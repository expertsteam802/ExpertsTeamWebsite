import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive, MessageCircle, Sparkles, Users, Video } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

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

  const uploadAvatar = useMutation({
    mutationFn: async () => {
      if (!user || !avatarFile) throw new Error("Choose a profile photo first.");
      if (!avatarFile.type.startsWith("image/") || avatarFile.size > 5 * 1024 * 1024) {
        throw new Error("Choose an image smaller than 5 MB.");
      }
      const extension = avatarFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/profile/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, avatarFile, {
        cacheControl: "3600",
        contentType: avatarFile.type,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      const { error } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setAvatarFile(null);
      toast.success("Profile photo updated");
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{(profile?.display_name || profile?.username || "E").slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Member dashboard</p>
              <h1 className="mt-1 truncate font-display text-3xl font-bold sm:text-4xl">
                Welcome back, {profile?.display_name || profile?.username || "Member"} 👋
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">Your uploads, learning, conversations and account — all in one place.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <UploadDialog />
            <AddVideoDialog category="entertainment" triggerLabel="Add a video" />
            <Button variant="outline" onClick={() => void navigate({ to: "/messages" })}><MessageCircle className="mr-2 h-4 w-4" /> Messages</Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-3 p-6">
          <div className="flex items-center justify-between">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-xs text-muted-foreground">Your library</span>
          </div>
          <h2 className="font-display text-2xl font-bold">{(files ?? []).length}</h2>
          <p className="text-sm text-muted-foreground">Uploaded files</p>
        </Card>
        <Card className="gap-3 p-6">
          <div className="flex items-center justify-between">
            <Video className="h-5 w-5 text-primary" />
            <span className="text-xs text-muted-foreground">Your library</span>
          </div>
          <h2 className="font-display text-2xl font-bold">{(videos ?? []).length}</h2>
          <p className="text-sm text-muted-foreground">Shared videos</p>
        </Card>
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
        <Tabs defaultValue="files" orientation="vertical" className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <TabsList className="flex h-fit flex-row flex-wrap gap-2 lg:flex-col lg:items-stretch">
            <TabsTrigger value="files">My files</TabsTrigger>
            <TabsTrigger value="videos">My videos</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="files" className="min-w-0 pt-0">
            <FileGrid files={files ?? []} />
          </TabsContent>
          <TabsContent value="videos" className="min-w-0 pt-0">
            <VideoGrid videos={videos ?? []} />
          </TabsContent>
          <TabsContent value="profile" className="min-w-0 pt-0">
            <Card className="max-w-2xl gap-5 p-6">
              <div className="flex flex-wrap items-center gap-4 border-b border-border/70 pb-5">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{(profile?.display_name || profile?.username || "E").slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">Profile photo</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Choose a clear photo so people recognise you in the community and messages. JPG, PNG or WebP up to 5 MB.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input type="file" accept="image/png,image/jpeg,image/webp" className="max-w-xs" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
                    <Button onClick={() => uploadAvatar.mutate()} disabled={!avatarFile || uploadAvatar.isPending}>
                      {uploadAvatar.isPending ? "Uploading…" : "Save photo"}
                    </Button>
                  </div>
                </div>
              </div>
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
