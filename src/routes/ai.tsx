import { createFileRoute } from "@tanstack/react-router";

import { CodeAgent } from "@/components/code-agent";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "ExpertsTeam — Infinity Expert Mode" },
      {
        name: "description",
        content: "Build, edit, preview, and publish applications in the ExpertsTeam workspace.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  return (
    <main className="expert-ai-page fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <section className="relative min-h-0 flex-1 overflow-hidden" aria-label="ExpertAI application builder">
        <div aria-hidden="true" className="et-ai-cinematic-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="et-ai-cinematic-atmosphere pointer-events-none absolute inset-0" />
        <div className="relative h-full min-h-0 overflow-hidden">
          <CodeAgent />
        </div>
      </section>
    </main>
  );
}
