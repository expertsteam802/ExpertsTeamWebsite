/**
 * Adapted from StackBlitz Bolt.new's app/components/chat/BaseChat.tsx.
 * Copyright (c) StackBlitz, Inc. (2024). MIT License.
 * ExpertsTeam's Kilo/Supabase handlers are supplied as controlled props.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Bot, ImagePlus, MousePointer2, Sparkles, GraduationCap, X } from "lucide-react";
import { BoltMarkdown } from "@/components/bolt-port/Markdown";
import { Button } from "@/components/ui/button";

type ChatMessage={role:"user"|"assistant";content:string;createdAt?:string};
export type ChatOptions={modelTier:"fast"|"architect";tutorMode:boolean};
type Props={projectName:string;messages:ChatMessage[];prompt:string;busy:boolean;width:number;
 onPromptChange:(value:string)=>void;onSend:(options:ChatOptions)=>void;onAttachImage:(file:File)=>void;
 onSelectElement:()=>void;tutorMode:boolean;onTutorModeChange:(value:boolean)=>void;attachedImageName?:string;onRemoveImage:()=>void;};
const EXAMPLES=["Build a modern landing page for my business","Create a dashboard with charts and navigation","Make this project responsive on mobile","Find and fix bugs in the current project"];

export function BoltChatPanel({projectName,messages,prompt,busy,width,onPromptChange,onSend,onAttachImage,onSelectElement,tutorMode,onTutorModeChange,attachedImageName,onRemoveImage}:Props){
 const scrollRef=useRef<HTMLDivElement>(null);const fileRef=useRef<HTMLInputElement>(null);const [modelTier,setModelTier]=useState<"fast"|"architect">("fast");
 useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[messages,busy]);
 const submit=()=>{if(prompt.trim()&&!busy)onSend({modelTier,tutorMode});};
 return <aside style={{ "--chat-panel-width": `${width}px` } as CSSProperties} className="flex min-h-0 w-full max-w-full shrink-0 flex-col border-r border-[#1E293B] bg-[#0D1322] md:w-[var(--chat-panel-width)] md:max-w-none max-md:w-full">
  <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#1E293B] px-4">
   <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-[#E2E8F0]"><Bot size={15} className="text-[#60A5FA]"/><span>Chat</span><span className="max-w-[180px] truncate text-[10px] font-normal text-[#94A3B8]">/ {projectName}</span></div>
   <span className="rounded-md border border-[#1E293B] bg-[#070B14] px-2 py-1 text-[9px] text-[#94A3B8]">Agent</span>
  </div>
  <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
   {messages.length===0?<div className="mx-auto mt-[8vh] max-w-[320px] text-center"><div className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-xl border border-[#1E293B] bg-[#2563EB]/10"><Sparkles size={20} className="text-[#60A5FA]"/></div><h2 className="text-[20px] font-semibold tracking-tight text-[#F8FAFC]">Where ideas begin</h2><p className="mt-2 text-[12px] leading-5 text-[#CBD5E1]">Bring your idea to life or ask the agent to improve this project.</p><div className="mt-6 flex flex-col gap-2">{EXAMPLES.map(example=><button key={example} type="button" onClick={()=>onPromptChange(example)} className="rounded-lg border border-[#1E293B] bg-[#070B14] px-3 py-2.5 text-left text-[11px] text-[#CBD5E1] transition hover:border-[#2563EB]/50 hover:bg-[#2563EB]/10 hover:text-white">{example}</button>)}</div></div>
   :messages.map((message,index)=><article key={message.createdAt??index} className={message.role==="user"?"ml-5 rounded-xl border border-[#1E293B] bg-[#070B14] px-3.5 py-3":"mr-1 px-1 py-2"}><div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-[#94A3B8]">{message.role==="user"?"You":<><Bot size={12} className="text-[#60A5FA]"/> ExpertsTeam</>}</div><BoltMarkdown content={message.content}/></article>)}
   {busy&&<div className="flex items-center gap-2 px-2 py-2 text-[11px] text-[#CBD5E1]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#2563EB]/30 border-t-[#3B82F6]"/> Working on your project…</div>}
  </div>
  <form className="shrink-0 border-t border-[#1E293B] p-3" onSubmit={e=>{e.preventDefault();submit();}}>
   <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#070B14] shadow-[0_8px_30px_rgba(0,0,0,0.22)] transition focus-within:border-[#2563EB]/60">
    <textarea value={prompt} onChange={e=>onPromptChange(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit();}}} placeholder="How can ExpertsTeam help you today?" rows={3} className="max-h-[200px] min-h-[76px] w-full resize-y bg-transparent px-4 pt-4 text-[12px] leading-5 text-[#F8FAFC] outline-none placeholder:text-[#94A3B8]"/>
    {attachedImageName&&<div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-[#1E293B] bg-[#0D1322] px-2 py-1.5 text-[10px] text-[#CBD5E1]"><ImagePlus size={12}/><span className="min-w-0 flex-1 truncate">{attachedImageName}</span><button type="button" onClick={onRemoveImage} aria-label="Remove attachment"><X size={12}/></button></div>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E293B] px-3 py-2">
     <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Model" value={modelTier} onChange={e=>setModelTier(e.target.value as "fast"|"architect")} className="h-7 rounded-md border border-[#1E293B] bg-[#0D1322] px-2 text-[10px] text-[#E2E8F0]"><option value="fast">Model: Fast (1 EC)</option><option value="architect">Model: Architect (3 EC)</option></select>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)onAttachImage(file);e.currentTarget.value="";}}/>
      <button type="button" onClick={()=>fileRef.current?.click()} title="Attach Image" className="grid h-7 w-7 place-items-center rounded-md text-[#CBD5E1] hover:bg-white/[0.08]"><ImagePlus size={14}/></button>
      <button type="button" onClick={onSelectElement} title="Select Element in preview" className="flex h-7 items-center gap-1 rounded-md px-2 text-[10px] text-[#CBD5E1] hover:bg-white/[0.08]"><MousePointer2 size={13}/><span className="hidden sm:inline">Select Element</span></button>
      <button type="button" aria-pressed={tutorMode} onClick={()=>onTutorModeChange(!tutorMode)} className={`flex h-7 items-center gap-1 rounded-md px-2 text-[10px] ${tutorMode?"bg-[#10B981]/15 text-[#6EE7B7]":"text-[#CBD5E1] hover:bg-white/[0.08]"}`}><GraduationCap size={13}/> Tutor</button>
     </div>
     <Button type="submit" size="sm" disabled={!prompt.trim()||busy} className="h-8 gap-2 rounded-lg bg-[#2563EB] px-3 text-[11px] font-medium text-white shadow-lg shadow-blue-500/25 hover:bg-[#3B82F6] disabled:opacity-40">{busy?<span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white"/>:<ArrowRight size={13}/>} {busy?"Working":"Send"}</Button>
    </div>
   </div>
   <p className="mt-2 text-center text-[9px] text-[#94A3B8]">AI can make mistakes. Review generated changes before publishing.</p>
  </form>
 </aside>;
}
