import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Youtube } from "lucide-react";

import { AddVideoDialog } from "@/components/add-video-dialog";
import { AdSlot } from "@/components/ads/ad-slot";
import { PageShell } from "@/components/layout/page-shell";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/videos")({
  head: () => ({
    meta: [
      { title: "Video archive — ExpertsTeam" },
      {
        name: "description",
        content:
          "Watch every Chris Expert video without leaving the site. The full @expertchris and @chrisexpert archive in one player.",
      },
      { property: "og:title", content: "Video archive — ExpertsTeam" },
      {
        property: "og:description",
        content: "The full Chris Expert YouTube archive, playable inside ExpertsTeam.",
      },
    ],
  }),
  component: VideosPage,
});

function VideosPage() {
  const settings = useSiteSettings();
  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos", "archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles(username, display_name)")
        .eq("category", "archive")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VideoItem[];
    },
  });

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-bold sm:text-5xl">
            The <span className="brand-text">archive</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every video from @expertchris and @chrisexpert, playable right here. Add one by pasting
            its YouTube share link — we read the id for you so links never break.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <AddVideoDialog category="archive" triggerLabel="Add archive video" />
            <a href={settings.youtube_url} target="_blank" rel="noreferrer">
              <Button variant="ghost">
                <Youtube className="mr-2 h-4 w-4" /> Visit the channel
              </Button>
            </a>
          </div>
        </div>
      </section>

      <AdSlot slot="videos-top" />

      <section className="mx-auto max-w-7xl px-4 py-12">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading videos…</p>
        ) : (
          <VideoGrid videos={videos ?? []} />
        )}
      </section>
      <AdSlot slot="videos-bottom" />
    </PageShell>
  );
}
