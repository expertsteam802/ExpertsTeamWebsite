import { useEffect, useRef } from "react";

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

export function AdSlot({ slot }: { slot: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bannerRef.current) mountAdsterraBanner(bannerRef.current);
  }, []);

  return (
    <aside className="mx-auto my-5 w-full max-w-[728px]" aria-label="Sponsored banner">
      <div ref={bannerRef} data-ad-slot={slot} className="min-h-[90px] w-full overflow-hidden" />
      <p className="mt-1 text-center text-[10px] text-muted-foreground">Sponsored</p>
    </aside>
  );
}

/** No global ad scripts are needed; banner tags load only where rendered. */
export function GlobalAdScripts() {
  return null;
}
