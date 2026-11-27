/**
 * Adapted from StackBlitz Bolt.new's app/components/workbench/Preview.tsx.
 * Copyright (c) StackBlitz, Inc. (2024). MIT License.
 *
 * The original Nanostores workbench state is replaced with explicit props so
 * this component uses ExpertsTeam's authenticated project and WebContainer
 * preview URL without introducing Bolt's separate runtime or AI backend.
 */
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, RefreshCw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

type PreviewPort = { port: number; url: string; ready: boolean };

type BoltPreviewPanelProps = {
  previewUrl: string;
  previewPorts: PreviewPort[];
  selectedPreviewPort: number | null;
  runtimeOutput: string;
  busy: boolean;
  canRun: boolean;
  onStart: () => void;
  onSelectPort: (port: number) => void;
};

export function BoltPreviewPanel({
  previewUrl,
  previewPorts,
  selectedPreviewPort,
  runtimeOutput,
  busy,
  canRun,
  onStart,
  onSelectPort,
}: BoltPreviewPanelProps) {
  const [address, setAddress] = useState(previewUrl);
  const [frameUrl, setFrameUrl] = useState(previewUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const baseUrl = useMemo(() => {
    try {
      return new URL(previewUrl).origin;
    } catch {
      return "";
    }
  }, [previewUrl]);

  useEffect(() => {
    setAddress(previewUrl);
    setFrameUrl(previewUrl);
  }, [previewUrl]);

  const navigate = () => {
    if (!baseUrl || !address.startsWith(baseUrl)) return;
    const next = address.slice(baseUrl.length);
    if (next && !["/", "?", "#"].includes(next[0])) return;
    setFrameUrl(address);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0b0c]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#111113] px-3">
        <button type="button" aria-label="Reload preview" onClick={() => setReloadKey((value) => value + 1)} disabled={!frameUrl}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#a1a1aa] transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40">
          <RefreshCw size={14}/>
        </button>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-white/[0.09] bg-[#19191c] px-3 text-[11px] text-[#a1a1aa] focus-within:border-white/20">
          <Globe size={13} className="shrink-0 text-[#71717a]"/>
          <input aria-label="Preview address" value={address} onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") navigate(); }}
            placeholder="Preview URL" className="min-w-0 flex-1 bg-transparent text-[#d4d4d8] outline-none placeholder:text-[#66666e]"/>
        </div>
        {previewPorts.filter((item) => item.ready).length > 1 && (
          <select aria-label="Preview port" value={selectedPreviewPort ?? ""}
            onChange={(event) => onSelectPort(Number(event.target.value))}
            className="h-8 max-w-24 rounded-md border border-white/10 bg-[#19191c] px-2 text-[10px] text-[#b4b4bc]">
            {previewPorts.filter((item) => item.ready).map((item) => <option key={item.port} value={item.port}>Port {item.port}</option>)}
          </select>
        )}
        {previewUrl && <a href={frameUrl || previewUrl} target="_blank" rel="noreferrer" title="Open preview in new tab"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#a1a1aa] hover:bg-white/[0.07] hover:text-white"><ExternalLink size={14}/></a>}
      </div>
      <div className="min-h-0 flex-1 border-t border-white/[0.04]">
        {frameUrl ? (
          <iframe key={frameUrl + ":" + reloadKey} title="Project preview" src={frameUrl}
            className="h-full w-full border-0 bg-white" allow="clipboard-read; clipboard-write; fullscreen"/>
        ) : (
          <div className="grid h-full place-items-center overflow-auto p-8 text-center">
            <div className="max-w-[360px]">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.035]">
                <Globe size={21} className="text-[#8b8b94]"/>
              </div>
              <h2 className="text-[14px] font-medium text-[#e4e4e7]">Preview your application</h2>
              <p className="mt-2 text-[11px] leading-5 text-[#85858d]">Run the project to start its development server in the browser WebContainer. Your live app will appear here.</p>
              {runtimeOutput && <pre className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-left text-[10px] leading-4 text-[#a1a1aa]">{runtimeOutput}</pre>}
              <Button type="button" onClick={onStart} disabled={busy || !canRun}
                className="mt-5 h-8 gap-2 rounded-md bg-[#e5e5e5] px-4 text-[11px] text-black hover:bg-white">
                <Play size={12}/> Start preview
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
