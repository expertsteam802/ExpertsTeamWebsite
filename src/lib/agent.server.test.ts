import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { executeAgentCommands, repairMissingStylesheetImports, runAgent, runAgentChat } from "./agent.server";
import { generateExpertAiContent } from "./kilo-gateway.server";
import { compactSmartContents, estimateSmartTokens } from "./smart-processing.server";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const input = { prompt: "Build a game", files: {}, history: [] };

test("agent file tools list, read, search, write and delete project files", () => {
  const initial = {
    "src/App.tsx": "export default function App() { return <main>Hello</main>; }",
    "src/index.css": "body { color: black; }",
    "README.md": "# Project",
  };
  const result = executeAgentCommands(initial, [
    { tool: "list_files", prefix: "src/" },
    { tool: "read_file", path: "src/App.tsx" },
    { tool: "search_files", query: "Hello" },
    { tool: "write_file", path: "src/App.tsx", content: "export default function App() { return <main>Updated</main>; }" },
    { tool: "delete_file", path: "README.md" },
  ]);
  assert.equal(result.changedFiles["src/App.tsx"], "export default function App() { return <main>Updated</main>; }");
  assert.equal(result.changedFiles["README.md"], null);
  assert.equal(result.results.length, 5);
  assert.match(result.results[0] ?? "", /src\\/App.tsx/);
  assert.match(result.results[1] ?? "", /Hello/);
  assert.match(result.results[2] ?? "", /src\\/App.tsx/);
});

test("agent file tools refuse locked and sensitive files", () => {
  const result = executeAgentCommands(
    { "src/App.tsx": "safe", ".env": "secret" },
    [
      { tool: "write_file", path: "src/App.tsx", content: "changed" },
      { tool: "read_file", path: ".env" },
    ],
    new Set(["src/App.tsx"]),
  );
  assert.equal(result.changedFiles["src/App.tsx"], undefined);
  assert.match(result.results[0] ?? "", /locked/);
  assert.throws(() => executeAgentCommands({}, [
    { tool: "write_file", path: "../outside.ts", content: "unsafe" },
  ]), /unsafe path|invalid file path/i);
});

test("agent repairs a missing stylesheet import by reusing style.css", () => {
  const files = repairMissingStylesheetImports({
    "src/main.tsx": 'import "./index.css";',
    "style.css": "body { background: #111; }",
  });
  assert.match(files["src/index.css"] ?? "", /@import "..\/style.css"/);
});

test("agent creates a minimal stylesheet when an imported CSS entry is missing", () => {
  const files = repairMissingStylesheetImports({ "src/main.tsx": 'import "./index.css";' });
  assert.match(files["src/index.css"] ?? "", /box-sizing: border-box/);
});

test("Agent chat forwards attached visual references to ExpertAI", async () => {
  let sawImage = false;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: { content?: { type?: string; image_url?: { url?: string } }[] }[];
    };
    sawImage = Boolean(body.messages?.some((message) =>
      Array.isArray(message.content) && message.content.some((part) =>
        part.type === "image_url" && part.image_url?.url?.startsWith("data:image/webp;base64,"),
      ),
    ));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "I can see the screenshot." } }] });
  }) as typeof fetch;

  const result = await runAgentChat({
    prompt: "What is in this screenshot?",
    files: {},
    history: [],
    referenceImages: [{ name: "screen.webp", mimeType: "image/webp", data: "aGVsbG8=" }],
  });
  assert.match(result.message, /see the screenshot/i);
  assert.equal(sawImage, true);
});

test("ExpertAI anonymous gateway receives a larger output budget and returns normalized text", async () => {
  let requestBody: { model?: string; max_tokens?: number } | undefined;
  let authorization: string | null = null;
  globalThis.fetch = (async (url, init) => {
    assert.match(String(url), /ai-gateway\.kilo\.ai\/api\/v1\/chat\/completions$/);
    authorization = new Headers(init?.headers).get("authorization");
    requestBody = JSON.parse(String(init?.body ?? "{}")) as typeof requestBody;
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: "Hello from ExpertAI" } }],
    });
  }) as typeof fetch;

  const response = await generateExpertAiContent({
    systemInstruction: { parts: [{ text: "You are ExpertAI." }] },
    contents: [{ role: "user", parts: [{ text: "Say hello." }] }],
    generationConfig: { maxOutputTokens: 8192 },
  });
  assert.equal(requestBody?.model, "kilo-auto/free");
  assert.equal(requestBody?.max_tokens, 8192);
  assert.equal(authorization, null);
  assert.equal(response.candidates?.[0]?.content?.parts?.[0]?.text, "Hello from ExpertAI");
});

test("ExpertAI adapter forwards image attachments in OpenAI-compatible format", async () => {
  let sawImage = false;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: { content?: { type?: string; image_url?: { url?: string } }[] }[];
    };
    sawImage = Boolean(body.messages?.some((message) =>
      Array.isArray(message.content) && message.content.some((part) =>
        part.type === "image_url" && part.image_url?.url?.startsWith("data:image/png;base64,"),
      ),
    ));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Image received." } }] });
  }) as typeof fetch;

  await generateExpertAiContent({
    systemInstruction: { parts: [{ text: "You are ExpertAI." }] },
    contents: [{ role: "user", parts: [
      { text: "Describe this image." },
      { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } },
    ] }],
  });
  assert.equal(sawImage, true);
});

test("ExpertAI free-model IP quota is identified separately and fails once", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ error: { message: "Rate limit exceeded for free models per IP address." } }, { status: 429 });
  }) as typeof fetch;
  await assert.rejects(
    generateExpertAiContent({
      systemInstruction: { parts: [{ text: "You are ExpertAI." }] },
      contents: [{ role: "user", parts: [{ text: "Help." }] }],
    }),
    /temporarily busy/i,
  );
  assert.equal(calls, 1);
});

test("ExpertAI upstream provider 429 is not mislabeled as the shared IP quota", async () => {
  globalThis.fetch = (async () =>
    Response.json({ error: { message: "The selected upstream model is temporarily rate limited." } }, { status: 429 })
  ) as typeof fetch;
  await assert.rejects(
    generateExpertAiContent({
      systemInstruction: { parts: [{ text: "You are ExpertAI." }] },
      contents: [{ role: "user", parts: [{ text: "Help." }] }],
    }),
    /temporarily busy/i,
  );
});

test("coding agent sends 8192 output tokens to ExpertAI and returns complete files", async () => {
  let model = "";
  let outputBudget = 0;
  globalThis.fetch = (async (url, init) => {
    assert.match(String(url), /ai-gateway\.kilo\.ai/);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string; max_tokens?: number };
    model = body.model ?? "";
    outputBudget = body.max_tokens ?? 0;
    return Response.json({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            message: "Created the game.",
            files: { "index.html": "<h1>Game</h1>" },
            complete: true,
          }),
        },
      }],
    });
  }) as typeof fetch;

  const result = await runAgent(input);
  assert.equal(model, "kilo-auto/free");
  assert.equal(outputBudget, 8192);
  assert.equal(result.files["index.html"], "<h1>Game</h1>");
});

test("coding agent stops immediately when ExpertAI's IP quota is exhausted", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("rate limit exceeded", { status: 429 });
  }) as typeof fetch;
  await assert.rejects(runAgent(input), /rate limit|temporarily busy/i);
  assert.equal(calls, 1);
});

test("agent rejects unsafe generated file paths", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            message: "Bad path",
            files: { "../outside.html": "not safe" },
            complete: true,
          }),
        },
      }],
    })) as typeof fetch;
  await assert.rejects(runAgent(input), /Invalid file path/i);
});

test("Smart Processing keeps the newest request while compacting old history", () => {
  const compacted = compactSmartContents([
    { role: "user", parts: [{ text: "old".repeat(1200) }] },
    { role: "model", parts: [{ text: "answer".repeat(1200) }] },
    { role: "user", parts: [{ text: "Build checkout and preserve the existing layout." }] },
  ]);
  const combined = compacted.flatMap((item) => item.parts.map((part) => part.text ?? "")).join("\n");
  assert.match(combined, /Build checkout and preserve the existing layout/);
  assert.ok(compacted.length <= 5);
});

test("Smart Processing preserves image payloads in the latest user request", () => {
  const image = { mimeType: "image/png", data: "aGVsbG8=" };
  const compacted = compactSmartContents([
    { role: "user", parts: [{ text: "Inspect this." }, { inlineData: image }] },
  ]);
  assert.deepEqual(compacted[0]?.parts[1], { inlineData: image });
});

test("Smart token estimate is conservative", () => {
  assert.equal(estimateSmartTokens("a".repeat(1000)), 500);
});

test("ExpertAI adapter drops unsupported JSON response mode and retries", async () => {
  let calls = 0;
  const sawFormats: boolean[] = [];
  globalThis.fetch = (async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body ?? "{}")) as { response_format?: unknown };
    sawFormats.push(Boolean(body.response_format));
    if (calls === 1) return new Response("unsupported parameter response_format", { status: 400 });
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }] });
  }) as typeof fetch;
  const response = await generateExpertAiContent({
    systemInstruction: { parts: [{ text: "Return JSON." }] },
    contents: [{ role: "user", parts: [{ text: "Return ok true." }] }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1024 },
  });
  assert.equal(calls, 2);
  assert.deepEqual(sawFormats, [true, false]);
  assert.equal(response.candidates?.[0]?.content?.parts?.[0]?.text, "{\"ok\":true}");
});
