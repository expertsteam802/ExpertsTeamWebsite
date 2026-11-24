import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, HardDrive, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAdminSupabaseBackups } from "@/lib/admin-backups.functions";

export function AdminSupabaseBackupsPanel() {
  const queryClient = useQueryClient();
  const getBackups = useServerFn(getAdminSupabaseBackups);
  const backups = useQuery({
    queryKey: ["admin-supabase-backups"],
    retry: false,
    queryFn: () => getBackups({ data: {} }),
  });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold">Database backups</h2><p className="text-sm text-muted-foreground">Review Supabase backup inventory and recovery coverage for the ExpertsTeam database.</p></div>
        <Button variant="outline" size="sm" disabled={backups.isFetching} onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin-supabase-backups"] })}><RefreshCw className={backups.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} /> Refresh</Button>
      </div>
      {backups.isError ? (
        <Card className="p-5"><p className="font-medium">Backup inventory unavailable</p><p className="mt-1 text-sm text-muted-foreground">{backups.error instanceof Error ? backups.error.message : "Configure the Supabase Management API access token and project reference."}</p></Card>
      ) : backups.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Available backups</p><p className="mt-1 text-2xl font-semibold tabular-nums">{backups.data.backups.length}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Database region</p><p className="mt-1 text-lg font-semibold">{backups.data.region}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Point-in-time recovery</p><p className="mt-1 text-lg font-semibold">{backups.data.pitrEnabled ? "Enabled" : "Not enabled"}</p></Card>
          </div>
          <div className="space-y-2">
            {backups.data.backups.map((backup) => (
              <Card key={backup.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3"><HardDrive className="h-5 w-5 text-primary" /><div><p className="font-medium">Backup #{backup.id} · {backup.physical ? "Physical" : "Logical"}</p><p className="text-xs text-muted-foreground">{new Date(backup.createdAt).toLocaleString()}</p></div></div>
                <span className={backup.status === "COMPLETED" ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600" : "rounded-full bg-muted px-2.5 py-1 text-xs"}>{backup.status}</span>
              </Card>
            ))}
            {!backups.data.backups.length && <Card className="p-5 text-sm text-muted-foreground">Supabase returned no downloadable daily backups for this project. Backup availability depends on your Supabase plan and configured retention.</Card>}
          </div>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">Restore and retention controls</p><p className="text-xs text-muted-foreground">Restoring replaces live database state and can cause downtime. Review the selected recovery point carefully in Supabase.</p></div>
            <a href={backups.data.dashboardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Open Supabase backups <ExternalLink className="ml-2 h-3.5 w-3.5" /></a>
          </Card>
        </>
      ) : <Card className="p-5 text-sm text-muted-foreground">Loading backup inventory…</Card>}
    </section>
  );
}
