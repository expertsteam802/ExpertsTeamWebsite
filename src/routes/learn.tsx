import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { AdSlot } from "@/components/ads/ad-slot";
import { PageShell } from "@/components/layout/page-shell";
import { UploadDialog } from "@/components/upload-dialog";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn to code with Chris — ExpertsTeam" },
      {
        name: "description",
        content:
          "Coding basics, lesson notes, books and app breakdowns by Chris Expert. Start from variables and build real apps.",
      },
      { property: "og:title", content: "Learn to code with Chris" },
      {
        property: "og:description",
        content: "Free coding basics, books and lessons on ExpertsTeam.",
      },
    ],
  }),
  component: LearnPage,
});

const LESSONS = [
  {
    title: "1 · How code actually runs",
    body: "What a program is, how the computer reads instructions top to bottom, and how to set up your editor.",
  },
  {
    title: "2 · Variables & data",
    body: "Numbers, text, booleans and lists — the boxes every app stores its information in.",
  },
  {
    title: "3 · Logic & loops",
    body: "if/else decisions and loops that repeat work for you, with small practice challenges.",
  },
  {
    title: "4 · Functions & reuse",
    body: "Wrap logic into functions so your project stays small, readable and easy to fix.",
  },
  {
    title: "5 · Building a real app",
    body: "HTML, CSS and JavaScript together: layout, styling and interaction in one small project.",
  },
  {
    title: "6 · Databases & the web",
    body: "How apps save data, log people in and talk to a server — the ideas behind this very site.",
  },
];

function LearnPage() {
  const { data: files } = useQuery({
    queryKey: ["files", "lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*, profiles(username, display_name)")
        .eq("category", "lesson")
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
            Learn to code <span className="brand-text">with Chris</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Start from zero with the basics track, then dig into the books, notes and app files
            shared by Chris and the community.
          </p>
          <div className="mt-6">
            <UploadDialog defaultCategory="lesson" />
          </div>
        </div>
      </section>

      <AdSlot slot="learn-top" />

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="font-display text-2xl font-semibold">Basics track</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.map((lesson) => (
            <Card
              key={lesson.title}
              className="animate-rise gap-2 p-6 transition-transform duration-300 hover:-translate-y-1 hover:glow-panel"
            >
              <h3 className="font-display text-lg font-semibold">{lesson.title}</h3>
              <p className="text-sm text-muted-foreground">{lesson.body}</p>
            </Card>
          ))}
        </div>

        <h2 className="mt-14 font-display text-2xl font-semibold">Books, notes & app files</h2>
        <div className="mt-6">
          <FileGrid files={files ?? []} />
        </div>
      </section>
      <AdSlot slot="learn-bottom" />
    </PageShell>
  );
}
