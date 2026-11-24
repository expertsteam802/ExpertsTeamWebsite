import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Rate = Tables<"credit_topup_rates">;
type Topup = Tables<"credit_topup_orders">;
type Provider = "momo" | "airtel" | "crypto" | "stripe";
const providers: Provider[] = ["momo", "airtel", "crypto", "stripe"];

const blankRate = {
  provider: "momo" as Provider,
  currency: "RWF",
  credits_per_unit: "1",
  min_amount: "1",
  max_amount: "100000",
  payment_instructions: "",
  is_enabled: false,
};

export function AdminCreditTopupsPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankRate);

  const rates = useQuery({
    queryKey: ["admin-credit-topup-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_topup_rates").select("*").order("provider").order("currency");
      if (error) throw error;
      return (data ?? []) as Rate[];
    },
  });
  const orders = useQuery({
    queryKey: ["admin-credit-topup-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_topup_orders").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Topup[];
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-credit-topup-rates"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-credit-topup-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["credit-topup-rates"] });
    void queryClient.invalidateQueries({ queryKey: ["credit-topup-orders"] });
  };

  const saveRate = useMutation({
    mutationFn: async () => {
      const multiplier = Number(form.credits_per_unit);
      const min = Number(form.min_amount);
      const max = Number(form.max_amount);
      const currency = form.currency.trim().toUpperCase();
      if (!/^[A-Z]{3,5}$/.test(currency)) throw new Error("Currency must be a 3–5 character ISO or crypto code.");
      if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100000) throw new Error("Enter a positive credit conversion rate.");
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) throw new Error("Check the minimum and maximum payment amounts.");
      if (form.provider === "stripe" && currency !== "USD") throw new Error("Stripe top-ups are currently USD only.");
      const { error } = await supabase.from("credit_topup_rates").upsert({
        provider: form.provider,
        currency,
        credits_per_unit: multiplier,
        min_amount: min,
        max_amount: max,
        payment_instructions: form.payment_instructions.trim(),
        is_enabled: form.is_enabled,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,currency" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Top-up rate saved."); setForm(blankRate); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_topup_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Top-up rate removed."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const review = useMutation({
    mutationFn: async ({ order, approve }: { order: Topup; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_review_credit_topup", {
        p_order_id: order.id,
        p_approve: approve,
        p_note: approve ? "Payment verified by administrator." : "Payment rejected after review.",
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.approve ? "Top-up verified and credits added." : "Top-up rejected.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div><h2 className="font-display text-xl font-semibold">Credit top-up rates</h2><p className="text-sm text-muted-foreground">Set the payment currency, credit conversion, limits and payment instructions. Methods remain hidden until enabled.</p></div>
        <Card className="grid gap-3 p-4 md:grid-cols-2">
          <div className="space-y-1"><Label>Provider</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as Provider, currency: event.target.value === "stripe" ? "USD" : form.currency })}>{providers.map((item) => <option key={item} value={item}>{item === "momo" ? "Mobile Money" : item === "airtel" ? "Airtel Money" : item === "crypto" ? "Crypto" : "Stripe"}</option>)}</select></div>
          <div className="space-y-1"><Label>Currency</Label><Input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="RWF, USD, USDT…" /></div>
          <div className="space-y-1"><Label>Credits per currency unit</Label><Input type="number" min="0.0001" step="0.0001" value={form.credits_per_unit} onChange={(event) => setForm({ ...form, credits_per_unit: event.target.value })} /></div>
          <div className="space-y-1"><Label>Minimum amount</Label><Input type="number" min="0.01" step="0.01" value={form.min_amount} onChange={(event) => setForm({ ...form, min_amount: event.target.value })} /></div>
          <div className="space-y-1"><Label>Maximum amount</Label><Input type="number" min="0.01" step="0.01" value={form.max_amount} onChange={(event) => setForm({ ...form, max_amount: event.target.value })} /></div>
          <div className="space-y-1 md:col-span-2"><Label>Payment instructions (shown to members)</Label><Textarea rows={3} maxLength={2000} value={form.payment_instructions} onChange={(event) => setForm({ ...form, payment_instructions: event.target.value })} placeholder="Mobile money number, account name, crypto address or transfer instructions…" /></div>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })} /> Enable this top-up method</label>
          <div className="md:col-span-2"><Button onClick={() => saveRate.mutate()} disabled={saveRate.isPending}><Plus className="h-4 w-4" /> {saveRate.isPending ? "Saving…" : "Save top-up rate"}</Button></div>
        </Card>
        <div className="space-y-2">
          {(rates.data ?? []).map((rate) => (
            <Card key={rate.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div><p className="font-medium capitalize">{rate.provider} · {rate.currency} <span className="text-xs text-primary">{Number(rate.credits_per_unit).toLocaleString()} credits/unit</span></p><p className="text-xs text-muted-foreground">{rate.min_amount}–{rate.max_amount} {rate.currency} · {rate.is_enabled ? "Enabled" : "Disabled"}</p></div>
              <Button size="icon" variant="destructive" disabled={deleteRate.isPending} onClick={() => { if (window.confirm("Remove this payment rate? Existing orders will be retained.")) deleteRate.mutate(rate.id); }}><Trash2 className="h-4 w-4" /></Button>
            </Card>
          ))}
          {!rates.data?.length && <p className="text-sm text-muted-foreground">No top-up rates configured yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="font-display text-xl font-semibold">Member top-up requests</h2><p className="text-sm text-muted-foreground">Verify manual MoMo, Airtel Money and crypto payments. Stripe payments are credited by the signed webhook.</p></div>
        {(orders.data ?? []).map((order) => (
          <Card key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-medium">{order.user_id.slice(0, 8)} · {order.provider.toUpperCase()} · {Number(order.amount).toLocaleString()} {order.currency} · +{order.credits_requested.toLocaleString()} credits</p><p className="break-all text-xs text-muted-foreground">Reference: {order.payment_reference || "Stripe checkout"} · {new Date(order.created_at).toLocaleString()} · {order.status}</p>{order.payment_note && <p className="mt-1 text-xs text-muted-foreground">{order.payment_note}</p>}</div>
            {order.status === "pending" && order.provider !== "stripe" && <div className="flex gap-2"><Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ order, approve: true })}><Check className="h-4 w-4" /> Verify</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ order, approve: false })}><X className="h-4 w-4" /> Reject</Button></div>}
            {order.status === "pending" && order.provider === "stripe" && <span className="text-xs text-muted-foreground">Awaiting Stripe webhook</span>}
          </Card>
        ))}
        {!orders.data?.length && <Card className="p-4 text-sm text-muted-foreground">No credit top-ups submitted yet.</Card>}
      </section>
    </div>
  );
}
