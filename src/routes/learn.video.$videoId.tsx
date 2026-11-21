import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";

import { LearningCodePlayground } from "@/components/learning-code-playground";
import { VideoPlayerDialog } from "@/components/video-player-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/learn/video/$videoId")({
  head: ({ params }) => ({
    meta: [
      { title: "Video lesson | ExpertsTeam" },
      { name: "description", content: "Watch a programming lesson and practise with the ExpertsTeam interactive code editor and live preview." },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "video.other" },
      { property: "og:url", content: `https://expertsteam.giize.com/learn/video/${params.videoId}` },
    ],
    links: [{ rel: "canonical", href: `https://expertsteam.giize.com/learn/video/${params.videoId}` }],
  }),
  component: LearningVideoPage,
});

type LessonVideo = {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string;
  category: string;
  user_id: string;
  created_at: string;
  player_alignment?: "left" | "center" | "right";
  profiles?: { username: string; display_name: string | null } | null;
};

function LearningVideoPage() {
  const { videoId } = Route.useParams();
  const navigate = useNavigate();
  const { data: video, isLoading, error } = useQuery({
    queryKey: ["learning-video", videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles(username, display_name)")
        .eq("id", videoId)
        .eq("category", "lesson")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as LessonVideo | null;
    },
  });

  return (
    <PageShell>
      <main className="mx-auto min-h-[75vh] max-w-7xl px-4 py-7 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/learn" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to learning
            </Link>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">ExpertsTeam learning</p>
            <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{video?.title ?? "Video lesson"}</h1>
          </div>
          <Button asChild variant="outline"><Link to="/learn"><BookOpen className="mr-2 h-4 w-4" /> All lessons</Link></Button>
        </div>

        {isLoading ? (
          <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading lesson…</Card>
        ) : error || !video ? (
          <Card className="p-8 text-center">
            <h2 className="font-semibold">Lesson not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">This video may have been removed or is no longer available in learning.</p>
            <Button asChild className="mt-4"><Link to="/learn">Return to learning</Link></Button>
          </Card>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <VideoPlayerDialog
                videoId={video.youtube_id}
                title={video.title}
                alignment={video.player_alignment ?? "center"}
                onClose={() => void navigate({ to: "/learn" })}
              />
              {video.description && (
                <Card className="mt-5 p-5">
                  <h2 className="font-semibold">About this lesson</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{video.description}</p>
                  <p className="mt-4 text-xs text-muted-foreground">Shared by {video.profiles?.display_name || video.profiles?.username || "ExpertsTeam community"}</p>
                </Card>
              )}
            </div>
            <aside className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 lg:sticky lg:top-24">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></div>
              <h2 className="mt-3 font-display text-lg font-semibold">Learn by doing</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Open the floating code workspace to write HTML, CSS and JavaScript, then see your result beside the editor without leaving this lesson.</p>
              <p className="mt-4 text-xs text-muted-foreground">Tip: pause the video, try the example, then continue watching.</p>
            </aside>
          </div>
        )}
        {video && <LearningCodePlayground />}
      </main>
    </PageShell>
  );
}
