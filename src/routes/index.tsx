import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Gamepad2,
  Palette,
  Play,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import heroImage from "@/assets/hero-chris-programs.jpg";
import { PageShell } from "@/components/layout/page-shell";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chris Programs — Watch, Learn & Share Code" },
      {
        name: "description",
        content:
          "Chris Programs is the home of Chris Expert: watch every channel video inside the site, download games and resources, learn to code and join the community.",
      },
      { property: "og:title", content: "Chris Programs — Watch, Learn & Share Code" },
      {
        property: "og:description",
        content:
          "Chris Programs is the home of Chris Expert: watch every channel video inside the site, download games and resources, learn to code and join the community.",
      },
    ],
  }),
  component: Index,
});

const FEATURES = [
  {
    icon: Play,
    title: "Watch in-site",
    body: "Paste a YouTube share link and the video plays here — no leaving the site.",
  },
  {
    icon: UploadCloud,
    title: "200MB uploads",
    body: "Share games, videos and resources with a live upload percentage.",
  },
  {
    icon: BookOpen,
    title: "Learn to code",
    body: "Lessons, books and app breakdowns curated by Chris.",
  },
  {
    icon: Gamepad2,
    title: "Entertainment",
    body: "Community games and clips, with original file icons preserved.",
  },
  {
    icon: Palette,
    title: "Your look",
    body: "Three themes plus tab alignment you control from the header.",
  },
  {
    icon: ShieldCheck,
    title: "Creator controls",
    body: "The first signup becomes the creator with a full admin panel.",
  },
];

function Index() {
  const settings = useSiteSettings();

  const { data: videos } = useQuery({
    queryKey: ["videos", "featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles(username, display_name)")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as VideoItem[];
    },
  });

  return (
    <PageShell>
      <section className="hero-surface relative overflow-hidden border-b border-border/60">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 lg:grid-cols-2 lg:py-28">
          <div className="animate-rise space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-accent" /> Built by Chris Expert
            </span>
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl">
              <span className="brand-text">{settings.site_name}</span>
              <br />
              {settings.tagline}
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              One place to watch the whole archive, grab games and resources, learn to code and
              build with the community.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/videos">
                <Button size="lg" className="animate-pulse-glow">
                  Watch the archive
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="secondary">
                  Join the community
                </Button>
              </Link>
            </div>
          </div>

          <div className="animate-float relative">
            <img
              src={heroImage}
              alt="Chris coding at night surrounded by glowing code panels"
              width={1600}
              height={1008}
              className="rounded-3xl border border-border/60 object-cover glow-panel"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">What you can do here</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="animate-rise gap-2 p-6 transition-transform duration-300 hover:-translate-y-1 hover:glow-panel"
            >
              <feature.icon className="h-6 w-6 text-primary" />
              <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Latest videos</h2>
          <Link to="/videos" className="text-sm text-primary hover:underline">
            See the full archive →
          </Link>
        </div>
        <div className="mt-8">
          <VideoGrid videos={videos ?? []} />
        </div>
      </section>

    </PageShell>
  );
}
