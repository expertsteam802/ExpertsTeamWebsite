import { posix as path } from "node:path";

import { generateGeminiContent } from "./gemini.server";

type AgentInput = {
  prompt: string;
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
export function repairMissingStylesheetImports<T extends Record<string, string | null>>(sourceFiles: T): T {
  const files = { ...sourceFiles } as Record<string, string | null>;
  const importPattern = /\bimport\s+(?:[^"'\n;]*?\s+from\s*)?["'](\.{1,2}\/[^"']+\.css(?:\?[^"']*)?)["']/g;

  for (const [importer, content] of Object.entries(files)) {
    if (typeof content !== "string") continue;
    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier || specifier.includes("?")) continue;
      const target = path.normalize(path.join(path.dirname(importer), specifier));
      if (target === ".." || target.startsWith("../") || files[target] !== undefined) continue;

      const availableStylesheet = Object.keys(files).find((candidate) =>
        typeof files[candidate] === "string" &&
        candidate.toLowerCase().endsWith(".css") &&
        path.basename(candidate).toLowerCase() === "style.css"
      );
      if (availableStylesheet) {
        let relative = path.relative(path.dirname(target), availableStylesheet);
        if (!relative.startsWith(".")) relative = "./" + relative;
        files[target] = `/* Recovered missing stylesheet entry; original styles are kept in ${availableStylesheet}. */\n@import "${relative}";\n`;
      } else {
        files[target] = `/* Recovered missing stylesheet entry. */\n:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n* { box-sizing: border-box; }\nhtml, body, #root { min-height: 100%; margin: 0; }\nbody { min-width: 320px; }\n`;
      }
    }
  }
  return files as T;
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
  { prompt, files, history, referenceImage, referenceImages: suppliedReferenceImages }: AgentInput,
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
  if (cleanPrompt.length > 16000) throw new Error("That request is too long.");
  const entries = Object.entries(files);
  if (entries.length > 80)
    throw new Error("This project has too many files to send to the agent at once.");
  if (entries.some(([path, content]) => !isSafeProjectPath(path) || content.length > 100000)) {
    throw new Error("One or more project files are too large or have an invalid path.");
  }

  const promptTerms = new Set(cleanPrompt.toLowerCase().match(/[a-z0-9_./-]{3,}/g) ?? []);
  const priorityFiles = [
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
  let remainingCharacters = 4200;
  for (const entry of rankedEntries) {
    if (remainingCharacters <= 0 || selected.length >= 12) break;
    const content = entry.content.slice(0, Math.min(entry.content.length, remainingCharacters));
    if (!content) continue;
    selected.push({ name: entry.name, content });
    remainingCharacters -= content.length;
  }
  const fileDump = selected
    .map(({ name, content }) => "--- " + name + " ---\\n" + content)
    .join("\\n\\n");

  const configured = (process.env["AI_PROVIDER_ORDER"] || "ollama,groq,gemini,openrouter")
    .split(",")
    .map((item) => item.trim().toLowerCase())
     .filter((item) => ["ollama", "groq", "gemini", "openrouter"].includes(item));
  const providerSequence = [...new Set(["ollama", ...configured, "groq", "gemini", "openrouter"])];
  const completedFiles: Record<string, string | null> = {};
  let latestMessage = "The agent generated the requested project files.";
  let lastFailure = "";
  const maxRounds = 12;

  for (let round = 0; round < maxRounds; round++) {
    const existingNames = Object.keys(completedFiles);
    const continuation =
      round === 0
        ? "User request: " +
          cleanPrompt +
          "\\nRelevant current project files:\\n" +
          (fileDump || "(empty starter project)")
        : [
            "Continue implementation of this same request: " + cleanPrompt,
            "Return only additional files still required. Do not repeat completed files unless correcting a specific inconsistency.",
            "Already completed files: " + (existingNames.join(", ") || "(none)") + ".",
            "Keep this response small: return at most 2 complete files. If more remain, set complete:false. Set complete:true only when the requested app/change is fully implemented.",
            "If a previous response was truncated, regenerate the missing file from scratch. Never return half a file as completed.",
            "Previously generated file names and short contents:",
            ...Object.entries(completedFiles).map(
              ([path, content]) => "--- " + path + " ---\\n" + String(content).slice(0, 500),
            ),
          ].join("\\n\\n");

    const systemPrompt =
      AGENT_PROMPT +
      "\\n\\nResponse style: keep progress notes and explanations concise, direct, and useful. Use short sentences and small lists. Do not add long introductions, repeat the request, or explain obvious steps. Put implementation effort into complete working files, not verbose commentary.\\n" +
      "Smart Processing rules:\\n" +
      "- Work in resumable batches of no more than 2 complete files per response.\\n" +
      '- Return JSON: {"message":"...","files":{"path":"full file content"},"complete":false}.\\n' +
      "- Set complete:true only after all necessary files have been supplied across continuation rounds.\\n" +
      "- Never intentionally truncate a file. Finish the current file, stop, and set complete:false if output budget is low.\\n" +
      "- Do not repeat files already supplied unless fixing a specific inconsistency.";

    const startAt = round % providerSequence.length;
    const rotatedProviders = [
      ...providerSequence.slice(startAt),
      ...providerSequence.slice(0, startAt),
    ];
    try {
      const response = await generateGeminiContent(
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1400 },
          contents: [
            ...history.slice(-4).map((message) => ({
              role: message.role === "assistant" ? ("model" as const) : ("user" as const),
              parts: [{ text: message.content.slice(-700) }],
            })),
            {
              role: "user",
              parts: [
                {
                  text:
                    continuation +
                    (visualReferences.length
                      ? "\\n\\nVISUAL REFERENCES: Inspect every attached screenshot/photo. Use them together as a complete visual specification for the requested screens, tabs, panels and canvases. Reproduce the layouts and working interactions, not just the images. Reference files: " +
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
        visualReferences.length ? ["gemini"] : rotatedProviders,
      );

      const candidate = response.candidates?.[0];
      const responseText =
        candidate?.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join("") ?? "";
      const parsed = parseAgentFiles(responseText);
      for (const [path, content] of Object.entries(parsed.files)) completedFiles[path] = content;
      if (parsed.message) latestMessage = parsed.message;

      if (
        parsed.complete &&
        candidate?.finishReason !== "MAX_TOKENS" &&
        Object.keys(completedFiles).length > 0
      ) {
        return { message: latestMessage, files: repairMissingStylesheetImports(completedFiles) };
      }
      if (candidate?.finishReason === "MAX_TOKENS") {
        lastFailure =
          "A model reached its output limit; continuing with smaller batches and another provider.";
      } else if (!Object.keys(parsed.files).length) {
        lastFailure = "A model returned incomplete file data; switching providers and retrying.";
      }
    } catch (error) {
      if (error instanceof Error && /Invalid file path|Invalid content/.test(error.message)) {
        throw new Error("AI did not return complete app files: " + error.message);
      }
      lastFailure = error instanceof Error ? error.message : String(error);
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
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`GitHub rejected the token (${userRes.status}).`);
  const { login } = (await userRes.json()) as { login: string };

  const repoRes = await fetch(`https://api.github.com/repos/${login}/${repo}`, { headers });
  if (repoRes.status === 404) {
    const created = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: repo,
        auto_init: true,
        description: "Built with the ExpertsTeam agent",
      }),
    });
    if (!created.ok) throw new Error(`Could not create repository: ${await created.text()}`);
  } else if (!repoRes.ok) {
    throw new Error(`GitHub error ${repoRes.status}`);
  }

  const allFiles: Record<string, string> = {
    ...files,
    ".github/workflows/deploy.yml": PAGES_WORKFLOW,
  };

  if (!allFiles["README.md"]) {
    allFiles["README.md"] =
      `# ${repo}\n\nBuilt with the ExpertsTeam AI agent.\n\nLive: https://${login}.github.io/${repo}/\n`;
  }

  for (const [path, content] of Object.entries(allFiles)) {
    const url = `https://api.github.com/repos/${login}/${repo}/contents/${encodeURI(path)}`;
    const existing = await fetch(url, { headers });
    const sha = existing.ok ? ((await existing.json()) as { sha?: string }).sha : undefined;
    const bytes = new TextEncoder().encode(content);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    const put = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: btoa(binary), sha }),
    });
    if (!put.ok) throw new Error(`Failed to push ${path}: ${put.status} ${await put.text()}`);
  }

  await fetch(`https://api.github.com/repos/${login}/${repo}/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ build_type: "workflow" }),
  }).catch(() => undefined);

  return {
    url: `https://github.com/${login}/${repo}`,
    pagesUrl: `https://${login}.github.io/${repo}/`,
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
