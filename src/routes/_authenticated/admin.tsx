import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { deleteUserAccount } from "@/lib/accounts.functions";
import { formatBytes, formatDate } from "@/lib/format";
import { paymentMethodLabel, type UpgradeRequest } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel — Chris Programs" },
      {
        name: "description",
        content:
          "Creator controls for Chris Programs: site branding, members, sessions and pricing.",
      },
      { property: "og:title", content: "Admin panel — Chris Programs" },
      { property: "og:description", content: "Creator controls for Chris Programs." },
    ],
  }),
  component: AdminPage,
});

type SettingsForm = {
  site_name: string;
  logo_url: string;
  youtube_url: string;
  instagram_url: string;
  owner_email: string;
  subscription_price: string;
  subscription_quota_bytes: string;
  payout_account: string;
};

function AdminPage() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const removeAccount = useServerFn(deleteUserAccount);
  const [form, setForm] = useState<SettingsForm | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["site-settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["admin", "members"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, is_subscribed, storage_quota_bytes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["admin", "auth-events"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_events")
        .select("id, event, created_at, user_id, profiles(username, display_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        event: string;
        created_at: string;
        user_id: string;
        profiles: { username: string; display_name: string | null } | null;
      }>;
    },
  });

  useEffect(() => {
    if (settings && !form) {
      setForm({
        site_name: settings.site_name,
        logo_url: settings.logo_url ?? "",
        youtube_url: settings.youtube_url,
        instagram_url: settings.instagram_url,
        owner_email: settings.owner_email,
        subscription_price: String(settings.subscription_price),
        subscription_quota_bytes: String(settings.subscription_quota_bytes),
        payout_account: settings.payout_account ?? "",
      });
    }
  }, [settings, form]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!form || !settings) return;
      const { error } = await supabase
        .from("site_settings")
        .update({
          site_name: form.site_name.trim().slice(0, 60),
          logo_url: form.logo_url.trim() || null,
          youtube_url: form.youtube_url.trim(),
          instagram_url: form.instagram_url.trim(),
          owner_email: form.owner_email.trim(),
          subscription_price: Number(form.subscription_price) || 0,
          subscription_quota_bytes: Number(form.subscription_quota_bytes) || 209715200,
          payout_account: form.payout_account.trim() || null,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Site settings saved");
      void queryClient.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: upgrades } = useQuery({
    queryKey: ["admin", "upgrades"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*, profiles(username, display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<
        UpgradeRequest & { profiles: { username: string; display_name: string | null } | null }
      >;
    },
  });

  const reviewUpgrade = useMutation({
    mutationFn: async ({ request, approve }: { request: UpgradeRequest; approve: boolean }) => {
      const { error } = await supabase
        .from("subscription_requests")
        .update({
          status: approve ? "approved" : "declined",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) throw error;

      if (approve) {
        const quota = Number(settings?.subscription_quota_bytes ?? 2147483648);
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ is_subscribed: true, storage_quota_bytes: quota })
          .eq("id", request.user_id);
        if (profileError) throw profileError;
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.approve ? "Payment confirmed — space unlocked" : "Payment declined");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: projectRequests } = useQuery({
    queryKey: ["admin", "project-requests"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_requests")
        .select("*, profiles(username, display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        title: string;
        summary: string;
        skills: string | null;
        contact: string | null;
        status: string;
        created_at: string;
        profiles: { username: string; display_name: string | null } | null;
      }>;
    },
  });

  const reviewProject = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from("project_requests")
        .update({
          status: approve ? "approved" : "declined",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.approve ? "Developer accepted" : "Application declined");
      void queryClient.invalidateQueries({ queryKey: ["admin", "project-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMember = useMutation({
    mutationFn: async (userId: string) => {
      await removeAccount({ data: { userId } });
    },
    onSuccess: () => {
      toast.success("Member deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <PageShell>
        <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <h1 className="font-display text-2xl font-semibold">Creator access only</h1>
          <p className="text-sm text-muted-foreground">
            This panel is reserved for the site creator. If this is your site, sign in with the
            creator account.
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            <span className="brand-text">Creator</span> control room
          </h1>
          <p className="mt-2 text-muted-foreground">
            Rename the site, swap the logo, watch sign-in activity and manage every member.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <Tabs defaultValue="branding">
          <TabsList>
            <TabsTrigger value="branding">Branding & pricing</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="sessions">Sign-in log</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="developers">Developer requests</TabsTrigger>
          </TabsList>

          <TabsContent value="branding" className="pt-6">
            <Card className="max-w-2xl gap-4 p-6">
              {form ? (
                <>
                  {(
                    [
                      ["site_name", "Website name"],
                      ["logo_url", "Logo image URL"],
                      ["youtube_url", "YouTube channel URL"],
                      ["instagram_url", "Instagram URL"],
                      ["owner_email", "Owner email"],
                      ["subscription_price", "Subscription price (USD)"],
                      ["subscription_quota_bytes", "Subscriber storage (bytes)"],
                      ["payout_account", "Payout account (PayPal email / card account)"],
                    ] as Array<[keyof SettingsForm, string]>
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>{label}</Label>
                      <Input
                        id={key}
                        value={form[key]}
                        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                      />
                    </div>
                  ))}
                  <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                    Save settings
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading settings…</p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="members" className="pt-6">
            <div className="grid gap-3">
              {(members ?? []).map((member) => (
                <Card
                  key={member.id}
                  className="flex-row flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-medium">{member.display_name || member.username}</p>
                    <p className="text-xs text-muted-foreground">
                      @{member.username} · joined {formatDate(member.created_at)} ·{" "}
                      {formatBytes(member.storage_quota_bytes)} quota
                      {member.is_subscribed ? " · subscriber" : ""}
                    </p>
                  </div>
                  {member.id !== user?.id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMember.mutate(member.id)}
                      disabled={deleteMember.isPending}
                    >
                      Delete user
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sessions" className="pt-6">
            <Card className="divide-y divide-border p-0">
              {(sessions ?? []).map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm">
                    {event.profiles?.display_name || event.profiles?.username || "Unknown member"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {event.event === "signed_in" ? "logged in" : "logged out"} ·{" "}
                    {formatDate(event.created_at)}
                  </span>
                </div>
              ))}
              {!sessions?.length && (
                <p className="px-4 py-6 text-sm text-muted-foreground">No sign-in activity yet.</p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="pt-6">
            <div className="space-y-3">
              {(upgrades ?? []).map((request) => (
                <Card key={request.id} className="gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {request.profiles?.display_name || request.profiles?.username || "Member"} ·
                        ${Number(request.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {paymentMethodLabel(request.method)} · ref {request.reference} ·{" "}
                        {formatDate(request.created_at)} · {request.status}
                      </p>
                      {request.note && (
                        <p className="mt-1 text-xs text-muted-foreground">“{request.note}”</p>
                      )}
                    </div>
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={reviewUpgrade.isPending}
                          onClick={() => reviewUpgrade.mutate({ request, approve: true })}
                        >
                          Confirm payment
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewUpgrade.isPending}
                          onClick={() => reviewUpgrade.mutate({ request, approve: false })}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
              {!upgrades?.length && (
                <p className="text-sm text-muted-foreground">
                  No subscription payments submitted yet.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="developers" className="pt-6">
            <div className="space-y-3">
              {(projectRequests ?? []).map((request) => (
                <Card key={request.id} className="gap-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {request.title} ·{" "}
                        {request.profiles?.display_name || request.profiles?.username || "Member"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(request.created_at)} · {request.status}
                        {request.skills ? ` · ${request.skills}` : ""}
                        {request.contact ? ` · ${request.contact}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{request.summary}</p>
                    </div>
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={reviewProject.isPending}
                          onClick={() => reviewProject.mutate({ id: request.id, approve: true })}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewProject.isPending}
                          onClick={() => reviewProject.mutate({ id: request.id, approve: false })}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
              {!projectRequests?.length && (
                <p className="text-sm text-muted-foreground">No developer applications yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
