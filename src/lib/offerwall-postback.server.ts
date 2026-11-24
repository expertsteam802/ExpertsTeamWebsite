import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";

type Provider = "torox" | "adgate" | "cpx" | "lootably";
type EventStatus = "pending" | "approved" | "reversed";

function sourceIp(request: Request): string {
  const headers = request.headers;
  const candidate =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  return candidate.replace(/^::ffff:/, "");
}

function allowedIp(ip: string, configured: string, required: boolean): boolean {
  if (!configured.trim()) return !required;
  const entries = configured.split(",").map((value) => value.trim()).filter(Boolean);
  return entries.includes(ip);
}

function safeHexEqual(expected: string, provided: string): boolean {
  if (!/^[0-9a-f]{32,128}$/i.test(expected) || !/^[0-9a-f]{32,128}$/i.test(provided)) return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(provided, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function required(params: URLSearchParams, key: string, max = 200): string {
  const value = params.get(key)?.trim() ?? "";
  if (!value || value.length > max) throw new Error("Missing or invalid " + key + ".");
  return value;
}

function numeric(params: URLSearchParams, key: string, allowNegative = false): number {
  const raw = required(params, key, 40);
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(raw) || (!allowNegative && raw.startsWith("-"))) {
    throw new Error("Invalid " + key + ".");
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error("Invalid " + key + ".");
  return value;
}

function creditAmount(value: number, rateName: string): number {
  const rate = Number(process.env[rateName] ?? "1");
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) throw new Error("Invalid server credit conversion setting.");
  const credits = Math.floor(Math.abs(value) * rate);
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > 100_000) {
    throw new Error("The offerwall reward is outside the supported credit range.");
  }
  return credits;
}

async function processEvent(input: {
  provider: Provider;
  eventId: string;
  userId: string;
  status: EventStatus;
  credits: number;
  revenue?: number;
  offerId?: string;
  offerName?: string;
  country?: string;
  ip?: string;
  raw: Record<string, string | number | null>;
}): Promise<unknown> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.userId)) {
    throw new Error("The provider returned an invalid ExpertsTeam user ID.");
  }
  if (input.ip && isIP(input.ip) === 0) throw new Error("The provider returned an invalid source IP.");
  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceKey =
    process.env["SUPABASE_SECRET_KEY"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceKey) throw new Error("The server-side reward processor is not configured.");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("process_offerwall_provider_event", {
    p_provider: input.provider,
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_status: input.status,
    p_reward_credits: input.credits,
    p_revenue_usd: input.revenue ?? null,
    p_offer_id: input.offerId ?? null,
    p_offer_name: input.offerName ?? null,
    p_country_code: input.country ?? null,
    p_source_ip: input.ip ?? null,
    p_raw_event: input.raw,
  });
  if (error) {
    console.error("[" + input.provider + "] Offerwall event rejected:", error.message);
    throw new Error("The conversion could not be processed.");
  }
  return data;
}

function response(ok: boolean): Response {
  return new Response(ok ? "1" : "0", {
    status: ok ? 200 : 409,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleToroxPostback(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response("0", { status: 405 });
  try {
    const params = new URL(request.url).searchParams;
    const eventId = required(params, "id");
    const offerId = required(params, "oid");
    const userId = required(params, "user_id", 64);
    const amount = numeric(params, "amount", true);
    const key = process.env["TOROX_APP_TOKEN"]?.trim();
    if (!key) return new Response("0", { status: 503 });
    const expected = createHash("md5").update(offerId + "-" + userId + "-" + key, "utf8").digest("hex");
    if (!safeHexEqual(expected, required(params, "sig", 128))) return new Response("0", { status: 401 });
    const ip = sourceIp(request);
    const ips = ["44.212.211.226", process.env["TOROX_ALLOWED_IPS"] ?? ""].filter(Boolean).join(",");
    if (!allowedIp(ip, ips, true)) return new Response("0", { status: 403 });
    await processEvent({
      provider: "torox", eventId, userId, status: amount < 0 ? "reversed" : "approved",
      credits: creditAmount(amount, "TOROX_CREDITS_PER_UNIT"),
      revenue: Math.abs(Number(params.get("payout") ?? 0)) || undefined,
      offerId, offerName: params.get("o_name") ?? undefined,
      ip: params.get("ip_address") ?? ip,
      raw: { oid: offerId, currency_name: params.get("currency_name"), event: params.get("event"), amount },
    });
    return response(true);
  } catch (error) {
    console.warn("[Torox] Postback rejected:", error instanceof Error ? error.message : "invalid request");
    return response(false);
  }
}

export async function handleAdGatePostback(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response("0", { status: 405 });
  try {
    const params = new URL(request.url).searchParams;
    const eventId = required(params, "conversion_id");
    const userId = required(params, "s1", 255);
    const points = numeric(params, "points", false);
    const state = required(params, "state", 32).toLowerCase();
    const status: EventStatus = state === "rejected" ? "reversed" : state === "pending" ? "pending" : state === "approved" ? "approved" : (() => { throw new Error("Unsupported AdGate state."); })();
    const ip = sourceIp(request);
    if (!allowedIp(ip, process.env["ADGATE_ALLOWED_IPS"] ?? "", true)) return new Response("0", { status: 403 });
    await processEvent({
      provider: "adgate", eventId, userId, status, credits: creditAmount(points, "ADGATE_CREDITS_PER_UNIT"),
      revenue: Math.abs(Number(params.get("payout") ?? 0)) || undefined,
      offerId: params.get("offer_id") ?? undefined, offerName: params.get("vc_title") ?? undefined,
      ip: params.get("session_ip") ?? ip,
      raw: { state, points, payout: params.get("payout"), offer_id: params.get("offer_id") },
    });
    return response(true);
  } catch (error) {
    console.warn("[AdGate] Postback rejected:", error instanceof Error ? error.message : "invalid request");
    return response(false);
  }
}

export async function handleCpxPostback(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response("0", { status: 405 });
  try {
    const params = new URL(request.url).searchParams;
    const eventId = required(params, "trans_id");
    const userId = required(params, "user_id", 64);
    const amount = numeric(params, "amount_local", false);
    const statusValue = required(params, "status", 8);
    const secret = process.env["CPX_POSTBACK_SECRET"]?.trim();
    if (!secret) return new Response("0", { status: 503 });
    // CPX's publisher dashboard is the source of truth for the callback hash.
    // The documented dashboard-compatible mode is configurable for accounts
    // that provide a different canonical string.
    const mode = process.env["CPX_POSTBACK_HASH_MODE"] ?? "md5_trans_id_secret";
    const canonical = mode === "md5_trans_id_secret"
      ? eventId + "-" + secret
      : mode === "md5_user_trans_id_secret"
        ? userId + "-" + eventId + "-" + secret
        : "";
    if (!canonical) return new Response("0", { status: 503 });
    const expected = createHash("md5").update(canonical, "utf8").digest("hex");
    const provided = params.get("hash") ?? params.get("secure_hash") ?? "";
    if (!safeHexEqual(expected, provided)) return new Response("0", { status: 401 });
    const ip = sourceIp(request);
    const allowed = process.env["CPX_ALLOWED_IPS"] ?? "";
    if (allowed.trim() && !allowedIp(ip, allowed, true)) return new Response("0", { status: 403 });
    const status: EventStatus = statusValue === "1" ? "approved" : statusValue === "2" ? "reversed" : (() => { throw new Error("Unsupported CPX status."); })();
    await processEvent({
      provider: "cpx", eventId, userId, status, credits: creditAmount(amount, "CPX_CREDITS_PER_UNIT"),
      revenue: Math.abs(Number(params.get("amount_usd") ?? 0)) || undefined,
      offerId: params.get("offer_ID") ?? undefined, ip: params.get("ip_click") ?? ip,
      raw: { status: statusValue, amount_local: amount, amount_usd: params.get("amount_usd") },
    });
    return response(true);
  } catch (error) {
    console.warn("[CPX] Postback rejected:", error instanceof Error ? error.message : "invalid request");
    return response(false);
  }
}

export async function handleLootablyPostback(request: Request): Promise<Response> {
  try {
    let eventId = "";
    let userId = "";
    let status: EventStatus = "approved";
    let reward = 0;
    let revenue = 0;
    let offerId = "";
    let offerName = "";
    let country = "";
    let ip = "";
    let raw: Record<string, string | number | null> = {};
    if (request.method === "POST") {
      const body = await request.json() as { event?: string; data?: Record<string, unknown> };
      const data = body.data ?? {};
      const event = String(body.event ?? request.headers.get("x-lootably-webhook-type") ?? "");
      const expectedSecret = process.env["LOOTABLY_WEBHOOK_SECRET"] ?? "";
      const providedSecret = request.headers.get("x-lootably-webhook-secret") ?? "";
      if (!expectedSecret || !safeTextEqual(expectedSecret, providedSecret)) return new Response("0", { status: 401 });
      eventId = String(data["transactionID"] ?? "");
      userId = String(data["userID"] ?? "");
      reward = Number(data["currencyReward"]);
      revenue = Number(data["revenue"]);
      offerId = String(data["offerID"] ?? "");
      offerName = String(data["offerName"] ?? "");
      country = String(data["countryCode"] ?? "");
      ip = String(data["ip"] ?? "");
      status = event === "approved" ? "approved" : event === "rejected" ? "reversed" : event === "pending" ? "pending" : (() => { throw new Error("Unsupported Lootably webhook event."); })();
      raw = { event, offerID: offerId, offerName, placementID: String(data["placementID"] ?? "") };
    } else if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      userId = required(params, "userID", 64);
      eventId = required(params, "transactionID");
      ip = required(params, "ip", 64);
      reward = numeric(params, "currencyReward", false);
      revenue = numeric(params, "revenue", false);
      offerId = params.get("offerID") ?? "";
      offerName = params.get("offerName") ?? "";
      country = params.get("countryCode") ?? "";
      const secret = process.env["LOOTABLY_POSTBACK_SECRET"] ?? "";
      if (!secret) return new Response("0", { status: 503 });
      const expected = createHash("sha256").update(userId + ip + String(params.get("revenue")) + String(params.get("currencyReward")) + secret, "utf8").digest("hex");
      if (!safeHexEqual(expected, params.get("hash") ?? "")) return new Response("0", { status: 401 });
      status = params.get("status") === "0" ? "reversed" : "approved";
      raw = { status: params.get("status"), offerID: offerId, offerName };
    } else {
      return new Response("0", { status: 405 });
    }
    if (!eventId || !userId || !Number.isFinite(reward) || reward <= 0) return new Response("0", { status: 400 });
    await processEvent({
      provider: "lootably", eventId, userId, status,
      credits: creditAmount(reward, "LOOTABLY_CREDITS_PER_UNIT"),
      revenue: Number.isFinite(revenue) ? Math.abs(revenue) : undefined,
      offerId: offerId || undefined, offerName: offerName || undefined,
      country: country || undefined, ip: ip || undefined, raw,
    });
    return response(true);
  } catch (error) {
    console.warn("[Lootably] Postback rejected:", error instanceof Error ? error.message : "invalid request");
    return response(false);
  }
}

function safeTextEqual(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(provided, "utf8");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
