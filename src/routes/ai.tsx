import { Component, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";

class StudioRenderBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ExpertsTeam Studio] Render failed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-semibold text-foreground">ExpertsTeam Studio hit a rendering error.</p>
          <p className="max-w-2xl break-words text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
          >
            Reload Studio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
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
  const [Studio, setStudio] = useState<ComponentType | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // The editor bundles CodeMirror and xterm, which depend on browser APIs.
  // Load the workspace only after hydration so those modules are never
  // evaluated during the server render of /ai.
  useEffect(() => {
    let active = true;
    import("@/components/code-agent")
      .then(({ CodeAgent }) => {
        if (active) setStudio(() => CodeAgent);
      })
      .catch((error) => {
        console.error("[ExpertsTeam Studio] Could not load the editor bundle:", error);
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="expert-ai-page fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <section className="relative min-h-0 flex-1 overflow-hidden" aria-label="ExpertAI application builder">
        <div aria-hidden="true" className="et-ai-cinematic-backdrop pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="et-ai-cinematic-atmosphere pointer-events-none absolute inset-0" />
        <div className="relative h-full min-h-0 overflow-hidden">
          {Studio ? (
            <StudioRenderBoundary><Studio /></StudioRenderBoundary>
          ) : loadFailed ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              ExpertsTeam Studio could not load. Refresh the page to try again.
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Preparing ExpertsTeam Studio…
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
