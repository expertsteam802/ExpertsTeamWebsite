import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { generateOpenRouterContent } from "./openrouter.server";

const originalFetch = globalThis.fetch;
const originalKey = process.env["OPENROUTER_API_KEY"];
const originalModel = process.env["OPENROUTER_MODEL"];

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env["OPENROUTER_API_KEY"];
  else process.env["OPENROUTER_API_KEY"] = originalKey;
  if (originalModel === undefined) delete process.env["OPENROUTER_MODEL"];
  else process.env["OPENROUTER_MODEL"] = originalModel;
});

const request = {
  systemInstruction: { parts: [{ text: "You are ExpertAI." }] },
  contents: [{ role: "user" as const, parts: [{ text: "Say hello." }] }],
  generationConfig: { maxOutputTokens: 1024 },
};

test("guest adapter calls OpenRouter server-side and normalizes the completion", async () => {
  process.env["OPENROUTER_API_KEY"] = "test-secret";
  process.env["OPENROUTER_MODEL"] = "openrouter/free";
  let sentAuthorization = "";
  let sentModel = "";
  let referer = "";
  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(init?.headers);
    sentAuthorization = headers.get("authorization") ?? "";
    referer = headers.get("HTTP-Referer") ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    sentModel = body.model ?? "";
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: "Hello from OpenRouter." } }],
    });
  }) as typeof fetch;

  const response = await generateOpenRouterContent(request);
  assert.equal(sentAuthorization, "Bearer test-secret");
  assert.equal(sentModel, "openrouter/free");
  assert.equal(referer, "https://expertsteam.giize.com");
  assert.equal(response.candidates?.[0]?.content?.parts?.[0]?.text, "Hello from OpenRouter.");
});

test("guest adapter fails clearly when its server-only key is missing", async () => {
  delete process.env["OPENROUTER_API_KEY"];
  await assert.rejects(generateOpenRouterContent(request), /OPENROUTER_API_KEY/);
});
