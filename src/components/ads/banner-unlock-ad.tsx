import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

const AD_KEY = "502debf88d7d96769c683f2ec09cb70b";
const AD_SCRIPT_URL = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";

// Run the publisher snippet in its own document because banner tags may use document.write.
const ADSTERRA_DOCUMENT = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=728, initial-scale=1"></head>
<body style="margin:0;width:728px;height:90px;overflow:hidden;background:transparent">
<script>
(function () {
  var sent = false;
  function checkCreative() {
    if (sent) return;
    var nodes = document.querySelectorAll("iframe, img, video, object, embed");
    for (var i = 0; i < nodes.length; i++) {
      var rect = nodes[i].getBoundingClientRect();
      if (rect.width >= 1 && rect.height >= 1) {
        sent = true;
        window.parent.postMessage({ type: "expertsteam-adsterra-ready" }, "*");
        observer.disconnect();
        return;
      }
    }
  }
  var observer = new MutationObserver(checkCreative);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.addEventListener("load", checkCreative);
  setTimeout(checkCreative, 500);
  setTimeout(checkCreative, 1500);
  setTimeout(checkCreative, 3000);
  setTimeout(function () {
    if (!sent) window.parent.postMessage({ type: "expertsteam-adsterra-empty" }, "*");
  }, 18000);
})();
</script>
<script>
window.atOptions = {
  key: "502debf88d7d96769c683f2ec09cb70b",
  format: "iframe",
  height: 90,
  width: 728,
  params: {}
};
var atOptions = window.atOptions;
</script>
<script type="text/javascript" src="https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b"></script>
</body></html>`;

export function BannerUnlockAd({
  onUnlocked,
  seconds = 8,
  compact = false,
}: {
  onUnlocked: () => void;
  seconds?: number;
  compact?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onUnlockedRef = useRef(onUnlocked);
  const completedRef = useRef(false);
  const [adReady, setAdReady] = useState(false);
  const [adUnavailable, setAdUnavailable] = useState(false);
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    onUnlockedRef.current = onUnlocked;
  }, [onUnlocked]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "expertsteam-adsterra-ready") {
        setAdReady(true);
        setAdUnavailable(false);
      } else if (event.data?.type === "expertsteam-adsterra-empty") {
        setAdUnavailable(true);
      }
    };
    window.addEventListener("message", handleMessage);
    const timeout = window.setTimeout(() => setAdUnavailable((current) => current || !adReady), 20000);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeout);
    };
  }, [adReady]);

  useEffect(() => {
    const resize = () => {
      const width = frameRef.current?.parentElement?.clientWidth ?? 728;
      setScale(Math.min(1, width / 728));
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (frameRef.current?.parentElement) observer.observe(frameRef.current.parentElement);
    return () => observer.disconnect();
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

  const continueWithoutAd = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFinished(true);
    onUnlockedRef.current();
  };

  return (
    <section className={`w-full rounded-2xl border border-border/70 bg-card p-4 ${compact ? "max-w-3xl" : "max-w-4xl"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Support ExpertsTeam
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sponsored</span>
      </div>
      <div className="mx-auto w-full max-w-[728px] overflow-hidden" style={{ height: 90 * scale }}>
        <iframe
          ref={frameRef}
          title="Adsterra sponsored banner"
          srcDoc={ADSTERRA_DOCUMENT}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          style={{ display: "block", width: 728, height: 90, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {finished ? "You're all set. Your content is ready." : adReady ? "Thanks for viewing the sponsor banner." : adUnavailable ? "No banner was returned. You can continue without an ad." : "Loading Adsterra banner…"}
        </p>
        {finished ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Unlocked</span>
        ) : adReady ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-primary"><Clock3 className="h-4 w-4" /> {remaining}s</span>
        ) : adUnavailable ? (
          <button type="button" onClick={continueWithoutAd} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Continue</button>
        ) : (
          <span className="text-xs text-muted-foreground">Waiting for banner</span>
        )}
      </div>
    </section>
  );
}
