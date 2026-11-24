import { createHash } from "node:crypto";
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
    mode: z.enum(["build", "plan", "chat"]).optional().default("build"),
    modelTier: z.enum(["fast", "balanced", "architect"]).optional().default("fast"),
    groundPackages: z.array(z.string().trim().min(1).max(214).regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i)).max(3).optional().default([]),
    files: z.record(z.string().max(512), z.string().max(25_000_000)),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) }))
      .max(8),
    referenceImage: referenceImageSchema.optional(),
    referenceImages: z.array(referenceImageSchema).max(3).optional(),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 2_000 &&
      Object.values(files).reduce((total, content) => total + content.length, 0) <= 100_000_000,
    "This agent request exceeds the 100 MB transport safety envelope. Import large assets separately and keep individual source files below 25 MB.",
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
    const creditCost = data.modelTier === "architect" ? 3 : data.modelTier === "balanced" ? 2 : 1;
    if (!isAdmin && data.mode !== "chat" && profile.ai_credits < creditCost)
      throw new Error(
        `This model requires ${creditCost} AI credits. Earn more credits from partner offers or choose Fast.`,
      );
    if (data.mode !== "chat") await assertBuilderResourcePolicy(context.supabase, context.userId, data.files, data.prompt);
    let groundedPrompt = data.prompt;
    if (data.groundPackages.length) {
      const docs = await Promise.all(data.groundPackages.map(async (packageName) => {
        const response = await fetch("https://registry.npmjs.org/" + encodeURIComponent(packageName), {
          headers: { Accept: "application/vnd.npm.install-v1+json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Could not retrieve npm documentation for " + packageName + " (HTTP " + response.status + ").");
        const rawMetadata = await response.text();
        if (rawMetadata.length > 2_000_000) throw new Error("The npm package metadata is too large to safely ground this request.");
        const metadata = JSON.parse(rawMetadata) as {
          name?: string;
          description?: string;
          "dist-tags"?: { latest?: string };
          readme?: string;
        };
        return [
          "### " + (metadata.name ?? packageName) + " · " + (metadata["dist-tags"]?.latest ?? "latest"),
          metadata.description ?? "",
          (metadata.readme ?? "No README was published in the npm registry.").slice(0, 12000),
        ].filter(Boolean).join("\n");
      }));
      groundedPrompt += "\n\nVERIFIED NPM PACKAGE DOCUMENTATION (retrieved from registry.npmjs.org; use version and API details from this source):\n" + docs.join("\n\n");
    }
    const agentData = { ...data, prompt: groundedPrompt };
    const { runAgent, runAgentPlan, runAgentChat } = await import("./agent.server");
    const result = data.mode === "plan"
      ? await runAgentPlan(agentData)
      : data.mode === "chat"
        ? await runAgentChat(agentData)
        : await runAgent(agentData);
    if (!isAdmin && data.mode !== "chat") {
      const consumeCredits = context.supabase.rpc as unknown as (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
      const { error: creditError } = await consumeCredits("consume_ai_credits", {
        p_amount: creditCost,
        p_description: `Agent ${data.mode ?? "build"} · ${data.modelTier ?? "fast"} model`,
      });
      if (creditError) throw new Error(creditError.message || "Could not deduct model credits.");
    }
    return result;
  });

export const runAgentSelfHeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      error: z.object({
        message: z.string().trim().min(1).max(3000),
        stack: z.string().max(5000).optional(),
        file: z.string().max(500).optional(),
        line: z.number().int().positive().max(1_000_000).optional(),
      }),
      files: z.record(z.string().max(512), z.string().max(1_000_000))
        .refine((files) => Object.keys(files).length <= 18, "Too many files for automatic repair.")
        .refine((files) => Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 180_000, "Project context exceeds the repair limit."),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("agent_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("This project is unavailable or you do not have permission to repair it.");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: attemptsError } = await context.supabase
      .from("agent_project_checkpoints")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .eq("name", "Before free runtime repair")
      .gte("created_at", since);
    if (attemptsError) throw new Error(attemptsError.message);
    if ((count ?? 0) >= 3) throw new Error("This project has reached its three free automatic repair attempts for the last 24 hours. Review the error manually or use Build mode.");
    const { runAgentSelfHeal: repair } = await import("./agent.server");
    return repair({ error: data.error, files: data.files });
  });

export const importGitHubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        repoUrl: z.string().trim().min(1).max(500),
        token: z.string().trim().max(500).optional().default(""),
        projectId: z.string().uuid().optional(),
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

    let githubToken = data.token;
    if (!githubToken) {
      // Public repositories remain importable without OAuth; use the stored account token for private repositories.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = context.supabase as any;
      const { data: connection, error: connectionError } = await db
        .from("user_plugin_connections")
        .select("id")
        .eq("user_id", context.userId)
        .eq("provider", "github")
        .eq("status", "connected")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (connectionError) throw new Error("Could not read the connected GitHub account.");
      if (connection?.id) githubToken = await resolveGitHubAccessToken(context.supabase, context.userId, "");
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ExpertsTeam-Project-Explorer",
    };
    if (githubToken) headers.Authorization = "Bearer " + githubToken;
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
      tree?: Array<{ path?: string; type?: string; size?: number; sha?: string }>;
    };
    let repositoryTree = tree.tree ?? [];

    // GitHub truncates recursive tree responses for very large repositories.
    // Fall back to walking individual tree objects so nested directories are
    // not silently omitted or rejected solely because of that API response cap.
    if (tree.truncated) {
      const branchResponse = await request(apiBase + "/branches/" + encodeURIComponent(defaultBranch));
      const branch = (await branchResponse.json()) as { commit?: { commit?: { tree?: { sha?: string } } } };
      const rootTreeSha = branch.commit?.commit?.tree?.sha;
      if (!rootTreeSha) throw new Error("GitHub did not return the repository tree.");
      const pending: { sha: string; prefix: string }[] = [{ sha: rootTreeSha, prefix: "" }];
      const visited = new Set<string>();
      const expanded: Array<{ path: string; type: string; size?: number }> = [];
      const worker = async () => {
        while (pending.length) {
          const next = pending.shift();
          if (!next) continue;
          const visitKey = next.sha + ":" + next.prefix;
          if (visited.has(visitKey)) continue;
          visited.add(visitKey);
          const response = await request(apiBase + "/git/trees/" + encodeURIComponent(next.sha));
          const node = (await response.json()) as {
            truncated?: boolean;
            tree?: Array<{ path?: string; type?: string; size?: number; sha?: string }>;
          };
          if (node.truncated) throw new Error("A GitHub directory tree exceeded the API's per-tree response limit.");
          for (const entry of node.tree ?? []) {
            if (!entry.path || !entry.type) continue;
            const fullPath = next.prefix ? next.prefix + "/" + entry.path : entry.path;
            if (entry.type === "tree" && entry.sha) pending.push({ sha: entry.sha, prefix: fullPath });
            else if (entry.type === "blob") expanded.push({ path: fullPath, type: "blob", size: entry.size });
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, () => worker()));
      repositoryTree = expanded;
    }
    const ignoredDirectories = new Set([
      ".git",
      ".kilo",
      ".kilocode",
      ".opencode",
      ".lovable",
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
      /^(?:\.env(?:$|\.(?!.*(?:example|sample|template)$).*)|\.npmrc|\.netrc|\.pypirc|id_rsa|id_ed25519|credentials?(?:\..*)?|secrets?(?:\..*)?)$/i;
    const candidates = (repositoryTree)
      .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
      .filter((entry) => {
        const path = entry.path!;
        const segments = path.split("/");
        const filename = segments.at(-1) ?? "";
        return (
          path.length <= 1024 &&
          !path.startsWith("/") &&
          ![".expertrules", ".config/kilo/kilo.jsonc"].includes(path.toLowerCase()) &&
          !segments.some(
            (part) =>
              !part ||
              part === "." ||
              part === ".." ||
              part.includes("\\") ||
              part.split("").some((character) => {
                const code = character.charCodeAt(0);
                return code <= 31 || code === 127;
              }) ||
              ignoredDirectories.has(part),
          ) &&
          !segments.some((part) => part.startsWith(".experts-")) &&
          !secretName.test(filename)
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
      throw new Error("No supported source files were found in this repository.");
    const resourceLimits = await getBuilderResourceLimits(context.supabase, context.userId);
    let projectName = metadata.name || repo;
    const repoUrl = metadata.html_url || "https://github.com/" + owner + "/" + repo;
    let project: { id: string };
    let previousAssetPaths: string[] = [];
    let preservedWorkspaceFiles: Record<string, string> = {};
    if (data.projectId) {
      await assertProjectOwnership(context.supabase, data.projectId, context.userId);
      const { data: existingProject, error: existingProjectError } = await context.supabase
        .from("agent_projects")
        .select("id,name")
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .single();
      if (existingProjectError || !existingProject) throw new Error("The project selected for GitHub sync is unavailable.");
      project = { id: existingProject.id };
      projectName = existingProject.name;
      const { data: oldAssets, error: oldAssetsError } = await context.supabase
        .from("agent_project_assets")
        .select("storage_path")
        .eq("project_id", project.id)
        .eq("user_id", context.userId);
      if (oldAssetsError) throw new Error("Could not prepare existing project assets for GitHub sync.");
      previousAssetPaths = (oldAssets ?? []).map((asset) => asset.storage_path);
      preservedWorkspaceFiles = await loadProjectSourceFiles(context.supabase, project.id, context.userId);
    } else {
      const { data: createdProject, error: projectError } = await context.supabase
        .from("agent_projects")
        .insert({
          user_id: context.userId,
          name: projectName,
          files: {},
          messages: [],
          github_repo: repoUrl,
          repository_url: repoUrl,
          default_branch: defaultBranch,
          published: false,
        })
        .select("id")
        .single();
      if (projectError || !createdProject) {
        throw new Error(projectError?.message || "Could not create the imported project.");
      }
      project = { id: createdProject.id };
    }

    const importId = crypto.randomUUID();
    let fileCount = 0;
    let totalBytes = 0;
    let batch: {
      import_id: string;
      project_id: string;
      user_id: string;
      file_path: string;
      content: string;
    }[] = [];
    let batchBytes = 0;
    const uploadedAssetPaths: string[] = [];
    const assetMime: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
      ico: "image/x-icon", pdf: "application/pdf", zip: "application/zip", gz: "application/gzip",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", mp4: "video/mp4",
      mp3: "audio/mpeg", wav: "audio/wav", mov: "video/quicktime", avi: "video/x-msvideo", wasm: "application/wasm",
    };

    const flush = async () => {
      if (!batch.length) return;
      const { error } = await context.supabase.from("agent_project_file_staging").insert(batch);
      if (error) throw new Error("Could not stage imported source files: " + error.message);
      batch = [];
      batchBytes = 0;
    };

    try {
      for (let offset = 0; offset < candidates.length; offset += 3) {
        const downloaded = await Promise.all(
          candidates.slice(offset, offset + 3).map(async (entry) => {
            const filePath = entry.path!;
            const rawUrl =
              "https://raw.githubusercontent.com/" +
              encodeURIComponent(owner) +
              "/" +
              encodeURIComponent(repo) +
              "/" +
              encodeURIComponent(defaultBranch) +
              "/" +
              filePath.split("/").map(encodeURIComponent).join("/");
            const response = await request(rawUrl, "text/plain");
            const buffer = Buffer.from(await response.arrayBuffer());
            if (resourceLimits.maxFileMb && buffer.byteLength > resourceLimits.maxFileMb * 1_000_000) {
              throw new Error(filePath + " exceeds the administrator-configured per-file limit of " + resourceLimits.maxFileMb + " MB.");
            }
            return { path: filePath, buffer, size: buffer.byteLength };
          }),
        );

        for (const file of downloaded) {
          if (!file) continue;
          fileCount += 1;
          totalBytes += file.size;
          if (resourceLimits.maxFiles && fileCount > resourceLimits.maxFiles) {
            throw new Error("This import exceeds the administrator-configured file-count allowance.");
          }
          if (resourceLimits.maxProjectMb && totalBytes > resourceLimits.maxProjectMb * 1_000_000) {
            throw new Error("This import exceeds the administrator-configured project-size allowance.");
          }
          if (resourceLimits.maxFileMb && file.size > resourceLimits.maxFileMb * 1_000_000) {
            throw new Error("A repository file exceeds the administrator-configured per-file allowance: " + file.path);
          }

          const decoded = file.buffer.toString("utf8");
          const extension = file.path.split(".").at(-1)?.toLowerCase() ?? "";
          const isBinary = binaryExtensions.test(file.path) || file.buffer.includes(0) || !Buffer.from(decoded, "utf8").equals(file.buffer);
          if (isBinary) {
            const storagePath = context.userId + "/" + project.id + "/" + importId + "/" + file.path;
            const { error: uploadError } = await context.supabase.storage.from("builder-project-assets").upload(
              storagePath, file.buffer,
              { contentType: assetMime[extension] ?? "application/octet-stream", cacheControl: "31536000", upsert: false },
            );
            if (uploadError) throw new Error("Could not import binary asset " + file.path + ": " + uploadError.message);
            uploadedAssetPaths.push(storagePath);
            const { error: stageError } = await context.supabase.from("agent_project_asset_staging").insert({
              import_id: importId, project_id: project.id, user_id: context.userId,
              file_path: file.path, storage_path: storagePath,
              mime_type: assetMime[extension] ?? "application/octet-stream",
              size_bytes: file.size, sha256: createHash("sha256").update(file.buffer).digest("hex"),
            });
            if (stageError) throw new Error("Could not stage binary asset metadata: " + stageError.message);
            continue;
          }
          if (batch.length && (batch.length >= 100 || batchBytes + file.size > 4_000_000)) {
            await flush();
          }
          batch.push({
            import_id: importId, project_id: project.id, user_id: context.userId,
            file_path: file.path, content: decoded,
          });
          batchBytes += file.size;
        }
      }

      if (data.projectId) {
        for (const [filePath, content] of Object.entries(preservedWorkspaceFiles)) {
          const parts = filePath.split("/");
          const preserveForWorkspace = filePath === ".expertrules" || parts.some((part) =>
            part.startsWith(".experts-") || [".kilo", ".kilocode", ".opencode"].includes(part),
          ) || filePath === ".config/kilo/kilo.jsonc";
          if (!preserveForWorkspace) continue;
          const size = Buffer.byteLength(content, "utf8");
          if (resourceLimits.maxFiles && fileCount + 1 > resourceLimits.maxFiles) throw new Error("Preserving workspace settings would exceed the administrator-configured file-count allowance.");
          if (resourceLimits.maxProjectMb && totalBytes + size > resourceLimits.maxProjectMb * 1_000_000) throw new Error("Preserving workspace settings would exceed the administrator-configured project-size allowance.");
          if (batch.length && (batch.length >= 100 || batchBytes + size > 4_000_000)) await flush();
          batch.push({ import_id: importId, project_id: project.id, user_id: context.userId, file_path: filePath, content });
          batchBytes += size;
          totalBytes += size;
          fileCount += 1;
        }
      }

      if (!fileCount) throw new Error("No readable source files could be imported.");
      await flush();

      const { error: finalizeError } = await context.supabase.rpc("finalize_agent_project_workspace_staging", {
        p_project_id: project.id,
        p_import_id: importId,
      });
      if (finalizeError) throw new Error("Could not finalize imported files: " + finalizeError.message);
      if (data.projectId) {
        const { error: linkError } = await context.supabase
          .from("agent_projects")
          .update({ github_repo: repoUrl, repository_url: repoUrl, default_branch: defaultBranch })
          .eq("id", project.id)
          .eq("user_id", context.userId);
        if (linkError) console.warn("[ExpertsTeam GitHub sync] Could not update repository metadata:", linkError.message);
      }
      if (previousAssetPaths.length) {
        const { error: cleanupError } = await context.supabase.storage.from("builder-project-assets").remove(previousAssetPaths);
        if (cleanupError) console.warn("[ExpertsTeam GitHub sync] Could not remove replaced project assets:", cleanupError.message);
      }
    } catch (error) {
      await context.supabase.storage.from("builder-project-assets").remove(uploadedAssetPaths);
      await context.supabase
        .from("agent_project_asset_staging")
        .delete()
        .eq("import_id", importId)
        .eq("project_id", project.id)
        .eq("user_id", context.userId);
      await context.supabase
        .from("agent_project_file_staging")
        .delete()
        .eq("import_id", importId)
        .eq("project_id", project.id)
        .eq("user_id", context.userId);
      if (!data.projectId) {
        await context.supabase
          .from("agent_projects")
          .delete()
          .eq("id", project.id)
          .eq("user_id", context.userId);
      }
      throw error;
    }

    return {
      id: project.id,
      name: projectName,
      repoUrl,
      branch: defaultBranch,
      fileCount,
    };
  });

async function resolveGitHubAccessToken(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  userId: string,
  suppliedToken: string,
): Promise<string> {
  // Prefer the dedicated Plugin Center credential because the sign-in provider token may not include repository scopes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: connection, error: connectionError } = await db
    .from("user_plugin_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "github")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError && !suppliedToken) throw new Error("Could not read the connected GitHub account.");
  if (connection?.id) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: secret, error: secretError } = await supabaseAdmin.rpc("get_user_plugin_connection_secret", {
      p_connection_id: connection.id,
      p_user_id: userId,
    });
    const payload = secret?.token_payload as Record<string, unknown> | undefined;
    const token = typeof payload?.access_token === "string" ? payload.access_token : "";
    if (!secretError && token) return token;
    if (!suppliedToken) throw new Error("The connected GitHub credential is unavailable. Reconnect GitHub in Plugin Center.");
  }
  if (suppliedToken) return suppliedToken;
  throw new Error("Connect GitHub in ExpertsTeam Plugin Center first, or provide a one-time token.");
}

export const listGitHubRepositories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ token: z.string().trim().max(500).optional().default("") }).parse(input))
  .handler(async ({ data, context }) => {
    const token = await resolveGitHubAccessToken(context.supabase, context.userId, data.token);
    const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member", {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ExpertsTeam-Builder",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("GitHub authorization expired or lacks repository access. Reconnect GitHub.");
      throw new Error("GitHub repository list failed (" + response.status + ").");
    }
    const rows = await response.json() as Array<{ full_name?: string; private?: boolean; html_url?: string; default_branch?: string; permissions?: { push?: boolean } }>;
    return rows.filter((row) => row.full_name && row.permissions?.push !== false).map((row) => ({
      fullName: row.full_name!,
      private: Boolean(row.private),
      url: row.html_url ?? "",
      defaultBranch: row.default_branch ?? "main",
    }));
  });

export const pushProjectToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    token: z.string().trim().max(500).optional().default(""),
    repo: z.string().trim().regex(/^[A-Za-z0-9._-]{1,100}$/),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const token = await resolveGitHubAccessToken(context.supabase, context.userId, data.token);
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const files = await loadProjectSourceFiles(context.supabase, data.projectId, context.userId);
    if (!Object.keys(files).length) throw new Error("This project has no saved source files to push.");
    await assertBuilderResourcePolicy(context.supabase, context.userId, files);
    try {
      const { pushToGithub } = await import("./agent.server");
      return {
        ok: true as const,
        ...(await pushToGithub({ token, repo: data.repo, files, message: "Update from ExpertsTeam agent" })),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Push failed" };
    }
  });

const previewRequest = z.object({ projectId: z.string().uuid() });

type BuilderResourceLimits = {
  maxFiles: number;
  maxProjectMb: number;
  maxFileMb: number;
  maxPromptChars: number;
};

async function getBuilderResourceLimits(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  userId: string,
): Promise<BuilderResourceLimits> {
  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleError) throw new Error("Could not verify Builder resource permissions.");
  if (isAdmin) return { maxFiles: 0, maxProjectMb: 0, maxFileMb: 0, maxPromptChars: 0 };

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

  return {
    maxFiles: numberLimit("maxFiles"),
    maxProjectMb: numberLimit("maxProjectMb"),
    maxFileMb: numberLimit("maxFileMb"),
    maxPromptChars: numberLimit("maxPromptChars"),
  };
}

async function assertBuilderResourcePolicy(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  userId: string,
  files: Record<string, string>,
  prompt?: string,
) {
  const limits = await getBuilderResourceLimits(supabase, userId);
  const entries = Object.entries(files);
  const totalBytes = entries.reduce((sum, [, content]) => sum + Buffer.byteLength(content, "utf8"), 0);

  if (limits.maxFiles && entries.length > limits.maxFiles) throw new Error("This project exceeds the administrator-configured file-count allowance.");
  if (limits.maxProjectMb && totalBytes > limits.maxProjectMb * 1_000_000) throw new Error("This project exceeds the administrator-configured project-size allowance.");
  if (limits.maxFileMb && entries.some(([, content]) => Buffer.byteLength(content, "utf8") > limits.maxFileMb * 1_000_000)) throw new Error("A project file exceeds the administrator-configured per-file allowance.");
  if (limits.maxPromptChars && prompt && prompt.length > limits.maxPromptChars) throw new Error("This request exceeds the administrator-configured prompt length.");
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
    const { data: savedAssets, error: assetQueryError } = await context.supabase
      .from("agent_project_assets")
      .select("file_path,storage_path,mime_type,sha256")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (assetQueryError) throw new Error("Could not load the project's saved binary assets: " + assetQueryError.message);
    const binaryAssets: { filePath: string; buffer: Buffer; mimeType: string; sha256: string }[] = [];
    for (const asset of savedAssets ?? []) {
      const { data: blob, error: downloadError } = await context.supabase.storage
        .from("builder-project-assets")
        .download(asset.storage_path);
      if (downloadError || !blob) throw new Error("Could not restore " + asset.file_path + ": " + (downloadError?.message ?? "asset is missing"));
      binaryAssets.push({
        filePath: asset.file_path,
        buffer: Buffer.from(await blob.arrayBuffer()),
        mimeType: asset.mime_type,
        sha256: asset.sha256,
      });
    }
    const { loadProjectPublicEnvironment } = await import("./project-secrets.server");
    // Supabase generated types do not yet include the project-secrets migration tables.
    const projectEnvironment = await loadProjectPublicEnvironment(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.supabase as any,
      context.userId,
      data.projectId,
    );
    const { startDaytonaProjectPreview } = await import("./daytona-terminal.server");
    return startDaytonaProjectPreview(data.projectId, files, projectEnvironment, binaryAssets);
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
    const { data: savedAssets, error: assetQueryError } = await context.supabase
      .from("agent_project_assets")
      .select("file_path, storage_path, mime_type, sha256")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (assetQueryError) throw new Error("Could not load the project's saved binary assets: " + assetQueryError.message);
    const binaryAssets: { filePath: string; buffer: Buffer; mimeType: string; sha256: string }[] = [];
    for (const asset of savedAssets ?? []) {
      const { data: blob, error: downloadError } = await context.supabase.storage
        .from("builder-project-assets")
        .download(asset.storage_path);
      if (downloadError || !blob) throw new Error("Could not restore " + asset.file_path + ": " + (downloadError?.message ?? "asset is missing"));
      binaryAssets.push({
        filePath: asset.file_path,
        buffer: Buffer.from(await blob.arrayBuffer()),
        mimeType: asset.mime_type,
        sha256: asset.sha256,
      });
    }
    const { loadProjectEnvironment, loadProjectPublicEnvironment } = await import("./project-secrets.server");
    const [privateEnvironment, publicEnvironment] = await Promise.all([
      loadProjectEnvironment(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.supabase as any,
        context.userId,
        data.projectId,
      ),
      loadProjectPublicEnvironment(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.supabase as any,
        context.userId,
        data.projectId,
      ),
    ]);
    const projectEnvironment = { ...publicEnvironment, ...privateEnvironment };
    const { daytonaTerminalSandboxName, startDaytonaProjectTerminal } = await import("./daytona-terminal.server");
    return startDaytonaProjectTerminal(
      daytonaTerminalSandboxName(context.userId),
      files,
      data.username ?? "ExpertsTeam",
      cli as "kilo" | "opencode" | "aider",
      binaryAssets,
      projectEnvironment,
    );
  });

const publishRequest = z.object({
  projectId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
  environment: z.enum(["production", "staging"]).default("production"),
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
    const resourceLimits = await getBuilderResourceLimits(context.supabase, context.userId);
    const snapshot = await readDaytonaProjectFiles(
      assertDaytonaTerminalSandboxName(context.userId, data.sandboxName),
      resourceLimits.maxFileMb * 1_000_000,
    );
    await assertBuilderResourcePolicy(context.supabase, context.userId, snapshot.files);
    const totalBinaryBytes = snapshot.binaryAssets.reduce((sum, asset) => sum + asset.buffer.byteLength, 0);
    const totalTextBytes = Object.values(snapshot.files).reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
    const totalFiles = Object.keys(snapshot.files).length + snapshot.binaryAssets.length;
    if (resourceLimits.maxFiles > 0 && totalFiles > resourceLimits.maxFiles) {
      throw new Error("The workspace exceeds the administrator-configured file-count limit of " + resourceLimits.maxFiles + ".");
    }
    if (resourceLimits.maxProjectMb > 0 && totalTextBytes + totalBinaryBytes > resourceLimits.maxProjectMb * 1_000_000) {
      throw new Error("The workspace exceeds the administrator-configured project-size limit of " + resourceLimits.maxProjectMb + " MB.");
    }

    const importId = crypto.randomUUID();
    const uploadedPaths: string[] = [];
    const stagedAssetRows: {
      import_id: string; project_id: string; user_id: string; file_path: string;
      storage_path: string; mime_type: string; size_bytes: number; sha256: string;
    }[] = [];
    const oldAssetsResult = await context.supabase.from("agent_project_assets")
      .select("file_path, storage_path, sha256").eq("project_id", data.projectId).eq("user_id", context.userId);
    if (oldAssetsResult.error) throw new Error("Could not inspect previous binary assets: " + oldAssetsResult.error.message);
    const previousAssets = new Map((oldAssetsResult.data ?? []).map((asset) => [asset.file_path, asset]));
    const retainedAssetPaths = new Set<string>();
    try {
      for (const asset of snapshot.binaryAssets) {
        const previous = previousAssets.get(asset.filePath);
        const unchanged = previous?.sha256 === asset.sha256;
        const storagePath = unchanged
          ? previous.storage_path
          : context.userId + "/" + data.projectId + "/" + importId + "/" + asset.filePath;
        if (!unchanged) {
          const { error: uploadError } = await context.supabase.storage.from("builder-project-assets").upload(
            storagePath, asset.buffer,
            { contentType: asset.mimeType, cacheControl: "31536000", upsert: false },
          );
          if (uploadError) throw new Error("Could not save binary asset " + asset.filePath + ": " + uploadError.message);
          uploadedPaths.push(storagePath);
        }
        retainedAssetPaths.add(storagePath);
        stagedAssetRows.push({
          import_id: importId, project_id: data.projectId, user_id: context.userId,
          file_path: asset.filePath, storage_path: storagePath, mime_type: asset.mimeType,
          size_bytes: asset.buffer.byteLength, sha256: asset.sha256,
        });
        if (stagedAssetRows.length >= 50) {
          const { error } = await context.supabase.from("agent_project_asset_staging").insert(stagedAssetRows.splice(0));
          if (error) throw new Error("Could not stage binary asset metadata: " + error.message);
        }
      }
      if (stagedAssetRows.length) {
        const { error } = await context.supabase.from("agent_project_asset_staging").insert(stagedAssetRows);
        if (error) throw new Error("Could not stage binary asset metadata: " + error.message);
      }

      const textRows = Object.entries(snapshot.files).map(([filePath, content]) => ({
        import_id: importId, project_id: data.projectId, user_id: context.userId, file_path: filePath, content,
      }));
      for (let offset = 0; offset < textRows.length; offset += 100) {
        const { error } = await context.supabase.from("agent_project_file_staging").insert(textRows.slice(offset, offset + 100));
        if (error) throw new Error("Could not stage workspace source files: " + error.message);
      }
      const { error: finalizeError } = await context.supabase.rpc("finalize_agent_project_workspace_staging", {
        p_project_id: data.projectId, p_import_id: importId,
      });
      if (finalizeError) throw new Error("Could not finalize the saved workspace: " + finalizeError.message);
      const oldPaths = (oldAssetsResult.data ?? []).map((asset) => asset.storage_path).filter((storagePath) => !retainedAssetPaths.has(storagePath));
      if (oldPaths.length) {
        const { error: cleanupError } = await context.supabase.storage.from("builder-project-assets").remove(oldPaths);
        if (cleanupError) console.warn("Old Builder asset cleanup is pending:", cleanupError.message);
      }
      return { files: snapshot.files, fileCount: totalFiles, textFileCount: Object.keys(snapshot.files).length, binaryAssetCount: snapshot.binaryAssets.length };
    } catch (error) {
      await context.supabase.from("agent_project_file_staging").delete().eq("import_id", importId).eq("project_id", data.projectId).eq("user_id", context.userId);
      await context.supabase.from("agent_project_asset_staging").delete().eq("import_id", importId).eq("project_id", data.projectId).eq("user_id", context.userId);
      if (uploadedPaths.length) await context.supabase.storage.from("builder-project-assets").remove(uploadedPaths);
      throw error;
    }
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
      const reservedSubdomains = new Set(["www", "api", "admin", "auth", "mail", "status", "cdn", "assets"]);
      if (data.environment === "production" && process.env["PUBLIC_APP_DOMAIN"] && reservedSubdomains.has(data.slug)) {
        throw new Error("That slug is reserved for a system subdomain. Choose another project URL.");
      }
      const { loadProjectPublicEnvironment } = await import("./project-secrets.server");
      const projectEnvironment = await loadProjectPublicEnvironment(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.supabase as any,
        context.userId,
        data.projectId,
      );
      const { publishDaytonaProject } = await import("./daytona-terminal.server");
      const result = await publishDaytonaProject(
        data.projectId,
        files,
        data.slug,
        context.userId,
        context.supabase,
        projectEnvironment,
      );

      const appUrl = (process.env["APP_URL"] || "https://expertsteam.giize.com").replace(/\/$/, "");
      let publicUrl: string;
      if (data.environment === "staging") {
        publicUrl = appUrl + "/staging/" + encodeURIComponent(data.slug);
      } else {
        const configuredDomain = process.env["PUBLIC_APP_DOMAIN"]?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
        if (configuredDomain) {
          const domainUrl = new URL("https://" + configuredDomain);
          if (domainUrl.pathname !== "/" || domainUrl.search || domainUrl.hash) throw new Error("PUBLIC_APP_DOMAIN must contain only a hostname.");
          publicUrl = "https://" + data.slug + "." + domainUrl.hostname;
        } else {
          publicUrl = appUrl + "/apps/" + encodeURIComponent(data.slug);
        }
      }

      const { data: deploymentId, error: recordError } = await context.supabase.rpc("record_agent_project_deployment", {
        p_project_id: data.projectId,
        p_slug: data.slug,
        p_environment: data.environment,
        p_release_id: result.releaseId,
        p_deployment_url: result.url,
        p_public_url: publicUrl,
        p_file_count: result.fileCount,
      });
      if (recordError || !deploymentId) {
        throw new Error(recordError?.message || "The app was built, but its deployment history could not be saved.");
      }

      const { error: buildLogError } = await context.supabase.from("agent_project_build_logs").insert({
        project_id: data.projectId,
        user_id: context.userId,
        environment: data.environment,
        status: "success",
        release_id: result.releaseId,
        message: "Published " + data.environment + " release " + result.releaseId + " with " + result.fileCount + " files.",
      });
      if (buildLogError) console.warn("[ExpertsTeam deployment] Could not save build log:", buildLogError.message);

      if (data.environment === "production") {
        const { data: existing } = await context.supabase
          .from("agent_projects")
          .select("thumbnail_url")
          .eq("id", data.projectId)
          .eq("user_id", context.userId)
          .maybeSingle();
        if (!existing?.thumbnail_url) {
          await context.supabase
            .from("agent_projects")
            .update({
              thumbnail_url: "https://image.thum.io/get/width/1200/crop/675/noanimate/maxAge/24/" + publicUrl,
            })
            .eq("id", data.projectId)
            .eq("user_id", context.userId);
        }
      }

      return { ...result, publicUrl, deploymentId, environment: data.environment };
    } catch (error) {
      await context.supabase
        .from("agent_projects")
        .update({ last_build_status: "failed", last_build_at: new Date().toISOString() })
        .eq("id", data.projectId)
        .eq("user_id", context.userId);
      await context.supabase.from("agent_project_build_logs").insert({
        project_id: data.projectId,
        user_id: context.userId,
        environment: data.environment,
        status: "failed",
        message: (error instanceof Error ? error.message : String(error)).slice(0, 4000),
      }).then(({ error: logError }) => {
        if (logError) console.warn("[ExpertsTeam deployment] Could not save failure log:", logError.message);
      });
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


export const stopAgentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { stopDaytonaProjectPreview } = await import("./daytona-terminal.server");
    return stopDaytonaProjectPreview(data.projectId);
  });
