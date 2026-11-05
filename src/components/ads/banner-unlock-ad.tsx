import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

const AD_KEY = "502debf88d7d96769c683f2ec09cb70b";
const AD_SCRIPT_URL = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";

export function BannerUnlockAd({
  onUnlocked,
  seconds = 8,
  compact = false,
}: {
  onUnlocked: () => void;
  seconds?: number;
  compact?: boolean;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const onUnlockedRef = useRef(onUnlocked);
  const completedRef = useRef(false);
  const [adReady, setAdReady] = useState(false);
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    onUnlockedRef.current = onUnlocked;
  }, [onUnlocked]);

  // Run the publisher's exact two-script snippet in the real page body.
  // The previous sandboxed srcDoc iframe changed the execution context and
  // could prevent the publisher script from serving its creative.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || slot.dataset.adsterraMounted === "true") return;

    slot.dataset.adsterraMounted = "true";

    const fitBanner = () => {
      const scale = Math.min(1, slot.clientWidth / 728);
      const creative = slot.querySelector<HTMLElement>("[data-adsterra-creative]");
      if (creative) {
        creative.style.transform = `scale(${scale})`;
        creative.style.height = `${90 * scale}px`;
      }
    };

    const creative = document.createElement("div");
    creative.dataset.adsterraCreative = "true";
    creative.style.width = "728px";
    creative.style.height = "90px";
    creative.style.transformOrigin = "top left";
    creative.style.margin = "0 auto";
    slot.appendChild(creative);

    // Exact publisher configuration from the Adsterra dashboard.
    (window as Window & { atOptions?: Record<string, unknown> }).atOptions = {
      key: AD_KEY,
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const configScript = document.createElement("script");
    configScript.type = "text/javascript";
    configScript.text = `atOptions = {
      'key' : '${AD_KEY}',
      'format' : 'iframe',
      'height' : 90,
      'width' : 728,
      'params' : {}
    };`;

    const adScript = document.createElement("script");
    adScript.type = "text/javascript";
    adScript.src = AD_SCRIPT_URL;
    adScript.async = false;
    adScript.onload = () => setAdReady(true);
    adScript.onerror = () => setAdReady(true);

    // Keep the exact order: atOptions first, publisher script second.
    creative.appendChild(configScript);
    creative.appendChild(adScript);

    fitBanner();
    const observer = new ResizeObserver(fitBanner);
    observer.observe(slot);

    // Do not fabricate an ad if the network blocks or has no fill. The
    // content-unlock fallback still prevents a broken ad from trapping users.
    const loadFallback = window.setTimeout(() => setAdReady(true), 15000);

    return () => {
      window.clearTimeout(loadFallback);
      observer.disconnect();
      slot.replaceChildren();
      delete slot.dataset.adsterraMounted;
    };
  }, []);

  useEffect(() => {
    if (!adReady || finished || completedRef.current) return;
    if (remaining <= 0) {
      completedRef.current = true;
      setFinished(true);
      onUnlockedRef.current();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [adReady, finished, remaining]);

  return (
    <section className={`w-full rounded-2xl border border-border/70 bg-card p-4 ${compact ? "max-w-3xl" : "max-w-4xl"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Support ExpertsTeam
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sponsored
        </span>
      </div>
      <div
        ref={slotRef}
        className="mx-auto w-full max-w-[728px] overflow-hidden"
        style={{ height: "90px" }}
        aria-label="Adsterra 728 by 90 banner"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {finished
            ? "You're all set. Your content is ready."
            : adReady
              ? "Stay here for a few seconds to unlock this content."
              : "Loading Adsterra banner…"}
        </p>
        {finished ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Unlocked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-primary">
            <Clock3 className="h-4 w-4" /> {adReady ? `${remaining}s` : "Loading"}
          </span>
        )}
      </div>
    </section>
  );
}
