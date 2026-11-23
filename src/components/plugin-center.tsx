import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Check, Github, LockKeyhole, Plug, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPluginCenterData, revokePluginConnection, updatePluginPermissions } from "@/lib/plugin-center.functions";
import { beginGitHubPluginOAuth, beginSupabasePluginOAuth } from "@/lib/plugin-oauth.functions";

type PluginConnection = {
  id: string;
  provider: string;
  display_name: string;
  provider_username: string | null;
  scopes: string[];
  status: string;
  connected_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  "repositories.read": "Read repositories",
  "files.read": "Read project files",
  "files.write": "Create and edit files",
  "branches.create": "Create branches",
  "commits.create": "Commit and push changes",
  "pull_requests.read": "View pull requests",
  "pull_requests.create": "Create pull requests",
  "issues.read": "Read issues",
  "issues.create": "Create issues",
  "repositories.delete": "Delete repositories",
  "organizations.read": "View organizations",
  "projects.read": "View projects",
  "schemas.read": "Inspect database schemas",
  "sql.read": "Run read-only SQL",
  "sql.write": "Run data-changing SQL",
  "tables.create": "Create tables",
  "tables.alter": "Alter tables",
  "tables.drop": "Drop tables",
  "auth.read": "Inspect Auth users/settings",
  "auth.manage": "Manage Auth configuration",
  "storage.read": "Read Storage",
  "storage.write": "Write Storage",
  "functions.deploy": "Deploy Edge Functions",
  "projects.delete": "Delete projects",
};

function PermissionEditor({ connection, actions, savedActions, onSave, saving }: {
  connection: PluginConnection;
  actions: string[];
  savedActions: string[];
  onSave: (actions: string[]) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState(savedActions);
  useEffect(() => setSelected(savedActions), [savedActions.join("|")]);
  const destructive = new Set(["repositories.delete", "tables.drop", "projects.delete", "auth.manage"]);
  return (
    <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Agent permissions</p>
          <p className="text-xs text-muted-foreground">Only selected actions are allowed for this connection.</p>
        </div>
        <Button size="sm" disabled={saving || (selected.length === savedActions.length && selected.every((x) => savedActions.includes(x)))} onClick={() => onSave(selected)}>
          {saving ? "Saving…" : "Save permissions"}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <label key={action} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs">
            <input type="checkbox" checked={selected.includes(action)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, action] : current.filter((item) => item !== action))} />
            <span className="flex-1">{ACTION_LABELS[action] ?? action}</span>
            {destructive.has(action) && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600">Approval required</span>}
          </label>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Destructive permissions are always gated by a separate confirmation before execution.</p>
    </div>
  );
}

export function PluginCenterPanel() {
  const queryClient = useQueryClient();
  const getData = useServerFn(getPluginCenterData);
  const updatePermissions = useServerFn(updatePluginPermissions);
  const revoke = useServerFn(revokePluginConnection);
  const beginGithub = useServerFn(beginGitHubPluginOAuth);
  const beginSupabase = useServerFn(beginSupabasePluginOAuth);
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["plugin-center"], queryFn: () => getData({ data: {} }) });
  const githubOAuth = useMutation({
    mutationFn: () => beginGithub({ data: {} }),
    onSuccess: (result) => window.location.assign(result.url),
    onError: (error: Error) => toast.error(error.message),
  });
  const supabaseOAuth = useMutation({
    mutationFn: () => beginSupabase({ data: {} }),
    onSuccess: (result) => window.location.assign(result.url),
    onError: (error: Error) => toast.error(error.message),
  });
  const saveMutation = useMutation({
    mutationFn: ({ connectionId, actions }: { connectionId: string; actions: string[] }) => updatePermissions({ data: { connectionId, actions } }),
    onSuccess: () => { toast.success("Plugin permissions updated"); void queryClient.invalidateQueries({ queryKey: ["plugin-center"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const revokeMutation = useMutation({
    mutationFn: (connectionId: string) => revoke({ data: { connectionId } }),
    onSuccess: () => { toast.success("Plugin access revoked"); void queryClient.invalidateQueries({ queryKey: ["plugin-center"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const connections = (query.data?.connections ?? []) as PluginConnection[];
  const catalog = query.data?.catalog ?? [];
  const permissions = query.data?.permissions ?? [];

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/15 p-3 text-primary"><Plug className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">ExpertsTeam extensions</p>
          <h2 className="font-display text-2xl font-bold">Plugin Center</h2>
          <p className="text-sm text-muted-foreground">Connect developer services and control exactly what the Agent can do.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="gap-3 p-5">
          <div className="flex items-center gap-3"><Github className="h-6 w-6" /><div><h3 className="font-semibold">GitHub</h3><p className="text-xs text-muted-foreground">Repositories, branches, commits and pull requests</p></div></div>
          <p className="text-xs text-muted-foreground">OAuth authorization, encrypted token storage and repository-level permissions are the required connection flow.</p>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3"><span className="text-xs text-muted-foreground">OAuth authorization</span><Button size="sm" variant="outline" disabled={githubOAuth.isPending} onClick={() => githubOAuth.mutate()}>{githubOAuth.isPending ? "Redirecting…" : "Connect GitHub"}</Button></div>
        </Card>
        <Card className="gap-3 p-5">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-500" /><div><h3 className="font-semibold">Supabase Management</h3><p className="text-xs text-muted-foreground">Organizations, projects, database and Edge Functions</p></div></div>
          <p className="text-xs text-muted-foreground">Use Supabase's official OAuth integration to authorize management actions without asking users to paste personal access tokens.</p>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3"><span className="text-xs text-muted-foreground">OAuth authorization</span><Button size="sm" variant="outline" disabled={supabaseOAuth.isPending} onClick={() => supabaseOAuth.mutate()}>{supabaseOAuth.isPending ? "Redirecting…" : "Connect Supabase"}</Button></div>
        </Card>
      </div>

      <Card className="gap-3 p-5">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /><h3 className="font-semibold">Connected plugins & permissions</h3></div><span className="text-xs text-muted-foreground">{connections.length} connected</span></div>
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading plugin connections…</p> : query.isError ? <p className="text-sm text-destructive">Could not load plugin permissions. Refresh and try again.</p> : connections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center"><Plug className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No OAuth plugins connected yet</p><p className="mt-1 text-xs text-muted-foreground">Your existing Supabase project-key connection is shown separately below. OAuth account connections appear here after authorization is configured.</p></div>
        ) : connections.map((connection) => {
          const saved = permissions.find((item: any) => item.connection_id === connection.id && !item.project_id)?.actions ?? [];
          const actions = catalog.find((item: any) => item.provider === connection.provider)?.actions ?? [];
          return <div key={connection.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2"><Activity className="h-4 w-4 text-primary" /></div><div><p className="text-sm font-semibold">{connection.display_name}</p><p className="text-xs text-muted-foreground">{connection.provider}{connection.provider_username ? " · @" + connection.provider_username : ""} · {connection.status}</p></div></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setExpanded(expanded === connection.id ? null : connection.id)}>{expanded === connection.id ? "Close permissions" : "Manage permissions"}</Button><Button size="sm" variant="destructive" disabled={revokeMutation.isPending} onClick={() => { if (window.confirm("Revoke this plugin connection and remove its access?")) revokeMutation.mutate(connection.id); }}>Revoke</Button></div>
            </div>
            {expanded === connection.id && <PermissionEditor connection={connection} actions={actions} savedActions={saved} saving={saveMutation.isPending} onSave={(next) => saveMutation.mutate({ connectionId: connection.id, actions: next })} />}
          </div>;
        })}
      </Card>
    </section>
  );
}
