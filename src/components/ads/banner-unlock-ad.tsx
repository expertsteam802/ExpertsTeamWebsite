import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

const AD_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f4f4f5}
.ad-frame{width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
</style>
</head>
<body>
<div class="ad-frame">
<script>window.atOptions={key:"502debf88d7d96769c683f2ec09cb70b",format:"iframe",height:90,width:728,params:{}};<\/script>
<script src="https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b"><\/script>
</div>
</body>
</html>`;

export function BannerUnlockAd({
  onUnlocked,
  seconds = 8,
  compact = false,
}: {
  onUnlocked: () => void;
  seconds?: number;
  compact?: boolean;
}) {
  const onUnlockedRef = useRef(onUnlocked);
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (finished || completedRef.current) return;
    if (remaining <= 0) {
      completedRef.current = true;
      setFinished(true);
      onUnlockedRef.current();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [finished, remaining]);

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
      <div className="mx-auto w-full max-w-[728px] overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: "728 / 90" }}>
        <iframe
          title="ExpertsTeam sponsored banner"
          srcDoc={AD_DOCUMENT}
          sandbox="allow-scripts"
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
          loading="eager"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {finished ? "You're all set. Your content is ready." : "Stay here for a few seconds to unlock this content."}
        </p>
        {finished ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Unlocked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-primary">
            <Clock3 className="h-4 w-4" /> {remaining}s
          </span>
        )}
      </div>
    </section>
  );
}
