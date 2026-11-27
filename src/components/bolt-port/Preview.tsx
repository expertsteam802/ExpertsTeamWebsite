/**
 * Adapted from StackBlitz Bolt.new's app/components/workbench/Preview.tsx.
 * Copyright (c) StackBlitz, Inc. (2024). MIT License.
 * Preview controls are connected to ExpertsTeam's browser WebContainer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Globe, Monitor, RefreshCw, Tablet, Smartphone, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PreviewPort = { port: number; url: string; ready: boolean };
type Viewport = "desktop" | "tablet" | "mobile";
type Props = {
  previewUrl: string; previewPorts: PreviewPort[]; selectedPreviewPort: number | null;
  runtimeOutput: string; busy: boolean; canRun: boolean; booting: boolean;
  onStart: () => void; onSelectPort: (port: number) => void;
  onElementSelected: (details: string) => void;
  visualEdit: boolean;
  onToggleVisualEdit: (enabled: boolean) => void;
};
export function BoltPreviewPanel({ previewUrl, previewPorts, selectedPreviewPort, runtimeOutput, busy, canRun, booting, visualEdit, onToggleVisualEdit, onStart, onSelectPort, onElementSelected }: Props) {
  const [address,setAddress]=useState(previewUrl);
  const [frameUrl,setFrameUrl]=useState(previewUrl);
  const [reloadKey,setReloadKey]=useState(0);
  const [viewport,setViewport]=useState<Viewport>("desktop");

  const frameRef=useRef<HTMLIFrameElement>(null);
  const baseUrl=useMemo(()=>{try{return new URL(previewUrl).origin;}catch{return "";}},[previewUrl]);
  useEffect(()=>{setAddress(previewUrl);setFrameUrl(previewUrl);},[previewUrl]);
  useEffect(()=>{
    frameRef.current?.contentWindow?.postMessage({type:"experts:visual-edit",enabled:visualEdit},"*");
  },[visualEdit,frameUrl]);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.source!==frameRef.current?.contentWindow||event.data?.type!=="experts:element-selected")return;
      const detail=String(event.data.detail??"").slice(0,3000);
      onElementSelected(detail);
      onToggleVisualEdit(false);
    };
    window.addEventListener("message",receive);
    return ()=>window.removeEventListener("message",receive);
  },[onElementSelected,onToggleVisualEdit]);
  const navigate=()=>{
    if(!baseUrl||!address.startsWith(baseUrl))return;
    const next=address.slice(baseUrl.length);
    if(next&& !["/","?","#"].includes(next[0]))return;
    setFrameUrl(address);
  };
  const widths:Record<Viewport,string>={desktop:"w-full",tablet:"w-[768px] max-w-full",mobile:"w-[390px] max-w-full"};
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#070B14]">
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-[#1E293B] bg-[#0D1322] px-3 py-1.5">
      <button type="button" aria-label="Reload preview" onClick={()=>setReloadKey(v=>v+1)} disabled={!frameUrl} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#CBD5E1] hover:bg-white/[0.07] disabled:opacity-40"><RefreshCw size={14}/></button>
      <div className="flex h-8 min-w-[120px] flex-1 items-center gap-2 rounded-md border border-[#1E293B] bg-[#070B14] px-3 text-[11px]">
        <Globe size={13} className="shrink-0 text-[#94A3B8]"/>
        <input aria-label="Preview URL" value={address} onChange={e=>setAddress(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")navigate();}} placeholder="Preview URL" className="min-w-0 flex-1 bg-transparent text-[#E2E8F0] outline-none placeholder:text-[#94A3B8]"/>
      </div>
      {previewPorts.filter(p=>p.ready).length>1&&<select aria-label="Preview port" value={selectedPreviewPort??""} onChange={e=>onSelectPort(Number(e.target.value))} className="h-8 max-w-24 rounded-md border border-[#1E293B] bg-[#070B14] px-2 text-[10px] text-[#CBD5E1]">{previewPorts.filter(p=>p.ready).map(p=><option key={p.port} value={p.port}>Port {p.port}</option>)}</select>}
      <div className="flex items-center gap-0.5 rounded-md border border-[#1E293B] bg-[#070B14] p-0.5">
        {([{id:"desktop" as const,icon:Monitor,label:"Desktop"},{id:"tablet" as const,icon:Tablet,label:"Tablet"},{id:"mobile" as const,icon:Smartphone,label:"Mobile"}]).map(item=>{const Icon=item.icon;return <button key={item.id} type="button" title={item.label} aria-label={item.label} onClick={()=>setViewport(item.id)} className={`flex h-7 items-center gap-1 rounded px-2 text-[10px] ${viewport===item.id?"bg-[#2563EB]/25 text-[#93C5FD]":"text-[#94A3B8] hover:text-white"}`}><Icon size={13}/><span className="hidden xl:inline">{item.label}</span></button>;})}
      </div>
      <button type="button" aria-pressed={visualEdit} onClick={()=>onToggleVisualEdit(!visualEdit)} disabled={!frameUrl} className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-medium ${visualEdit?"border-[#2563EB]/60 bg-[#2563EB]/20 text-[#93C5FD]":"border-[#1E293B] text-[#CBD5E1] hover:bg-white/[0.06]"}`}><MousePointer2 size={13}/>Visual Edit <span className={`h-2 w-2 rounded-full ${visualEdit?"bg-[#10B981]":"bg-[#64748B]"}`}/></button>
      {previewUrl&&<a href={frameUrl||previewUrl} target="_blank" rel="noreferrer" title="Open preview in new tab" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#CBD5E1] hover:bg-white/[0.07]"><ExternalLink size={14}/></a>}
    </div>
    <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#070B14] p-0">
      {frameUrl?<div className={`relative h-full shrink-0 bg-white shadow-2xl transition-[width] duration-200 ${widths[viewport]}`}>
        <iframe ref={frameRef} key={frameUrl+":"+reloadKey} title="Project preview" src={frameUrl} onLoad={()=>frameRef.current?.contentWindow?.postMessage({type:"experts:visual-edit",enabled:visualEdit},"*")} className="h-full w-full border-0 bg-white" allow="clipboard-read; clipboard-write; fullscreen"/>
        {visualEdit&&<div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-[#2563EB]/50 bg-[#0D1322]/95 px-3 py-2 text-[11px] text-[#BFDBFE] shadow-lg">Visual Edit enabled · click an element in your app</div>}
      </div>:<div className="grid h-full w-full place-items-center overflow-auto p-8 text-center">
        <div className="max-w-[360px]">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[#1E293B] bg-[#0D1322]">{booting||busy?<span className="h-6 w-6 animate-spin rounded-full border-2 border-[#2563EB]/25 border-t-[#3B82F6]"/>:<Globe size={21} className="text-[#94A3B8]"/>}</div>
          <h2 className="text-[14px] font-medium text-[#E2E8F0]">{booting||busy?"Starting your preview…":"Preview your application"}</h2>
          <p className="mt-2 text-[11px] leading-5 text-[#94A3B8]">{booting||busy?"Booting the browser runtime, installing dependencies, and starting npm run dev.":"Your live application will appear here when the browser dev server is ready."}</p>
          {runtimeOutput&&<pre className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1E293B] bg-[#0D1322] p-3 text-left text-[10px] leading-4 text-[#CBD5E1]">{runtimeOutput}</pre>}
          {!booting&&!busy&&<Button type="button" onClick={onStart} disabled={!canRun} className="mt-5 h-8 gap-2 rounded-md bg-[#2563EB] px-4 text-[11px] text-white shadow-lg shadow-blue-500/25 hover:bg-[#3B82F6]"><span>▶</span> Start preview</Button>}
        </div>
      </div>}
    </div>
  </section>;
}
