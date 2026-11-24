import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, HeartPulse, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export function UptimeAlertsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [failureThreshold, setFailureThreshold] = useState("3");
  const [recoveryThreshold, setRecoveryThreshold] = useState("2");
  const settings = useQuery({
    queryKey: ["agent-project-uptime-settings", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_project_uptime_settings")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setFailureThreshold(String(settings.data.failure_threshold));
    setRecoveryThreshold(String(settings.data.recovery_threshold));
  }, [settings.data]);

  const alerts = useQuery({
    queryKey: ["agent-project-uptime-alerts", projectId],
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_project_uptime_alerts")
        .select("id,event_type,message,created_at,acknowledged_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const checks = useQuery({
    queryKey: ["agent-project-uptime-checks", projectId],
    enabled: Boolean(projectId && settings.data?.enabled),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_project_uptime_checks")
        .select("status,status_code,response_time_ms,checked_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const configure = useMutation({
    mutationFn: async (enabled: boolean) => {
      const failures = Number(failureThreshold);
      const recoveries = Number(recoveryThreshold);
      if (
        !Number.isInteger(failures) ||
        failures < 1 ||
        failures > 10 ||
        !Number.isInteger(recoveries) ||
        recoveries < 1 ||
        recoveries > 10
      ) {
        throw new Error("Thresholds must be whole numbers between 1 and 10.");
      }
      const { error } = await supabase.rpc("set_agent_project_uptime_settings", {
        p_project_id: projectId,
        p_enabled: enabled,
        p_failure_threshold: failures,
        p_recovery_threshold: recoveries,
      });
      if (error) throw error;
    },
    onSuccess: (_data, enabled) => {
      toast.success(enabled ? "Uptime monitoring enabled." : "Uptime monitoring paused.");
      void queryClient.invalidateQueries({ queryKey: ["agent-project-uptime-settings", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["agent-project-uptime-checks", projectId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const acknowledge = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase.rpc("acknowledge_agent_project_uptime_alert", {
        p_alert_id: alertId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["agent-project-uptime-alerts", projectId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const enabled = Boolean(settings.data?.enabled);
  const latest = checks.data;
  return (
    <section className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-cyan-300" />
        <p className="text-xs font-semibold text-slate-200">Uptime monitoring</p>
      </div>
      <p className="mb-3 text-[10px] leading-4 text-slate-400">
        Production assets are checked every 5 minutes. Alerts appear after the configured consecutive-failure threshold.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] text-slate-400">
          Failures before alert
          <Input
            type="number"
            min="1"
            max="10"
            value={failureThreshold}
            onChange={(event) => setFailureThreshold(event.target.value)}
            className="h-8 border-slate-700 bg-slate-900 text-xs text-white"
          />
        </label>
        <label className="space-y-1 text-[10px] text-slate-400">
          Successes before recovery
          <Input
            type="number"
            min="1"
            max="10"
            value={recoveryThreshold}
            onChange={(event) => setRecoveryThreshold(event.target.value)}
            className="h-8 border-slate-700 bg-slate-900 text-xs text-white"
          />
        </label>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-slate-900 p-2">
        <div>
          <p className="text-xs font-medium text-white">
            {enabled ? "Monitoring enabled" : "Monitoring paused"}
          </p>
          <p className="text-[10px] text-slate-400">
            {latest
              ? `${latest.status.toUpperCase()} · ${latest.status_code ?? "no code"} · ${latest.response_time_ms ?? "—"} ms`
              : "No check result yet"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "outline" : "default"}
          className="h-7 text-[10px]"
          disabled={configure.isPending || settings.isLoading}
          onClick={() => configure.mutate(!enabled)}
        >
          {configure.isPending ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : enabled ? (
            "Pause"
          ) : (
            "Enable"
          )}
        </Button>
      </div>
      <div className="space-y-2">
        {alerts.data?.map((alert) => (
          <div key={alert.id} className="rounded-lg border border-slate-800 p-2">
            <div className="flex items-start gap-2">
              {alert.event_type === "down" ? (
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 text-rose-300" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-200">{alert.message}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {new Date(alert.created_at).toLocaleString()}
                </p>
              </div>
              {!alert.acknowledged_at && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-slate-300"
                  disabled={acknowledge.isPending}
                  onClick={() => acknowledge.mutate(alert.id)}
                >
                  Acknowledge
                </Button>
              )}
            </div>
          </div>
        ))}
        {!alerts.data?.length && (
          <p className="text-[10px] text-slate-500">No uptime alerts recorded.</p>
        )}
      </div>
    </section>
  );
}
