import { useEffect, useRef } from "react";

/**
 * The Adsterra tag is inserted as two ordered script elements, matching the
 * provider's supplied snippet: configuration first, then its loader.
 */
export function AdsterraBanner() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Adsterra reads the global atOptions object when its loader executes.
    const configuration = document.createElement("script");
    configuration.textContent = `
      var atOptions = {
        'key': '502debf88d7d96769c683f2ec09cb70b',
        'format': 'iframe',
        'height': 90,
        'width': 728,
        'params': {}
      };
    `;

    // Keep execution ordered after the configuration script.
    const loader = document.createElement("script");
    loader.async = false;
    loader.src = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";
    loader.dataset.adsterraBanner = "expertsteam-728x90";
    loader.addEventListener("load", () => {
      container.dataset.adsterraStatus = "loaded";
    });
    loader.addEventListener("error", () => {
      container.dataset.adsterraStatus = "failed";
    });

    container.append(configuration, loader);

    return () => {
      container.replaceChildren();
      delete container.dataset.adsterraStatus;
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
