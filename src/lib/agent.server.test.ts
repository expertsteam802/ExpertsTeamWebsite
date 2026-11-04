import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { runAgent } from "./agent.server";
import { resetProviderCooldowns } from "./gemini.server";
import { compactSmartContents, estimateSmartTokens } from "./smart-processing.server";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetProviderCooldowns();
});

const input = { prompt: "Build a game", files: {}, history: [] };

test("agent never uses a browser-prefixed key when server credential is missing", async () => {
  const previous = process.env["VITE_GEMINI_API_KEY"];
  process.env["VITE_GEMINI_API_KEY"] = "browser-test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({});
  }) as typeof fetch;
  try {
    await assert.rejects(runAgent(input), /ExpertAI is not connected yet/i);
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env["VITE_GEMINI_API_KEY"];
    else process.env["VITE_GEMINI_API_KEY"] = previous;
  }
});

test("coding agent uses Gemini and returns complete files", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  message: "Built",
                  files: { "index.html": "<h1>Game</h1>" },
                  complete: true,
                }),
              },
            ],
          },
        },
      ],
    });
  }) as typeof fetch;

  const result = await runAgent(input, "test-key");

  assert.deepEqual(urls, [
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  ]);
  assert.equal(result.files["index.html"], "<h1>Game</h1>");
});

test("coding agent falls back to Groq when Gemini is rate limited", async () => {
  const previousOrder = process.env["AI_PROVIDER_ORDER"];
  const previousGroqKey = process.env["GROQ_API_KEY"];
  process.env["AI_PROVIDER_ORDER"] = "gemini,groq";
  process.env["GROQ_API_KEY"] = "groq-test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response("quota exceeded", { status: 429 });
    }
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              message: "Recovered through the fallback provider",
              files: { "index.html": "<h1>Fallback worked</h1>" },
              complete: true,
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await runAgent(input, "test-key");
    assert.equal(result.files["index.html"], "<h1>Fallback worked</h1>");
    assert.equal(urls.length, 2);
    assert.match(urls[1], /api.groq.com/);
  } finally {
    if (previousOrder === undefined) delete process.env["AI_PROVIDER_ORDER"];
    else process.env["AI_PROVIDER_ORDER"] = previousOrder;
    if (previousGroqKey === undefined) delete process.env["GROQ_API_KEY"];
    else process.env["GROQ_API_KEY"] = previousGroqKey;
  }
});

test("truncated output cannot replace existing files", async () => {
  globalThis.fetch = (async () =>
    Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] })) as typeof fetch;

  await assert.rejects(runAgent(input, "test-key"), /files were not replaced/i);
});

test("agent rejects unsafe generated file paths", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  message: "Built",
                  files: { "../outside.html": "not safe" },
                }),
              },
            ],
          },
        },
      ],
    })) as typeof fetch;

  await assert.rejects(runAgent(input, "test-key"), /complete app files/i);
});

test("Smart Processing keeps the newest request while compacting old history", () => {
  const compacted = compactSmartContents([
    { role: "user", parts: [{ text: "old".repeat(1200) }] },
    { role: "model", parts: [{ text: "answer".repeat(1200) }] },
    {
      role: "user",
      parts: [{ text: "Build the checkout page and preserve the existing layout." }],
    },
  ]);
  const combined = compacted
    .flatMap((item) => item.parts.map((part) => part.text ?? ""))
    .join("\\n");
  assert.match(combined, /Build the checkout page and preserve the existing layout/);
  assert.ok(combined.length <= 9_000);
  assert.ok(compacted.length <= 3);
});

test("Smart Processing retains image payloads for Gemini", () => {
  const image = { mimeType: "image/png", data: "aGVsbG8=" };
  const compacted = compactSmartContents([
    { role: "user", parts: [{ text: "Please inspect this image." }, { inlineData: image }] },
  ]);
  assert.deepEqual(compacted[0].parts[1], { inlineData: image });
});

test("Smart token estimate is deliberately conservative", () => {
  assert.equal(estimateSmartTokens("a".repeat(1000)), 500);
});

test("coding agent continues to Groq when Gemini rejects an oversized request", async () => {
  const previousOrder = process.env["AI_PROVIDER_ORDER"];
  const previousGroqKey = process.env["GROQ_API_KEY"];
  process.env["AI_PROVIDER_ORDER"] = "gemini,groq";
  process.env["GROQ_API_KEY"] = "groq-test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response("request too large", { status: 413 });
    }
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              message: "Recovered after Gemini rejected the request",
              files: { "index.html": "<h1>Fallback</h1>" },
              complete: true,
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await runAgent(input, "test-key");
    assert.equal(result.files["index.html"], "<h1>Fallback</h1>");
    assert.equal(urls.length, 2);
    assert.match(urls[1], /api.groq.com/);
  } finally {
    if (previousOrder === undefined) delete process.env["AI_PROVIDER_ORDER"];
    else process.env["AI_PROVIDER_ORDER"] = previousOrder;
    if (previousGroqKey === undefined) delete process.env["GROQ_API_KEY"];
    else process.env["GROQ_API_KEY"] = previousGroqKey;
  }
});

test("agent salvages complete files from truncated JSON and continues with another provider", async () => {
  const previousOrder = process.env["AI_PROVIDER_ORDER"];
  const previousGroqKey = process.env["GROQ_API_KEY"];
  process.env["AI_PROVIDER_ORDER"] = "gemini,groq";
  process.env["GROQ_API_KEY"] = "groq-test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return Response.json({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: {
              parts: [
                {
                  text: '{"message":"partial","files":{"index.html":"<h1>Complete first file</h1>","src/App.tsx":"import React from',
                },
              ],
            },
          },
        ],
      });
    }
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              message: "Finished remaining files with fallback model",
              files: {
                "src/App.tsx": "export default function App(){return <main>Complete</main>}",
              },
              complete: true,
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await runAgent(input, "test-key");
    assert.equal(result.files["index.html"], "<h1>Complete first file</h1>");
    assert.match(result.files["src/App.tsx"] ?? "", /export default function App/);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /generativelanguage.googleapis.com/);
    assert.match(urls[1], /api.groq.com/);
  } finally {
    if (previousOrder === undefined) delete process.env["AI_PROVIDER_ORDER"];
    else process.env["AI_PROVIDER_ORDER"] = previousOrder;
    if (previousGroqKey === undefined) delete process.env["GROQ_API_KEY"];
    else process.env["GROQ_API_KEY"] = previousGroqKey;
  }
});

test("agent refuses partial files when continuation providers are exhausted", async () => {
  const previousOrder = process.env["AI_PROVIDER_ORDER"];
  process.env["AI_PROVIDER_ORDER"] = "gemini";
  globalThis.fetch = (async () =>
    Response.json({
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: {
            parts: [
              {
                text: '{"files":{"index.html":"<h1>Finished file</h1>","src/App.tsx":"import React from',
              },
            ],
          },
        },
      ],
    })) as typeof fetch;

  try {
    await assert.rejects(runAgent(input, "test-key"), /continuation limit.*did not apply a partial project update/i);
  } finally {
    if (previousOrder === undefined) delete process.env["AI_PROVIDER_ORDER"];
    else process.env["AI_PROVIDER_ORDER"] = previousOrder;
  }
});

test("Groq retries a 413 TPM response with smaller context and output budgets", async () => {
  const previousOrder = process.env["AI_PROVIDER_ORDER"];
  const previousGroqKey = process.env["GROQ_API_KEY"];
  process.env["AI_PROVIDER_ORDER"] = "groq";
  process.env["GROQ_API_KEY"] = "groq-test-key";
  const outputBudgets: number[] = [];
  let calls = 0;
  globalThis.fetch = (async (url, init) => {
    if (!String(url).includes("api.groq.com")) {
      throw new Error("Unexpected provider request: " + String(url));
    }
    calls++;
    const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number };
    outputBudgets.push(body.max_tokens ?? 0);
    if (calls === 1) return new Response("TPM limit exceeded", { status: 413 });
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            message: "Recovered with compact context",
            files: { "index.html": "<h1>Recovered</h1>" },
            complete: true,
          }),
        },
      }],
    });
  }) as typeof fetch;

  try {
    const result = await runAgent(input, "test-key");
    assert.equal(result.files["index.html"], "<h1>Recovered</h1>");
    assert.equal(calls, 2);
    assert.deepEqual(outputBudgets, [1100, 600]);
  } finally {
    if (previousOrder === undefined) delete process.env["AI_PROVIDER_ORDER"];
    else process.env["AI_PROVIDER_ORDER"] = previousOrder;
    if (previousGroqKey === undefined) delete process.env["GROQ_API_KEY"];
    else process.env["GROQ_API_KEY"] = previousGroqKey;
  }
});

test("AI builder forwards multiple visual references to Gemini vision", async () => {
  const previousKey = process.env["GEMINI_API_KEY"];
  delete process.env["GEMINI_API_KEY"];
  let imageParts = 0;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      contents?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }[];
    };
    imageParts = body.contents?.at(-1)?.parts?.filter((part) => Boolean(part.inlineData)).length ?? 0;
    return Response.json({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              message: "Built from both references",
              files: { "index.html": "<h1>Reference matched</h1>" },
              complete: true,
            }),
          }],
        },
      }],
    });
  }) as typeof fetch;

  try {
    const result = await runAgent({
      ...input,
      referenceImages: [
        { name: "feed.png", mimeType: "image/png", data: "a".repeat(120) },
        { name: "builder.png", mimeType: "image/png", data: "b".repeat(120) },
      ],
    }, "test-key");
    assert.equal(result.files["index.html"], "<h1>Reference matched</h1>");
    assert.equal(imageParts, 2);
  } finally {
    if (previousKey === undefined) delete process.env["GEMINI_API_KEY"];
    else process.env["GEMINI_API_KEY"] = previousKey;
  }
});
