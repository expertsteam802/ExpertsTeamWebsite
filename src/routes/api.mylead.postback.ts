import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MYLEAD_IPS = new Set(
  (process.env["MYLEAD_ALLOWED_IPS"] || "159.65.61.13")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function getSourceIp(request: Request): string {
  // Prefer platform-set client IP headers; never trust the callback's query-string IP.
  const headers = request.headers;
  const platformIp =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-nf-client-connection-ip")?.trim() ||
    headers.get("x-real-ip")?.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  const candidate = (platformIp || forwarded?.at(-1) || "").replace(/^::ffff:/, "");
  return isIP(candidate) ? candidate : "";
}

function readRequired(params: URLSearchParams, name: string, max = 200): string {
  const value = params.get(name)?.trim() ?? "";
  if (!value || value.length > max) throw new Error(`Invalid or missing ${name}.`);
  return value;
}

function readOptional(params: URLSearchParams, name: string, max = 500): string | null {
  const value = params.get(name)?.trim() ?? "";
  return value ? value.slice(0, max) : null;
}

function parseAmount(value: string): number {
  if (!/^\d{1,9}$/.test(value)) throw new Error("Invalid virtual_amount.");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid virtual_amount.");
  return amount;
}


function verifyMyLeadHmac(request: Request, params: URLSearchParams): boolean {
  const secret = process.env["MYLEAD_POSTBACK_SECRET"];
  const required = process.env["MYLEAD_REQUIRE_HMAC"] === "true";
  if (!secret) return !required;
  const provided = (request.headers.get("x-mylead-signature") ?? params.get("signature") ?? "").replace(/^sha256=/i, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  // Configure the provider to sign this exact canonical payload with HMAC-SHA256.
  const canonical = [
    params.get("transaction_id") ?? "",
    params.get("player_id") ?? "",
    (params.get("status") ?? "").toLowerCase(),
    params.get("virtual_amount") ?? "0",
  ].join("|");
  const expected = createHmac("sha256", secret).update(canonical, "utf8").digest();
  const actual = Buffer.from(provided, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handleMyLeadPostback(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "GET only." }, { status: 405 });
  }

  const sourceIp = getSourceIp(request);
  if (!sourceIp || !MYLEAD_IPS.has(sourceIp)) {
    return Response.json({ ok: false, error: "Untrusted postback source." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  let transactionId: string;
  let playerId: string;
  let status: string;
  let virtualAmount: number;
  try {
    transactionId = readRequired(params, "transaction_id");
    playerId = readRequired(params, "player_id", 64);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId)) {
      throw new Error("Invalid player_id.");
    }
    status = readRequired(params, "status", 32).toLowerCase();
    if (!["pending", "pre_approved", "approved", "rejected"].includes(status)) {
      throw new Error("Unsupported conversion status.");
    }
    virtualAmount = parseAmount(params.get("virtual_amount") ?? "0");
    if (status === "approved" && virtualAmount < 1) throw new Error("Approved conversion has no credits.");
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid postback." },
      { status: 400 },
    );
  }

  if (!verifyMyLeadHmac(request, params)) {
    return Response.json({ ok: false, error: "Invalid postback signature." }, { status: 401 });
  }

  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceKey =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_SECRET_KEY"] ??
    process.env["SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceKey) {
    console.error("[MyLead] Missing server-side Supabase credentials.");
    return Response.json({ ok: false, error: "Postback service is not configured." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("process_mylead_offerwall_postback", {
    p_transaction_id: transactionId,
    p_player_id: playerId,
    p_status: status,
    p_virtual_amount: virtualAmount,
    p_program_id: readOptional(params, "program_id", 80),
    p_program_name: readOptional(params, "program_name", 160),
    p_destination_program_id: readOptional(params, "destination_program_id", 80),
    p_destination_program_name: readOptional(params, "destination_program_name", 200),
    p_payout: readOptional(params, "payout", 32),
    p_payout_decimal: readOptional(params, "payout_decimal", 32),
    p_currency: readOptional(params, "currency", 8),
    p_country_code: readOptional(params, "country_code", 4),
    p_lead_ip: readOptional(params, "ip", 64),
    p_goal_id: readOptional(params, "goal_id", 80),
    p_goal_name: readOptional(params, "goal_name", 160),
  });

  if (error) {
    console.error("[MyLead] Postback processing failed:", error.message);
    return Response.json({ ok: false, error: "Conversion could not be processed." }, { status: 409 });
  }

  return Response.json({ ok: true, result: data });
}

export const Route = createFileRoute("/api/mylead/postback")({
  server: {
    handlers: {
      GET: ({ request }) => handleMyLeadPostback(request),
    },
  },
});
