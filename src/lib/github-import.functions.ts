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
