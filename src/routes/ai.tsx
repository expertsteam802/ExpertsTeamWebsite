import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Code2, MessageSquare, Users } from "lucide-react";

import { ChrisAiChat } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
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
  const [activeView, setActiveView] = useState<"builder" | "chat">("builder");

  return (
    <main className="fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070b13] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b111d] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label="Back to ExpertsTeam website"
            title="Back to website"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-cyan-300/40 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <img src="/expertai-mark.svg" alt="ExpertAI" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide">EXPERTAI STUDIO</span>
              <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300 sm:inline">
                WORKSPACE
              </span>
            </div>
            <p className="hidden text-[10px] text-slate-400 sm:block">Build. Test. Ship.</p>
          </div>
        </div>

        <nav
          aria-label="ExpertAI workspace"
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
        >
          <button
            type="button"
            onClick={() => setActiveView("builder")}
            aria-pressed={activeView === "builder"}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${activeView === "builder" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <Code2 className="h-4 w-4" />
            <span>Agent</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("chat")}
            aria-pressed={activeView === "chat"}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${activeView === "chat" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>AI Chat</span>
          </button>
        </nav>

        <Link
          to="/community"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Community</span>
        </Link>
      </header>

      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={`h-full min-h-0 overflow-hidden ${activeView === "builder" ? "block" : "hidden"}`}
        >
          <CodeAgent />
        </div>
        <div
          className={`h-full min-h-0 overflow-hidden ${activeView === "chat" ? "block" : "hidden"}`}
        >
          <ChrisAiChat />
        </div>
      </section>
    </main>
  );
}
