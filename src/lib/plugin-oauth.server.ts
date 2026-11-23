import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type PluginOAuthState = {
  provider: "github" | "supabase";
  userId: string;
  issuedAt: number;
  nonce: string;
  codeVerifier?: string;
};

function stateSecret(): string {
  const value = process.env["PLUGIN_OAUTH_STATE_SECRET"];
  if (!value || value.length < 32) throw new Error("PLUGIN_OAUTH_STATE_SECRET must be set to a random value of at least 32 characters.");
  return value;
}

export function createPluginOAuthState(provider: PluginOAuthState["provider"], userId: string, codeVerifier?: string): string {
  const payload: PluginOAuthState = {
    provider, userId, issuedAt: Date.now(), nonce: randomBytes(24).toString("base64url"),
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

export function verifyPluginOAuthState(value: string, expectedProvider: PluginOAuthState["provider"]): PluginOAuthState {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) throw new Error("OAuth state is invalid.");
  const expected = createHmac("sha256", stateSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("OAuth state signature is invalid.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PluginOAuthState;
  if (payload.provider !== expectedProvider || !payload.userId || !payload.nonce || Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 30_000) {
    throw new Error("OAuth request expired or does not match this provider. Please connect again.");
  }
  return payload;
}

export function supabaseOAuthChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function pluginOAuthRedirect(provider: "github" | "supabase"): string {
  const base = (process.env["APP_URL"] || "https://expertsteam.giize.com").replace(/\/$/, "");
  return base + "/api/plugins/" + provider + "/callback";
}
