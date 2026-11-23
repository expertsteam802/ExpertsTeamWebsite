import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const configured = process.env["PROJECT_SECRET_ENCRYPTION_KEY"] ?? "";
  let key: Buffer;
  if (/^[a-f0-9]{64}$/i.test(configured)) key = Buffer.from(configured, "hex");
  else {
    try { key = Buffer.from(configured, "base64"); } catch { key = Buffer.alloc(0); }
  }
  if (key.byteLength !== 32) {
    throw new Error("Project secrets are unavailable: configure a 32-byte PROJECT_SECRET_ENCRYPTION_KEY on the server.");
  }
  return key;
}

export function encryptProjectSecret(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted_value: encrypted.toString("base64"),
    nonce: nonce.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptProjectSecret(row: {
  encrypted_value: string;
  nonce: string;
  auth_tag: string;
}): string {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(row.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_value, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Server-only helper. Never return its result from a browser-callable server function. */
export async function loadProjectEnvironment(
  supabase: { from: (table: string) => any },
  userId: string,
  projectId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("agent_project_env_vars")
    .select("key, encrypted_value, nonce, auth_tag")
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error("Could not load project environment variables: " + error.message);
  return Object.fromEntries((data ?? []).map((row: any) => [row.key, decryptProjectSecret(row)]));
}

const PUBLIC_BUILD_KEYS = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

/** Only explicitly approved public configuration is passed to browser builds. */
export async function loadProjectPublicEnvironment(
  supabase: { from: (table: string) => any },
  userId: string,
  projectId: string,
): Promise<Record<string, string>> {
  const all = await loadProjectEnvironment(supabase, userId, projectId);
  const { data: project, error: projectError } = await supabase
    .from("agent_projects")
    .select("cloud_connection_id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectError) throw new Error("Could not load the project's Supabase connection: " + projectError.message);

  let connectedProjectEnvironment: Record<string, string> = {};
  if (project?.cloud_connection_id) {
    const { getUserSupabaseConnectionCredentials } = await import("./cloud-connections.server");
    const credentials = await getUserSupabaseConnectionCredentials(project.cloud_connection_id, userId);
    connectedProjectEnvironment = {
      VITE_SUPABASE_URL: credentials.project_url,
      VITE_SUPABASE_PUBLISHABLE_KEY: credentials.publishable_key,
      NEXT_PUBLIC_SUPABASE_URL: credentials.project_url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: credentials.publishable_key,
    };
  }

  // Explicit project environment entries override the connection defaults.
  return {
    ...connectedProjectEnvironment,
    ...Object.fromEntries(Object.entries(all).filter(([key]) => PUBLIC_BUILD_KEYS.has(key)).sort(([left], [right]) => left.localeCompare(right))),
  };
}
