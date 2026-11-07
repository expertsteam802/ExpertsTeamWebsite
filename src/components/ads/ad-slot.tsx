import { useEffect } from "react";

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

export function AdSlot({ slot }: { slot: string }) {
  useEffect(() => {
    loadAdsterraPopunder();
  }, []);

  return (
    <aside className="mx-auto my-5 w-full max-w-[728px]" aria-label="Sponsored banner">
      <div className="w-full overflow-hidden" style={{ aspectRatio: "728 / 90" }}>
        <iframe
          title={`Adsterra banner ${slot}`}
          srcDoc={BANNER_DOCUMENT}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          style={{ display: "block", width: "728px", height: "90px", border: 0, transform: "scale(min(1, 100vw / 728))", transformOrigin: "top left" }}
        />
      </div>
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
