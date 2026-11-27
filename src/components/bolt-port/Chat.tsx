/**
 * Adapted from StackBlitz Bolt.new's app/components/chat/BaseChat.tsx.
 * Copyright (c) StackBlitz, Inc. (2024). MIT License.
 *
 * The original Remix/AI SDK message handlers are replaced by controlled props
 * wired to ExpertsTeam's Supabase conversation persistence and Kilo agent.
 */
import { useEffect, useRef } from "react";
import { ArrowRight, Bot, Sparkles } from "lucide-react";
import { BoltMarkdown } from "@/components/bolt-port/Markdown";
import { Button } from "@/components/ui/button";

type ChatMessage = { role: "user" | "assistant"; content: string; createdAt?: string };

type BoltChatPanelProps = {
  projectName: string;
  messages: ChatMessage[];
  prompt: string;
  busy: boolean;
  onPromptChange: (value: string) => void;
  onSend: () => void;
};

const EXAMPLE_PROMPTS = [
  "Build a modern landing page for my business",
  "Create a dashboard with charts and navigation",
  "Make this project responsive on mobile",
  "Find and fix bugs in the current project",
];

export function BoltChatPanel({ projectName, messages, prompt, busy, onPromptChange, onSend }: BoltChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  const submit = () => {
    if (!prompt.trim() || busy) return;
    onSend();
  };

  return (
    <aside className="flex min-h-0 w-full max-w-[440px] shrink-0 flex-col border-r border-white/[0.08] bg-[#111113] max-md:max-w-[48%] max-sm:max-w-full">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
        <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-[#e4e4e7]">
          <Bot size={15} className="text-sky-300"/>
          <span>Chat</span>
          <span className="max-w-[180px] truncate text-[10px] font-normal text-[#71717a]">/ {projectName}</span>
        </div>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] text-[#85858d]">Agent</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto mt-[8vh] max-w-[320px] text-center">
            <div className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Sparkles size={20} className="text-sky-300"/>
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight text-[#f4f4f5]">Where ideas begin</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#85858d]">Bring your idea to life or ask the agent to improve this project.</p>
            <div className="mt-6 flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((example) => (
                <button key={example} type="button" onClick={() => onPromptChange(example)}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-left text-[11px] text-[#a1a1aa] transition hover:border-sky-400/25 hover:bg-sky-400/[0.06] hover:text-white">
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message, index) => (
          <article key={message.createdAt ?? index} className={message.role === "user" ? "ml-5 rounded-xl bg-[#202024] px-3.5 py-3" : "mr-1 px-1 py-2"}>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-[#8b8b94]">
              {message.role === "user" ? "You" : <><Bot size={12} className="text-sky-300"/> ExpertsTeam</>}
            </div>
            <BoltMarkdown content={message.content}/>
          </article>
        ))}
        {busy && <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-[#a1a1aa]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-300/30 border-t-sky-300"/> Working on your project…</div>}
      </div>

      <form className="shrink-0 border-t border-white/[0.07] p-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="overflow-hidden rounded-xl border border-white/[0.12] bg-[#19191c] shadow-[0_8px_30px_rgba(0,0,0,0.22)] transition focus-within:border-sky-300/35">
          <textarea ref={textareaRef} value={prompt} onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="How can ExpertsTeam help you today?" rows={3}
            className="max-h-[200px] min-h-[76px] w-full resize-y bg-transparent px-4 pt-4 text-[12px] leading-5 text-white outline-none placeholder:text-[#686870]"/>
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <span className="text-[10px] text-[#777780]">Kilo · Build mode</span>
            <Button type="submit" size="sm" disabled={!prompt.trim() || busy}
              className="h-8 gap-2 rounded-lg bg-sky-300 px-3 text-[11px] font-medium text-slate-950 hover:bg-sky-200 disabled:opacity-40">
              {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950"/> : <ArrowRight size={13}/>}
              {busy ? "Working" : "Send"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-[#62626a]">AI can make mistakes. Review generated changes before publishing.</p>
      </form>
    </aside>
  );
}
