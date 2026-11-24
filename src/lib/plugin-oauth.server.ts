import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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

function stateEncryptionKey(): Buffer {
  return createHash("sha256").update(stateSecret()).digest();
}

export function createPluginOAuthState(provider: PluginOAuthState["provider"], userId: string, codeVerifier?: string): string {
  const payload: PluginOAuthState = {
    provider,
    userId,
    issuedAt: Date.now(),
    nonce: randomBytes(24).toString("base64url"),
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", stateEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function verifyPluginOAuthState(value: string, expectedProvider: PluginOAuthState["provider"]): PluginOAuthState {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("OAuth state is invalid.");
  const [, encodedIv, encodedTag, encodedCiphertext] = parts;
  if (!encodedIv || !encodedTag || !encodedCiphertext) throw new Error("OAuth state is invalid.");

  let payload: PluginOAuthState;
  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("Invalid encrypted state.");
    const decipher = createDecipheriv("aes-256-gcm", stateEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    payload = JSON.parse(plaintext.toString("utf8")) as PluginOAuthState;
  } catch {
    throw new Error("OAuth state is invalid or has been tampered with.");
  }

  if (payload.provider !== expectedProvider || !payload.userId || !payload.nonce || !Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 30_000) {
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
