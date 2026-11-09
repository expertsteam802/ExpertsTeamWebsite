import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const referenceImageSchema = z.object({
  name: z.string().max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string().min(100).max(3_000_000),
});

const codingRequest = z
  .object({
    prompt: z.string().trim().min(1).max(16000),
    files: z.record(z.string().max(512), z.string().max(100000)),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) }))
      .max(8),
    referenceImage: referenceImageSchema.optional(),
    referenceImages: z.array(referenceImageSchema).max(3).optional(),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 80 &&
      Object.values(files).reduce((total, content) => total + content.length, 0) <= 200000,
    "The project is too large to send to the agent.",
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
        "You have no AI credits remaining on this account. Ask an administrator about your usage allowance.",
      );
    const { runAgent } = await import("./agent.server");
    const result = await runAgent(data, process.env["GEMINI_API_KEY"]);
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
  .handler(async ({ data }) => {
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
          (entry.size ?? 0) <= 500000
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
    if (candidates.length > 400)
      throw new Error(
        "This repository contains more than 400 supported text files. Reduce the repository size and try again.",
      );

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
          if (buffer.byteLength > 500000 || buffer.includes(0)) return null;
          return { path, content: buffer.toString("utf8"), size: buffer.byteLength };
        }),
      );
      for (const file of downloaded) {
        if (!file) continue;
        totalBytes += file.size;
        if (totalBytes > 3_000_000)
          throw new Error(
            "The repository's text files exceed the current 3 MB project import limit. Use a smaller repository or remove generated files.",
          );
        files[file.path] = file.content;
      }
    }
    if (!Object.keys(files).length) throw new Error("No readable source files could be imported.");
    return {
      name: metadata.name || repo,
      repoUrl: metadata.html_url || "https://github.com/" + owner + "/" + repo,
      branch: defaultBranch,
      files,
      fileCount: Object.keys(files).length,
    };
  });

export const pushProjectToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string; repo: string; files: Record<string, string> }) => {
    const token = String(input?.token ?? "").trim();
    const repo = String(input?.repo ?? "").trim();
    if (!token) throw new Error("Paste a GitHub access token.");
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo))
      throw new Error("Repository name can use letters, numbers, - _ .");
    return { token, repo, files: input.files ?? {} };
  })
  .handler(async ({ data }) => {
    try {
      const { pushToGithub } = await import("./agent.server");
      return {
        ok: true as const,
        ...(await pushToGithub({ ...data, message: "Update from ExpertsTeam agent" })),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Push failed" };
    }
  });

const previewRequest = z
  .object({
    projectId: z.string().uuid(),
    files: z.record(z.string().max(512), z.string().max(500000)),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 400 &&
      Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 3_000_000,
    "The project is too large to preview.",
  );

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
    const { startCloudProjectPreview } = await import("./agent-sandbox.server");
    return startCloudProjectPreview(data.projectId, data.files);
  });

const terminalStartRequest = z
  .object({
    projectId: z.string().uuid(),
    files: z.record(z.string().max(512), z.string().max(150000)),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 120 &&
      Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 1_000_000,
    "The project is too large to open in the Linux terminal.",
  );

export const startAgentTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => terminalStartRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { startCloudProjectTerminal } = await import("./agent-sandbox.server");
    return startCloudProjectTerminal(data.projectId, data.files);
  });

const publishRequest = z
  .object({
    projectId: z.string().uuid(),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
    files: z.record(z.string().max(512), z.string().max(150000)),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 120 &&
      Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 1_000_000,
    "The project is too large to publish.",
  );

export const syncAgentTerminalFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { readCloudProjectFiles } = await import("./agent-sandbox.server");
    return readCloudProjectFiles(data.projectId);
  });

export const publishAgentProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => publishRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const now = new Date().toISOString();
    const { error: startError } = await context.supabase
      .from("agent_projects")
      .update({ last_build_status: "building", last_build_at: now })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (startError) throw new Error("Could not start the app publishing job.");

    try {
      const { publishCloudProject } = await import("./agent-sandbox.server");
      const result = await publishCloudProject(
        data.projectId,
        data.files,
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
      return result;
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
        command: z.string().trim().min(1).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { runCloudProjectCommand } = await import("./agent-sandbox.server");
    return runCloudProjectCommand(data.projectId, data.command);
  });

export const stopAgentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { stopCloudProjectPreview } = await import("./agent-sandbox.server");
    return stopCloudProjectPreview(data.projectId);
  });
