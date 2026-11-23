import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type CallbackValues = {
  trackingId: string;
  eventId: string;
  status: string;
  secret: string;
};

const MAX_POSTBACK_BYTES = 8 * 1024;

function safeSecretMatch(expected: string, provided: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(provided);
  if (left.length !== right.length || left.length === 0) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

function readValues(url: URL, body: Record<string, unknown> = {}): CallbackValues {
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = body[key] ?? url.searchParams.get(key);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  return {
    trackingId: read("subid", "tracking_id", "click_id", "s1"),
    eventId: read("event_id", "transaction_id", "txid", "conversion_id"),
    status: read("status", "conversion_status", "event_status").toLowerCase(),
    secret: read("key", "secret", "token"),
  };
}

async function readBoundedBody(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_POSTBACK_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const isJson = contentType.includes("application/json");
  const isForm = contentType.includes("application/x-www-form-urlencoded");
  if (!isJson && !isForm) throw new Error("UNSUPPORTED_MEDIA_TYPE");
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_POSTBACK_BYTES) {
        await reader.cancel();
        throw new Error("PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (isJson) {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("INVALID_PAYLOAD");
    }
    return parsed as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

async function handlePostback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = await readBoundedBody(request);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason === "PAYLOAD_TOO_LARGE") {
        return Response.json({ ok: false, error: "Postback payload is too large." }, { status: 413 });
      }
      if (reason === "UNSUPPORTED_MEDIA_TYPE") {
        return Response.json({ ok: false, error: "Use JSON or form-encoded postback data." }, { status: 415 });
      }
      return Response.json({ ok: false, error: "Invalid postback payload." }, { status: 400 });
    }
  }

  const values = readValues(url, body);
  const providedSecret = request.headers.get("x-cpa-grip-secret")?.trim() || values.secret;
  const expectedSecret = process.env["CPA_GRIP_POSTBACK_SECRET"] ?? "";
  if (!expectedSecret) {
    console.error("[CPA Grip] Postback disabled: CPA_GRIP_POSTBACK_SECRET is not configured.");
    return Response.json({ ok: false, error: "Postback integration is not configured." }, { status: 503 });
  }
  if (!safeSecretMatch(expectedSecret, providedSecret)) {
    return Response.json({ ok: false, error: "Unauthorized postback." }, { status: 401 });
  }

  if (values.trackingId.length < 8 || values.trackingId.length > 128) {
    return Response.json({ ok: false, error: "Missing or invalid subid/tracking identifier." }, { status: 400 });
  }
  if (values.eventId.length > 200) {
    return Response.json({ ok: false, error: "Invalid provider event identifier." }, { status: 400 });
  }

  const successfulStatuses = new Set(["", "1", "approved", "success", "successful", "complete", "completed", "converted", "conversion"]);
  if (!successfulStatuses.has(values.status)) {
    return Response.json({ ok: true, status: "ignored", reason: "The event is not a successful conversion." });
  }

  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey =
    process.env["SUPABASE_SECRET_KEY"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[CPA Grip] Postback disabled: server-side Supabase credentials are missing.");
    return Response.json({ ok: false, error: "Server database configuration is missing." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("process_cpa_grip_conversion", {
    p_tracking_id: values.trackingId,
    p_provider_event_id: values.eventId || values.trackingId,
  });
  if (error) {
    console.warn("[CPA Grip] Conversion postback was not accepted:", error.message);
    return Response.json({ ok: false, error: "Conversion could not be verified." }, { status: 409 });
  }
  return Response.json({ ok: true, result: data });
}

export const Route = createFileRoute("/api/cpa-grip/postback")({
  server: {
    handlers: {
      GET: ({ request }) => handlePostback(request),
      POST: ({ request }) => handlePostback(request),
    },
  },
});
