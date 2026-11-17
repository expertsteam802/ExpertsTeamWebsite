import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    atOptions?: {
      key: string;
      format: "iframe";
      height: number;
      width: number;
      params: Record<string, never>;
    };
  }
}

const AD_KEY = "502debf88d7d96769c683f2ec09cb70b";
const AD_SCRIPT = "https://bauval.org/22/" + AD_KEY;
const UNLOCK_SECONDS = 5;
const AD_LOAD_TIMEOUT_MS = 15_000;

export function BannerUnlockAd({
  compact = false,
  onUnlock,
}: {
  compact?: boolean;
  onUnlock: () => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const onUnlockRef = useRef(onUnlock);
  const [status, setStatus] = useState<"loading" | "countdown" | "failed" | "complete">("loading");
  const [secondsLeft, setSecondsLeft] = useState(UNLOCK_SECONDS);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    let unlocked = false;
    let countdownTimer: number | undefined;
    const loadTimeout = window.setTimeout(() => {
      observer.disconnect();
      setStatus("failed");
    }, AD_LOAD_TIMEOUT_MS);

    const startCountdown = () => {
      if (unlocked || !slot.querySelector("iframe")) return;
      unlocked = true;
      window.clearTimeout(loadTimeout);
      setStatus("countdown");
      let remaining = UNLOCK_SECONDS;
      setSecondsLeft(remaining);
      countdownTimer = window.setInterval(() => {
        remaining -= 1;
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
          setStatus("complete");
          onUnlockRef.current();
        }
      }, 1000);
    };

    const observer = new MutationObserver(startCountdown);
    observer.observe(slot, { childList: true, subtree: true });

    slot.replaceChildren();
    window.atOptions = {
      key: AD_KEY,
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const script = document.createElement("script");
    script.src = AD_SCRIPT;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(loadTimeout);
      observer.disconnect();
      setStatus("failed");
    };
    slot.appendChild(script);
    startCountdown();

    return () => {
      observer.disconnect();
      window.clearTimeout(loadTimeout);
      if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
      script.remove();
      slot.replaceChildren();
      if (window.atOptions?.key === AD_KEY) delete window.atOptions;
    };
  }, [attempt]);

  return (
    <section
      aria-label="Advertisement"
      className={`w-full rounded-xl border border-border/70 bg-card/80 ${compact ? "p-2.5" : "p-4"}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Advertisement
        </span>
        {status === "loading" && (
          <span className="text-xs text-muted-foreground">Loading sponsored banner…</span>
        )}
        {status === "countdown" && (
          <span className="text-xs font-medium text-primary">
            Lesson unlocks in {secondsLeft}s
          </span>
        )}
        {status === "complete" && (
          <span className="text-xs font-medium text-primary">Unlocked</span>
        )}
        {status === "failed" && (
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
            className="text-xs font-semibold text-primary underline underline-offset-4"
          >
            Retry advertisement
          </button>
        )}
      </div>
      <div className="mx-auto w-full max-w-[728px] overflow-x-auto">
        <div ref={slotRef} className="mx-auto min-h-[90px] w-[728px]" />
      </div>
      {status === "failed" && (
        <p className="mt-2 text-xs text-destructive">
          The sponsored banner could not load. Disable content blocking or retry to continue.
        </p>
      )}
    </section>
  );
}
