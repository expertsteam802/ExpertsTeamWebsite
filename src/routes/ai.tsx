import { createFileRoute } from "@tanstack/react-router";

import { CodeAgent } from "@/components/code-agent";
import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Chris AI — full app builder workspace" },
      {
        name: "description",
        content:
          "Build complete apps inside a large full-width workspace with Chris AI. No tiny preview panels, just the real agent experience.",
      },
      { property: "og:title", content: "Chris AI — full app builder workspace" },
      {
        property: "og:description",
        content:
          "Turn ideas into working app projects with a full-size AI workspace built for real app generation and editing.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  return (
    <PageShell>
      <section className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8">
        <div className="mb-6 animate-rise">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                Chris AI workspace
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Build real apps in a full-size workspace
              </h1>
            </div>
            <div className="rounded-full border border-border/80 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              Full editor · project builder · live app generation
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
            This is the real agent experience: no snippet previews, no tiny mockups. Just a large,
            expandable workspace for building, editing, and shipping app ideas with Chris AI.
          </p>
        </div>

        <div className="min-h-[72vh] w-full">
          <CodeAgent />
        </div>
      </section>
    </PageShell>
  );
}
