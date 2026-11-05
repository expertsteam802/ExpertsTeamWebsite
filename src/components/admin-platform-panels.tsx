import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

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
  const edgeFunctionCalls = data
    .filter((row) => row.service.toLowerCase() === "functions")
    .reduce((total, row) => total + Number(row.request_count), 0);

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Edge Function calls</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {isLoading ? "…" : edgeFunctionCalls.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Observed in the selected period</p>
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
