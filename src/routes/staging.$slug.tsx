import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStagingDeployment } from "@/lib/deployment.functions";

export const Route = createFileRoute("/staging/$slug")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Protected staging preview — ExpertsTeam" },
    ],
  }),
  component: StagingPreview,
});

function documentWithAssetBase(html: string, deploymentUrl: string) {
  const baseUrl = new URL(".", deploymentUrl).href;
  const safeBaseUrl = baseUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const baseTag = '<base href="' + safeBaseUrl + '">';
  const withoutExistingBase = html.replace(/<base\b[^>]*>/i, "");
  if (/<head\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<head\b[^>]*>/i, (head) => head + baseTag);
  }
  if (/<html\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<html\b[^>]*>/i, (htmlTag) => htmlTag + "<head>" + baseTag + "</head>");
  }
  return "<!doctype html><html><head>" + baseTag + "</head><body>" + withoutExistingBase + "</body></html>";
}

function StagingPreview() {
  const { slug } = Route.useParams();
  const [password, setPassword] = useState("");
  const [document, setDocument] = useState("");
  const [appName, setAppName] = useState("Staging preview");
  const getDeployment = useServerFn(getStagingDeployment);

  const unlock = useMutation({
    mutationFn: async () => {
      const result = await getDeployment({ data: { slug, password } });
      const response = await fetch(result.deploymentUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("The staging app could not be loaded.");
      const html = await response.text();
      const normalized = html.replace(/^\uFEFF/, "").trimStart().toLowerCase();
      if (!normalized.startsWith("<!doctype html") && !normalized.startsWith("<html")) {
        throw new Error("The staging release did not contain a valid HTML document.");
      }
      return { html: documentWithAssetBase(html, result.deploymentUrl), name: result.name };
    },
    onSuccess: (result) => {
      setDocument(result.html);
      setAppName(result.name);
      setPassword("");
    },
  });

  if (document) {
    return (
      <main className="fixed inset-0 bg-white">
        <iframe title={appName + " staging"} srcDoc={document} sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0 bg-white" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <form onSubmit={(event) => { event.preventDefault(); unlock.mutate(); }} className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><LockKeyhole className="h-6 w-6" /></div>
        <div><h1 className="text-xl font-semibold">Protected staging preview</h1><p className="mt-1 text-sm text-slate-400">Enter the staging password supplied by the project owner.</p></div>
        <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Staging password" required maxLength={128} className="border-slate-700 bg-slate-950 text-white" />
        {unlock.isError && <p role="alert" className="text-sm text-rose-300">The staging app is unavailable or the password is incorrect.</p>}
        <Button type="submit" className="w-full" disabled={unlock.isPending || password.length < 1}>{unlock.isPending ? "Unlocking preview…" : "Unlock staging preview"}</Button>
      </form>
    </main>
  );
}
