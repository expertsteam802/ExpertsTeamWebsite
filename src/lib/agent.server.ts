import { generateGeminiContent } from "./gemini.server";

type AgentInput = {
  prompt: string;
  files: Record<string, string>;
  history: { role: "user" | "assistant"; content: string }[];
};

const AGENT_PROMPT = `You are the Experts Team 802 coding agent.
You build complete, production-quality browser apps and front-end products for Experts Team 802, including landing pages, dashboards, SaaS tools, portfolios, apps, prototypes, and product MVPs.

Priority: generate complete, working project code that can be published live and branded as Experts Team 802.

Your output must be a valid JSON object with this exact shape:
{"message":"short summary of what you did","files":{"path":"full file content",...}}

Rules:
- Prefer modern, real-world app structure over tiny single-file demos when the request needs it.
- For full products, generate a Vite + React + TypeScript app when appropriate, with package.json, vite.config.ts, tsconfig.json, index.html, src/main.tsx, src/App.tsx, src/index.css, and supporting files.
- For browser-only prototypes, you may use plain HTML/CSS/JS if simpler, but do not create toy or incomplete apps.
- If a project needs multiple files, include all required files and keep them consistent.
- Always include only files you created or changed; null values are allowed to delete files.
- Use relative file paths like "src/App.tsx" or "src/index.css".
- Keep the app visually polished, production-ready, and easy to run.
- Brand the app as "Experts Team 802" everywhere.
- Keep code modern, accessible, and easy to run.
- If the project is meant to be published live, make it production-ready and deployment-friendly.
- You are not limited to static HTML only. If a real app is needed, generate a proper project scaffold.
- Never use browser localStorage/sessionStorage/indexedDB in sandboxed preview code unless the request explicitly requires it and it is safe.
- If persistence is needed, propose Supabase or backend storage instead of fake browser storage.
- Always reply with JSON only. Do not wrap it in markdown fences.
- Do not return placeholder comments like TODO.
- Do not use fake imports or unsupported libraries.
- Keep the app realistic and serious, like Bolt, Lovable, or a proper Vite app, not a toy demo.`;

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

export async function runAgent({ prompt, files, history }: AgentInput, apiKey?: string) {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new Error("Tell the agent what to build.");
  if (cleanPrompt.length > 16000) throw new Error("That request is too long.");

  const entries = Object.entries(files);
  if (entries.length > 80)
    throw new Error("This project has too many files to send to the agent at once.");
  if (entries.some(([path, content]) => !isSafeProjectPath(path) || content.length > 100000)) {
    throw new Error("One or more project files are too large or have an invalid path.");
  }

  const fileDump = entries.map(([name, content]) => `--- ${name} ---\n${content}`).join("\n\n");
  if (fileDump.length > 200000) {
    throw new Error(
      "This project is too large to send in one request. Reduce the project size and try again.",
    );
  }

  const json = await generateGeminiContent(
    {
      systemInstruction: { parts: [{ text: AGENT_PROMPT }] },
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 32768 },
      contents: [
        ...history.slice(-8).map((message) => ({
          role: message.role === "assistant" ? ("model" as const) : ("user" as const),
          parts: [{ text: message.content.slice(0, 3000) }],
        })),
        {
          role: "user",
          parts: [
            { text: `Current project files:\n${fileDump || "(empty)"}\n\nRequest: ${cleanPrompt}` },
          ],
        },
      ],
    },
    apiKey,
  );

  const candidate = json.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error(
      "Gemini's answer was too large. Ask for a smaller change; your files were not replaced.",
    );
  }

  const text =
    candidate?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";

  try {
    const cleaned = text.trim();
    if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) {
      throw new Error("Not JSON");
    }

    const parsed = JSON.parse(cleaned) as {
      message?: string;
      files?: Record<string, string | null>;
    };

    if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
      throw new Error("Invalid files");
    }

    const output: Record<string, string | null> = {};
    for (const [path, content] of Object.entries(parsed.files)) {
      if (!isSafeProjectPath(path)) throw new Error(`Invalid file path: ${path}`);
      if (typeof content !== "string" && content !== null) throw new Error(`Invalid content for ${path}`);
      output[path] = content;
    }

    if (Object.keys(output).length === 0) {
      throw new Error("No files returned");
    }

    return {
      message: typeof parsed.message === "string" ? parsed.message : "Done.",
      files: output,
    };
  } catch {
    throw new Error(
      "Gemini did not return complete app files. Try a smaller request; your existing files were not changed.",
    );
  }
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
        description: "Built with the Experts Team 802 agent",
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
    allFiles["README.md"] = `# ${repo}\n\nBuilt with the Experts Team 802 AI agent.\n\nLive: https://${login}.github.io/${repo}/\n`;
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
