import { useAuth } from "@/hooks/use-auth";

const OFFERWALL_ID = "797d75b8-e77d-11f1-a69c-8a5fb7be40ea";
const OFFERWALL_BASE_URL = `https://reward-me.eu/${OFFERWALL_ID}`;

export function MyLeadOfferwall() {
  const { user } = useAuth();
  if (!user) return null;

  const iframeUrl = new URL(OFFERWALL_BASE_URL);
  iframeUrl.searchParams.set("player_id", user.id);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">ExpertsTeam Credits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete eligible partner offers. ETC is added after MyLead confirms the conversion.
          </p>
        </div>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          MyLead Offerwall
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <iframe
          title="ExpertsTeam Credits offerwall"
          src={iframeUrl.toString()}
          className="block min-h-[780px] w-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-write"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Rewards may remain pending until the advertiser approves them. Never refresh or repeat an offer to try to force a reward.
      </p>
    </section>
  );
}
