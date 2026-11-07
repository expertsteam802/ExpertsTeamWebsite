import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, FileText, GraduationCap, Video } from "lucide-react";

import { AddVideoDialog } from "@/components/add-video-dialog";
import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { PageShell } from "@/components/layout/page-shell";
import { UploadDialog } from "@/components/upload-dialog";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn to Code — Become a Pro Coder | ExpertsTeam" },
      { name: "description", content: "Learn to code, become a pro coder, and study programming through beginner-friendly lessons, books, files and videos." },
      { property: "og:title", content: "Learn to Code — Become a Pro Coder" },
      { property: "og:description", content: "Learn programming through coding lessons, books, videos and practical resources." },
    ],
  }),
  component: LearnPage,
});

const LESSONS = [
  { title: "1 · How code actually runs", body: "What a program is, how the computer reads instructions top to bottom, and how to set up your editor." },
  { title: "2 · Variables & data", body: "Numbers, text, booleans and lists — the boxes every app stores its information in." },
  { title: "3 · Logic & loops", body: "if/else decisions and loops that repeat work for you, with small practice challenges." },
  { title: "4 · Functions & reuse", body: "Wrap logic into functions so your project stays small, readable and easy to fix." },
  { title: "5 · Building a real app", body: "HTML, CSS and JavaScript together: layout, styling and interaction in one small project." },
  { title: "6 · Databases & the web", body: "How apps save data, log people in and talk to a server — the ideas behind this very site." },
];

const SECTIONS = [
  { id: "library", label: "Books & files", icon: BookOpen, hint: "Read and download resources" },
  { id: "videos", label: "Learning videos", icon: Video, hint: "Watch tutorials and walkthroughs" },
  { id: "lessons", label: "Coding lessons", icon: GraduationCap, hint: "Learn the foundations step by step" },
] as const;

function LearnPage() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("library");
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["files", "learn-library"],
    queryFn: async () => {
      const { data, error } = await supabase.from("files").select("*, profiles(username, display_name)")
        .in("category", ["book", "lesson", "resource", "file"]).order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CommunityFile[];
    },
  });
  const { data: videos = [], isLoading: videosLoading } = useQuery({
    queryKey: ["videos", "learn"],
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*, profiles(username, display_name)")
        .eq("category", "lesson").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VideoItem[];
    },
  });

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Your learning space</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-5xl">Learn to <span className="brand-text">code</span></h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Start as a beginner, practise step by step and grow into a pro coder with coding lessons, books, downloadable files and tutorial videos.</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-border/70 bg-card p-3 lg:sticky lg:top-24">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Learn menu</p>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {SECTIONS.map((item) => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={`flex min-w-max flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition lg:w-full lg:flex-none ${section === item.id ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="hidden text-[11px] opacity-75 sm:block">{item.hint}</span></span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          {section === "library" && (
            <div>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Resource library</p><h2 className="mt-1 font-display text-2xl font-bold">Books & files</h2><p className="mt-1 text-sm text-muted-foreground">Browse the available study material first. Upload is below the library.</p></div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{files.length} resources</span>
              </div>
              {filesLoading ? <Card className="p-8 text-sm text-muted-foreground">Loading books and files…</Card> : <FileGrid files={files} />}
              <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/60 p-5">
                <div className="mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h3 className="font-semibold">Share a learning resource</h3></div>
                <p className="mb-4 text-sm text-muted-foreground">Add a book, notes or a useful file for other learners.</p>
                <UploadDialog defaultCategory="book" />
              </div>
            </div>
          )}
          {section === "videos" && (
            <div>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Watch and practise</p><h2 className="mt-1 font-display text-2xl font-bold">Learning videos</h2><p className="mt-1 text-sm text-muted-foreground">Tutorials and practical walkthroughs shared by the community.</p></div>
                <AddVideoDialog category="lesson" triggerLabel="Add learning video" />
              </div>
              {videosLoading ? <Card className="p-8 text-sm text-muted-foreground">Loading videos…</Card> : <VideoGrid videos={videos} />}
            </div>
          )}
          {section === "lessons" && (
            <div>
              <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Start here</p><h2 className="mt-1 font-display text-2xl font-bold">Coding lessons</h2><p className="mt-1 text-sm text-muted-foreground">A simple path from the basics to building a real app.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">{LESSONS.map((lesson) => <Card key={lesson.title} className="animate-rise gap-2 p-5 transition-transform duration-300 hover:-translate-y-1 hover:glow-panel"><h3 className="font-display text-lg font-semibold">{lesson.title}</h3><p className="text-sm leading-6 text-muted-foreground">{lesson.body}</p></Card>)}</div>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
