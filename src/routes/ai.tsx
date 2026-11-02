import { createFileRoute } from "@tanstack/react-router";

import { CodeAgent } from "@/components/code-agent";
import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "ExpertsAgent — full builder workspace" },
      {
        name: "description",
        content:
          "ExpertsAgent is a full-stack app-building workspace with project files, preview, console, publishing, and GitHub sync.",
      },
      { property: "og:title", content: "ExpertsAgent — full builder workspace" },
      {
        property: "og:description",
        content:
          "Build, preview, edit, and publish apps from a full builder workspace inside Experts Team.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  return (
    <PageShell>
      <CodeAgent />
    </PageShell>
  );
}
