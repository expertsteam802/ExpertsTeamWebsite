import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Code2, MessageSquare, Users, Link2, Save } from "lucide-react";

import { AdSlot } from "@/components/ads/ad-slot";
import { ChrisAiChat } from "@/components/chris-ai";
import { CodeAgent } from "@/components/code-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "ExpertsTeam — ExpertAI Studio" },
      {
        name: "description",
        content: "Build, edit, preview, and publish applications in the ExpertsTeam workspace.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  const [activeView, setActiveView] = useState<"builder" | "chat">("builder");
  const { isAdmin } = useAuth();
  const settings = useSiteSettings();
  const queryClient = useQueryClient();
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [savingOllama, setSavingOllama] = useState(false);
  useEffect(() => { setOllamaUrl(settings.ollama_url ?? ""); }, [settings.ollama_url]);
  async function saveOllamaUrl() {
    const cleanUrl = ollamaUrl.trim().replace(/\/+$/, "");
    if (cleanUrl) {
      try {
        const parsed = new URL(cleanUrl);
        if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".loca.lt")) {
          throw new Error("Use your HTTPS LocalTunnel URL ending in .loca.lt.");
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Enter a valid LocalTunnel URL.");
        return;
      }
    }
    setSavingOllama(true);
    try {
      const current = settings.ad_settings && typeof settings.ad_settings === "object" && !Array.isArray(settings.ad_settings)
        ? settings.ad_settings as Record<string, unknown> : {};
      const currentBranding = current.siteBranding && typeof current.siteBranding === "object" && !Array.isArray(current.siteBranding)
        ? current.siteBranding as Record<string, unknown> : {};
      const { error } = await supabase.from("site_settings").update({
        ad_settings: { ...current, siteBranding: { ...currentBranding, ollama_url: cleanUrl } },
      }).eq("id", 1);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      window.alert(cleanUrl ? "Ollama endpoint saved. ExpertAI will use it for text requests." : "Ollama endpoint cleared.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not save the Ollama endpoint.");
    } finally {
      setSavingOllama(false);
    }
  }

  return (
    <main className="fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070b13] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b111d] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label="Back to ExpertsTeam website"
            title="Back to website"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-cyan-300/40 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <img src="/expertai-mark.svg" alt="ExpertAI" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide">EXPERTAI STUDIO</span>
              <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300 sm:inline">
                WORKSPACE
              </span>
            </div>
            <p className="hidden text-[10px] text-slate-400 sm:block">Build. Test. Ship.</p>
          </div>
        </div>

        <nav aria-label="ExpertAI workspace" className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setActiveView("builder")}
            aria-pressed={activeView === "builder"}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${activeView === "builder" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <Code2 className="h-4 w-4" />
            <span>Agent</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("chat")}
            aria-pressed={activeView === "chat"}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${activeView === "chat" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>AI Chat</span>
          </button>
        </nav>

        <Link
          to="/community"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Community</span>
        </Link>
      </header>

      {isAdmin && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b111d] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-200">
            <Link2 className="h-4 w-4" /> Ollama endpoint
          </div>
          <Input
            aria-label="Colab Ollama endpoint URL"
            value={ollamaUrl}
            onChange={(event) => setOllamaUrl(event.target.value)}
            placeholder="https://your-tunnel.loca.lt"
            className="h-8 min-w-[220px] flex-1 border-white/10 bg-white/5 text-xs text-white placeholder:text-slate-500"
          />
          <Button size="sm" onClick={() => void saveOllamaUrl()} disabled={savingOllama} className="h-8">
            <Save className="mr-1.5 h-3.5 w-3.5" /> {savingOllama ? "Saving…" : "Save URL"}
          </Button>
          <span className="w-full text-[10px] text-slate-500">Update this whenever Colab creates a new LocalTunnel link. Ollama is preferred for text; configured API providers remain fallback.</span>
        </div>
      )}
      <AdSlot slot="ai-top" />
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div className={`h-full min-h-0 overflow-hidden ${activeView === "builder" ? "block" : "hidden"}`}>
          <CodeAgent />
        </div>
        <div className={`h-full min-h-0 overflow-hidden ${activeView === "chat" ? "block" : "hidden"}`}>
          <ChrisAiChat />
        </div>
      </section>
      <AdSlot slot="ai-bottom" />
    </main>
  );
}
