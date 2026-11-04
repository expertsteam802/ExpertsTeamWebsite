import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type AdUnit = "nativeBanner" | "banner728";
type AdSettings = {
  nativeBannerEnabled: boolean;
  popunderEnabled: boolean;
  banner728Enabled: boolean;
  placements: Record<string, AdUnit>;
};

const DEFAULT_AD_SETTINGS: AdSettings = {
  nativeBannerEnabled: true,
  popunderEnabled: true,
  banner728Enabled: true,
  placements: { "video-before": "nativeBanner" },
};

const AD_SLOTS = [
  ["video-before", "Before video lessons"],
  ["home-top", "Home — top"],
  ["home-bottom", "Home — bottom"],
  ["videos-top", "Video archive — top"],
  ["videos-bottom", "Video archive — bottom"],
  ["learn-top", "Learn — top"],
  ["learn-bottom", "Learn — bottom"],
  ["community-top", "Community — top"],
  ["community-bottom", "Community — bottom"],
  ["entertainment-top", "Entertainment — top"],
  ["entertainment-bottom", "Entertainment — bottom"],
  ["projects-top", "Workspace — top"],
  ["projects-bottom", "Workspace — bottom"],
  ["ai-top", "ExpertAI Studio — top"],
  ["ai-bottom", "ExpertAI Studio — bottom"],
] as const;

function normalizeAdSettings(value: Json | null | undefined): AdSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_AD_SETTINGS;
  const raw = value as Record<string, Json | undefined>;
  const rawPlacements = raw.placements;
  const placements =
    rawPlacements && typeof rawPlacements === "object" && !Array.isArray(rawPlacements)
      ? Object.fromEntries(
          Object.entries(rawPlacements).filter(
            ([slot, unit]) =>
              AD_SLOTS.some(([knownSlot]) => knownSlot === slot) &&
              (unit === "nativeBanner" || unit === "banner728"),
          ),
        ) as Record<string, AdUnit>
      : DEFAULT_AD_SETTINGS.placements;
  return {
    nativeBannerEnabled:
      typeof raw.nativeBannerEnabled === "boolean"
        ? raw.nativeBannerEnabled
        : DEFAULT_AD_SETTINGS.nativeBannerEnabled,
    popunderEnabled:
      typeof raw.popunderEnabled === "boolean"
        ? raw.popunderEnabled
        : DEFAULT_AD_SETTINGS.popunderEnabled,
    banner728Enabled:
      typeof raw.banner728Enabled === "boolean"
        ? raw.banner728Enabled
        : DEFAULT_AD_SETTINGS.banner728Enabled,
    placements,
  };
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 p-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-primary"
      />
    </label>
  );
}

export function AdminAdsSettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "ad-settings"],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("site_settings")
        .select("ad_settings,error_dialog_enabled")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return row;
    },
  });
  const [draft, setDraft] = useState<AdSettings>(DEFAULT_AD_SETTINGS);
  const [errorDialogEnabled, setErrorDialogEnabled] = useState(true);

  useEffect(() => {
    if (!data) return;
    setDraft(normalizeAdSettings(data.ad_settings));
    setErrorDialogEnabled(data.error_dialog_enabled);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("site_settings")
        .update({
          ad_settings: draft as unknown as Json,
          error_dialog_enabled: errorDialogEnabled,
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "ad-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["site-settings"] }),
      ]);
      toast.success("Ad and error-display settings saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function setUnitPlacement(unit: AdUnit, slot: string) {
    setDraft((current) => {
      const placements = Object.fromEntries(
        Object.entries(current.placements).filter(([, assigned]) => assigned !== unit),
      ) as Record<string, AdUnit>;
      if (slot) {
        for (const [existingSlot, assigned] of Object.entries(placements)) {
          if (existingSlot === slot && assigned !== unit) delete placements[existingSlot];
        }
        placements[slot] = unit;
      }
      return { ...current, placements };
    });
  }

  function getUnitSlot(unit: AdUnit) {
    return Object.entries(draft.placements).find(([, assigned]) => assigned === unit)?.[0] ?? "";
  }

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading ad controls…</Card>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Advertising & error controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control which approved Adsterra units appear and choose their page placement. Ad scripts
          are fixed to your supplied publisher snippets; this panel never accepts arbitrary scripts.
        </p>
      </div>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Ad units</h3>
        <ToggleRow
          title="Native Banner"
          description="Your 4:1 Native Banner. It is assigned to the pre-video lesson screen by default."
          checked={draft.nativeBannerEnabled}
          onChange={(checked) => setDraft((current) => ({ ...current, nativeBannerEnabled: checked }))}
        />
        <ToggleRow
          title="Popunder"
          description="Loads the supplied Popunder unit once per page when enabled."
          checked={draft.popunderEnabled}
          onChange={(checked) => setDraft((current) => ({ ...current, popunderEnabled: checked }))}
        />
        <ToggleRow
          title="728 × 90 banner"
          description="Your supplied fixed-size banner unit. Choose one page section below."
          checked={draft.banner728Enabled}
          onChange={(checked) => setDraft((current) => ({ ...current, banner728Enabled: checked }))}
        />
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="font-semibold">Ad placement</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose one location per display unit. The pre-video Native Banner placement is the default.
          </p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Native Banner location</span>
          <select
            value={getUnitSlot("nativeBanner")}
            onChange={(event) => setUnitPlacement("nativeBanner", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Not placed</option>
            {AD_SLOTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">728 × 90 banner location</span>
          <select
            value={getUnitSlot("banner728")}
            onChange={(event) => setUnitPlacement("banner728", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Not placed</option>
            {AD_SLOTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Only the page slots installed in ExpertsTeam can render ads. A selected slot will be
          connected to the corresponding page component.
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Application errors</h3>
        <ToggleRow
          title="Show error dialog to visitors"
          description="When disabled, the public error dialog is suppressed. Errors must still be recorded for admin review."
          checked={errorDialogEnabled}
          onChange={setErrorDialogEnabled}
        />
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save advertising settings"}
        </Button>
      </div>
    </div>
  );
}

type UsageRow = {
  service: string;
  endpoint: string;
  method: string;
  request_count: number;
  error_count: number;
  average_duration_ms: number;
  last_seen: string;
};

export function AdminApiUsagePanel() {
  const [range, setRange] = useState("7");
  const since = useMemo(
    () => new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString(),
    [range],
  );
  const { data = [], isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "api-usage", range],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("admin_api_usage_summary", {
        p_since: since,
      });
      if (error) throw error;
      return (rows ?? []) as UsageRow[];
    },
  });

  const totals = data.reduce(
    (sum, row) => ({
      requests: sum.requests + Number(row.request_count),
      errors: sum.errors + Number(row.error_count),
    }),
    { requests: 0, errors: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Supabase API activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Observed requests made by signed-in ExpertsTeam sessions. This is request telemetry,
            not your exact Supabase billing or monthly quota meter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Usage time range"
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Tracked requests</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {isLoading ? "…" : totals.requests.toLocaleString()}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Failed requests</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {isLoading ? "…" : totals.errors.toLocaleString()}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Endpoints observed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {isLoading ? "…" : data.length.toLocaleString()}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        {isError ? (
          <p className="p-5 text-sm text-destructive">
            Could not load API activity. Check the database permissions and try again.
          </p>
        ) : isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading API activity…</p>
        ) : data.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No request metrics have been collected for this period yet. Tracking begins after this
            version of ExpertsTeam is deployed and signed-in users make requests.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Endpoint</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 text-right font-medium">Requests</th>
                  <th className="px-4 py-3 text-right font-medium">Errors</th>
                  <th className="px-4 py-3 text-right font-medium">Avg. ms</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={`${row.service}:${row.endpoint}:${row.method}`} className="border-t border-border/60">
                    <td className="px-4 py-3 capitalize">{row.service}</td>
                    <td className="max-w-[360px] truncate px-4 py-3 font-mono text-xs">{row.endpoint}</td>
                    <td className="px-4 py-3">{row.method}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(row.request_count).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(row.error_count).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Math.round(Number(row.average_duration_ms))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Last refreshed {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : "not yet"}.
        Metrics are batched in the background to avoid one extra database write per request.
      </p>
    </div>
  );
}
