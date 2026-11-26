import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "ExpertsTeam — Agent Studio" },
      {
        name: "description",
        content: "ExpertsTeam Agent Studio.",
      },
    ],
  }),
  component: AiPage,
});

/**
 * Agent Studio is intentionally reset to an empty foundation.
 * The navigation tab and backend AI request-routing endpoints remain intact.
 * New Studio features will be rebuilt incrementally.
 */
function AiPage() {
  return (
    <main
      className="fixed inset-0 z-40 h-[100dvh] w-full overflow-hidden bg-background"
      aria-label="Agent Studio"
    />
  );
}
