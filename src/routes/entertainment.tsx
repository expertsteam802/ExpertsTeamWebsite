import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AddVideoDialog } from "@/components/add-video-dialog";
import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { PageShell } from "@/components/layout/page-shell";
import { UploadDialog } from "@/components/upload-dialog";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/entertainment")({
  head: () => ({
    meta: [
      { title: "Entertainment — ExpertsTeam" },
      {
        name: "description",
        content:
          "Community videos, games and files shared by ExpertsTeam members. Upload up to 200MB and share with everyone.",
      },
      { property: "og:title", content: "Entertainment — ExpertsTeam" },
      {
        property: "og:description",
        content: "Community games, clips and files on ExpertsTeam.",
      },
    ],
  }),
  component: EntertainmentPage,
});

function EntertainmentPage() {
  const { data: videos } = useQuery({
    queryKey: ["videos", "entertainment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles(username, display_name)")
        .eq("category", "entertainment")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VideoItem[];
    },
  });

  const { data: files } = useQuery({
    queryKey: ["files", "entertainment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*, profiles(username, display_name)")
        .in("category", ["game", "video", "resource"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CommunityFile[];
    },
  });

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-bold sm:text-5xl">
            <span className="brand-text">Entertainment</span> hub
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Members post their own videos, games and files here. Uploads show a live percentage and
            keep their original file icons.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <UploadDialog defaultCategory="game" />
            <AddVideoDialog category="entertainment" triggerLabel="Post your video" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <Tabs defaultValue="files">
          <TabsList>
            <TabsTrigger value="files">Games & files</TabsTrigger>
            <TabsTrigger value="videos">Member videos</TabsTrigger>
          </TabsList>
          <TabsContent value="files" className="pt-6">
            <FileGrid files={files ?? []} />
          </TabsContent>
          <TabsContent value="videos" className="pt-6">
            <VideoGrid videos={videos ?? []} />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
