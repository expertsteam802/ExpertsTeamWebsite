import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Clock3, Coins, Gift, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/earn")({
  head: () => ({
    meta: [
      { title: "Earn AI Credits | ExpertsTeam" },
      { name: "description", content: "Complete eligible partner offers to earn AI credits for ExpertsTeam." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EarnCreditsPage,
});

type Offer = Tables<"cpa_offers">;
type Conversion = Tables<"cpa_conversions">;
type CreditTransaction = Tables<"ai_credit_transactions">;

function EarnCreditsPage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const offersQuery = useQuery({
    queryKey: ["cpa-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpa_offers")
        .select("*")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Offer[];
    },
  });

  const conversionsQuery = useQuery({
    queryKey: ["cpa-conversions", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpa_conversions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Conversion[];
    },
  });

  const ledgerQuery = useQuery({
    queryKey: ["ai-credit-ledger", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_credit_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as CreditTransaction[];
    },
  });

  const startOffer = useMutation({
    mutationFn: async (offer: Offer) => {
      const { data, error } = await supabase.rpc("start_cpa_offer", { p_offer_id: offer.id });
      if (error) throw error;
      const started = data?.[0];
      if (!started?.tracking_id || !started.destination_url) {
        throw new Error("The offer could not be started. Please try again.");
      }
      const destination = new URL(started.destination_url);
      if (destination.protocol !== "https:") throw new Error("This partner offer has an invalid destination.");
      const parameter = started.tracking_parameter || "subid";
      const macro = "{" + parameter + "}";
      const encodedMacro = encodeURIComponent(macro);
      const href = destination.href;
      if (href.includes(macro)) {
        destination.href = href.replaceAll(macro, started.tracking_id);
      } else if (href.toLowerCase().includes(encodedMacro.toLowerCase())) {
        destination.href = href.replace(new RegExp(encodedMacro, "ig"), encodeURIComponent(started.tracking_id));
      } else if (destination.searchParams.get(parameter) === macro) {
        destination.searchParams.set(parameter, started.tracking_id);
      } else {
        destination.searchParams.set(parameter, started.tracking_id);
      }
      return destination.toString();
    },
    onSuccess: (url) => {
      void queryClient.invalidateQueries({ queryKey: ["cpa-conversions", user?.id] });
      window.location.assign(url);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:py-12">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-9">
          <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Gift className="h-3.5 w-3.5" /> Partner rewards
              </span>
              <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Earn credits. Build more.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Complete an eligible partner offer and ExpertsTeam will add AI credits after the completion is verified.
                No subscription payment is required to earn credits.
              </p>
            </div>
            <Card className="min-w-44 border-primary/25 bg-background/80 p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Coins className="h-4 w-4 text-primary" /> Available AI credits</div>
              <p className="mt-2 font-display text-4xl font-bold tabular-nums">{profile?.ai_credits ?? 0}</p>
            </Card>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Available offers</h2>
            <p className="mt-1 text-sm text-muted-foreground">Rewards are credited only after the partner confirms a valid completion.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="h-4 w-4" /> Verified completions</div>
        </div>

        {offersQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2"><Card className="h-36 animate-pulse" /><Card className="h-36 animate-pulse" /></div>
        ) : offersQuery.isError ? (
          <Card className="p-6 text-sm text-destructive">Offers could not be loaded. Please refresh the page.</Card>
        ) : offersQuery.data?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {offersQuery.data.map((offer) => (
              <Card key={offer.id} className="flex flex-col gap-4 p-5 transition-colors hover:border-primary/35">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{offer.category}</span>
                    <h3 className="mt-1 text-lg font-semibold">{offer.title}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">+{offer.reward_credits} credits</span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{offer.description}</p>
                {offer.instructions && <p className="rounded-lg bg-muted/60 p-3 text-xs leading-5">{offer.instructions}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
                  <span className="text-xs text-muted-foreground">{offer.provider}</span>
                  <Button onClick={() => startOffer.mutate(offer)} disabled={startOffer.isPending}>
                    {startOffer.isPending ? "Preparing…" : "Start offer"} <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Gift className="mx-auto h-8 w-8 text-primary" />
            <h3 className="mt-3 font-semibold">New offers are on the way</h3>
            <p className="mt-1 text-sm text-muted-foreground">There are no active partner offers right now. Check back soon.</p>
          </Card>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Your reward activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pending rewards are not spendable until verified.</p>
          </div>
          <Card className="divide-y divide-border p-0">
            {conversionsQuery.isLoading ? (
              <p className="p-5 text-sm text-muted-foreground">Loading reward activity…</p>
            ) : conversionsQuery.data?.length ? conversionsQuery.data.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{item.provider} offer completion</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">+{item.reward_credits}</span>
                  <span className={item.status === "approved" ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600" : item.status === "rejected" ? "rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive" : "inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"}>
                    {item.status === "pending" && <Clock3 className="h-3 w-3" />}{item.status}
                  </span>
                </div>
              </div>
            )) : <p className="p-5 text-sm text-muted-foreground">Your completed offers will appear here.</p>}
          </Card>
        </section>
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold">AI credit history</h2>
            <p className="mt-1 text-sm text-muted-foreground">A transparent record of rewards and AI usage.</p>
          </div>
          <Card className="divide-y divide-border p-0">
            {ledgerQuery.isLoading ? (
              <p className="p-5 text-sm text-muted-foreground">Loading credit history…</p>
            ) : ledgerQuery.data?.length ? ledgerQuery.data.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{entry.description || entry.source.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()} · balance after: {entry.balance_after}</p>
                </div>
                <span className={entry.amount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-muted-foreground"}>
                  {entry.amount > 0 ? "+" : ""}{entry.amount}
                </span>
              </div>
            )) : <p className="p-5 text-sm text-muted-foreground">Your AI credit rewards and usage will appear here.</p>}
          </Card>
        </section>
      </main>
    </PageShell>
  );
}
