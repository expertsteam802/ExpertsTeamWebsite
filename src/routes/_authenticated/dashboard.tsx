import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AddVideoDialog } from "@/components/add-video-dialog";
import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { PageShell } from "@/components/layout/page-shell";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { UploadDialog } from "@/components/upload-dialog";

import { VideoGrid, type VideoItem } from "@/components/video-grid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";
import { deleteUserAccount } from "@/lib/accounts.functions";
import { formatBytes, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My dashboard — ExpertsTeam" },
      {
        name: "description",
        content: "Manage your uploads, videos, storage space and account settings on ExpertsTeam.",
      },
      { property: "og:title", content: "My dashboard — ExpertsTeam" },
      { property: "og:description", content: "Your ExpertsTeam member dashboard." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, profile } = useAuth();
  const settings = useSiteSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deleteAccount = useServerFn(deleteUserAccount);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const { data: files } = useQuery({
    queryKey: ["files", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*, profiles(username, display_name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CommunityFile[];
    },
  });

  const { data: videos } = useQuery({
    queryKey: ["videos", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles(username, display_name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VideoItem[];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["auth-events", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_events")
        .select("id, event, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim().slice(0, 60) || profile?.display_name || null,
          bio: bio.trim().slice(0, 300) || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const used = (files ?? []).reduce((total, file) => total + Number(file.size_bytes), 0);
  const quota = profile?.storage_quota_bytes ?? 209715200;
  const usedPercent = Math.min(100, Math.round((used / quota) * 100));

  async function removeAccount() {
    try {
      await deleteAccount({ data: { userId: user!.id } });
      await supabase.auth.signOut();
      queryClient.clear();
      toast.success("Your account has been deleted");
      void navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the account");
    }
  }

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-12">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              Hey {profile?.display_name || profile?.username} 👋
            </h1>
            <p className="mt-2 text-muted-foreground">Your uploads, videos and account settings.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <UploadDialog />
            <AddVideoDialog category="entertainment" triggerLabel="Add a video" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-10 md:grid-cols-3">
        <Card className="gap-3 p-6">
          <HardDrive className="h-5 w-5 text-primary" />
          <h2 className="font-display font-semibold">Storage</h2>
          <Progress value={usedPercent} />
          <p className="text-sm text-muted-foreground">
            {formatBytes(used)} of {formatBytes(quota)} used ({usedPercent}%)
          </p>
        </Card>
        <Card className="gap-3 p-6">
          <Sparkles className="h-5 w-5 text-accent" />
          <h2 className="font-display font-semibold">Membership</h2>
          <p className="text-sm text-muted-foreground">
            {profile?.is_subscribed
              ? "Subscriber — extra upload space unlocked."
              : `Free member. $${Number(settings.subscription_price).toFixed(2)} unlocks ${formatBytes(settings.subscription_quota_bytes)} of space.`}
          </p>
          <UpgradeDialog />
        </Card>

        <Card className="gap-3 p-6">
          <h2 className="font-display font-semibold">Recent sign-in activity</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {(events ?? []).slice(0, 5).map((event) => (
              <li key={event.id}>
                {event.event === "signed_in" ? "Signed in" : "Signed out"} ·{" "}
                {formatDate(event.created_at)}
              </li>
            ))}
            {!events?.length && <li>No activity recorded yet.</li>}
          </ul>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <Tabs defaultValue="files">
          <TabsList>
            <TabsTrigger value="files">My files</TabsTrigger>
            <TabsTrigger value="videos">My videos</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="files" className="pt-6">
            <FileGrid files={files ?? []} />
          </TabsContent>
          <TabsContent value="videos" className="pt-6">
            <VideoGrid videos={videos ?? []} />
          </TabsContent>
          <TabsContent value="profile" className="pt-6">
            <Card className="max-w-xl gap-4 p-6">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  maxLength={60}
                  placeholder={profile?.display_name ?? ""}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  maxLength={300}
                  placeholder={profile?.bio ?? "Tell the community what you build"}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                  Save profile
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Delete my account</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes your profile, videos and every file you uploaded.
                        It cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep my account</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void removeAccount()}>
                        Delete forever
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
