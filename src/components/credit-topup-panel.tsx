import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CreditCard, Smartphone, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { createStripeCreditTopupCheckout } from "@/lib/offerwall.functions";

type Provider = "momo" | "airtel" | "crypto" | "stripe";
const providerLabels: Record<Provider, string> = {
  momo: "Mobile Money",
  airtel: "Airtel Money",
  crypto: "Crypto",
  stripe: "Stripe",
};

export function CreditTopupPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const createStripeCheckout = useServerFn(createStripeCreditTopupCheckout);
  const [provider, setProvider] = useState<Provider>("momo");
  const [amount, setAmount] = useState("10");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const rates = useQuery({
    queryKey: ["credit-topup-rates"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_topup_rates")
        .select("id,provider,currency,credits_per_unit,min_amount,max_amount,payment_instructions,is_enabled")
        .eq("is_enabled", true).order("provider").order("currency");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orders = useQuery({
    queryKey: ["credit-topup-orders", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_topup_orders")
        .select("id,provider,currency,amount,credits_requested,status,payment_reference,checkout_url,created_at")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentRate = useMemo(
    () => rates.data?.find((rate) => rate.provider === provider),
    [rates.data, provider],
  );
  const numericAmount = Number(amount);
  const previewCredits = currentRate && Number.isFinite(numericAmount) && numericAmount > 0
    ? Math.floor(numericAmount * Number(currentRate.credits_per_unit))
    : 0;
  const isStripe = provider === "stripe";

  const submit = useMutation({
    mutationFn: async () => {
      if (!currentRate) throw new Error("This payment method is not configured yet.");
      if (!Number.isFinite(numericAmount) || numericAmount < Number(currentRate.min_amount) || numericAmount > Number(currentRate.max_amount)) {
        throw new Error("Enter an amount within the displayed top-up limits.");
      }
      if (isStripe) {
        return await createStripeCheckout({ data: { amount: numericAmount } });
      }
      if (reference.trim().length < 4) throw new Error("Enter the transaction reference from your payment confirmation.");
      const { data, error } = await supabase.rpc("create_credit_topup_order", {
        p_provider: provider,
        p_currency: currentRate.currency,
        p_amount: numericAmount,
        p_payment_reference: reference.trim().slice(0, 160),
        p_payment_note: note.trim().slice(0, 500),
      });
      if (error) throw error;
      return { manual: true as const, order: data };
    },
    onSuccess: (result) => {
      if ("checkoutUrl" in result) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      toast.success("Top-up submitted. Credits will be added after payment verification.");
      setReference("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["credit-topup-orders", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Top up AI credits</h2></div>
      <p className="text-sm text-muted-foreground">Add credits through Mobile Money, Airtel Money, cryptocurrency or Stripe. Manual payments are verified before credits are released.</p>
      <Card className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credit-topup-provider">Payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["momo", "airtel", "crypto", "stripe"] as Provider[]).map((item) => (
                <Button key={item} type="button" variant={provider === item ? "default" : "outline"} onClick={() => setProvider(item)}>
                  {item === "stripe" ? <CreditCard className="h-4 w-4" /> : item === "crypto" ? <Wallet className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  {providerLabels[item]}
                </Button>
              ))}
            </div>
          </div>
          {currentRate ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="credit-topup-amount">Amount ({currentRate.currency})</Label>
                <Input id="credit-topup-amount" type="number" min={currentRate.min_amount} max={currentRate.max_amount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
                <p className="text-xs text-muted-foreground">Allowed: {Number(currentRate.min_amount).toLocaleString()}–{Number(currentRate.max_amount).toLocaleString()} {currentRate.currency}</p>
              </div>
              {!isStripe && (
                <>
                  <div className="space-y-2"><Label htmlFor="credit-topup-reference">Payment transaction reference</Label><Input id="credit-topup-reference" maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter the MoMo / Airtel / crypto transaction ID" /></div>
                  <div className="space-y-2"><Label htmlFor="credit-topup-note">Note (optional)</Label><Textarea id="credit-topup-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Sender name or additional payment details" /></div>
                </>
              )}
              <Button className="w-full" onClick={() => submit.mutate()} disabled={submit.isPending || previewCredits < 1}>
                {submit.isPending ? "Preparing payment…" : isStripe ? "Continue to secure Stripe checkout" : "Submit payment for verification"}
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{rates.isLoading ? "Loading payment methods…" : "This payment method is not enabled yet. Ask an administrator to configure its rate and payment instructions."}</p>
          )}
        </div>
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit estimate</p>
          <p className="font-display text-3xl font-bold tabular-nums">{previewCredits.toLocaleString()} <span className="text-base font-medium text-muted-foreground">credits</span></p>
          {currentRate && <p className="text-xs text-muted-foreground">Rate: {Number(currentRate.credits_per_unit).toLocaleString()} credits per {currentRate.currency}</p>}
          {currentRate?.payment_instructions && <div className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap">{currentRate.payment_instructions}</div>}
          <p className="text-xs leading-5 text-muted-foreground">{isStripe ? "Stripe checkout confirms payment automatically through a signed webhook." : "Send payment using the instructions above, then submit your transaction reference. An administrator verifies it before the credit balance changes."}</p>
        </div>
      </Card>
      <div className="space-y-3">
        <h3 className="font-semibold">Top-up history</h3>
        {orders.data?.length ? orders.data.map((order) => (
          <Card key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div><p className="font-medium">{providerLabels[order.provider as Provider]} · {Number(order.amount).toLocaleString()} {order.currency}</p><p className="text-xs text-muted-foreground">+{order.credits_requested.toLocaleString()} credits · {order.payment_reference || "Stripe checkout"} · {new Date(order.created_at).toLocaleString()}</p></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">{order.status}</span>{order.checkout_url && order.status === "pending" && <Button size="sm" variant="outline" onClick={() => window.location.assign(order.checkout_url!)}>Resume checkout <ArrowUpRight className="h-3.5 w-3.5" /></Button>}</div>
          </Card>
        )) : <p className="text-sm text-muted-foreground">No top-ups yet.</p>}
      </div>
    </section>
  );
}
