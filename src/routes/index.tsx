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
  Play,
  Rocket,
  Sparkles,
  TerminalSquare,
  Users,
  WandSparkles,
} from "lucide-react";

import { AdSlot } from "@/components/ads/ad-slot";
import { PageShell } from "@/components/layout/page-shell";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Expertsteam802 | ExpertsTeam Coding & AI Studio" },
      {
        name: "description",
        content:
          "Expertsteam802 is the official ExpertsTeam website to ask any question and get help, learn to code with Christo and become a pro coder, build apps with AI, and explore creator videos and developer projects.",
      },
      { property: "og:title", content: "Expertsteam802 | ExpertsTeam Coding & AI Studio" },
      {
        property: "og:description",
        content:
          "Visit Expertsteam802 to get community answers, learn coding with Christo, become a pro coder, build with ExpertAI and explore developer resources.",
      },
    ],
  }),
  component: Index,
});

const CAPABILITIES = [
  {
    icon: WandSparkles,
    number: "01",
    title: "Describe it. Start building.",
    body: "Turn a plain-language idea into a working project with ExpertAI, then refine the result as you go.",
    tag: "AI APP BUILDER",
  },
  {
    icon: Code2,
    number: "02",
    title: "Make the code yours.",
    body: "Open your files, edit the details, run your project and keep control of what gets changed.",
    tag: "CODE WORKSPACE",
  },
  {
    icon: TerminalSquare,
    number: "03",
    title: "See it come alive.",
    body: "Work in a browser-based terminal and preview your project as you build — without setting up a local machine first.",
    tag: "LIVE PREVIEW",
  },
  {
    icon: Users,
    number: "04",
    title: "Ask anything. Get answers.",
    body: "Get help with any question, find practical solutions and grow with creators, learners and developers in the ExpertsTeam community.",
    tag: "CREATOR COMMUNITY",
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
              YOUR NEXT IDEA STARTS HERE
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
                Think it.
                <br />
                <span className="brand-text">Build it.</span>
                <br />
                Make it real.
              </h1>
              <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                {settings.site_name} is your creative space to turn ideas into apps with AI, explore
                real code, learn by doing and share what you make.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/ai">
                <Button
                  size="lg"
                  className="group h-12 w-full px-6 text-sm font-semibold sm:w-auto"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open ExpertAI Studio
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to="/videos">
                <Button size="lg" variant="outline" className="h-12 w-full px-6 sm:w-auto">
                  <Play className="mr-2 h-4 w-4" />
                  Explore the platform
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
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-accent/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080d18] shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-2 text-[11px] font-medium tracking-wide text-slate-400">
                    EXPERTSTEAM / STUDIO
                  </span>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-300">
                  WORKSPACE
                </span>
              </div>

              <div className="grid min-h-[330px] grid-cols-[116px_1fr] sm:min-h-[390px] sm:grid-cols-[145px_1fr]">
                <aside className="border-r border-white/10 bg-white/[0.02] p-3 sm:p-4">
                  <div className="mb-6 flex items-center gap-2 text-xs font-bold text-white">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-cyan-300 to-violet-400 text-[11px] text-slate-950">
                      E
                    </span>
                    <span>Studio</span>
                  </div>
                  <div className="space-y-2 text-[10px] text-slate-400 sm:text-[11px]">
                    <div className="flex items-center gap-2 rounded-lg bg-cyan-300/10 px-2 py-2 text-cyan-200">
                      <WandSparkles className="h-3.5 w-3.5" /> Builder
                    </div>
                    <div className="flex items-center gap-2 px-2 py-2">
                      <Code2 className="h-3.5 w-3.5" /> Editor
                    </div>
                    <div className="flex items-center gap-2 px-2 py-2">
                      <TerminalSquare className="h-3.5 w-3.5" /> Terminal
                    </div>
                    <div className="mt-5 border-t border-white/10 pt-4 text-[9px] uppercase tracking-widest text-slate-600">
                      Your projects
                    </div>
                    <div className="truncate px-2 py-2 text-slate-300">✦ Launchpad</div>
                    <div className="truncate px-2 py-2">◈ Portfolio</div>
                  </div>
                </aside>

                <div className="flex min-w-0 flex-col p-4 sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                        New project
                      </p>
                      <h2 className="mt-1 font-display text-lg font-semibold text-white sm:text-xl">
                        What will you create?
                      </h2>
                    </div>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-200">
                      <Bot className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#0e1727] p-3 sm:p-4">
                    <p className="text-xs leading-6 text-slate-300 sm:text-sm">
                      Build a clean website for a creative studio with a project gallery, contact
                      form and a bold dark theme.
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                      <span className="text-[10px] text-slate-500">
                        Describe your idea in your own words…
                      </span>
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-300 text-slate-950">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <span className="h-px flex-1 bg-white/10" /> BUILD PROGRESS{" "}
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <div className="space-y-3">
                    {[
                      ["01", "Understand the idea", "Map pages and key features"],
                      ["02", "Create the experience", "Build the layout and components"],
                      ["03", "Preview and refine", "Test it, then polish the details"],
                    ].map(([number, title, detail], index) => (
                      <div
                        key={number}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3"
                      >
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${index === 0 ? "bg-cyan-300/15 text-cyan-200" : "bg-white/5 text-slate-500"}`}
                        >
                          {number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-200">{title}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{detail}</p>
                        </div>
                        {index === 0 ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                        ) : (
                          <span className="text-[10px] text-slate-600">NEXT</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-5 text-[10px] text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> A plan you can
                    review before the build begins
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.025] px-4 py-3 text-[10px] text-slate-500">
                <span>IDEAS → BUILD → PREVIEW</span>
                <span className="inline-flex items-center gap-1.5 text-cyan-300">
                  <Sparkles className="h-3 w-3" /> Made to create
                </span>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur sm:flex">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <Rocket className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold">From thought to launch</span>
                <span className="block text-[10px] text-muted-foreground">
                  One workspace. Your next move.
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <AdSlot slot="home-top" />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold tracking-[0.22em] text-primary">
            MORE THAN A PROMPT BOX
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

      <AdSlot slot="home-bottom" />

      <section className="border-y border-border/60 bg-surface/40 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-primary">
            OFFICIAL BRAND & CREATOR HOME
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
            Expertsteam802 — the official ExpertsTeam website
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            Expertsteam802 is the online home of ExpertsTeam, a creative technology platform by
            Chris Expert. Explore AI-assisted app building, practical programming resources, creator
            videos, community projects and beginner-friendly coding lessons.
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            Find the platform through searches for Expertsteam802, ExpertsTeam, Chris Expert,
            ChrisPrograms, AngeloCodes, Dismas, ExpertsTeamCoders, CodeWithExperts and
            LearnCodingWithChris. Ask any question in our community and get help, or start with the{" "}
            <Link to="/learn" className="font-medium text-primary hover:underline">
              coding lessons
            </Link>
            , explore the{" "}
            <Link to="/videos" className="font-medium text-primary hover:underline">
              creator video library
            </Link>
            , or try the{" "}
            <Link to="/ai" className="font-medium text-primary hover:underline">
              ExpertAI app-building workspace
            </Link>
            .
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
