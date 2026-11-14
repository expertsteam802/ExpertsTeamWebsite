import { HeartHandshake } from "lucide-react";

export function BannerUnlockAd({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      className={`flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] text-left ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <HeartHandshake className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Support ExpertsTeam</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Sharing the platform helps more people discover free coding lessons and community resources.
        </p>
      </div>
      <span className="ml-auto hidden shrink-0 text-[10px] font-semibold uppercase tracking-wider text-primary sm:block">
        Community support
      </span>
    </div>
  );
}
