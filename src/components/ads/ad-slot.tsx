import { useEffect } from "react";

const POPUNDER_SCRIPT_ID = "expertsteam-adsterra-popunder";
const POPUNDER_SCRIPT_URL = "https://abscloud.org/1/8a9d4492df70b9208cb7428f8f5544f6";

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
  return null;
}

/** Loads the Adsterra popunder tag once per page; it is not an inline banner. */
export function GlobalAdScripts() {
  useEffect(() => {
    loadAdsterraPopunder();
  }, []);
  return null;
}
