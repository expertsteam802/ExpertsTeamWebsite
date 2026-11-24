import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const fields = header.split(",").map((item) => item.trim());
  const timestamp = fields.find((item) => item.startsWith("t="))?.slice(2) ?? "";
  const signatures = fields.filter((item) => item.startsWith("v1=")).map((item) => item.slice(3));
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300 || signatures.length === 0) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + payload, "utf8").digest();
  return signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const provided = Buffer.from(signature, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

async function handleStripeCreditsWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!webhookSecret || !signature) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 401 });
  }

  let event: {
    id?: string;
    type?: string;
    data?: { object?: {
      id?: string;
      payment_status?: string;
      amount_total?: number;
      currency?: string;
      metadata?: Record<string, string | undefined>;
    } };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true, ignored: true });
  }

  const session = event.data?.object;
  if (!session || session.payment_status !== "paid") return Response.json({ received: true, pending: true });
  const orderId = session.metadata?.["order_id"];
  const eventId = event.id;
  if (!orderId || !eventId || !session.id) return Response.json({ error: "Missing Stripe order metadata." }, { status: 400 });

  const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceKey) return Response.json({ error: "Reward processor is not configured." }, { status: 503 });
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: order, error: orderError } = await supabase
    .from("credit_topup_orders")
    .select("id,provider,currency,amount,status,stripe_checkout_session_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order || order.provider !== "stripe") {
    return Response.json({ error: "Stripe top-up order was not found." }, { status: 404 });
  }
  if (order.status === "paid") return Response.json({ received: true, duplicate: true });
  const expectedAmount = Math.round(Number(order.amount) * 100);
  if (
    order.status !== "pending" ||
    order.stripe_checkout_session_id !== session.id ||
    session.currency?.toUpperCase() !== order.currency ||
    session.amount_total !== expectedAmount
  ) {
    return Response.json({ error: "Stripe session does not match the pending top-up order." }, { status: 409 });
  }

  const { data, error } = await supabase.rpc("complete_stripe_credit_topup", {
    p_order_id: order.id,
    p_event_id: eventId,
    p_checkout_session_id: session.id,
  });
  if (error) {
    console.error("[Stripe credits] Could not complete top-up:", error.message);
    return Response.json({ error: "Credit top-up could not be completed." }, { status: 409 });
  }
  return Response.json({ received: true, result: data });
}

export const Route = createFileRoute("/api/stripe/credits/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleStripeCreditsWebhook(request),
    },
  },
});
