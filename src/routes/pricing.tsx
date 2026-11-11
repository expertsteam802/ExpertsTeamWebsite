import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "ExpertsTeam Pricing — Custom Software from $10" },
      {
        name: "description",
        content:
          "Join ExpertsTeam for free. Custom software projects start at $10, with scope and final pricing confirmed before work begins.",
      },
      { property: "og:title", content: "ExpertsTeam Free Plan — $0" },
      {
        property: "og:description",
        content: "Learn, create, connect and publish with ExpertsTeam. Start free with no subscription checkout.",
      },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/pricing" }],
  }),
  component: PricingPage,
});

const features = [
  "Community profiles, posts and private messages",
  "Learning resources and creator videos",
  "Project workspace with editable source files",
  "Isolated Linux terminal and cloud preview, subject to availability",
  "Save projects and publish shareable app URLs",
  "Project showcase and developer community",
  "ExpertAI access with the credits available to your account",
];

function PricingPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Straightforward access
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight sm:text-6xl">
            Start free. <span className="brand-text">Build from $10.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Learn, connect and use the platform for free. When you need a custom website, business
            system or application built by our team, projects start at $10.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <Card className="relative overflow-hidden border-primary/35 p-6 shadow-xl shadow-primary/5 sm:p-8">
            <div className="absolute right-0 top-0 rounded-bl-2xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
              START HERE
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Zap className="h-4 w-4" /> FREE PLAN
            </div>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-display text-6xl font-bold tracking-tight">$0</span>
              <span className="pb-2 text-sm text-muted-foreground">/ forever to join</span>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              No subscription payment or card is required to create an account and use the free
              platform features.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm leading-6">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <Button asChild className="mt-8 h-11 w-full sm:w-auto">
              <Link to="/auth">
                Create your free account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Card>

          <div className="space-y-5">
            <Card className="p-6">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-display text-xl font-semibold">No surprise charges</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The community platform can be used for free. Custom software development is a separate
                service, with a starting price of $10 and a confirmed quote before work begins.
              </p>
            </Card>
            <Card className="border-primary/30 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Custom software</p>
              <p className="mt-2 font-display text-4xl font-bold">$10<span className="ml-2 text-sm font-medium text-muted-foreground">starting price</span></p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Request a website, POS, business system or custom app. We confirm the final quote after reviewing your requirements.
              </p>
              <Link to="/software" className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
                Request a project <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Card>
            <Card className="p-6">
              <Sparkles className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-display text-xl font-semibold">Clear AI and compute limits</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                AI credits, sandbox time, file size and hosting capacity depend on account allowance
                and infrastructure. Free access does not mean unlimited compute or unlimited AI use.
              </p>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-xl font-semibold">Need software built?</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Tell us what your business or project needs and request a software build.
              </p>
              <Link to="/software" className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
                Request software <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Card>
          </div>
        </div>
        <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
          External services, hosting providers and third-party products may have their own terms,
          availability and charges. Those are separate from an ExpertsTeam subscription.
        </p>
      </main>
    </PageShell>
  );
}
