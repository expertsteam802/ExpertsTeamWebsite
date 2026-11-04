import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Code2, MessageSquare, Sparkles } from "lucide-react";

import { AdSlot } from "@/components/ads/ad-slot";
import { ChrisAiChat } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";
import { UpgradeDialog } from "@/components/upgrade-dialog";

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
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0b111d] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-black text-slate-950">
            E
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide">EXPERTSTEAM</span>
              <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300 sm:inline">
                WORKSPACE
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Build something extraordinary</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setActiveView("builder")}
            aria-pressed={activeView === "builder"}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeView === "builder"
                ? "bg-cyan-400/15 text-cyan-200"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Code2 className="h-4 w-4" />
            <span>Builder</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("chat")}
            aria-pressed={activeView === "chat"}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeView === "chat"
                ? "bg-cyan-400/15 text-cyan-200"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>ExpertAI Chat</span>
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <UpgradeDialog />
        </div>

        <div className="hidden items-center gap-2 text-xs text-emerald-300 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Workspace ready
        </div>

        <div className="sm:hidden">
          <Sparkles className="h-5 w-5 text-cyan-300" />
        </div>
      </header>

      <AdSlot slot="ai-top" />
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={`h-full min-h-0 overflow-hidden ${
            activeView === "builder" ? "block" : "hidden"
          }`}
        >
          <CodeAgent />
        </div>

        <div
          className={`h-full min-h-0 overflow-hidden ${activeView === "chat" ? "block" : "hidden"}`}
        >
          <ChrisAiChat />
        </div>
      </section>
      <AdSlot slot="ai-bottom" />
    </main>
  );
}
