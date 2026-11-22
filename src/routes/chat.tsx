import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Code2, LogIn, MessageSquare } from "lucide-react";

import { ChrisAiChat } from "@/components/chris-ai";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { name: "robots", content: "index, follow" },
      { title: "AI Chat — Ask ExpertAI Anything | ExpertsTeam" },
      {
        name: "description",
        content:
          "Chat with ExpertAI for help with coding, software, learning, ideas and everyday questions. Start a conversation with ExpertsTeam's AI assistant.",
      },
      { property: "og:title", content: "AI Chat — ExpertsTeam" },
      {
        property: "og:description",
        content:
          "Ask ExpertAI about coding, software, learning, ideas and more. Start chatting for free on ExpertsTeam.",
      },
      { property: "og:url", content: "https://expertsteam.giize.com/chat" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/chat" }],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { user } = useAuth();

  return (
    <main className="expert-ai-page fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label="Back to ExpertsTeam website"
            title="Back to website"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-wide">ExpertAI Chat</h1>
            <p className="hidden text-[10px] text-muted-foreground sm:block">
              Ask questions. Explore ideas. Get help.
            </p>
          </div>
        </div>
        <nav aria-label="ExpertAI navigation" className="flex shrink-0 items-center gap-2">
          <Link
            to="/ai"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">AI Agent</span>
          </Link>
          {!user && (
            <Link
              to="/auth"
              search={{ next: "/chat" }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign in</span>
            </Link>
          )}
        </nav>
      </header>
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div aria-hidden="true" className="et-ai-cinematic-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="et-ai-cinematic-atmosphere pointer-events-none absolute inset-0" />
        <div className="relative z-10 h-full min-h-0 overflow-hidden">
          <ChrisAiChat />
        </div>
      </section>
    </main>
  );
}
