import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Crown, ShieldCheck, Sparkles, Users } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/creator")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Creator dashboard — ExpertsTeam" },
      { name: "description", content: "Private owner dashboard for ExpertsTeam." },
    ],
  }),
  component: CreatorDashboard,
});

function CreatorDashboard() {
  const { user, isCreator } = useAuth();
  const authorized = isCreator && user?.email?.toLowerCase() === "expertsteam2011@gmail.com";

  if (!authorized) {
    return (
      <PageShell>
        <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground" />
          <h1 className="font-display text-2xl font-semibold">Creator access only</h1>
          <p className="text-sm text-muted-foreground">This owner dashboard is reserved for the verified ExpertsTeam creator account.</p>
          <Link to="/"><Button variant="outline">Return home</Button></Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 p-7 text-white shadow-2xl sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-200/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-100"><Crown className="h-3.5 w-3.5" /> Owner access</div>
              <h1 className="font-display text-3xl font-bold sm:text-5xl">Creator dashboard</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/75">Your private control room for ExpertsTeam ownership, platform administration and creator operations.</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10"><Sparkles className="h-7 w-7 text-cyan-200" /></div>
          </div>
          <div className="relative mt-8 border-t border-white/10 pt-5 text-xs text-blue-100/70">Signed in as <span className="font-semibold text-white">{user?.email}</span></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-semibold">Administration</h2><p className="mt-1 text-sm text-muted-foreground">Manage members, community content, moderation, payments, uploads and site settings.</p></div>
            <div className="mt-auto"><Link to="/admin"><Button className="w-full">Open admin dashboard <ArrowUpRight className="ml-2 h-4 w-4" /></Button></Link></div>
          </Card>
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Crown className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-semibold">Creator ownership</h2><p className="mt-1 text-sm text-muted-foreground">Your creator identity is protected separately from ordinary admin permissions. Admins cannot grant or remove the creator role.</p></div>
            <div className="mt-auto rounded-xl border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">Owner account: expertsteam2011@gmail.com</div>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
