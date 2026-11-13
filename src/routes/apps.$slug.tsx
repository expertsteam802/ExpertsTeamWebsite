import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/apps/$slug")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Published app — ExpertsTeam" },
      {
        name: "description",
        content: "A standalone app published from the ExpertsTeam development workspace.",
      },
      { property: "og:title", content: "Published app — ExpertsTeam" },
      {
        property: "og:description",
        content: "An application built and published with ExpertsTeam.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LiveApp,
});

function documentWithAssetBase(html: string, deploymentUrl: string) {
  const baseUrl = new URL(".", deploymentUrl).href;
  const safeBaseUrl = baseUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const baseTag = `<base href="${safeBaseUrl}">`;
  const withoutExistingBase = html.replace(/<base\b[^>]*>/i, "");
  if (/<head\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<head\b[^>]*>/i, (head) => head + baseTag);
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${withoutExistingBase}</body></html>`;
}

function LiveApp() {
  const { slug } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-live-app", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_projects")
        .select("name,deployment_url")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      if (!data?.deployment_url) return data ? { ...data, document: null as string | null } : null;
      const response = await fetch(data.deployment_url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`The published app could not be loaded (HTTP ${response.status}).`);
      }
      const html = await response.text();
      const normalizedHtml = html.replace(/^\uFEFF/, "").trimStart().toLowerCase();
      if (!normalizedHtml.startsWith("<!doctype html") && !normalizedHtml.startsWith("<html")) {
        throw new Error("The published entry file is not a valid HTML document.");
      }
      return { ...data, document: documentWithAssetBase(html, data.deployment_url) };
    },
  });

  return (
    <main className="min-h-screen w-screen overflow-hidden bg-white text-slate-900">
      {isLoading ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Loading published app…
        </div>
      ) : error ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-xl font-semibold">Could not load this app</h1>
          <p className="max-w-md text-sm text-slate-600">
            The published app could not be loaded. Please try again in a moment.
          </p>
          <Link to="/" className="text-sm font-semibold text-blue-700 underline">Back to ExpertsTeam</Link>
        </div>
      ) : data?.document ? (
        <iframe
          title={data.name}
          srcDoc={data.document}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className="fixed inset-0 h-screen w-screen border-0 bg-white"
        />
      ) : (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-semibold">This app is not published</h1>
          <p className="max-w-md text-sm text-slate-600">
            The owner may have unpublished it or the link may be incorrect.
          </p>
          <Link to="/" className="text-sm font-semibold text-blue-700 underline">Back to ExpertsTeam</Link>
        </div>
      )}
    </main>
  );
}
