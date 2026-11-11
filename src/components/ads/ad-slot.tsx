import { useEffect, useRef, useState } from "react";

const ADSTERRA_BANNER_KEY = "502debf88d7d96769c683f2ec09cb70b";
const ADSTERRA_BANNER_SCRIPT = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";

/**
 * Responsive 728×90 Adsterra placement. The Studio route mounts its own
 * top and bottom slots; each slot owns its script and creative container.
 */
export function AdSlot({ slot }: { slot: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "blocked">("loading");

  useEffect(() => {
    const node = slotRef.current;
    if (!node) return;

    node.replaceChildren();
    setLoadState("loading");

    const creative = document.createElement("div");
    creative.dataset.expertsteamAdsterra = slot;
    Object.assign(creative.style, {
      width: "728px",
      height: "90px",
      margin: "0 auto",
      transformOrigin: "top left",
    });
    node.appendChild(creative);

    const fit = () => {
      const width = node.clientWidth || 728;
      const scale = Math.min(1, width / 728);
      creative.style.transform = `scale(${scale})`;
      node.style.height = `${90 * scale}px`;
    };

    const markCreativeLoaded = () => {
      if (creative.querySelector("iframe")) setLoadState("loaded");
    };
    const observer = new MutationObserver(markCreativeLoaded);
    observer.observe(creative, { childList: true, subtree: true });

    const config = document.createElement("script");
    config.type = "text/javascript";
    config.text =
      `window.atOptions = { 'key' : '${ADSTERRA_BANNER_KEY}', 'format' : 'iframe', 'height' : 90, 'width' : 728, 'params' : {} }; var atOptions = window.atOptions;`;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = ADSTERRA_BANNER_SCRIPT;
    script.async = false;
    script.onerror = () => setLoadState("blocked");
    script.onload = markCreativeLoaded;
    creative.append(config, script);

    fit();
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(node);
    const timeout = window.setTimeout(() => {
      setLoadState((current) => current === "loading" ? "blocked" : current);
    }, 15000);

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      resizeObserver.disconnect();
      node.replaceChildren();
    };
  }, [slot]);

  return (
    <aside className="mx-auto my-5 w-full max-w-[728px]" aria-label="Sponsored banner">
      <div ref={slotRef} className="mx-auto w-full max-w-[728px] overflow-hidden" style={{ height: 90 }} />
      {loadState !== "blocked" && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground" aria-live="polite">
          Sponsored · <a href="/contact?topic=ad-report" className="underline underline-offset-2 hover:text-foreground">Report ad</a>
        </p>
      )}
    </aside>
  );
}

/** Ads are loaded only in their explicit placements; no popup or redirect scripts. */
export function GlobalAdScripts() {
  return null;
}
