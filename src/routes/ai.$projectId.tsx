import { createFileRoute } from "@tanstack/react-router";
import { AgentStudioWorkspace } from "@/components/agent-studio-workspace";

export const Route = createFileRoute("/ai/$projectId")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "ExpertsTeam — Agent Studio Project" },
      { name: "description", content: "Private project workspace in ExpertsTeam Agent Studio." },
    ],
  }),
  component: AgentProjectPage,
});

function AgentProjectPage() {
  const { projectId } = Route.useParams();
  return <AgentStudioWorkspace key={projectId} projectId={projectId} />;
}
