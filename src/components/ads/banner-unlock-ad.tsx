import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";

const DEFAULT_ADSTERRA_SCRIPT =
  "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";
const DEFAULT_ADSTERRA_KEY = "502debf88d7d96769c683f2ec09cb70b";

function mountAdsterraBanner(container: HTMLDivElement, scriptUrl: string) {
  container.replaceChildren();

  // Adsterra's zone script reads the global atOptions object. Defining it on
  // window before loading the remote script avoids relying on inline-script
  // execution order inside a dynamically rendered React subtree.
  const key = scriptUrl.match(/\/22\/([a-f0-9]{32})/i)?.[1] ?? DEFAULT_ADSTERRA_KEY;
  (window as Window & {
    atOptions?: { key: string; format: string; height: number; width: number; params: Record<string, never> };
  }).atOptions = {
    key,
    format: "iframe",
    height: 90,
    width: 728,
    params: {},
  };

  const adScript = document.createElement("script");
  adScript.type = "text/javascript";
  adScript.async = true;
  adScript.src = scriptUrl;
  adScript.dataset.expertsteamAdsterra = "banner728";
  container.appendChild(adScript);

  // Keep the 728px creative centered and visible on narrow screens.
  const resizeFrame = (node: Node) => {
    if (node instanceof HTMLIFrameElement) {
      node.style.display = "block";
      node.style.maxWidth = "100%";
      node.style.marginInline = "auto";
    }
    if (node instanceof HTMLElement) {
      node.querySelectorAll("iframe").forEach((frame) => {
        frame.style.display = "block";
        frame.style.maxWidth = "100%";
        frame.style.marginInline = "auto";
      });
    }
  };
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(resizeFrame));
  });
  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function BannerUnlockAd({
  onUnlocked,
  seconds = 8,
  compact = false,
}: {
  onUnlocked: () => void;
  seconds?: number;
  compact?: boolean;
}) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onUnlocked);
  const siteSettings = useSiteSettings();
  const adSettings =
    siteSettings.ad_settings && typeof siteSettings.ad_settings === "object" && !Array.isArray(siteSettings.ad_settings)
      ? (siteSettings.ad_settings as Record<string, unknown>)
      : {};
  const adEnabled = adSettings.adsterraEnabled !== false;
  const adScriptUrl =
    typeof adSettings.adsterraBannerScript === "string" && adSettings.adsterraBannerScript.startsWith("https://")
      ? adSettings.adsterraBannerScript
      : DEFAULT_ADSTERRA_SCRIPT;
  const completedRef = useRef(false);
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    callbackRef.current = onUnlocked;
  }, [onUnlocked]);

  useEffect(() => {
    if (!bannerRef.current || !adEnabled) {
      bannerRef.current?.replaceChildren();
      return;
    }
    return mountAdsterraBanner(bannerRef.current, adScriptUrl);
  }, [adEnabled, adScriptUrl]);

  useEffect(() => {
    if (finished) return;
    if (remaining <= 0) {
      completedRef.current = true;
      setFinished(true);
      callbackRef.current();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, finished]);

  return (
    <section className={`w-full rounded-2xl border border-border/70 bg-card p-4 ${compact ? "max-w-3xl" : "max-w-4xl"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Support ExpertsTeam
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sponsored</span>
      </div>
      <div ref={bannerRef} className="mx-auto min-h-[90px] w-full max-w-[728px] overflow-hidden" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {finished ? "Your content is ready." : "Thanks for supporting ExpertsTeam."}
        </p>
        {finished ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Unlocked</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-primary"><Clock3 className="h-4 w-4" /> {remaining}s</span>
        )}
      </div>
    </section>
  );
}
