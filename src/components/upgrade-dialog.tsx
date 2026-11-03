import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod, type UpgradeRequest } from "@/lib/subscription";

export function UpgradeDialog() {
  const { user, profile } = useAuth();
  const settings = useSiteSettings();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("paypal");
  const [planKind, setPlanKind] = useState<"ai" | "storage">("ai");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const { data: requests } = useQuery({
    queryKey: ["upgrade-requests", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("id, user_id, amount, kind, method, reference, note, status, reviewed_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as UpgradeRequest[];
    },
  });

  const pending = (requests ?? []).find((request) => request.status === "pending");
  const configuredPrice = Number(planKind === "ai" ? settings.ai_subscription_price : settings.subscription_price);
  const price = Number.isFinite(configuredPrice) && configuredPrice > 0 ? configuredPrice : 1;
  const payoutAccount = settings.payout_account?.trim();
  const studioActive = Boolean(profile?.ai_subscribed && (!profile.ai_subscription_expires_at || new Date(profile.ai_subscription_expires_at).getTime() > Date.now()));
  const activeMethod = PAYMENT_METHODS.find((item) => item.value === method)!;

  const submit = useMutation({
    mutationFn: async () => {
      if (pending) throw new Error("You already have a payment awaiting review.");
      if (!payoutAccount) throw new Error("The creator has not configured a payment destination yet.");
      if (!user) throw new Error("Sign in first.");
      if (reference.trim().length < 4) {
        throw new Error("Paste the payment reference or transaction ID (at least 4 characters).");
      }
      const { error } = await supabase.from("subscription_requests").insert({
        user_id: user.id,
        amount: price,
        kind: planKind,
        method,
        reference: reference.trim().slice(0, 120),
        note: note.trim().slice(0, 400) || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment submitted — the creator will confirm it shortly.");
      setReference("");
      setNote("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["upgrade-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;

  if (studioActive) {
    return (
      <Badge variant="secondary" className="w-fit gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" /> Subscriber ·{" "}
        Studio access · {Number(profile.ai_credits ?? 0)} AI credits available
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      {pending && (
        <Badge variant="outline" className="w-fit gap-1">
          <Clock className="h-3.5 w-3.5" /> Payment under review
        </Badge>
      )}
      <Dialog open={open} onOpenChange={(next) => !submit.isPending && setOpen(next)}>
        <DialogTrigger asChild>
          <Button size="sm" className="w-fit">
            <Sparkles className="mr-2 h-4 w-4" /> Upgrade for ${price.toFixed(2)}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {planKind === "ai" ? "Unlock ExpertsTeam Studio" : `Unlock ${formatBytes(settings.subscription_quota_bytes)} of space`}
            </DialogTitle>
            <DialogDescription>
              {planKind === "ai"
                ? `A 30-day Studio subscription for ${price.toFixed(2)} unlocks app creation and ${Number(settings.ai_subscription_credits) || 500} AI credits.`
                : `One payment of ${price.toFixed(2)} raises your upload limit from ${formatBytes(profile?.storage_quota_bytes ?? 209715200)} to ${formatBytes(settings.subscription_quota_bytes)}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Choose plan</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={planKind === "ai" ? "default" : "outline"} onClick={() => setPlanKind("ai")}>Studio · ${Number(settings.ai_subscription_price) > 0 ? Number(settings.ai_subscription_price).toFixed(2) : "1.00"}</Button>
                <Button type="button" size="sm" variant={planKind === "storage" ? "default" : "outline"} onClick={() => setPlanKind("storage")}>Extra storage · ${Number(settings.subscription_price).toFixed(2)}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{planKind === "ai" ? "Unlocks app creation for 30 days with a limited AI credit allowance. Free-model provider quotas still apply." : "One-time storage upgrade, confirmed manually by the creator."}</p>
            </div>
            <div className="space-y-2">
              <Label>Pay with</Label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={method === item.value ? "default" : "outline"}
                    onClick={() => setMethod(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{activeMethod.hint}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Send ${price.toFixed(2)} to
              </p>
              {payoutAccount ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="break-all text-sm font-medium">{payoutAccount}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void navigator.clipboard.writeText(payoutAccount);
                      toast.success("Payout account copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  The creator has not published a payout account yet. Contact {settings.owner_email}{" "}
                  before paying.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upgrade-reference">Payment reference / transaction ID</Label>
              <Input
                id="upgrade-reference"
                maxLength={120}
                placeholder="e.g. 8FJ92KL0X or MoMo ref 123456789"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upgrade-note">Note for the creator (optional)</Label>
              <Textarea
                id="upgrade-note"
                maxLength={400}
                placeholder="Name on the payment, time sent, anything useful"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Your selected plan unlocks after the creator confirms payment in the Admin panel. Studio access lasts 30 days.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "I have paid — submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!!requests?.length && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {requests.slice(0, 3).map((request) => (
            <li key={request.id}>
              ${Number(request.amount).toFixed(2)} · {request.reference} · {request.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
