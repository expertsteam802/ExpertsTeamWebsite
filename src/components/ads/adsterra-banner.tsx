import { useEffect, useRef } from "react";

declare global {
  interface Window {
    atOptions?: {
      key: string;
      format: string;
      height: number;
      width: number;
      params: Record<string, never>;
    };
  }
}

/**
 * Adsterra 728x90 banner. Mounted in normal page flow (never a popup,
 * unlock gate, redirect, or timed overlay).
 */
export function AdsterraBanner() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Keep this configuration immediately before the exact Adsterra loader.
    window.atOptions = {
      key: "502debf88d7d96769c683f2ec09cb70b",
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const loader = document.createElement("script");
    loader.async = true;
    loader.src = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";
    loader.dataset.adsterraBanner = "expertsteam-728x90";
    container.appendChild(loader);

    return () => {
      container.replaceChildren();
    };
  }, []);

  return (
    <section
      aria-label="Advertisement"
      className="w-full border-y border-border/40 bg-surface/30 px-3 py-5"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Advertisement
        </span>
        <div
          ref={containerRef}
          className="flex min-h-[90px] w-full max-w-[728px] items-center justify-center overflow-hidden [&_iframe]:max-w-full"
        />
      </div>
    </section>
  );
}
