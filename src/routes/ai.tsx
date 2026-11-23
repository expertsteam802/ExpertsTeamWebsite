import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Users } from "lucide-react";

import { CodeAgent } from "@/components/code-agent";
import { useAuth } from "@/hooks/use-auth";

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
  const { user } = useAuth();
  return (
    <main className="expert-ai-page fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label="Back to ExpertsTeam website"
            title="Back to website"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-cyan-300/40 hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <img src="/expertai-mark.svg" alt="ExpertAI" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="expert-ai-brand-copy text-sm font-semibold tracking-wide">EXPERTAI STUDIO</span>
              <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300 sm:inline">
                WORKSPACE
              </span>
            </div>
            <p className="hidden text-[10px] text-muted-foreground sm:block">Build. Test. Ship.</p>
          </div>
        </div>
        <nav aria-label="ExpertAI tools" className="flex items-center gap-1">
          {!user && (
            <Link
              to="/auth"
              search={{ next: "/ai" }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Sign in
            </Link>
          )}
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            <MessageSquare className="h-4 w-4" />
            <span>AI Chat</span>
          </Link>
          <Link
            to="/community"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-muted"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Community</span>
          </Link>
        </nav>
      </header>
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div aria-hidden="true" className="et-ai-cinematic-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="et-ai-cinematic-atmosphere pointer-events-none absolute inset-0" />
        <div className="h-full min-h-0 overflow-hidden">
          <CodeAgent />
        </div>
      </section>
    </main>
  );
}
