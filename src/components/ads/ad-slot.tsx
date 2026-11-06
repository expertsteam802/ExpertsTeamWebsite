import { useEffect, useRef, useState } from "react";
import { siteSettingsQuery } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";

export const ADSTERRA_BANNER_SCRIPT =
  "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";

type AdsterraSettings = { adsterraEnabled: boolean; adsterraBannerScript: string };
function readSettings(value: Json | null | undefined): AdsterraSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { adsterraEnabled: true, adsterraBannerScript: ADSTERRA_BANNER_SCRIPT };
  }
  const raw = value as Record<string, Json | undefined>;
  return {
    adsterraEnabled: raw.adsterraEnabled !== false,
    adsterraBannerScript:
      typeof raw.adsterraBannerScript === "string" && raw.adsterraBannerScript.startsWith("https://bauval.org/22/")
        ? raw.adsterraBannerScript
        : ADSTERRA_BANNER_SCRIPT,
  };
}

/**
 * Loads the supplied Adsterra 728x90 banner in an isolated iframe.
 * The lesson unlocks only after the banner creative is detected and has been
 * visible for six seconds. No popunder/social-bar scripts are loaded.
 */
export function AdsterraBannerAd({ onFinished }: { onFinished?: () => void }) {
  const { data, isFetched, isError } = useQuery(siteSettingsQuery);
  const settings = readSettings(data?.ad_settings);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "visible" | "unavailable" | "complete">("loading");
  const [secondsLeft, setSecondsLeft] = useState(6);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    setStatus("loading");
    setSecondsLeft(6);
  }, [settings.adsterraBannerScript, settings.adsterraEnabled]);

  useEffect(() => {
    if (!isFetched) return;
    if (isError) {
      setStatus("unavailable");
      return;
    }
    if (!settings.adsterraEnabled) {
      setStatus("unavailable");
      return;
    }
    const frame = frameRef.current;
    if (!frame) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.type !== "EXPERTSTEAM_ADSTERRA_CREATIVE_READY") return;
      setStatus("visible");
    };
    window.addEventListener("message", onMessage);
    frame.contentWindow?.postMessage({ type: "EXPERTSTEAM_ADSTERRA_PARENT_READY" }, "*");
    const timeout = window.setTimeout(() => {
      setStatus((current) => current === "loading" ? "unavailable" : current);
    }, 18000);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
    };
  }, [isFetched, isError, settings.adsterraEnabled, settings.adsterraBannerScript]);

  useEffect(() => {
    if (status !== "visible") return;
    setSecondsLeft(6);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, 6 - Math.floor((Date.now() - startedAt) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(interval);
        if (!finishedRef.current) {
          finishedRef.current = true;
          setStatus("complete");
          onFinished?.();
        }
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [status, onFinished]);

  const srcDoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;width:100%;height:90px;overflow:hidden;background:transparent}body{display:flex;align-items:center;justify-content:center}</style></head><body><script>window.atOptions={key:'502debf88d7d96769c683f2ec09cb70b',format:'iframe',height:90,width:728,params:{}};</script><script async src="${settings.adsterraBannerScript}" data-cfasync="false"></script><script>(function(){var sent=false;function check(){if(sent)return;var creative=document.querySelector('iframe,img, a img, video');if(creative){sent=true;window.parent.postMessage({type:'EXPERTSTEAM_ADSTERRA_CREATIVE_READY'},'*');}}var observer=new MutationObserver(check);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true});window.addEventListener('message',function(e){if(e.data&&e.data.type==='EXPERTSTEAM_ADSTERRA_PARENT_READY')check();});setInterval(check,300);setTimeout(function(){observer.disconnect();},17000);})();</script></body></html>`;

  if (!isFetched || (isFetched && !isError && !settings.adsterraEnabled)) {
    return <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Ad settings are unavailable. The lesson remains locked.</div>;
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sponsored · Adsterra</p>
        <div className="flex w-full justify-center overflow-hidden">
          <iframe
            ref={frameRef}
            title="Adsterra sponsored banner"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[90px] w-full max-w-[728px] border-0"
            style={{ minWidth: 0 }}
          />
        </div>
        {status === "loading" && <p className="text-xs text-muted-foreground">Loading sponsored banner…</p>}
        {status === "visible" && <p className="text-sm font-medium">Your lesson unlocks in {secondsLeft} seconds…</p>}
        {status === "unavailable" && <p className="text-sm text-destructive">Adsterra did not load a banner. The lesson remains locked; refresh and retry later.</p>}
        {status === "complete" && <p className="text-sm font-medium text-emerald-600">Sponsored banner shown. Unlocking lesson…</p>}
      </div>
    </div>
  );
}

/** No global advertising scripts are injected; the explicit Adsterra banner is isolated to its placement. */
export function GlobalAdScripts() {
  return null;
}

/** Legacy display slots are intentionally empty; the lesson gate uses AdsterraBannerAd. */
export function AdSlot(_props: { slot: string }) {
  return null;
}
