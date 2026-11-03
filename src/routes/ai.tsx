
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Code2, Sparkles, Zap } from "lucide-react";

import { ChrisAiChat } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Experts Team — AI Studio" },
      {
        name: "description",
        content: "Build and develop projects with Experts Team AI Studio.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  const [active, setActive] = useState<"agent" | "chat">("agent");

  return (
    <main className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#080e19] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0b1320] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide">EXPERTS TEAM</p>
            <p className="text-[9px] font-semibold tracking-[0.2em] text-cyan-300">
              AI DEVELOPMENT STUDIO
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => setActive("agent")}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              active === "agent"
                ? "bg-cyan-400/15 text-cyan-200"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">AI Studio</span>
            <span className="sm:hidden">Studio</span>
          </button>
          <button
            onClick={() => setActive("chat")}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              active === "chat"
                ? "bg-cyan-400/15 text-cyan-200"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Expert AI Chat</span>
            <span className="sm:hidden">Chat</span>
          </button>
        </nav>

        <div className="hidden items-center gap-2 text-[10px] text-slate-500 md:flex">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
          Your AI workspace
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden">
        <div className={`h-full min-h-0 ${active === "agent" ? "block" : "hidden"}`}>
          <CodeAgent />
        </div>
        <div className={`h-full min-h-0 overflow-hidden ${active === "chat" ? "block" : "hidden"}`}>
          <ChrisAiChat />
        </div>
      </section>
    </main>
  );
}
