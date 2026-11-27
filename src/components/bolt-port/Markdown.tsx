/**
 * Safe, dependency-light Markdown renderer adapted for Bolt's chat message surface.
 * Inspired by StackBlitz Bolt.new's app/components/chat/Markdown.tsx.
 * Copyright (c) StackBlitz, Inc. (2024). MIT License.
 *
 * Unlike Bolt's rehype pipeline, this renderer intentionally never injects HTML.
 */
import type { ReactNode } from "react";

function inline(content: string): ReactNode[] {
  const tokens = content.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index} className="rounded bg-white/[0.09] px-1 py-0.5 font-mono text-[0.92em] text-sky-200">{token.slice(1, -1)}</code>;
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index} className="font-semibold text-[#f4f4f5]">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200">{link[1]}</a>;
    return token;
  });
}

export function BoltMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let code: string[] = [];
  let codeLanguage = "";
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`} className="whitespace-pre-wrap break-words text-[12px] leading-[1.75] text-[#dedee2]">{inline(paragraph.join("\n"))}</p>);
    paragraph = [];
  };

  for (const line of lines) {
    const fence = /^\s*```([^\s`]*)\s*$/.exec(line);
    if (fence) {
      if (inCode) {
        flushParagraph();
        blocks.push(
          <div key={`code-${blocks.length}`} className="my-2 overflow-hidden rounded-lg border border-white/[0.09] bg-[#09090b]">
            <div className="flex h-7 items-center border-b border-white/[0.07] px-3 text-[9px] uppercase tracking-wider text-[#777780]">{codeLanguage || "code"}</div>
            <pre className="max-h-[420px] overflow-auto p-3 text-[11px] leading-5 text-[#d4d4d8]"><code>{code.join("\n")}</code></pre>
          </div>,
        );
        code = [];
        inCode = false;
        codeLanguage = "";
      } else {
        flushParagraph();
        inCode = true;
        codeLanguage = fence[1] || "";
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const className = level === 1 ? "text-[16px]" : level === 2 ? "text-[14px]" : "text-[12px]";
      blocks.push(<h3 key={`h-${blocks.length}`} className={`font-semibold text-[#f4f4f5] ${className}`}>{inline(heading[2])}</h3>);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push(<div key={`li-${blocks.length}`} className="flex gap-2 pl-1 text-[12px] leading-[1.7] text-[#dedee2]"><span className="text-sky-300">•</span><span>{inline(bullet[1])}</span></div>);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push(<blockquote key={`q-${blocks.length}`} className="border-l-2 border-sky-300/40 pl-3 text-[12px] italic leading-[1.7] text-[#a1a1aa]">{inline(quote[1])}</blockquote>);
      continue;
    }
    paragraph.push(line);
  }
  if (inCode) {
    blocks.push(<pre key={`code-${blocks.length}`} className="my-2 max-h-[420px] overflow-auto rounded-lg border border-white/[0.09] bg-[#09090b] p-3 text-[11px] leading-5 text-[#d4d4d8]"><code>{code.join("\n")}</code></pre>);
  }
  flushParagraph();
  return <div className="space-y-2">{blocks}</div>;
}
