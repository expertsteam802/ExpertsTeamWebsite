import { posix as path } from "node:path";

import { generateGeminiContent } from "./gemini.server";

type AgentInput = {
  prompt: string;
  modelTier?: "fast" | "balanced" | "architect";
  files: Record<string, string>;
  history: { role: "user" | "assistant"; content: string }[];
  referenceImage?: {
    name: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    data: string;
  };
  referenceImages?: {
    name: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    data: string;
  }[];
};

const AGENT_PROMPT = `You are the ExpertsTeam coding agent.
You build complete, production-quality browser apps and front-end products for ExpertsTeam, including landing pages, dashboards, SaaS tools, portfolios, apps, prototypes, and product MVPs.

Priority: generate complete, working project code that can be published live and branded as ExpertsTeam.

Your output must be a valid JSON object with this exact shape:
{"message":"short summary of what you did","files":{"path":"full file content",...},"complete":true}

Rules:
- Prefer modern, real-world app structure over tiny single-file demos when the request needs it.
- For full products, generate a Vite + React + TypeScript app when appropriate, with package.json, vite.config.ts, tsconfig.json, index.html, src/main.tsx, src/App.tsx, src/index.css, and supporting files.
- For browser-only prototypes, you may use plain HTML/CSS/JS if simpler, but do not create toy or incomplete apps.
- If a project needs multiple files, include all required files and keep them consistent.
- Before editing, inspect the supplied project context and form a short implementation plan; include that plan in the JSON message, then complete the requested work rather than stopping at a plan.
- When a screenshot or photo reference is attached, treat it as the visual specification: reproduce its layout, proportions, spacing, typography, colors, imagery, responsive behavior and visible interactions as closely as possible. Build real interface code and working controls; never return only a static image or a superficial approximation.
- Treat reference screenshots as a complete product-design brief, not a loose inspiration. Recreate the full visible composition: top bars, sidebars, navigation, tabs, toolbars, panels, canvases, split views, cards, dialogs, menus, typography, spacing, borders, shadows, icon scale and responsive breakpoints.
- If the reference shows multiple tabs, screens or canvases, implement every visible tab and its distinct content/state. Do not collapse a multi-screen product into one generic page or omit controls that appear in the reference.
- Match visual hierarchy and proportions before adding decoration. Use consistent design tokens and reusable components so the result feels like one coherent product.
- Every visible control must perform a real action. Include loading, empty, error, active, selected, disabled and mobile states where relevant. Never use dead buttons, fake data presented as live data, or placeholder sections.
- When editing an existing project, inspect and preserve its architecture, routes, data contracts and current visual identity. Make focused changes instead of replacing the project with a generic template.
- Before returning complete:true, audit every requested screen, tab, responsive layout, interaction, import and route. If a required screen or file is still missing, continue generating it.
- Preserve existing project features and visual identity unless the user explicitly asks to replace them. Do not remove unrelated routes, flows, settings, or data.
- Before marking complete, check that all referenced imports, files, routes, dependencies and interactions are present and mutually consistent.
- For React/Vite projects, ensure src/main.tsx imports an existing src/index.css (or update the import to the stylesheet that actually exists). Never create an entry file that imports a stylesheet you did not return. Include missing supporting files in later continuation rounds instead of leaving TODOs or placeholders.
- Always include only files you created or changed; null values are allowed to delete files.
- Use relative file paths like "src/App.tsx" or "src/index.css".
- Keep the app visually polished, production-ready, and easy to run.
- Brand the app as "ExpertsTeam" everywhere.
- Keep code modern, accessible, and easy to run.
- If the project is meant to be published live, make it production-ready and deployment-friendly.
- You are not limited to static HTML only. If a real app is needed, generate a proper project scaffold.
- Never use browser localStorage/sessionStorage/indexedDB in sandboxed preview code unless the request explicitly requires it and it is safe.
- If persistence is needed, propose Supabase or backend storage instead of fake browser storage.
- Always reply with JSON only. Do not wrap it in markdown fences.
- Do not return placeholder comments like TODO.
- Do not use fake imports or unsupported libraries.
- Keep the app realistic and serious, like Bolt, Lovable, or a proper Vite app, not a toy demo.`;

/**
 * Repairs missing local CSS imports before a generated project reaches the preview.
 * If the app already has a stylesheet (commonly /style.css), wire the missing
 * entry stylesheet to it instead of silently dropping the app's styling.
 */
export function repairMissingStylesheetImports<T extends Record<string, string | null>>(
  sourceFiles: T,
): T {
  const files = { ...sourceFiles } as Record<string, string | null>;
  const importPattern =
    /\bimport\s+(?:[^"'\n;]*?\s+from\s*)?["'](\.{1,2}\/[^"']+\.css(?:\?[^"']*)?)["']/g;

  for (const [importer, content] of Object.entries(files)) {
    if (typeof content !== "string") continue;
    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier || specifier.includes("?")) continue;
      const target = path.normalize(path.join(path.dirname(importer), specifier));
      if (target === ".." || target.startsWith("../") || files[target] !== undefined) continue;

      const availableStylesheet = Object.keys(files).find(
        (candidate) =>
          typeof files[candidate] === "string" &&
          candidate.toLowerCase().endsWith(".css") &&
          path.basename(candidate).toLowerCase() === "style.css",
      );
      if (availableStylesheet) {
        let relative = path.relative(path.dirname(target), availableStylesheet);
        if (!relative.startsWith(".")) relative = "./" + relative;
        files[target] =
          `/* Recovered missing stylesheet entry; original styles are kept in ${availableStylesheet}. */\n@import "${relative}";\n`;
      } else {
        files[target] =
          `/* Recovered missing stylesheet entry. */\n:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n* { box-sizing: border-box; }\nhtml, body, #root { min-height: 100%; margin: 0; }\nbody { min-width: 320px; }\n`;
      }
    }
  }
  return files as T;
}

function getLockedProjectFiles(files: Record<string, string>) {
  const locked = new Set<string>([".experts-locks.json"]);
  try {
    const parsed: unknown = JSON.parse(files[".experts-locks.json"] ?? "[]");
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        if (typeof value === "string" && isSafeProjectPath(value) && files[value] !== undefined) locked.add(value);
      }
    }
  } catch {
    // Invalid lock metadata is ignored; the metadata file itself remains protected.
  }
  return locked;
}

function isSafeProjectPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return (
    normalized.length > 0 &&
    normalized.length <= 512 &&
    !normalized.startsWith("/") &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !normalized.split("/").some((part) => part === ".." || part === "")
  );
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index++;
  return index;
}

function scanJsonString(source: string, start: number): number {
  if (source[start] !== '"') return -1;
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') return index + 1;
  }
  return -1;
}

function recoverCompleteFiles(source: string): Record<string, string | null> {
  const filesKey = /"files"\s*:\s*\{/.exec(source);
  const recovered: Record<string, string | null> = {};
  if (!filesKey || filesKey.index === undefined) return recovered;
  let index = filesKey.index + filesKey[0].length;
  while (index < source.length) {
    index = skipWhitespace(source, index);
    if (source[index] === "}" || source[index] === undefined) break;
    const keyEnd = scanJsonString(source, index);
    if (keyEnd < 0) break;
    let path: string;
    try {
      path = JSON.parse(source.slice(index, keyEnd)) as string;
    } catch {
      break;
    }
    index = skipWhitespace(source, keyEnd);
    if (source[index] !== ":") break;
    index = skipWhitespace(source, index + 1);
    let valueEnd = -1;
    if (source[index] === '"') valueEnd = scanJsonString(source, index);
    else if (source.startsWith("null", index)) valueEnd = index + 4;
    if (valueEnd < 0) break;
    try {
      const value = JSON.parse(source.slice(index, valueEnd)) as unknown;
      if ((typeof value === "string" || value === null) && isSafeProjectPath(path))
        recovered[path] = value;
    } catch {
      break;
    }
    index = skipWhitespace(source, valueEnd);
    if (source[index] === ",") index++;
    else break;
  }
  return recovered;
}

function parseAgentFiles(text: string): {
  message?: string;
  files: Record<string, string | null>;
  complete: boolean;
} {
  try {
    const parsed = JSON.parse(text.trim()) as {
      message?: string;
      files?: Record<string, string | null>;
      complete?: boolean;
    };
    if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
      return { files: recoverCompleteFiles(text), complete: false };
    }
    const files: Record<string, string | null> = {};
    for (const [path, content] of Object.entries(parsed.files)) {
      if (!isSafeProjectPath(path)) throw new Error("Invalid file path: " + path);
      if (typeof content !== "string" && content !== null)
        throw new Error("Invalid content for " + path);
      files[path] = content;
    }
    return {
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      files,
      complete: parsed.complete === true,
    };
  } catch (error) {
    if (error instanceof Error && /Invalid file path|Invalid content/.test(error.message))
      throw error;
    return { files: recoverCompleteFiles(text), complete: false };
  }
}

export async function runAgent(
  { prompt, files, history, referenceImage, referenceImages: suppliedReferenceImages, modelTier = "fast" }: AgentInput,
  apiKey?: string,
) {
  const cleanPrompt = prompt.trim();

  if (!cleanPrompt) throw new Error("Tell the agent what to build.");
  const visualReferences = suppliedReferenceImages?.length
    ? suppliedReferenceImages
    : referenceImage
      ? [referenceImage]
      : [];
  if (
    visualReferences.length > 3 ||
    visualReferences.some(
      (image) =>
        image.data.length > 3_000_000 ||
        !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType),
    ) ||
    visualReferences.reduce((total, image) => total + image.data.length, 0) > 8_000_000
  )
    throw new Error(
      "Use up to three PNG, JPG or WebP references, with a combined size under 8 MB.",
    );
  if (cleanPrompt.length > 100_000) throw new Error("That request exceeds the 100,000-character transport safety envelope.");
  const lockedFilePaths = getLockedProjectFiles(files);
  const entries = Object.entries(files).filter(([filePath]) => filePath !== ".experts-locks.json");
  if (entries.length > 2_000 || entries.some(([path, content]) => !isSafeProjectPath(path) || Buffer.byteLength(content, "utf8") > 10_000_000)) {
    throw new Error("One or more project files exceed the 10 MB per-file safety envelope or have an invalid path.");
  }
  if (entries.reduce((total, [, content]) => total + Buffer.byteLength(content, "utf8"), 0) > 25_000_000) {
    throw new Error("The project exceeds the 25 MB agent request safety envelope.");
  }

  const promptTerms = new Set(cleanPrompt.toLowerCase().match(/[a-z0-9_./-]{3,}/g) ?? []);
  const priorityFiles = [
    ".expertrules",
    "package.json",
    "vite.config.",
    "tsconfig.json",
    "index.html",
    "src/main.",
    "src/app.",
    "src/index.css",
    "src/routes/",
  ];
  const rankedEntries = entries
    .map(([name, content]) => {
      const lowerName = name.toLowerCase();
      let score = priorityFiles.some((path) => lowerName.endsWith(path) || lowerName.includes(path))
        ? 8
        : 0;
      for (const term of promptTerms) if (lowerName.includes(term)) score += 3;
      if (/lock|\.map$|node_modules|dist\//i.test(lowerName)) score -= 20;
      return { name, content, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ name: string; content: string }> = [];
  let remainingCharacters = 36000;
  for (const entry of rankedEntries) {
    if (remainingCharacters <= 0 || selected.length >= 32) break;
    const content = entry.content.slice(0, Math.min(entry.content.length, remainingCharacters));
    if (!content) continue;
    selected.push({ name: entry.name, content });
    remainingCharacters -= content.length;
  }
  const fileDump = selected
    .map(({ name, content }) => "--- " + name + " ---\n" + content)
    .join("\n\n");

  // All coding-agent generations use Kilo Gateway only.
  const providerSequence = ["kilo"];
  const completedFiles: Record<string, string | null> = {};
  const handoffNotes: string[] = [];
  const blockedLockedFiles = new Set<string>();
  let latestMessage = "The agent generated the requested project files.";
  let lastFailure = "";
  let agentOutputBudget = 8192;
  let maxFilesPerRound = 3;
  const maxRounds = 16;

  for (let round = 0; round < maxRounds; round++) {
    const existingNames = Object.keys(completedFiles);
    const collaborationRole =
      round % 3 === 0
        ? "ARCHITECT / PLANNER: check the full request, identify dependencies and decide the next smallest complete batch."
        : round % 3 === 1
          ? "IMPLEMENTER: create the next complete files, respecting the architecture and handoff from previous experts."
          : "INDEPENDENT REVIEWER: inspect the already completed files, find missing requirements or integration defects, then add or correct only what is needed.";
    const continuation =
      round === 0
        ? "User request: " +
          cleanPrompt +
          "\nRelevant current project files:\n" +
          (fileDump || "(empty starter project)")
        : [
            "Continue implementation of this same request: " + cleanPrompt,
            "Return only additional files still required. Do not repeat completed files unless correcting a specific inconsistency.",
            "Already completed files: " + (existingNames.join(", ") || "(none)") + ".",
            "Expert handoff summaries: " + (handoffNotes.slice(-4).join(" | ") || "(first expert round)") + ".",
            "Keep this response small: return at most " + maxFilesPerRound + " complete file(s). If more remain, set complete:false. Set complete:true only when the requested app/change is fully implemented.",
            "If a previous response was truncated, regenerate the missing file from scratch. Never return half a file as completed.",
            "Previously generated file names and short contents:",
            ...Object.entries(completedFiles).map(
              ([path, content]) => "--- " + path + " ---\n" + String(content).slice(0, 500),
            ),
          ].join("\n\n");

    const systemPrompt =
      AGENT_PROMPT +
      "\n\nResponse style: keep progress notes and explanations concise, direct, and useful. Use short sentences and small lists. Do not add long introductions, repeat the request, or explain obvious steps. Put implementation effort into complete working files, not verbose commentary.\n" +
      "Project rules: if a .expertrules file is present in the supplied files, read it first and obey its valid project-specific conventions unless they conflict with security, platform policies, or the user request.\n" +
      "Smart Processing rules:\n" +
      "- Work in resumable batches of no more than 3 complete files per response.\n" +
      '- Return JSON: {"message":"...","files":{"path":"full file content"},"complete":false}.\n' +
      "- Set complete:true only after all necessary files have been supplied across continuation rounds.\n" +
      "- Never intentionally truncate a file. Finish the current file, stop, and set complete:false if output budget is low.\n" +
      "- Do not repeat files already supplied unless fixing a specific inconsistency.\n" +
      "Experts Routing collaboration: each round is a separate expert handoff. Review prior decisions, share a concise progress summary, and continue from the last complete file. The current role is: " +
      collaborationRole +
      "\nDo not claim completion while required screens, files, tests or interactions remain. Never claim tests, builds, runtime behavior, browser verification, or deployment were executed unless an actual tool result in this run proves it. When you only generated or saved source files, say implementation was written and clearly state that runtime verification remains outstanding.";

    const startAt = round % providerSequence.length;
    const rotatedProviders = [
      ...providerSequence.slice(startAt),
      ...providerSequence.slice(0, startAt),
    ];
    try {
      const response = await generateGeminiContent(
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: agentOutputBudget },
          contents: [
            ...history.slice(-8).map((message) => ({
              role: message.role === "assistant" ? ("model" as const) : ("user" as const),
              parts: [{ text: message.content.slice(-1400) }],
            })),
            {
              role: "user",
              parts: [
                {
                  text:
                    continuation +
                    (visualReferences.length
                      ? "\n\nVISUAL REFERENCES: Inspect every attached screenshot/photo. Use them together as a complete visual specification for the requested screens, tabs, panels and canvases. Reproduce the layouts and working interactions, not just the images. Reference files: " +
                        visualReferences.map((image) => image.name).join(", ")
                      : ""),
                },
                ...visualReferences.map((image) => ({
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                  },
                })),
              ],
            },
          ],
        },
        apiKey,
        rotatedProviders,
        modelTier === "architect"
          ? (process.env["KILO_ARCHITECT_MODEL"] || process.env["KILO_MODEL"] || "kilo-auto/free")
          : modelTier === "balanced"
            ? (process.env["KILO_BALANCED_MODEL"] || process.env["KILO_MODEL"] || "kilo-auto/free")
            : (process.env["KILO_FAST_MODEL"] || "kilo-auto/free"),
      );

      const candidate = response.candidates?.[0];
      const responseText =
        candidate?.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join("") ?? "";
      const parsed = parseAgentFiles(responseText);
      for (const [path, content] of Object.entries(parsed.files)) {
        if (lockedFilePaths.has(path)) blockedLockedFiles.add(path);
        else completedFiles[path] = content;
      }
      if (parsed.message) {
        latestMessage = parsed.message;
        handoffNotes.push(parsed.message.slice(0, 1200));
      }

      if (parsed.complete && candidate?.finishReason !== "MAX_TOKENS") {
        const lockNote = blockedLockedFiles.size
          ? " AI changes were skipped for locked files: " + [...blockedLockedFiles].join(", ") + "."
          : "";
        return { message: latestMessage + lockNote, files: repairMissingStylesheetImports(completedFiles) };
      }
      if (candidate?.finishReason === "MAX_TOKENS") {
        maxFilesPerRound = 1;
        lastFailure =
          "A model reached its output limit; retrying with a single-file batch and the full output budget.";
      } else if (!Object.keys(parsed.files).length) {
        lastFailure = "A model returned incomplete file data; switching providers and retrying.";
      }
    } catch (error) {
      if (error instanceof Error && /Invalid file path|Invalid content/.test(error.message)) {
        throw new Error("AI did not return complete app files: " + error.message);
      }
      lastFailure = error instanceof Error ? error.message : String(error);
      // Quota/auth failures will not improve by repeating the same request.
      if (/rate limit|free access is unavailable|HTTP 401|HTTP 402|HTTP 403|does not support image input/i.test(lastFailure)) {
        throw new Error(lastFailure);
      }
    }
  }

  if (Object.keys(completedFiles).length > 0) {
    throw new Error(
      "The agent reached its continuation limit before the full request was complete. " +
        "It prepared " +
        Object.keys(completedFiles).length +
        " complete file(s), but did not apply a partial project update. " +
        "Retry with a narrower request or ask the agent to continue in smaller steps.",
    );
  }
  throw new Error(
    lastFailure
      ? "AI providers could not produce complete files. " +
          lastFailure +
          " Your existing files were not replaced."
      : "AI did not return any complete files. Your existing files were not replaced.",
  );
}

export async function pushToGithub({
  token,
  repo,
  files,
  message,
}: {
  token: string;
  repo: string;
  files: Record<string, string>;
  message: string;
}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "experts-team-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`GitHub request failed (${response.status}): ${detail.slice(0, 1200)}`);
    }
    return response;
  };
  const api = "https://api.github.com";
  const user = (await (await request(api + "/user")).json()) as { login?: string };
  if (!user.login) throw new Error("GitHub did not return the connected account name.");
  const login = user.login;
  const repoParts = repo.split("/").filter(Boolean);
  if (repoParts.length < 1 || repoParts.length > 2 || repoParts.some((part) => !/^[A-Za-z0-9_.-]{1,100}$/.test(part))) {
    throw new Error("Choose a GitHub repository as owner/name.");
  }
  const owner = repoParts.length === 2 ? repoParts[0] : login;
  const repository = repoParts.length === 2 ? repoParts[1] : repoParts[0];
  const repoApi = api + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repository);

  let repoInfo: { default_branch?: string };
  const repoResponse = await fetch(repoApi, { headers });
  if (repoResponse.status === 404) {
    if (owner !== login) throw new Error("The selected organization repository does not exist or you lack permission to create it.");
    await request(api + "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: repository,
        auto_init: true,
        description: "Built with the ExpertsTeam agent",
      }),
    });
    const createdInfo = await request(repoApi);
    repoInfo = (await createdInfo.json()) as { default_branch?: string };
  } else if (!repoResponse.ok) {
    throw new Error(`GitHub could not open the target repository (${repoResponse.status}).`);
  } else {
    repoInfo = (await repoResponse.json()) as { default_branch?: string };
  }

  const allFiles: Record<string, string> = {
    ...files,
    ".github/workflows/deploy.yml": PAGES_WORKFLOW,
  };
  if (!allFiles["README.md"]) {
    allFiles["README.md"] =
      `# ${repository}\n\nBuilt with the ExpertsTeam AI agent.\n\nLive: https://${owner}.github.io/${repository}/\n`;
  }

  const entries = Object.entries(allFiles);
  if (!entries.length) throw new Error("There are no project files to push.");
  for (const [filePath, content] of entries) {
    if (!isSafeProjectPath(filePath)) throw new Error("Refusing to push an unsafe file path: " + filePath);
    if (typeof content !== "string") throw new Error("A project file is not text: " + filePath);
  }

  const branch = repoInfo.default_branch || "main";
  const refPath = branch.split("/").map(encodeURIComponent).join("/");
  let parentCommit: string | undefined;
  let baseTree: string | undefined;
  const refResponse = await fetch(repoApi + "/git/ref/heads/" + refPath, { headers });
  if (refResponse.ok) {
    const ref = (await refResponse.json()) as { object?: { sha?: string } };
    parentCommit = ref.object?.sha;
    if (parentCommit) {
      const commit = (await (await request(repoApi + "/git/commits/" + parentCommit)).json()) as {
        tree?: { sha?: string };
      };
      baseTree = commit.tree?.sha;
    }
  } else if (refResponse.status !== 404) {
    throw new Error(`GitHub could not read branch ${branch} (${refResponse.status}).`);
  }

  // Upload blobs in bounded concurrency, then publish one Git tree + commit.
  // This avoids two Contents API calls per file and handles much larger trees.
  const treeEntries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  for (let offset = 0; offset < entries.length; offset += 6) {
    const batch = entries.slice(offset, offset + 6);
    const blobs = await Promise.all(batch.map(async ([filePath, content]) => {
      const response = await request(repoApi + "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content, encoding: "utf-8" }),
      });
      const blob = (await response.json()) as { sha?: string };
      if (!blob.sha) throw new Error("GitHub did not return a blob ID for " + filePath);
      return { path: filePath, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }));
    treeEntries.push(...blobs);
  }

  const treePayload: { base_tree?: string; tree: typeof treeEntries } = { tree: treeEntries };
  if (baseTree) treePayload.base_tree = baseTree;
  const treeResponse = await request(repoApi + "/git/trees", {
    method: "POST",
    body: JSON.stringify(treePayload),
  });
  const tree = (await treeResponse.json()) as { sha?: string };
  if (!tree.sha) throw new Error("GitHub did not return the new project tree.");

  const commitResponse = await request(repoApi + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      ...(parentCommit ? { parents: [parentCommit] } : {}),
    }),
  });
  const commit = (await commitResponse.json()) as { sha?: string };
  if (!commit.sha) throw new Error("GitHub did not return the new project commit.");

  if (parentCommit) {
    await request(repoApi + "/git/refs/heads/" + refPath, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await request(repoApi + "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: commit.sha }),
    });
  }

  await fetch(repoApi + "/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({ build_type: "workflow" }),
  }).catch(() => undefined);

  return {
    url: `https://github.com/${owner}/${repository}`,
    pagesUrl: `https://${owner}.github.io/${repository}/`,
  };
}

const PAGES_WORKFLOW = `name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "."
      - id: deployment
        uses: actions/deploy-pages@v4
`;


/** Low-cost, no-user-credit runtime repair. Returns only changed existing files. */
export async function runAgentSelfHeal(input: {
  error: { message: string; stack?: string; file?: string; line?: number };
  files: Record<string, string>;
}) {
  const lockedFilePaths = getLockedProjectFiles(input.files);
  const safeFiles = Object.entries(input.files)
    .filter(([name]) => {
      if (lockedFilePaths.has(name)) return false;
      const parts = name.split("/");
      return isSafeProjectPath(name) && !parts.some((part) =>
        part === ".env" || part.startsWith(".env.") ||
        part.toLowerCase().startsWith("secret") || part.toLowerCase().startsWith("credential") ||
        ["node_modules", "dist", ".git", ".experts-terminal"].includes(part)
      );
    })
    .sort((a, b) => {
      const priority = (name: string) => ["package.json", "index.html", "main.tsx", "main.ts", "App.tsx", "App.jsx", "index.css"].includes(name.split("/").pop() ?? "") ? 0 : 1;
      return priority(a[0]) - priority(b[0]);
    })
    .slice(0, 18);
  const total = safeFiles.reduce((sum, [, content]) => sum + Buffer.byteLength(content, "utf8"), 0);
  if (!safeFiles.length || total > 180_000) {
    throw new Error("This project is too large for an automatic runtime repair. Use Build mode to fix it safely.");
  }
  const errorText = [
    "Runtime error: " + input.error.message.slice(0, 3000),
    input.error.file ? "File: " + input.error.file.slice(0, 500) : "",
    Number.isFinite(input.error.line) ? "Line: " + input.error.line : "",
    input.error.stack ? "Stack:\n" + input.error.stack.slice(0, 5000) : "",
  ].filter(Boolean).join("\n");
  const context = safeFiles.map(([name, content]) => "--- " + name + " ---\n" + content).join("\n\n");
  const systemPrompt = [
    "You are the ExpertsTeam runtime self-repair specialist.",
    "Fix only the specific runtime error supplied. Make the smallest safe correction possible.",
    "Return one valid JSON object only: {\"message\":\"short explanation\",\"files\":{\"existing/path\":\"complete replacement content\"}}.",
    "Only return files that already exist in the supplied project. Never create files, delete files, change package dependencies, add network calls, or rewrite unrelated features.",
    "Never return secrets, environment files, credentials, binary assets, or internal tool configuration.",
    "If the error cannot be confidently fixed from the supplied context, return {\"message\":\"Manual review required\",\"files\":{}}.",
    "Do not claim the repair was tested or verified."
  ].join("\n");
  const response = await generateGeminiContent({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: errorText + "\n\nPROJECT FILES:\n" + context }] }],
    generationConfig: { maxOutputTokens: 3600, responseMimeType: "application/json" },
  });
  const raw = response.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim();
  if (!raw) throw new Error("The repair model did not return a patch.");
  let parsed: { message?: string; files?: Record<string, unknown> };
  try { parsed = JSON.parse(raw) as typeof parsed; }
  catch { throw new Error("The repair model returned an invalid patch. No project files were changed."); }
  if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
    throw new Error("The repair model returned no valid file patch.");
  }
  const allowed = new Map(safeFiles);
  const changed: Record<string, string> = {};
  for (const [filePath, value] of Object.entries(parsed.files)) {
    if (!isSafeProjectPath(filePath) || !allowed.has(filePath) || typeof value !== "string") {
      throw new Error("The repair model attempted to modify an unsupported file. No changes were applied.");
    }
    if (value.length > 1_000_000) throw new Error("A proposed repair is too large.");
    if (value !== allowed.get(filePath)) changed[filePath] = value;
  }
  return {
    message: typeof parsed.message === "string" ? parsed.message.slice(0, 800) : "Runtime repair prepared.",
    files: changed,
  };
}

/** Conversational Agent response. This path is read-only: it never returns file patches or invokes a terminal. */
export async function runAgentChat(
  { prompt, files, history, modelTier = "fast" }: AgentInput,
) {
  const selectedFiles = Object.entries(files)
    .filter(([name]) => !/node_modules|(^|\/)dist\//i.test(name))
    .slice(0, 12);
  const projectContext = selectedFiles.map(([name, content]) =>
    "--- " + name + " ---\n" + content.slice(0, 1800)
  ).join("\n\n").slice(0, 12000);
  const systemPrompt = [
    "You are ExpertsTeam Agent, a helpful, technically capable coding partner.",
    "This is conversational chat mode. Answer greetings, questions, explanations, and follow-up discussion naturally.",
    "Do not create, edit, delete, or claim to have changed project files. Do not invoke a terminal, CLI, shell, or remote sandbox.",
    "If the user asks to implement a change, explain briefly that Build mode is the correct action rather than pretending it was implemented.",
    "Use the project context only to answer accurately. Never claim that tests, builds, deployments, or commands were run.",
    "Be direct, concise, friendly, and honest. Represent ExpertsTeam as a serious software and AI product company."
  ].join("\n");
  const response = await generateGeminiContent({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history.slice(-8).map((message) => ({
        role: message.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: message.content.slice(-2200) }],
      })),
      {
        role: "user" as const,
        parts: [{
          text: "USER MESSAGE:\n" + prompt + "\n\nCURRENT PROJECT CONTEXT (read-only):\n" + (projectContext || "(empty project)")
        }]
      }
    ],
    generationConfig: { maxOutputTokens: 1600 },
  }, undefined, ["kilo"], modelTier === "architect"
    ? (process.env["KILO_ARCHITECT_MODEL"] || "kilo-auto/free")
    : modelTier === "balanced"
      ? (process.env["KILO_BALANCED_MODEL"] || "kilo-auto/free")
      : (process.env["KILO_FAST_MODEL"] || process.env["KILO_MODEL"] || "kilo-auto/free"));
  const message = response.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("").trim();
  if (!message) throw new Error("ExpertsTeam Agent could not generate a reply. Please try again.");
  return { message, files: {} as Record<string, string | null>, mode: "chat" as const };
}

/** Kilo-only planning pass. It reads the saved project snapshot but never returns file mutations. */
export async function runAgentPlan(
  { prompt, files, history, referenceImage, referenceImages: suppliedReferenceImages, modelTier = "fast" }: AgentInput,
) {
  const visualReferences = suppliedReferenceImages?.length
    ? suppliedReferenceImages
    : referenceImage ? [referenceImage] : [];
  const selectedFiles = Object.entries(files)
    .filter(([name]) => !/node_modules|(^|\/)dist\//i.test(name))
    .sort((left, right) => {
      const priority = (name: string) => /^(package\.json|index\.html|vite\.config|src\/main|src\/App|src\/index\.css)/i.test(name) ? 0 : 1;
      return priority(left[0]) - priority(right[0]);
    })
    .slice(0, 28);
  const projectContext = selectedFiles.map(([name, content]) =>
    "--- " + name + " ---\n" + content.slice(0, 4500)
  ).join("\n\n").slice(0, 28000);
  const systemPrompt = [
    "You are the planning mode of the ExpertsTeam coding agent.",
    "Use the Kilo Gateway only. You do not have or need a terminal, CLI, remote sandbox, or external project workspace.",
    "Inspect the supplied project files and conversation. Produce a practical implementation plan for the user's latest request.",
    "Return readable Markdown, not JSON. Do not output code patches and do not create, edit, delete, or rename files.",
    "Be specific: affected files, components/routes, data flow, dependencies, risks, ordered implementation steps, and verification checks.",
    "Preserve existing architecture and unrelated functionality. If the project context is incomplete, state the assumptions.",
    "Keep the plan concise and actionable."
  ].join("\n");
  const contents = [
    ...history.slice(-8).map((message) => ({
      role: message.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: message.content.slice(-1800) }],
    })),
    {
      role: "user" as const,
      parts: [
        { text: "LATEST REQUEST:\n" + prompt + "\n\nCURRENT PROJECT FILES:\n" + (projectContext || "(empty project)") },
        ...visualReferences.map((image) => ({
          inlineData: { mimeType: image.mimeType, data: image.data },
        })),
      ],
    },
  ];
  const response = await generateGeminiContent({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: 3000 },
  }, undefined, undefined, modelTier === "architect"
    ? (process.env["KILO_ARCHITECT_MODEL"] || process.env["KILO_MODEL"] || "kilo-auto/free")
    : modelTier === "balanced"
      ? (process.env["KILO_BALANCED_MODEL"] || process.env["KILO_MODEL"] || "kilo-auto/free")
      : (process.env["KILO_FAST_MODEL"] || "kilo-auto/free"));
  const message = response.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("").trim();
  if (!message) throw new Error("Kilo could not produce an implementation plan.");
  return { message, files: {} as Record<string, string | null>, mode: "plan" as const };
}
