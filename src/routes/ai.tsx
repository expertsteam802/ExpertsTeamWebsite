import { createFileRoute } from "@tanstack/react-router";
import { AgentProjectDashboard } from "@/components/agent-project-dashboard";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "ExpertsTeam — Agent Studio" },
      {
        name: "description",
        content: "Edit project files in ExpertsTeam Agent Studio.",
      },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  return <AgentProjectDashboard />;
}
