import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const claimFreeAiCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_free_ai_credits");
    if (error) throw new Error(error.message || "Could not reset your free AI credits.");
    return { credits: Number(data ?? 0) };
  });

const referenceImageSchema = z.object({
  name: z.string().max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string().min(100).max(3_000_000),
});

const codingRequest = z
  .object({
    prompt: z.string().trim().min(1).max(100_000),
    files: z.record(z.string().max(512), z.string().max(10_000_000)),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) }))
      .max(8),
    referenceImage: referenceImageSchema.optional(),
    referenceImages: z.array(referenceImageSchema).max(3).optional(),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 2_000 &&
      Object.values(files).reduce((total, content) => total + content.length, 0) <= 25_000_000,
    "The project exceeds the 25 MB agent request safety envelope.",
  )
  .refine(({ referenceImage, referenceImages }) => {
    const references = referenceImages?.length
      ? referenceImages
      : referenceImage
        ? [referenceImage]
        : [];
    return (
      references.length <= 3 &&
      references.reduce((total, image) => total + image.data.length, 0) <= 8_000_000
    );
  }, "Attach up to three visual references with a combined size under 8 MB.");

export const runCodingAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => codingRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("ai_credits")
      .eq("id", context.userId)
      .single();
    if (profileError) throw new Error(profileError.message);
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin && profile.ai_credits < 1)
      throw new Error(
        "You have no AI credits remaining. Visit Earn AI Credits to complete a partner offer.",
      );
    await assertBuilderResourcePolicy(context.supabase, context.userId, data.files, data.prompt);
    const { runAgent } = await import("./agent.server");
    const result = await runAgent(data);
    if (!isAdmin) {
      const { error: creditError } = await context.supabase.rpc("consume_ai_credit");
      if (creditError) throw new Error(creditError.message);
    }
    return result;
  });

export const importGitHubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        repoUrl: z.string().trim().min(1).max(500),
        token: z.string().trim().max(500).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let parsed: URL;
    try {
      parsed = new URL(data.repoUrl);
    } catch {
      throw new Error("Enter a valid GitHub repository URL.");
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.hostname.toLowerCase() !== "github.com" || parts.length < 2)
      throw new Error("Use a repository URL like https://github.com/owner/repository.");
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo))
      throw new Error("The GitHub owner or repository name is invalid.");

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ExpertsTeam-Project-Explorer",
    };
    if (data.token) headers.Authorization = "Bearer " + data.token;
    const request = async (url: string, accept = "application/vnd.github+json") => {
      const response = await fetch(url, {
        headers: { ...headers, Accept: accept },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        if (response.status === 404)
          throw new Error(
            "Repository not found, or it is private. Check the URL and access token.",
          );
        if (response.status === 401 || response.status === 403)
          throw new Error(
            "GitHub rejected access. Check your token and repository permissions or rate limit.",
          );
        throw new Error("GitHub request failed (" + response.status + ").");
      }
      return response;
    };

    const apiBase =
      "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
    const metadataResponse = await request(apiBase);
    const metadata = (await metadataResponse.json()) as {
      name?: string;
      default_branch?: string;
      html_url?: string;
    };
    const defaultBranch = metadata.default_branch;
    if (!defaultBranch) throw new Error("GitHub did not return the repository's default branch.");
    const treeResponse = await request(
      apiBase + "/git/trees/" + encodeURIComponent(defaultBranch) + "?recursive=1",
    );
    const tree = (await treeResponse.json()) as {
      truncated?: boolean;
      tree?: Array<{ path?: string; type?: string; size?: number }>;
    };
    if (tree.truncated)
      throw new Error(
        "This repository is too large for a complete project import. Try a smaller repository.",
      );
    const ignoredDirectories = new Set([
      ".git",
      "node_modules",
      "dist",
      "build",
      "out",
      ".next",
      ".vercel",
      "coverage",
      ".turbo",
      ".cache",
      "vendor",
    ]);
    const binaryExtensions =
      /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp4|mp3|wav|mov|avi|exe|dll|so|dylib|class|jar|wasm|lockb)$/i;
    const secretName =
      /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|id_rsa|id_ed25519|credentials?(?:\..*)?|secrets?(?:\..*)?)$/i;
    const candidates = (tree.tree ?? [])
      .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
      .filter((entry) => {
        const path = entry.path!;
        const segments = path.split("/");
        const filename = segments.at(-1) ?? "";
        return (
          path.length <= 512 &&
          /^[A-Za-z0-9_@./+ -]+$/.test(path) &&
          !segments.some(
            (part) => !part || part === "." || part === ".." || ignoredDirectories.has(part),
          ) &&
          !segments.some((part) => part.startsWith(".experts-")) &&
          !secretName.test(filename) &&
          !binaryExtensions.test(filename) &&
          (entry.size ?? 0) <= 10_000_000
        );
      })
      .sort((left, right) => {
        const priority = (path: string) =>
          /^(package\.json|index\.html|vite\.config\.[^/]+|README(?:\.md)?|src\/)/i.test(path)
            ? 0
            : 1;
        return (
          priority(left.path!) - priority(right.path!) || left.path!.localeCompare(right.path!)
        );
      });
    if (!candidates.length)
      throw new Error("No supported text source files were found in this repository.");
    const files: Record<string, string> = {};
    let totalBytes = 0;
    for (let offset = 0; offset < candidates.length; offset += 6) {
      const batch = candidates.slice(offset, offset + 6);
      const downloaded = await Promise.all(
        batch.map(async (entry) => {
          const path = entry.path!;
          const rawUrl =
            "https://raw.githubusercontent.com/" +
            encodeURIComponent(owner) +
            "/" +
            encodeURIComponent(repo) +
            "/" +
            encodeURIComponent(defaultBranch) +
            "/" +
            path.split("/").map(encodeURIComponent).join("/");
          const response = await request(rawUrl, "text/plain");
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.byteLength > 10_000_000 || buffer.includes(0)) return null;
          return { path, content: buffer.toString("utf8"), size: buffer.byteLength };
        }),
      );
      for (const file of downloaded) {
        if (!file) continue;
        totalBytes += file.size;
        files[file.path] = file.content;
      }
    }
    if (!Object.keys(files).length) throw new Error("No readable source files could be imported.");
    await assertBuilderResourcePolicy(context.supabase, context.userId, files);

    // Create the project and persist its source files on the server. The
    // browser receives only metadata, avoiding a huge repository response.
    const projectName = metadata.name || repo;
    const repoUrl = metadata.html_url || "https://github.com/" + owner + "/" + repo;
    const { data: project, error: projectError } = await context.supabase
      .from("agent_projects")
      .insert({
        user_id: context.userId,
        name: projectName,
        files: {},
        messages: [],
        github_repo: repoUrl,
        published: false,
      })
      .select("id")
      .single();
    if (projectError || !project) {
      throw new Error(projectError?.message || "Could not create the imported project.");
    }

    try {
      const entries = Object.entries(files);
      let batch: { project_id: string; user_id: string; file_path: string; content: string }[] = [];
      let batchBytes = 0;
      const flush = async () => {
        if (!batch.length) return;
        const { error } = await context.supabase.from("agent_project_files").insert(batch);
        if (error) throw new Error("Could not save imported source files: " + error.message);
        batch = [];
        batchBytes = 0;
      };
      for (const [filePath, fileContent] of entries) {
        const bytes = Buffer.byteLength(fileContent, "utf8");
        if (batch.length && batchBytes + bytes > 4_000_000) await flush();
        batch.push({
          project_id: project.id,
          user_id: context.userId,
          file_path: filePath,
          content: fileContent,
        });
        batchBytes += bytes;
      }
      await flush();

      const { error: readyError } = await context.supabase
        .from("agent_projects")
        .update({ file_storage_ready_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", project.id)
        .eq("user_id", context.userId);
      if (readyError) throw new Error("Imported files were saved, but project finalization failed: " + readyError.message);
    } catch (error) {
      await context.supabase.from("agent_projects").delete().eq("id", project.id).eq("user_id", context.userId);
      throw error;
    }

    return {
      id: project.id,
      name: projectName,
      repoUrl,
      branch: defaultBranch,
      fileCount: Object.keys(files).length,
    };
  });

export const pushProjectToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    token: z.string().trim().min(1).max(500),
    repo: z.string().trim().regex(/^[A-Za-z0-9._-]{1,100}$/),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const files = await loadProjectSourceFiles(context.supabase, data.projectId, context.userId);
    if (!Object.keys(files).length) throw new Error("This project has no saved source files to push.");
    await assertBuilderResourcePolicy(context.supabase, context.userId, files);
    try {
      const { pushToGithub } = await import("./agent.server");
      return {
        ok: true as const,
        ...(await pushToGithub({ token: data.token, repo: data.repo, files, message: "Update from ExpertsTeam agent" })),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Push failed" };
    }
  });

const previewRequest = z.object({ projectId: z.string().uuid() });

async function assertBuilderResourcePolicy(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  userId: string,
  files: Record<string, string>,
  prompt?: string,
) {
  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleError) throw new Error("Could not verify Builder resource permissions.");
  if (isAdmin) return;

  const { data: settings, error } = await supabase
    .from("site_settings")
    .select("site_branding_settings")
    .eq("id", 1)
    .single();
  if (error) throw new Error("Could not load the administrator's Builder resource policy.");

  const root = settings.site_branding_settings && typeof settings.site_branding_settings === "object" && !Array.isArray(settings.site_branding_settings)
    ? settings.site_branding_settings as Record<string, unknown> : {};
  const limits = root.builderLimits && typeof root.builderLimits === "object" && !Array.isArray(root.builderLimits)
    ? root.builderLimits as Record<string, unknown> : {};
  const numberLimit = (key: string) => {
    const value = Number(limits[key] ?? 0);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  };

  const entries = Object.entries(files);
  const totalBytes = entries.reduce((sum, [, content]) => sum + Buffer.byteLength(content, "utf8"), 0);
  const maxProjectMb = numberLimit("maxProjectMb");
  const maxFileMb = numberLimit("maxFileMb");
  const maxFiles = numberLimit("maxFiles");
  const maxPromptChars = numberLimit("maxPromptChars");

  if (maxFiles && entries.length > maxFiles) throw new Error("This project exceeds the administrator-configured file-count allowance.");
  if (maxProjectMb && totalBytes > maxProjectMb * 1_000_000) throw new Error("This project exceeds the administrator-configured project-size allowance.");
  if (maxFileMb && entries.some(([, content]) => Buffer.byteLength(content, "utf8") > maxFileMb * 1_000_000)) throw new Error("A project file exceeds the administrator-configured per-file allowance.");
  if (maxPromptChars && prompt && prompt.length > maxPromptChars) throw new Error("This request exceeds the administrator-configured prompt length.");
}

async function loadProjectSourceFiles(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  projectId: string,
  userId: string,
): Promise<Record<string, string>> {
  const readRows = async () => {
    const allRows: { file_path: string; content: string }[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("agent_project_files")
        .select("file_path,content")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .order("file_path", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error("Could not load the saved project files.");
      allRows.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return allRows;
  };

  const { data: projectMeta, error: metaError } = await supabase
    .from("agent_projects")
    .select("file_storage_ready_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (metaError) throw new Error("Could not verify the saved project file snapshot.");
  if (!projectMeta?.file_storage_ready_at) {
    const { data: legacyProject, error: legacyError } = await supabase
      .from("agent_projects")
      .select("files")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (legacyError) throw new Error("Could not load the legacy project snapshot.");
    const legacy = legacyProject?.files;
    const recoveredSnapshot =
      legacy && typeof legacy === "object" && !Array.isArray(legacy)
        ? Object.fromEntries(Object.entries(legacy).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
    if (Object.keys(recoveredSnapshot).length) return recoveredSnapshot;

    // A cleared legacy snapshot is expected after successful per-file migration.
    // If the readiness marker is missing, still recover any intact file rows.
    const recoveredRows = await readRows();
    return Object.fromEntries(recoveredRows.map((row) => [row.file_path, row.content]));
  }

  const rows = await readRows();
  return Object.fromEntries(rows.map((row) => [row.file_path, row.content]));
}

async function assertProjectOwnership(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  projectId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("agent_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not verify project access.");
  if (!data) throw new Error("This project is not available in your account.");
}

export const startAgentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => previewRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const files = await loadProjectSourceFiles(context.supabase, data.projectId, context.userId);
    if (!Object.keys(files).length) throw new Error("This project has no saved source files to preview.");
    await assertBuilderResourcePolicy(context.supabase, context.userId, files);
    const { startDaytonaProjectPreview } = await import("./daytona-terminal.server");
    return startDaytonaProjectPreview(data.projectId, files);
  });

const terminalStartRequest = z
  .object({
    projectId: z.string().uuid(),
    username: z.string().trim().min(1).max(39).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    cli: z.enum(["kilo", "opencode", "aider"]).optional(),
  });

export const startAgentTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => terminalStartRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const files = await loadProjectSourceFiles(context.supabase, data.projectId, context.userId);
    if (!Object.keys(files).length) throw new Error("This project has no saved source files for the terminal.");
    await assertBuilderResourcePolicy(context.supabase, context.userId, files);
    const { data: siteSettings, error: settingsError } = await context.supabase
      .from("site_settings")
      .select("site_branding_settings")
      .eq("id", 1)
      .single();
    if (settingsError) throw new Error("Could not load the administrator's terminal CLI policy.");
    const root = siteSettings.site_branding_settings && typeof siteSettings.site_branding_settings === "object" && !Array.isArray(siteSettings.site_branding_settings)
      ? siteSettings.site_branding_settings as Record<string, unknown> : {};
    const terminal = root.terminalSettings && typeof root.terminalSettings === "object" && !Array.isArray(root.terminalSettings)
      ? root.terminalSettings as Record<string, unknown> : {};
    const configured = Array.isArray(terminal.enabledClis)
      ? terminal.enabledClis.filter((value): value is string => typeof value === "string" && ["kilo", "opencode", "aider"].includes(value))
      : ["kilo"];
    const enabledClis = configured.length ? configured : ["kilo"];
    const defaultCli = typeof terminal.defaultCli === "string" && enabledClis.includes(terminal.defaultCli)
      ? terminal.defaultCli : enabledClis[0];
    const cli = data.cli ?? defaultCli;
    if (!enabledClis.includes(cli)) throw new Error("This coding CLI is not enabled by the administrator.");
    const { daytonaTerminalSandboxName, startDaytonaProjectTerminal } = await import("./daytona-terminal.server");
    return startDaytonaProjectTerminal(daytonaTerminalSandboxName(context.userId), files, data.username ?? "ExpertsTeam", cli as "kilo" | "opencode" | "aider");
  });

const publishRequest = z.object({
  projectId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
});

export const stopAgentTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ sandboxName: z.string().min(20).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertDaytonaTerminalSandboxName, stopDaytonaProjectTerminal } = await import("./daytona-terminal.server");
    return stopDaytonaProjectTerminal(assertDaytonaTerminalSandboxName(context.userId, data.sandboxName));
  });

export const syncAgentTerminalFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), sandboxName: z.string().min(20).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { assertDaytonaTerminalSandboxName, readDaytonaProjectFiles } = await import("./daytona-terminal.server");
    return readDaytonaProjectFiles(assertDaytonaTerminalSandboxName(context.userId, data.sandboxName));
  });

export const refreshAgentTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), sandboxName: z.string().min(20).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { assertDaytonaTerminalSandboxName, refreshDaytonaProjectTerminal } = await import("./daytona-terminal.server");
    return refreshDaytonaProjectTerminal(assertDaytonaTerminalSandboxName(context.userId, data.sandboxName));
  });

export const publishAgentProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => publishRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const files = await loadProjectSourceFiles(context.supabase, data.projectId, context.userId);
    if (!Object.keys(files).length) throw new Error("This project has no saved source files to publish.");
    await assertBuilderResourcePolicy(context.supabase, context.userId, files);
    const now = new Date().toISOString();
    const { error: startError } = await context.supabase
      .from("agent_projects")
      .update({ last_build_status: "running", last_build_at: now })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (startError) throw new Error("Could not start the app publishing job.");

    try {
      const { publishDaytonaProject } = await import("./daytona-terminal.server");
      const result = await publishDaytonaProject(
        data.projectId,
        files,
        data.slug,
        context.userId,
        context.supabase,
      );
      const { data: saved, error: saveError } = await context.supabase
        .from("agent_projects")
        .update({
          published: true,
          slug: data.slug,
          deployment_url: result.url,
          thumbnail_url: (await context.supabase
            .from("agent_projects")
            .select("thumbnail_url")
            .eq("id", data.projectId)
            .eq("user_id", context.userId)
            .maybeSingle()).data?.thumbnail_url ??
            `https://image.thum.io/get/width/1200/crop/675/noanimate/maxAge/24/https://expertsteam.giize.com/apps/${encodeURIComponent(data.slug)}`,
          last_build_status: "success",
          last_build_at: new Date().toISOString(),
        })
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .select("id")
        .maybeSingle();
      if (saveError)
        throw new Error("The app was built, but its published URL could not be saved.");
      if (!saved) throw new Error("The app was built, but the project is no longer available.");
      return {
        ...result,
        // Public project links must use the agreed first-party path route, never wildcard subdomains.
        publicUrl: `https://expertsteam.giize.com/apps/${encodeURIComponent(data.slug)}`,
      };
    } catch (error) {
      await context.supabase
        .from("agent_projects")
        .update({ last_build_status: "failed", last_build_at: new Date().toISOString() })
        .eq("id", data.projectId)
        .eq("user_id", context.userId);
      throw error;
    }
  });

export const runAgentTerminalCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        sandboxName: z.string().min(20).max(80),
        command: z.string().trim().min(1).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { assertDaytonaTerminalSandboxName, runDaytonaProjectCommand } = await import("./daytona-terminal.server");
    return runDaytonaProjectCommand(assertDaytonaTerminalSandboxName(context.userId, data.sandboxName), data.command);
  });

export const runAgentTerminalPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      sandboxName: z.string().min(20).max(80),
      cli: z.enum(["kilo", "opencode", "aider"]),
      mode: z.enum(["build", "plan"]).optional().default("build"),
      prompt: z.string().trim().min(1).max(100_000),
      referenceImages: z.array(referenceImageSchema).max(3).optional().default([]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const projectFiles = await loadProjectSourceFiles(context.supabase, data.projectId, context.userId);
    await assertBuilderResourcePolicy(context.supabase, context.userId, projectFiles, data.prompt);
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles").select("ai_credits").eq("id", context.userId).single();
    if (profileError) throw new Error(profileError.message);
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin && profile.ai_credits < 1)
      throw new Error("You have no AI credits remaining. Visit Earn AI Credits to complete a partner offer.");

    const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
    const {
      assertDaytonaTerminalSandboxName,
      runDaytonaProjectCommand,
      readDaytonaProjectFiles,
      writeDaytonaProjectReferenceImages,
    } = await import("./daytona-terminal.server");
    const terminalName = assertDaytonaTerminalSandboxName(context.userId, data.sandboxName);
    const referencePaths = await writeDaytonaProjectReferenceImages(terminalName, data.referenceImages);
    const modePrompt = data.mode === "plan"
      ? "PLANNING ONLY. Inspect the project and produce a concrete implementation plan with affected files, dependencies, risks, test steps, and ordered tasks. Do not create, edit, delete, rename, or format any project files. Do not run commands that change project state. Return the plan as readable text only.\n\nREQUEST:\n" + data.prompt
      : data.prompt;
    const promptWithReferences = referencePaths.length
      ? modePrompt + "\n\nVISUAL REFERENCES (read these image files before planning or changing the UI):\n" +
        referencePaths.map((filePath) => "- " + filePath).join("\n") +
        "\nUse the attached images as visual requirements for the implementation plan; do not edit project files in plan mode."
      : modePrompt;
    const commandWithReferences = data.cli === "kilo"
      ? "kilo run --auto " + quote(promptWithReferences)
      : data.cli === "opencode"
        ? "opencode run " + quote(promptWithReferences)
        : "aider --yes --message " + quote(promptWithReferences);
    const cliEnvironment = "runuser -u experts-shell -- env HOME=/home/experts-shell USER=experts-shell LOGNAME=experts-shell " +
      "PATH=/home/experts-shell/.local/bin:/home/experts-shell/.cargo/bin:/home/experts-shell/.npm-global/bin:/usr/local/bin:/usr/bin:/bin ";
    const executionCommand = data.mode === "plan"
      ? [
          'PLAN_DIR="$(mktemp -d /tmp/experts-plan-XXXXXX)" || exit 1',
          'tar --exclude="./node_modules" --exclude="./.git" --exclude="./dist" --exclude="./build" --exclude="./.next" --exclude="./.experts-terminal-*" --exclude="./.experts-preview-*" -cf - . | tar -xf - -C "$PLAN_DIR" || { rm -rf "$PLAN_DIR"; exit 1; }',
          'chmod -R a-w "$PLAN_DIR"',
          '(cd "$PLAN_DIR" && ' + cliEnvironment + commandWithReferences + ')',
          'PLAN_EXIT=$?',
          'chmod -R u+w "$PLAN_DIR" 2>/dev/null || true',
          'rm -rf "$PLAN_DIR"',
          'exit "$PLAN_EXIT"',
        ].join("\n")
      : cliEnvironment + commandWithReferences;
    const result = await runDaytonaProjectCommand(terminalName, executionCommand);
    if (result.exitCode !== 0 && (data.mode !== "plan" || !result.stdout.trim())) {
      const detail = result.stderr || result.stdout || "The agent could not complete the request.";
      throw new Error(detail.slice(-6000));
    }
    const files = await readDaytonaProjectFiles(terminalName);
    if (!isAdmin) {
      const { error: creditError } = await context.supabase.rpc("consume_ai_credit");
      if (creditError) throw new Error(creditError.message);
    }
    return { message: (result.stdout || (data.mode === "plan" ? "The agent could not produce a plan." : "Your project update is complete.")).slice(-12000), files: files.files, mode: data.mode };
  });

export const stopAgentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { stopDaytonaProjectPreview } = await import("./daytona-terminal.server");
    return stopDaytonaProjectPreview(data.projectId);
  });
