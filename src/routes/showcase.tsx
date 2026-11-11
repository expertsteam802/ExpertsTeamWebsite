import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Code2, Rocket } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type PublishedProject = {
  id: string;
  name: string;
  slug: string | null;
  updated_at: string;
  thumbnail_url: string | null;
};

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Project Showcase — Apps built with ExpertsTeam" },
      {
        name: "description",
        content:
          "Explore apps and projects published by ExpertsTeam members. Build your own project in the browser workspace.",
      },
      { property: "og:title", content: "ExpertsTeam Project Showcase" },
      {
        property: "og:description",
        content: "Real projects published by the ExpertsTeam community.",
      },
    ],
  }),
  component: ShowcasePage,
});

function ShowcasePage() {
  const {
    data: projects = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["public-project-showcase"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_projects")
        .select("id,name,slug,updated_at,thumbnail_url")
        .eq("published", true)
        .not("slug", "is", null)
        .not("deployment_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as PublishedProject[];
    },
  });

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Made by the community
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Project showcase
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Explore apps published by ExpertsTeam members. Every card links directly to the app,
              without the main site interface.
            </p>
          </div>
          <Button asChild>
            <Link to="/ai">
              <Rocket className="mr-2 h-4 w-4" /> Build and publish
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="mt-10 text-sm text-muted-foreground">Loading published projects…</div>
        ) : error ? (
          <Card className="mt-10 p-6 text-sm text-muted-foreground">
            The showcase is temporarily unavailable. Please try again later.
          </Card>
        ) : projects.length ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="group flex min-h-52 flex-col justify-between overflow-hidden p-5 transition-colors hover:border-primary/40"
              >
                <div>
                  {project.thumbnail_url ? (
                    <img src={project.thumbnail_url} alt={project.name + " project thumbnail"} loading="lazy" className="mb-4 aspect-video w-full rounded-xl border border-border/60 bg-secondary object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Code2 className="h-5 w-5" />
                    </div>
                  )}
                  <h2 className="mt-5 font-display text-xl font-semibold">{project.name}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  to="/apps/$slug"
                  params={{ slug: project.slug ?? "" }}
                  className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Open published app{" "}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-10 flex flex-col items-center px-6 py-14 text-center">
            <Rocket className="h-9 w-9 text-primary" />
            <h2 className="mt-4 font-display text-xl font-semibold">
              The first project can be yours
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              There are no public apps in the showcase yet. Open the workspace, build something and
              publish it to give it a shareable URL.
            </p>
            <Button asChild className="mt-5">
              <Link to="/ai">Open workspace</Link>
            </Button>
          </Card>
        )}
      </main>
    </PageShell>
  );
}
