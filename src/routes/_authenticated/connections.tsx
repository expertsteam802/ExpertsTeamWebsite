import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Cloud, Database, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { connectSupabaseProject, disconnectSupabaseProject } from "@/lib/cloud-connections.functions";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Connections & Integrations | ExpertsTeam" },
      { name: "description", content: "Connect your own cloud services to ExpertsTeam projects." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const queryClient = useQueryClient();
  const connect = useServerFn(connectSupabaseProject);
  const disconnect = useServerFn(disconnectSupabaseProject);
  const [displayName, setDisplayName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const connections = useQuery({
    queryKey: ["cloud-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_cloud_connections")
        .select("id, display_name, project_url, project_ref, status, tested_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => connect({ data: { displayName, projectUrl, publishableKey, secretKey } }),
    onSuccess: () => {
      setDisplayName("");
      setProjectUrl("");
      setPublishableKey("");
      setSecretKey("");
      toast.success("Supabase project connected and verified");
      void queryClient.invalidateQueries({ queryKey: ["cloud-connections"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) => disconnect({ data: { connectionId } }),
    onSuccess: () => {
      toast.success("Cloud connection removed");
      void queryClient.invalidateQueries({ queryKey: ["cloud-connections"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <main className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:py-12">
        <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-9">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/15 p-3 text-primary"><Cloud className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Your infrastructure</p>
              <h1 className="font-display text-3xl font-bold sm:text-4xl">Connections & Integrations</h1>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            Connect cloud accounts you own and choose them for your generated apps. Your app database,
            storage and backend usage should run on your connected provider instead of silently consuming
            the ExpertsTeam owner's free-tier resources.
          </p>
        </section>

        <Card className="gap-5 p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <Database className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-xl font-semibold">Connect a Supabase project</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use your Supabase Project URL and publishable key. A server key is optional and is stored encrypted for trusted backend operations only.
              </p>
            </div>
          </div>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              connectMutation.mutate();
            }}
          >
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cloud-name">Connection name</Label>
              <Input id="cloud-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="My production backend" maxLength={80} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cloud-url">Supabase Project URL</Label>
              <Input id="cloud-url" type="url" value={projectUrl} onChange={(event) => setProjectUrl(event.target.value)} placeholder="https://your-project.supabase.co" required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cloud-public-key">Publishable key (or legacy anon key)</Label>
              <Input id="cloud-public-key" value={publishableKey} onChange={(event) => setPublishableKey(event.target.value)} placeholder="sb_publishable_… or legacy anon JWT" autoComplete="off" required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cloud-secret-key">Secret key (or legacy service_role key) — optional</Label>
              <Input id="cloud-secret-key" type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder="sb_secret_… / legacy service_role JWT" autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">
                Never put this key in generated frontend code. ExpertsTeam stores it in Supabase Vault and does not return it to your browser after saving.
              </p>
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="max-w-xl text-xs text-muted-foreground">Connection test checks the project URL and publishable key before saving. Only standard *.supabase.co project URLs are supported in this first version.</p>
              <Button type="submit" disabled={connectMutation.isPending || !projectUrl.trim() || !publishableKey.trim()}>
                <PlugZap className="mr-2 h-4 w-4" /> {connectMutation.isPending ? "Testing & saving…" : "Test and connect"}
              </Button>
            </div>
          </form>
        </Card>

        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Your connected projects</h2>
            <p className="mt-1 text-sm text-muted-foreground">Connections are private to your account. Disconnecting removes the encrypted server key too.</p>
          </div>
          {connections.isLoading ? (
            <Card className="p-6 text-sm text-muted-foreground">Loading your connections…</Card>
          ) : connections.isError ? (
            <Card className="p-6 text-sm text-destructive">Could not load your cloud connections. Refresh and try again.</Card>
          ) : connections.data?.length ? (
            <div className="grid gap-3">
              {connections.data.map((connection) => (
                <Card key={connection.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Database className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{connection.display_name}</h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" /> {connection.status}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{connection.project_url}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Tested {new Date(connection.tested_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled={disconnectMutation.isPending} onClick={() => disconnectMutation.mutate(connection.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Disconnect
                  </Button>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Cloud className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">No cloud projects connected yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Connect your own Supabase project to prepare it for Builder apps.</p>
            </Card>
          )}
        </section>

        <Card className="gap-3 border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">What is protected?</h2></div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Your publishable key is visible only in this private connection record and is intended for client use with your own RLS policies.</li>
            <li>Your optional secret key is encrypted in Supabase Vault and is never selected by the browser.</li>
            <li>ExpertsTeam platform accounts and permissions continue to use the platform's own database.</li>
            <li>Connecting a project does not yet migrate existing Builder files or switch a project's storage automatically; that is the next integration step.</li>
          </ul>
        </Card>
      </main>
    </PageShell>
  );
}
