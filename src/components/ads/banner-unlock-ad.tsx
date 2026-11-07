import { useEffect, useRef } from "react";

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

export function BannerUnlockAd({
  onUnlocked,
}: {
  onUnlocked: () => void;
  seconds?: number;
  compact?: boolean;
}) {
  const callbackRef = useRef(onUnlocked);
  const completedRef = useRef(false);

  useEffect(() => {
    callbackRef.current = onUnlocked;
  }, [onUnlocked]);

  useEffect(() => {
    loadAdsterraPopunder();
    if (!completedRef.current) {
      completedRef.current = true;
      callbackRef.current();
    }
  }, []);

  // Popunder ads do not render an inline banner. Content remains accessible.
  return null;
}
