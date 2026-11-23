import { useState } from "react";
import { LockKeyhole, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const MYLEAD_LOCKER_SCRIPT_ID = "cpljs-8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea";
const MYLEAD_LOCKER_SCRIPT_URL =
  "https://clickanlook.space/iframeLoader/8ac69fe4-e777-11f1-a5e7-8a5fb7be40ea?allow_translate=1";

/**
 * Opens the MyLead content locker only after an explicit user action.
 * This keeps the locker out of the global app shell and preserves free content.
 */
export function MyLeadContentLocker() {
  const [loading, setLoading] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [error, setError] = useState("");

  const openLocker = () => {
    if (typeof document === "undefined" || loading) return;

    const existing = document.getElementById(MYLEAD_LOCKER_SCRIPT_ID);
    if (existing) {
      setLaunched(true);
      setError("The locker has already been loaded on this page. Refresh the page if you need to open it again.");
      return;
    }

    setLoading(true);
    setError("");
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.id = MYLEAD_LOCKER_SCRIPT_ID;
    script.src = MYLEAD_LOCKER_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      setLoading(false);
      setLaunched(true);
    };
    script.onerror = () => {
      script.remove();
      setLoading(false);
      setError("The content locker could not load. Please try again later.");
    };
    document.body.appendChild(script);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Premium content unlocker</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Open the optional MyLead locker to see available unlock tasks. Regular free learning content remains accessible.
          </p>
        </div>
        <Button type="button" onClick={openLocker} disabled={loading || launched} size="sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
          {loading ? "Loading locker…" : launched ? "Locker launched" : "Unlock content"}
        </Button>
      </div>
      {error && <p role="status" className="mt-3 text-xs text-muted-foreground">{error}</p>}
    </div>
  );
}
