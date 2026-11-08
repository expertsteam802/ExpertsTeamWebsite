import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Info } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Plans & Limits — ExpertsTeam" },
      {
        name: "description",
        content:
          "See the current ExpertsTeam access model, available features and which paid plans are still under development.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Simple and transparent
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Plans & limits
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          ExpertsTeam is currently available without a paid subscription. We will publish exact
          quotas and prices before introducing paid plans or charging for any feature.
        </p>

        <Card className="mt-9 overflow-hidden border-primary/30 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <CheckCircle2 className="h-4 w-4" /> Current access
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold">Free access</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No ExpertsTeam subscription checkout is currently offered on this page.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "Community, profiles and private messages",
              "Learning resources and creator videos",
              "Games, apps and shared files",
              "Browser code editor and project saving",
              "Isolated Linux sandbox and app preview",
              "Public app publishing with a shareable URL",
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {feature}
              </div>
            ))}
          </div>
        </Card>

        <Card className="mt-5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 text-primary" /> Features in development
          </div>
          <h2 className="mt-3 font-display text-xl font-semibold">
            ExpertAI plans and paid upgrades
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            ExpertAI prompt-based coding is under development. Paid AI credits, premium hosting,
            custom domains and subscription tiers are not available for purchase yet. Sandbox
            sessions, compute resources and storage remain subject to infrastructure limits.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Before any paid launch, this page will explain the exact quotas, renewal terms,
            supported payment methods and cancellation process. No pricing or payment method is
            being implied today.
          </p>
        </Card>

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link to="/showcase" className="font-semibold text-primary hover:underline">
            Explore published projects
          </Link>
          <Link to="/contact" className="font-semibold text-primary hover:underline">
            Ask about the platform
          </Link>
        </div>
      </main>
    </PageShell>
  );
}
