import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { buildSrcDoc, type ProjectFiles } from "@/lib/sandbox";

export const Route = createFileRoute("/apps/$slug")({
  head: () => ({
    meta: [
      { title: "Live app — ExpertsTeam" },
      {
        name: "description",
        content: "An app built and published with the ExpertsTeam coding agent.",
      },
      { property: "og:title", content: "Live app — ExpertsTeam" },
      {
        property: "og:description",
        content: "An app built and published with the ExpertsTeam coding agent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveApp,
});

function LiveApp() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["live-app", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_projects")
        .select("name, files")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      return data as { name: string; files: ProjectFiles } | null;
    },
  });
  const srcDoc = useMemo(() => (data ? buildSrcDoc(data.files) : ""), [data]);

  return (
    <PageShell>
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold">{data?.name ?? "Live app"}</h1>
          <Link
            to="/ai"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Build your own
          </Link>
        </div>
        <Card className="overflow-hidden p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading app…</p>
          ) : data ? (
            <iframe
              title={data.name}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="h-[80vh] w-full bg-background"
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">This app isn't published.</p>
          )}
        </Card>
      </section>
    </PageShell>
  );
}
