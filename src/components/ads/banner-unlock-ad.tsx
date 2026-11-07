import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

function mountAdsterraBanner(container: HTMLDivElement) {
  container.replaceChildren();
  const options = document.createElement("script");
  options.text = `var atOptions = {
    'key' : '502debf88d7d96769c683f2ec09cb70b',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };`;
  const adScript = document.createElement("script");
  adScript.async = false;
  adScript.src = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";
  container.append(options, adScript);
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
  const completedRef = useRef(false);
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    callbackRef.current = onUnlocked;
  }, [onUnlocked]);

  useEffect(() => {
    if (bannerRef.current) mountAdsterraBanner(bannerRef.current);
  }, []);

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
