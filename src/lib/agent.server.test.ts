import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { runAgent } from "./agent.server";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
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
    await assert.rejects(runAgent(input), /not configured/i);
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
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  ]);
  assert.equal(result.files["index.html"], "<h1>Game</h1>");
});

test("agent reports Gemini quota exhaustion without retrying another provider", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(null, { status: 429 });
  }) as typeof fetch;

  await assert.rejects(runAgent(input, "test-key"), /rate limited or out of quota/i);
  assert.equal(calls, 1);
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
