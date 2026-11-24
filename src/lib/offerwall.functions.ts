import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createToroxWallSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const placementId = process.env["TOROX_PLACEMENT_ID"]?.trim();
    const appToken = process.env["TOROX_APP_TOKEN"]?.trim();
    if (!placementId || !appToken) {
      throw new Error("Torox is not configured yet. Add TOROX_PLACEMENT_ID and TOROX_APP_TOKEN to the server environment.");
    }
    const response = await fetch(
      "https://api.wall.torox.io/partner/session?placement_id=" +
        encodeURIComponent(placementId) +
        "&token=" +
        encodeURIComponent(appToken),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ player: { uid: context.userId } }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; wall_url?: string; message?: string } | null;
    if (!response.ok || !payload?.ok || !payload.wall_url) {
      throw new Error("Torox could not create a secure offerwall session. Check the placement credentials and account approval.");
    }
    let wallUrl: URL;
    try {
      wallUrl = new URL(payload.wall_url);
    } catch {
      throw new Error("Torox returned an invalid offerwall URL.");
    }
    if (wallUrl.protocol !== "https:" || !wallUrl.hostname.endsWith("torox.io")) {
      throw new Error("Torox returned an untrusted offerwall destination.");
    }
    return { wallUrl: wallUrl.toString() };
  });

export const getCpxWallConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const appId = process.env["CPX_APP_ID"]?.trim();
    const appSecret = process.env["CPX_APP_SECRET"]?.trim();
    if (!appId || !appSecret) {
      throw new Error("CPX Research is not configured yet. Add CPX_APP_ID and CPX_APP_SECRET to the server environment.");
    }
    const secureHash = createHash("md5").update(context.userId + "-" + appSecret, "utf8").digest("hex");
    return { appId, secureHash };
  });

export const createStripeCreditTopupCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ amount: z.number().min(0.5).max(100000) }).parse(input))
  .handler(async ({ data, context }) => {
    const stripeKey = process.env["STRIPE_SECRET_KEY"]?.trim();
    const appUrl = process.env["APP_URL"]?.trim();
    if (!stripeKey || !appUrl) {
      throw new Error("Stripe top-ups are not configured. Add STRIPE_SECRET_KEY and APP_URL to the server environment.");
    }
    const baseUrl = new URL(appUrl);
    if (baseUrl.protocol !== "https:") throw new Error("APP_URL must use HTTPS.");
    const { data: orderData, error: orderError } = await context.supabase.rpc("create_credit_topup_order", {
      p_provider: "stripe",
      p_currency: "USD",
      p_amount: data.amount,
      p_payment_reference: null,
      p_payment_note: "",
    });
    if (orderError) throw new Error(orderError.message);
    const order = orderData as unknown as { id: string; credits: number; amount: number };
    const amountMinor = Math.round(Number(order.amount) * 100);
    if (!order.id || !Number.isSafeInteger(amountMinor) || amountMinor < 50) {
      throw new Error("Stripe checkout requires a valid top-up amount of at least $0.50.");
    }

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", baseUrl.origin + "/earn?topup=success&session_id={CHECKOUT_SESSION_ID}");
    form.set("cancel_url", baseUrl.origin + "/earn?topup=cancelled");
    form.set("client_reference_id", context.userId);
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(amountMinor));
    form.set("line_items[0][price_data][product_data][name]", "ExpertsTeam AI credits");
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[order_id]", order.id);
    form.set("metadata[user_id]", context.userId);
    form.set("metadata[credits]", String(order.credits));

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + stripeKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const session = (await response.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
    if (!response.ok || !session?.id || !session.url) {
      await supabaseAdmin.from("credit_topup_orders").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", order.id);
      throw new Error(session?.error?.message || "Stripe could not create a checkout session.");
    }
    const checkoutUrl = new URL(session.url);
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
      await supabaseAdmin.from("credit_topup_orders").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", order.id);
      throw new Error("Stripe returned an untrusted checkout URL.");
    }
    const { error: updateError } = await supabaseAdmin
      .from("credit_topup_orders")
      .update({
        checkout_url: checkoutUrl.toString(),
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("user_id", context.userId);
    if (updateError) throw new Error("Checkout was created but the top-up order could not be linked. Contact support before paying.");
    return { checkoutUrl: checkoutUrl.toString(), orderId: order.id, credits: order.credits };
  });
