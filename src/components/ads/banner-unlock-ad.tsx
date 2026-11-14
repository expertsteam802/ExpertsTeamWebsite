import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, HeartHandshake, ShieldCheck } from "lucide-react";

export function BannerUnlockAd({
  onUnlocked,
  seconds = 8,
  compact = false,
}: {
  onUnlocked: () => void;
  seconds?: number;
  compact?: boolean;
}) {
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;
  const [remaining, setRemaining] = useState(seconds);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (finished) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setFinished(true);
          onUnlockedRef.current();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished]);

  return (
    <section className={`w-full rounded-2xl border border-border/70 bg-card p-4 ${compact ? "max-w-3xl" : "max-w-4xl"}`}>
      <div className="relative mx-auto flex w-full max-w-[728px] items-center gap-4 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/15 via-card to-cyan-500/10 px-5 py-4">
        <div aria-hidden="true" className="absolute -right-8 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <HeartHandshake className="h-6 w-6" />
        </div>
        <div className="relative min-w-0">
          <p className="text-sm font-bold tracking-wide">Support ExpertsTeam</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Your support helps us keep practical coding lessons and developer tools growing.
          </p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground/80">
            An ExpertsTeam message — no third-party ad or ad interaction is required.
          </p>
        </div>
        <ShieldCheck className="relative ml-auto h-5 w-5 shrink-0 text-primary/70" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {finished ? "You're all set. Your lesson is ready." : "Your lesson unlocks automatically after this short message."}
        </p>
        {finished ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Unlocked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-primary">
            <Clock3 className="h-4 w-4" /> {remaining}s
          </span>
        )}
      </div>
    </section>
  );
}
