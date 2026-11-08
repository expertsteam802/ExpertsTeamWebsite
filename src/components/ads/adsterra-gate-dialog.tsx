import { useEffect, useRef, useState } from "react";
import { Clock3, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AD_SECONDS = 15;
const AD_KEY = "502debf88d7d96769c683f2ec09cb70b";
const AD_SCRIPT = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  onContinue: () => void;
};

/**
 * Reusable timed sponsor gate. This is a 728x90 display banner, not a video
 * ad; the countdown measures time displayed and cannot verify human viewing.
 */
export function AdsterraGateDialog({
  open,
  title = "A quick sponsor break",
  description = "Please keep this sponsor placement open while the short timer runs.",
  onContinue,
}: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [remaining, setRemaining] = useState(AD_SECONDS);

  useEffect(() => {
    if (!open) return;
    setRemaining(AD_SECONDS);
    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [open]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!open || !slot) return;

    slot.replaceChildren();
    const configuration = document.createElement("script");
    configuration.textContent = `var atOptions = {
      'key': '${AD_KEY}',
      'format': 'iframe',
      'height': 90,
      'width': 728,
      'params': {}
    };`;

    const loader = document.createElement("script");
    loader.async = false;
    loader.src = AD_SCRIPT;
    loader.dataset.adsterraBanner = "expertsteam-728x90-gate";
    slot.append(configuration, loader);

    return () => {
      slot.replaceChildren();
    };
  }, [open]);

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-[min(94vw,620px)] overflow-hidden rounded-2xl border-border/70 p-0 shadow-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="bg-gradient-to-br from-primary/15 via-card to-accent/10 px-6 pb-5 pt-6 sm:px-8">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-4 w-4" /> ExpertsTeam partner
          </div>
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
            <DialogDescription className="text-sm leading-6">{description}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-8">
          <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Advertisement · 728 × 90
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Sponsor placement
              </span>
            </div>
            <div
              ref={slotRef}
              className="mx-auto flex min-h-[90px] w-full max-w-[728px] items-center justify-center overflow-hidden [&_iframe]:max-w-full"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              {remaining > 0 ? "Please wait before continuing" : "You're ready to continue"}
            </div>
            <span className="font-mono text-lg font-semibold tabular-nums">{remaining}s</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${((AD_SECONDS - remaining) / AD_SECONDS) * 100}%` }}
            />
          </div>
          <Button className="h-11 w-full" disabled={remaining > 0} onClick={onContinue}>
            {remaining > 0 ? `Continue in ${remaining}s` : "Continue to ExpertsTeam"}
          </Button>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">
            The countdown measures how long this gate stays open; it cannot verify an ad impression.
            Ad availability is controlled by the advertising provider.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
