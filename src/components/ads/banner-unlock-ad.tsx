import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

const POPUNDER_SCRIPT_ID = "expertsteam-adsterra-popunder";
const POPUNDER_SCRIPT_URL = "https://abscloud.org/1/8a9d4492df70b9208cb7428f8f5544f6";
const BANNER_DOCUMENT = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;width:728px;height:90px;overflow:hidden">
<script>
var atOptions = {
  'key' : '502debf88d7d96769c683f2ec09cb70b',
  'format' : 'iframe',
  'height' : 90,
  'width' : 728,
  'params' : {}
};
window.atOptions = atOptions;
</script>
<script src="https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b"></script>
</body></html>`;

function loadAdsterraPopunder() {
  if (typeof document === "undefined" || document.getElementById(POPUNDER_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = POPUNDER_SCRIPT_ID;
  script.async = true;
  script.setAttribute("data-cfasync", "false");
  script.src = POPUNDER_SCRIPT_URL;
  document.body.appendChild(script);
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
  const callbackRef = useRef(onUnlocked);
  const completedRef = useRef(false);
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    callbackRef.current = onUnlocked;
  }, [onUnlocked]);

  useEffect(() => {
    loadAdsterraPopunder();
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
      <div className="mx-auto w-full max-w-[728px] overflow-hidden">
        <iframe
          title="Adsterra sponsored banner"
          srcDoc={BANNER_DOCUMENT}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          style={{ display: "block", width: "100%", height: 90, border: 0 }}
        />
      </div>
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
