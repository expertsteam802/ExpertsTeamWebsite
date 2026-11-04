import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type AdSettings = {
  myBidVastEnabled: boolean;
  myBidVastUrl: string;
  myBidAdCodeId: string;
  myBidFormatId: string;
  myBidAdCodeName: string;
};

const DEFAULT_AD_SETTINGS: AdSettings = {
  myBidVastEnabled: true,
  myBidVastUrl: "https://vast.vstserv.com/vast?spot_id=2030847",
  myBidAdCodeId: "470834",
  myBidFormatId: "2030847",
  myBidAdCodeName: "ExpertsTeam",
};

function normalizeAdSettings(value: Json | null | undefined): AdSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_AD_SETTINGS;
  const raw = value as Record<string, Json | undefined>;
  return {
    myBidVastEnabled: typeof raw.myBidVastEnabled === "boolean" ? raw.myBidVastEnabled : true,
    myBidVastUrl: typeof raw.myBidVastUrl === "string" && raw.myBidVastUrl.trim()
      ? raw.myBidVastUrl
      : DEFAULT_AD_SETTINGS.myBidVastUrl,
    myBidAdCodeId: typeof raw.myBidAdCodeId === "string" ? raw.myBidAdCodeId : DEFAULT_AD_SETTINGS.myBidAdCodeId,
    myBidFormatId: typeof raw.myBidFormatId === "string" ? raw.myBidFormatId : DEFAULT_AD_SETTINGS.myBidFormatId,
    myBidAdCodeName: typeof raw.myBidAdCodeName === "string" ? raw.myBidAdCodeName : DEFAULT_AD_SETTINGS.myBidAdCodeName,
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
      const parsedUrl = new URL(draft.myBidVastUrl);
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "vast.vstserv.com") {
        throw new Error("Use the secure MyBid VAST URL supplied for this placement.");
      }
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
      toast.success("MyBid video advertising settings saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading ad controls…</Card>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Video advertising</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the MyBid VAST pre-roll shown before ExpertsTeam videos. Adsterra display and popunder scripts have been retired.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">MyBid Video VAST</h3>
            <p className="mt-1 text-xs text-muted-foreground">Publisher ad code #{draft.myBidAdCodeId} · Format ID {draft.myBidFormatId}</p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">Configured</span>
        </div>
        <ToggleRow
          title="Enable pre-roll video ads"
          description="Request a MyBid video ad before each video lesson. Visitors can continue if MyBid has no ad available."
          checked={draft.myBidVastEnabled}
          onChange={(checked) => setDraft((current) => ({ ...current, myBidVastEnabled: checked }))}
        />
        <label className="block space-y-2">
          <span className="text-sm font-medium">Ad code name</span>
          <input
            value={draft.myBidAdCodeName}
            onChange={(event) => setDraft((current) => ({ ...current, myBidAdCodeName: event.target.value }))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">VAST tag URL</span>
          <input
            type="url"
            value={draft.myBidVastUrl}
            onChange={(event) => setDraft((current) => ({ ...current, myBidVastUrl: event.target.value }))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs"
            spellCheck={false}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium">MyBid ad code ID</span>
            <input value={draft.myBidAdCodeId} readOnly className="h-10 w-full rounded-md border border-input bg-muted px-3 text-sm" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Video VAST format ID</span>
            <input value={draft.myBidFormatId} readOnly className="h-10 w-full rounded-md border border-input bg-muted px-3 text-sm" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          The VAST tag is requested through the Google IMA SDK. The original YouTube video starts only after the ad completes or MyBid reports no fill.
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
  const {
    data = [],
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["admin", "api-usage", range],
    refetchInterval: 2 * 60 * 1000,
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
            Observed requests made by signed-in ExpertsTeam sessions. This is request telemetry, not
            your exact Supabase billing or monthly quota meter.
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
                  <tr
                    key={`${row.service}:${row.endpoint}:${row.method}`}
                    className="border-t border-border/60"
                  >
                    <td className="px-4 py-3 capitalize">{row.service}</td>
                    <td className="max-w-[360px] truncate px-4 py-3 font-mono text-xs">
                      {row.endpoint}
                    </td>
                    <td className="px-4 py-3">{row.method}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(row.request_count).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(row.error_count).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Math.round(Number(row.average_duration_ms))}
                    </td>
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
