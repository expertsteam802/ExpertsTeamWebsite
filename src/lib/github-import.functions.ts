import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  updated_at: string;
  owner: { login: string; avatar_url: string };
};

async function githubRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch("https://api.github.com" + path, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ExpertsTeam-Agent-Studio",
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your GitHub connection expired. Reconnect GitHub and try again.");
    if (response.status === 403) throw new Error("GitHub denied access. Check that the connected account has repository access.");
    if (response.status === 404) throw new Error("The selected repository or branch could not be found.");
    throw new Error("GitHub request failed (" + response.status + "). Please try again.");
  }
  return await response.json() as T;
}

async function getGitHubToken(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("get_user_plugin_oauth_secret", {
    p_user_id: userId,
    p_provider: "github",
  });
  if (error) throw new Error("Connect GitHub first from Connections: " + error.message);
  const payload = data as { access_token?: unknown } | null;
  if (!payload || typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("The connected GitHub account has no usable access token. Reconnect GitHub.");
  }
  return payload.access_token;
}

export const listConnectedGitHubRepositories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const token = await getGitHubToken(context.userId);
    const repositories = await githubRequest<GitHubRepository[]>(
      "/user/repos?sort=updated&direction=desc&per_page=100&visibility=all&affiliation=owner,collaborator,organization_member",
      token,
    );
    return repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      default_branch: repo.default_branch,
      html_url: repo.html_url,
      updated_at: repo.updated_at,
      owner: { login: repo.owner.login, avatar_url: repo.owner.avatar_url },
    }));
  });

export const importConnectedGitHubRepository = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    owner: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
    repo: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
    branch: z.string().trim().min(1).max(255),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const token = await getGitHubToken(context.userId);
    const tree = await githubRequest<{
      truncated?: boolean;
      tree: Array<{ path: string; type: string; sha: string; size?: number; mode?: string }>;
    }>(
      "/repos/" + encodeURIComponent(data.owner) + "/" + encodeURIComponent(data.repo) +
      "/git/trees/" + encodeURIComponent(data.branch) + "?recursive=1",
      token,
    );
    if (tree.truncated) throw new Error("This repository is too large to import in one pass. Import a smaller repository or a specific branch.");
    const sourceFiles = tree.tree.filter((item) =>
      item.type === "blob" &&
      !item.path.startsWith(".git/") &&
      !item.path.split("/").some((part) => part === "node_modules" || part === "dist" || part === "build" || part === ".next" || part === ".turbo") &&
      (item.size ?? 0) <= 750_000 &&
      !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm|exe|dll|lockb)$/i.test(item.path)
    ).slice(0, 400);
    if (!sourceFiles.length) throw new Error("No importable source files were found in this repository.");
    const files: Record<string, string> = {};
    let totalBytes = 0;
    for (let i = 0; i < sourceFiles.length; i += 8) {
      const batch = sourceFiles.slice(i, i + 8);
      const blobs = await Promise.all(batch.map(async (file) => {
        const blob = await githubRequest<{ encoding: string; content: string; size: number }>(
          "/repos/" + encodeURIComponent(data.owner) + "/" + encodeURIComponent(data.repo) + "/git/blobs/" + file.sha,
          token,
        );
        if (blob.encoding !== "base64" || typeof blob.content !== "string") return null;
        const decoded = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
        if (decoded.includes(0)) return null;
        const content = decoded.toString("utf8");
        if (content.includes("\uFFFD")) return null;
        return { path: file.path, content, bytes: decoded.byteLength };
      }));
      for (const blob of blobs) {
        if (!blob) continue;
        if (totalBytes + blob.bytes > 8_000_000) break;
        files[blob.path] = blob.content;
        totalBytes += blob.bytes;
      }
      if (totalBytes >= 8_000_000) break;
    }
    if (!Object.keys(files).length) throw new Error("GitHub returned no text source files that can be imported.");
    return {
      owner: data.owner,
      repo: data.repo,
      branch: data.branch,
      files,
      importedCount: Object.keys(files).length,
      skippedCount: tree.tree.filter((item) => item.type === "blob").length - Object.keys(files).length,
    };
  });


const projectSyncInput = z.object({
  projectId: z.string().uuid(),
  direction: z.enum(["push", "pull"]),
  files: z.record(z.string().min(1).max(512), z.string().max(750_000)).optional(),
});

export const syncAgentProjectGitHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => projectSyncInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("agent_projects").select("id,name").eq("id", data.projectId).eq("user_id", context.userId).maybeSingle();
    if (projectError || !project) throw new Error("Project not found or access denied.");
    const { data: link, error: linkError } = await context.supabase.from("project_repos")
      .select("repo_owner,repo_name,default_branch,active_branch").eq("project_id", data.projectId)
      .eq("user_id", context.userId).maybeSingle();
    if (linkError) throw new Error("Could not load the linked GitHub repository: " + linkError.message);
    if (!link) throw new Error("No GitHub repository is linked to this project. Connect GitHub and import or link a repository first.");
    const token = await getGitHubToken(context.userId);
    const branch = link.active_branch || link.default_branch || "main";
    const prefix = "/repos/" + encodeURIComponent(link.repo_owner) + "/" + encodeURIComponent(link.repo_name);
    const ref = await githubRequest<{ object: { sha: string } }>(prefix + "/git/ref/heads/" + encodeURIComponent(branch), token);

    if (data.direction === "push") {
      const files = data.files ?? {};
      const entries = Object.entries(files).filter(([path, content]) =>
        !path.startsWith(".git/") &&
        !path.split("/").some((part) => ["node_modules", "dist", "build", ".next", ".turbo"].includes(part)) &&
        !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm|exe|dll)$/i.test(path) &&
        typeof content === "string"
      );
      if (!entries.length) throw new Error("There are no source files available to push.");
      if (entries.length > 400 || entries.reduce((sum, [, value]) => sum + value.length, 0) > 8_000_000) {
        throw new Error("This project exceeds the GitHub sync limit (400 files / 8 MB per push).");
      }
      const blobs: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
      for (let index = 0; index < entries.length; index += 8) {
        const batch = await Promise.all(entries.slice(index, index + 8).map(async ([path, content]) => {
          const response = await fetch("https://api.github.com" + prefix + "/git/blobs", {
            method: "POST",
            headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ExpertsTeam-Agent-Studio" },
            body: JSON.stringify({ content, encoding: "utf-8" }),
            signal: AbortSignal.timeout(25000),
          });
          if (!response.ok) throw new Error("GitHub could not upload " + path + " (HTTP " + response.status + ").");
          const blob = await response.json() as { sha: string };
          return { path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
        }));
        blobs.push(...batch);
      }
      const baseCommit = await githubRequest<{ tree: { sha: string }; parents: Array<{ sha: string }> }>(prefix + "/git/commits/" + ref.object.sha, token);
      const treeResponse = await fetch("https://api.github.com" + prefix + "/git/trees", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ExpertsTeam-Agent-Studio" },
        body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
        signal: AbortSignal.timeout(25000),
      });
      if (!treeResponse.ok) throw new Error("GitHub could not create the repository tree (HTTP " + treeResponse.status + ").");
      const tree = await treeResponse.json() as { sha: string };
      const commitResponse = await fetch("https://api.github.com" + prefix + "/git/commits", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ExpertsTeam-Agent-Studio" },
        body: JSON.stringify({ message: "Sync from ExpertsTeam Agent Studio", tree: tree.sha, parents: [ref.object.sha] }),
        signal: AbortSignal.timeout(25000),
      });
      if (!commitResponse.ok) throw new Error("GitHub could not create the sync commit (HTTP " + commitResponse.status + ").");
      const commit = await commitResponse.json() as { sha: string };
      const updateResponse = await fetch("https://api.github.com" + prefix + "/git/refs/heads/" + encodeURIComponent(branch), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ExpertsTeam-Agent-Studio" },
        body: JSON.stringify({ sha: commit.sha, force: false }),
        signal: AbortSignal.timeout(25000),
      });
      if (!updateResponse.ok) throw new Error("GitHub rejected the branch update. The remote branch may have changed; pull and review before pushing again.");
      return { direction: "push" as const, branch, count: blobs.length, commit: commit.sha, repository: link.repo_owner + "/" + link.repo_name };
    }

    const remoteTree = await githubRequest<{ truncated?: boolean; tree: Array<{ path: string; type: string; sha: string; size?: number }> }>(
      prefix + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1", token,
    );
    if (remoteTree.truncated) throw new Error("GitHub's repository tree is too large to pull in one pass.");
    const sourceFiles = remoteTree.tree.filter(item => item.type === "blob" &&
      !item.path.startsWith(".git/") &&
      !item.path.split("/").some(part => ["node_modules", "dist", "build", ".next", ".turbo"].includes(part)) &&
      (item.size ?? 0) <= 750_000 &&
      !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm|exe|dll|lockb)$/i.test(item.path)
    ).slice(0, 400);
    const pulled: Record<string, string> = {};
    for (let index = 0; index < sourceFiles.length; index += 8) {
      const batch = await Promise.all(sourceFiles.slice(index, index + 8).map(async file => {
        const blob = await githubRequest<{ encoding: string; content: string }>(prefix + "/git/blobs/" + file.sha, token);
        if (blob.encoding !== "base64") return null;
        const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
        if (bytes.includes(0)) return null;
        const content = bytes.toString("utf8");
        if (content.includes("\uFFFD")) return null;
        return [file.path, content] as const;
      }));
      for (const item of batch) if (item) pulled[item[0]] = item[1];
    }
    if (!Object.keys(pulled).length) throw new Error("No readable source files were found in the linked GitHub branch.");
    return { direction: "pull" as const, branch, count: Object.keys(pulled).length, files: pulled, repository: link.repo_owner + "/" + link.repo_name };
  });
