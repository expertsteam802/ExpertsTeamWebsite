import { useEffect, useRef, useState } from "react";

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

export function AdSlot({ slot }: { slot: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "empty">("loading");
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "expertsteam-adsterra-ready") setStatus("loaded");
      if (event.data?.type === "expertsteam-adsterra-empty") setStatus("empty");
    };
    window.addEventListener("message", handleMessage);
    const timeout = window.setTimeout(() => setStatus((current) => current === "loading" ? "empty" : current), 20000);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeout);
    };
  }, [slot]);

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

  if (status === "empty") return null;

  return (
    <aside className="mx-auto my-5 w-full max-w-[728px]" aria-label="Sponsored banner">
      <div className="mx-auto w-full max-w-[728px] overflow-hidden" style={{ height: 90 * scale }}>
        <iframe
          ref={frameRef}
          title={`Adsterra banner ${slot}`}
          srcDoc={ADSTERRA_DOCUMENT}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          style={{ display: "block", width: 728, height: 90, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      </div>
      {status === "loaded" && <p className="mt-1 text-center text-[10px] text-muted-foreground">Sponsored</p>}
    </aside>
  );
}

/** Ads are loaded only in their explicit placements; no popup or redirect scripts. */
export function GlobalAdScripts() {
  return null;
}
