import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  Code2,
  Compass,
  Cpu,
  Gamepad2,
  Layers3,
  MessageCircle,
  Rocket,
  Sparkles,
  TerminalSquare,
  Users,
  WandSparkles,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ExpertsTeam — Learn, Code, Play & Free Downloads" },
      {
        name: "description",
        content: "Learn coding, build apps, play games and download free apps, games and files.",
      },
      { property: "og:title", content: "ExpertsTeam — Learn, Code, Play & Free Downloads" },
      {
        property: "og:description",
        content:
          "Learn to code, build apps, connect with creators and request custom software from ExpertsTeam.",
      },
      { property: "og:url", content: "https://expertsteam.giize.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ExpertsTeam — Learn, Build & Connect" },
      {
        name: "twitter:description",
        content: "Learn coding, build software, connect with creators and request custom apps.",
      },
      { property: "og:image", content: "https://expertsteam.giize.com/experts-team-brand.svg" },
      { name: "twitter:image", content: "https://expertsteam.giize.com/experts-team-brand.svg" },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/" }],
  }),
  component: Index,
});

const CAPABILITIES = [
  {
    icon: Code2,
    number: "01",
    title: "Learn by building.",
    body: "Follow practical coding lessons and turn what you learn into real projects.",
    tag: "LEARN TO CODE",
  },
  {
    icon: Gamepad2,
    number: "02",
    title: "Discover free downloads.",
    body: "Find games, apps, tools and useful files shared for the community.",
    tag: "GAMES, APPS & FILES",
  },
  {
    icon: Users,
    number: "03",
    title: "Grow with creators.",
    body: "Ask questions, share your work and find helpful answers in the ExpertsTeam community.",
    tag: "COMMUNITY",
  },
  {
    icon: WandSparkles,
    number: "04",
    title: "Build with ExpertAI.",
    body: "Get AI help when you need to plan, code, test or improve a project.",
    tag: "EXPERTAI STUDIO",
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
        .limit(3);
      if (error) throw error;
      return data as VideoItem[];
    },
  });

  return (
    <PageShell>
      <section className="hero-surface relative isolate overflow-hidden border-b border-border/60">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="animate-rise space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              LEARN · CODE · PLAY · CREATE
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
                Learn it.
                <br />
                <span className="brand-text">Code it.</span>
                <br />
                Play. Create. Share.
              </h1>
              <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                Learn coding, build apps, play games, find free downloads and connect with creators.
                ExpertAI is one of the tools here when you need a hand.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/explore">
                <Button
                  size="lg"
                  className="group h-12 w-full px-6 text-sm font-semibold sm:w-auto"
                >
                  <Compass className="mr-2 h-4 w-4" />
                  Explore ExpertsTeam
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to="/ai">
                <Button size="lg" variant="outline" className="h-12 w-full px-6 sm:w-auto">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open ExpertAI
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> AI-assisted creation
              </span>
              <span className="inline-flex items-center gap-2">
                <Braces className="h-4 w-4 text-primary" /> Real editable code
              </span>
              <span className="inline-flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" /> Learn as you build
              </span>
            </div>
          </div>

          <div className="animate-float relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary/20 via-transparent to-amber-400/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#081426] shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <img
                src="/experts-team-platform-visual.svg"
                alt="ExpertsTeam platform overview showing developer projects, learning, community and personal files"
                className="block h-auto w-full"
                loading="eager"
              />
            </div>
            <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur sm:flex">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold">More than an AI studio</span>
                <span className="block text-[10px] text-muted-foreground">
                  Learn · Connect · Create · Share
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold tracking-[0.22em] text-primary">
            ONE PLATFORM, MANY WAYS TO GROW
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            Everything you need to keep creating.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            A connected creative workflow — from the first rough idea to the details that make a
            project yours.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((item) => (
            <Card
              key={item.number}
              className="group relative overflow-hidden gap-4 p-6 transition-all duration-300 hover:-translate-y-1 hover:glow-panel"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="font-display text-sm text-muted-foreground/50">{item.number}</span>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.18em] text-primary">{item.tag}</p>
                <h3 className="mt-2 font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-surface/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-20">
          <div>
            <span className="text-xs font-semibold tracking-[0.22em] text-primary">
              A SIMPLE WAY TO START
            </span>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-bold sm:text-4xl">
              You bring the idea. We give you room to build.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              No need to know every technical step before you begin. Start with what you want to
              make, review the changes, and shape the result as you go.
            </p>
            <Link to="/ai" className="mt-7 inline-flex">
              <Button size="lg" className="group">
                Try ExpertAI{" "}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: MessageCircle, title: "Tell us", text: "Explain what you want to create." },
              {
                icon: Layers3,
                title: "Shape it",
                text: "Review the changes and guide the result.",
              },
              { icon: Rocket, title: "Launch it", text: "Preview, refine and keep ownership." },
            ].map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-border bg-card p-5">
                <span className="text-xs font-semibold text-primary">STEP 0{index + 1}</span>
                <step.icon className="my-5 h-6 w-6 text-primary" />
                <h3 className="font-display font-semibold">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {videos && videos.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold tracking-[0.22em] text-primary">
                FROM THE CREATOR
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                Watch. Learn. Get inspired.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Explore the latest videos and practical ideas from the ExpertsTeam creator
                community.
              </p>
            </div>
            <Link
              to="/videos"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              Browse all videos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8">
            <VideoGrid videos={videos} />
          </div>
        </section>
      )}
      <section className="border-y border-border/60 bg-surface/40 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-primary">
            ONE COMMUNITY. MANY WAYS TO CREATE.
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
            Welcome to ExpertsTeam
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            Learn programming, explore practical tutorials, share questions with the community,
            build websites and apps, and discover free games, apps and downloadable resources.
            Whether you are just starting or already creating, ExpertsTeam gives you useful tools
            and a place to grow.
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            Start with{" "}
            <Link to="/learn" className="font-medium text-primary hover:underline">
              coding lessons
            </Link>
            , browse{" "}
            <Link to="/entertainment" className="font-medium text-primary hover:underline">
              free games, apps and files
            </Link>
            , meet creators in the{" "}
            <Link to="/community" className="font-medium text-primary hover:underline">
              community
            </Link>
            , or open{" "}
            <Link to="/ai" className="font-medium text-primary hover:underline">
              ExpertAI Studio
            </Link>{" "}
            when you want help building.
          </p>
        </div>
      </section>
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-8 sm:p-12 lg:p-14">
          <div className="absolute -right-12 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-primary">
                <Gamepad2 className="h-4 w-4" /> THE NEXT CHAPTER IS YOURS
              </span>
              <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
                Curious what you could make?
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
                Step into ExpertsTeam, explore the tools and turn that idea you have been thinking
                about into your next project.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link to="/auth">
                <Button size="lg" className="w-full sm:w-auto">
                  Create your account <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/community">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  <Users className="mr-2 h-4 w-4" /> Meet the community
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
