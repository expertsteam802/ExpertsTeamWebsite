import { createFileRoute } from "@tanstack/react-router";

import { CodeAgent } from "@/components/code-agent";
import { MyLeadContentLocker } from "@/components/mylead-content-locker";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "ExpertsTeam — ExpertAI Studio" },
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
      <div className="relative z-50 shrink-0 border-b border-primary/20 bg-background/95 px-3 py-2 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-5xl">
          <MyLeadContentLocker />
        </div>
      </div>
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
