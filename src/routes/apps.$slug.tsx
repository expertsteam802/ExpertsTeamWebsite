import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

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
        .select("name, files, deployment_url")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      return data as { name: string; files: ProjectFiles; deployment_url: string | null } | null;
    },
  });
  const srcDoc = useMemo(() => (data ? buildSrcDoc(data.files) : ""), [data]);

  return (
    <main className="min-h-screen w-screen overflow-hidden bg-white text-slate-900">
      {isLoading ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading published app…</div>
      ) : data ? (
        <iframe
          title={data.name}
          src={data.deployment_url ?? undefined}
          srcDoc={data.deployment_url ? undefined : srcDoc}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          className="fixed inset-0 h-screen w-screen border-0 bg-white"
        />
      ) : (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-semibold">This app is not published</h1>
          <p className="max-w-md text-sm text-slate-600">The owner may have unpublished it or the link may be incorrect.</p>
        </div>
      )}
    </main>
  );
}
