import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { buildSrcDoc, type ProjectFiles } from "@/lib/sandbox";

export const Route = createFileRoute("/apps/$slug")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Published app" },
      {
        name: "description",
        content: "A standalone app published from a browser development workspace.",
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
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["live-app", slug],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_projects")
        .select("name, deployment_url")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.deployment_url)
        return data as { name: string; deployment_url: string | null; files?: ProjectFiles } | null;

      const { data: legacy, error: legacyError } = await supabase
        .from("agent_projects")
        .select("files")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (legacyError) throw legacyError;
      return {
        ...data,
        files: (legacy?.files ?? {}) as ProjectFiles,
      } as { name: string; deployment_url: string | null; files?: ProjectFiles };
    },
  });
  const srcDoc = useMemo(() => (data?.files ? buildSrcDoc(data.files) : ""), [data]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-500">
        Checking your sign-in…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center text-slate-900">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-2xl" aria-hidden="true">
          🔒
        </div>
        <h1 className="text-2xl font-semibold">Sign in to access this app</h1>
        <p className="max-w-md text-sm text-slate-600">
          Published ExpertsTeam apps are available to signed-in members. Sign in or create a free
          account to continue.
        </p>
        <Link
          to="/auth"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Sign in or create account
        </Link>
        <Link to="/" className="text-sm text-slate-500 underline underline-offset-4">
          Back to ExpertsTeam
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-screen overflow-hidden bg-white text-slate-900">
      {isLoading ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Loading published app…
        </div>
      ) : data ? (
        <iframe
          title={data.name}
          src={data.deployment_url ?? undefined}
          srcDoc={data.deployment_url ? undefined : srcDoc}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
          className="fixed inset-0 h-screen w-screen border-0 bg-white"
        />
      ) : (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-semibold">This app is not published</h1>
          <p className="max-w-md text-sm text-slate-600">
            The owner may have unpublished it or the link may be incorrect.
          </p>
        </div>
      )}
    </main>
  );
}
