import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppWindow, FolderOpen, Gamepad2 } from "lucide-react";

import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { PageShell } from "@/components/layout/page-shell";
import { UploadDialog } from "@/components/upload-dialog";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/entertainment")({
  head: () => ({
    meta: [
      { title: "Games, Apps & Files — ExpertsTeam" },
      { name: "description", content: "Discover games, useful apps and downloadable files shared by ExpertsTeam members." },
      { property: "og:title", content: "Games, Apps & Files — ExpertsTeam" },
      { property: "og:description", content: "Community games, apps and useful files on ExpertsTeam." },
    ],
  }),
  component: EntertainmentPage,
});

const SECTIONS = [
  { id: "games", label: "Games", icon: Gamepad2, description: "Play and discover games shared by members." },
  { id: "apps", label: "Apps & files", icon: AppWindow, description: "Explore useful apps, tools and downloadable resources." },
] as const;

function EntertainmentPage() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("games");
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files", "games-apps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("files").select("*, profiles(username, display_name)")
        .in("category", ["game", "app", "resource"]).order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CommunityFile[];
    },
  });
  const games = files.filter((file) => file.category === "game");
  const appsAndFiles = files.filter((file) => file.category !== "game");
  const active = SECTIONS.find((item) => item.id === section)!;

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Discover and share</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-5xl">Games, <span className="brand-text">Apps & Files</span></h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">A dedicated space for community games, apps and useful downloads. Choose a section from the side panel.</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-border/70 bg-card p-3 lg:sticky lg:top-24">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Explore library</p>
          <nav className="flex gap-2 lg:flex-col">
            {SECTIONS.map((item) => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition lg:w-full lg:flex-none ${section === item.id ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                <item.icon className="h-5 w-5 shrink-0" /><span className="text-sm font-semibold">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Community library</p><h2 className="mt-1 font-display text-2xl font-bold">{active.label}</h2><p className="mt-1 text-sm text-muted-foreground">{active.description}</p></div>
            <UploadDialog key={section} defaultCategory={section === "games" ? "game" : "app"} />
          </div>
          {isLoading ? <Card className="p-8 text-sm text-muted-foreground">Loading community files…</Card> : section === "games" ? <FileGrid files={games} /> : <FileGrid files={appsAndFiles} />}
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><FolderOpen className="h-4 w-4" /> Members can share their own games, apps and useful files.</div>
        </div>
      </section>
    </PageShell>
  );
}
