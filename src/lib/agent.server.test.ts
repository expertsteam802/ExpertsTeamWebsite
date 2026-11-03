import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { runAgent } from "./agent.server";
import { resetProviderCooldowns } from "./gemini.server";

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
    await assert.rejects(runAgent(input), /No AI provider is configured/i);
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
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
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
      choices: [{
        message: {
          content: JSON.stringify({
            message: "Recovered through the fallback provider",
            files: { "index.html": "<h1>Fallback worked</h1>" },
          }),
        },
      }],
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
