import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { generateOpenRouterContent } from "./openrouter.server";

const originalFetch = globalThis.fetch;
const originalEnv = {
  groqKey: process.env["GROQ_API_KEY"],
  groqModel: process.env["GROQ_MODEL"],
  openRouterKey: process.env["OPENROUTER_API_KEY"],
  openRouterModel: process.env["OPENROUTER_MODEL"],
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  const entries = [
    ["GROQ_API_KEY", originalEnv.groqKey],
    ["GROQ_MODEL", originalEnv.groqModel],
    ["OPENROUTER_API_KEY", originalEnv.openRouterKey],
    ["OPENROUTER_MODEL", originalEnv.openRouterModel],
  ] as const;
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const request = {
  systemInstruction: { parts: [{ text: "You are ExpertAI." }] },
  contents: [{ role: "user" as const, parts: [{ text: "Say hello." }] }],
  generationConfig: { maxOutputTokens: 1024 },
};

test("guest adapter uses Groq first and normalizes its completion", async () => {
  process.env["GROQ_API_KEY"] = "groq-test-secret";
  process.env["GROQ_MODEL"] = "llama-3.3-70b-versatile";
  delete process.env["OPENROUTER_API_KEY"];
  let sentAuthorization = "";
  let sentModel = "";

  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), "https://api.groq.com/openai/v1/chat/completions");
    const headers = new Headers(init?.headers);
    sentAuthorization = headers.get("authorization") ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    sentModel = body.model ?? "";
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: "Hello from Groq." } }],
    });
  }) as typeof fetch;

  const response = await generateOpenRouterContent(request);
  assert.equal(sentAuthorization, "Bearer groq-test-secret");
  assert.equal(sentModel, "llama-3.3-70b-versatile");
  assert.equal(response.candidates?.[0]?.content?.parts?.[0]?.text, "Hello from Groq.");
});

test("guest adapter falls back to OpenRouter when Groq is unavailable", async () => {
  process.env["GROQ_API_KEY"] = "groq-test-secret";
  process.env["OPENROUTER_API_KEY"] = "openrouter-test-secret";
  let calls = 0;
  let openRouterReferer = "";

  globalThis.fetch = (async (url, init) => {
    calls += 1;
    if (String(url).includes("api.groq.com")) {
      return new Response("rate limited", { status: 429 });
    }
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer openrouter-test-secret");
    openRouterReferer = headers.get("HTTP-Referer") ?? "";
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: "Fallback worked." } }],
    });
  }) as typeof fetch;

  const response = await generateOpenRouterContent(request);
  assert.equal(calls, 2);
  assert.equal(openRouterReferer, "https://expertsteam.giize.com");
  assert.equal(response.candidates?.[0]?.content?.parts?.[0]?.text, "Fallback worked.");
});

test("guest adapter reports unavailable when no server-side provider key is configured", async () => {
  delete process.env["GROQ_API_KEY"];
  delete process.env["OPENROUTER_API_KEY"];
  await assert.rejects(generateOpenRouterContent(request), /guest service is temporarily unavailable/i);
});
