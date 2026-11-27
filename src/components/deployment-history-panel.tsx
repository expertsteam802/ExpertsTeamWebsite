import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { UptimeAlertsPanel } from "@/components/uptime-alerts-panel";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Deployment = Tables<"agent_project_deployments">;

export function DeploymentHistoryPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["agent-project-deployments", projectId],
    enabled: Boolean(projectId && user),
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_project_deployments")
        .select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as Deployment[];
    },
  });

  const analytics = useQuery({
    queryKey: ["agent-project-analytics", projectId],
    enabled: Boolean(projectId && user),
    queryFn: async () => {
      const fromDay = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("agent_project_analytics_daily")
        .select("day,views,errors").eq("project_id", projectId).gte("day", fromDay).order("day", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const buildLogs = useQuery({
    queryKey: ["agent-project-build-logs", projectId],
    enabled: Boolean(projectId && user),
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_project_build_logs")
        .select("id,environment,status,release_id,message,created_at")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rollback = useMutation({
    mutationFn: async (deployment: Deployment) => {
      const { data, error } = await supabase.rpc("rollback_agent_project_deployment", {
        p_project_id: projectId,
        p_deployment_id: deployment.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Production rolled back to the selected release.");
      void queryClient.invalidateQueries({ queryKey: ["agent-project-deployments", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["agent-projects", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!projectId || !user) return null;
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-[#1E293B] bg-[#1E293B]/70 px-3 py-1.5 text-[11px] font-medium text-[#CBD5E1] hover:border-[#2563EB]/50">
        Deploy history
      </summary>
      <div className="absolute right-0 top-full z-[100] mt-2 max-h-[420px] w-[min(420px,90vw)] overflow-y-auto rounded-xl border border-[#1E293B] bg-[#070B14] p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-white">Deployment releases</p><span className="text-[10px] text-[#94A3B8]">{history.data?.length ?? 0} releases</span></div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#0D1322] p-2"><p className="text-[10px] text-[#94A3B8]">Views · 30 days</p><p className="text-lg font-semibold text-white tabular-nums">{(analytics.data ?? []).reduce((sum, day) => sum + Number(day.views), 0).toLocaleString()}</p></div>
          <div className="rounded-lg bg-[#0D1322] p-2"><p className="text-[10px] text-[#94A3B8]">Load errors · 30 days</p><p className="text-lg font-semibold text-white tabular-nums">{(analytics.data ?? []).reduce((sum, day) => sum + Number(day.errors), 0).toLocaleString()}</p></div>
        </div>
        {history.isLoading ? <p className="p-3 text-xs text-[#94A3B8]">Loading deployment history…</p> : history.data?.length ? (
          <div className="space-y-2">
            {history.data.map((deployment) => (
              <div key={deployment.id} className="rounded-lg border border-[#1E293B] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#E2E8F0]">{deployment.environment === "production" ? "Production" : "Staging"} · {deployment.release_id.slice(0, 8)}</p>
                  <span className={deployment.is_current ? "rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] text-[#6EE7B7]" : "rounded-full bg-[#1E293B] px-2 py-0.5 text-[10px] text-[#94A3B8]"}>{deployment.is_current ? "Current" : deployment.status}</span>
                </div>
                <p className="mt-1 text-[10px] text-[#94A3B8]">{new Date(deployment.created_at).toLocaleString()} · {deployment.file_count} files</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <a href={deployment.public_url} target="_blank" rel="noopener noreferrer" className="truncate text-[11px] text-[#60A5FA] underline">Open release</a>
                  {deployment.environment === "production" && !deployment.is_current && deployment.status === "success" && (
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={rollback.isPending} onClick={() => {
                      if (window.confirm("Roll production back to this release?")) rollback.mutate(deployment);
                    }}><RotateCcw className="mr-1 h-3 w-3" /> Roll back</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="p-3 text-xs text-[#94A3B8]">No deployment releases yet.</p>}
        <UptimeAlertsPanel projectId={projectId} />
        <div className="mt-3 border-t border-[#1E293B] pt-3">
          <p className="mb-2 text-xs font-semibold text-[#CBD5E1]">Recent build logs</p>
          {buildLogs.data?.length ? buildLogs.data.map((log) => (
            <div key={log.id} className="mb-2 rounded-lg bg-[#0D1322] p-2">
              <p className="text-[10px] text-[#94A3B8]">{log.environment} · {log.status} · {new Date(log.created_at).toLocaleString()}</p>
              <p className="mt-1 break-words text-[11px] text-[#CBD5E1]">{log.message}</p>
            </div>
          )) : <p className="text-[10px] text-[#94A3B8]">No build logs recorded yet.</p>}
        </div>
      </div>
    </details>
  );
}
