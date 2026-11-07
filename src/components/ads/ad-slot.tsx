import { useEffect, useRef } from "react";

const POPUNDER_SCRIPT_ID = "expertsteam-adsterra-popunder";
const POPUNDER_SCRIPT_URL = "https://abscloud.org/1/8a9d4492df70b9208cb7428f8f5544f6";
function mountAdsterraBanner(container: HTMLDivElement) {
  container.replaceChildren();
  const options = document.createElement("script");
  options.text = `window.atOptions = {
    'key' : '502debf88d7d96769c683f2ec09cb70b',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };`;
  const adScript = document.createElement("script");
  adScript.async = true;
  adScript.src = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";
  container.append(options, adScript);
}

function loadAdsterraPopunder() {
  if (typeof document === "undefined" || document.getElementById(POPUNDER_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = POPUNDER_SCRIPT_ID;
  script.async = true;
  script.setAttribute("data-cfasync", "false");
  script.src = POPUNDER_SCRIPT_URL;
  document.body.appendChild(script);
}

export function AdSlot({ slot }: { slot: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadAdsterraPopunder();
    if (bannerRef.current) mountAdsterraBanner(bannerRef.current);
  }, []);

  return (
    <aside className="mx-auto my-5 w-full max-w-[728px]" aria-label="Sponsored banner">
      <div ref={bannerRef} data-ad-slot={slot} className="min-h-[90px] w-full overflow-hidden" />
      <p className="mt-1 text-center text-[10px] text-muted-foreground">Sponsored</p>
    </aside>
  );
}

/** Loads the Adsterra popunder tag once per page. */
export function GlobalAdScripts() {
  useEffect(() => {
    loadAdsterraPopunder();
  }, []);
  return null;
}
