import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type CallbackValues = {
  trackingId: string;
  eventId: string;
  status: string;
  secret: string;
};

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

async function handlePostback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    try {
      if (contentType.includes("application/json")) {
        const parsed: unknown = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
      } else {
        const raw = await request.text();
        const params = new URLSearchParams(raw);
        body = Object.fromEntries(params.entries());
      }
    } catch {
      return Response.json({ ok: false, error: "Invalid postback payload." }, { status: 400 });
    }
  }

  const values = readValues(url, body);
  const providedSecret = request.headers.get("x-cpa-grip-secret") ?? values.secret;
  const expectedSecret = process.env["CPA_GRIP_POSTBACK_SECRET"] ?? "";
  if (!expectedSecret) {
    console.error("[CPA Grip] Postback disabled: CPA_GRIP_POSTBACK_SECRET is not configured.");
    return Response.json({ ok: false, error: "Postback integration is not configured." }, { status: 503 });
  }
  if (!safeSecretMatch(expectedSecret, providedSecret)) {
    return Response.json({ ok: false, error: "Unauthorized postback." }, { status: 401 });
  }

  if (!values.trackingId || values.trackingId.length > 128) {
    return Response.json({ ok: false, error: "Missing or invalid subid/tracking identifier." }, { status: 400 });
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
