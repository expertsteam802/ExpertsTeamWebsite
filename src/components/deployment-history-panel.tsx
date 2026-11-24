import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
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
      <summary className="cursor-pointer list-none rounded-md border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-cyan-500/40">
        Deploy history
      </summary>
      <div className="absolute right-0 top-full z-[100] mt-2 max-h-[420px] w-[min(420px,90vw)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-white">Deployment releases</p><span className="text-[10px] text-slate-400">{history.data?.length ?? 0} releases</span></div>
        {history.isLoading ? <p className="p-3 text-xs text-slate-400">Loading deployment history…</p> : history.data?.length ? (
          <div className="space-y-2">
            {history.data.map((deployment) => (
              <div key={deployment.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-100">{deployment.environment === "production" ? "Production" : "Staging"} · {deployment.release_id.slice(0, 8)}</p>
                  <span className={deployment.is_current ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300" : "rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400"}>{deployment.is_current ? "Current" : deployment.status}</span>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{new Date(deployment.created_at).toLocaleString()} · {deployment.file_count} files</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <a href={deployment.public_url} target="_blank" rel="noopener noreferrer" className="truncate text-[11px] text-cyan-300 underline">Open release</a>
                  {deployment.environment === "production" && !deployment.is_current && deployment.status === "success" && (
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={rollback.isPending} onClick={() => {
                      if (window.confirm("Roll production back to this release?")) rollback.mutate(deployment);
                    }}><RotateCcw className="mr-1 h-3 w-3" /> Roll back</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="p-3 text-xs text-slate-400">No deployment releases yet.</p>}
      </div>
    </details>
  );
}
