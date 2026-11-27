import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AgentStudioWorkspace } from "@/components/agent-studio-workspace";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { projectSlug } from "@/lib/agent-project-slug";

export const Route = createFileRoute("/agent/$projectName")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "ExpertsTeam — Agent Studio" }, { name: "description", content: "Private project workspace in ExpertsTeam Agent Studio." }] }),
  component: AgentProjectPage,
});

function AgentProjectPage() {
  const { projectName } = Route.useParams();
  const { user, loading } = useAuth();
  const projects = useQuery({
    queryKey: ["agent-project-route", user?.id, projectName], enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("agent_projects").select("id,name").eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const project = projects.data?.find((item) => item.id === projectName || projectSlug(item, projects.data ?? []) === projectName);
  if (loading) return <main className="grid h-screen place-items-center bg-[#070B14] text-sm text-[#94A3B8]">Restoring your session…</main>;
  if (!user) return <main className="grid h-screen place-items-center bg-[#070B14] text-[#CBD5E1]"><a href="/auth" className="underline">Sign in to open this project</a></main>;
  if (projects.isLoading) return <main className="grid h-screen place-items-center bg-[#070B14] text-sm text-[#94A3B8]">Finding your project…</main>;
  if (projects.isError) return <main className="grid h-screen place-items-center bg-[#070B14] text-sm text-rose-300">Could not load your projects. Please refresh and try again.</main>;
  if (!project) return <main className="grid h-screen place-items-center bg-[#070B14] px-6 text-center text-sm text-[#CBD5E1]"><div><p>Project not found.</p><a href="/ai" className="mt-3 inline-block text-cyan-300 underline">Back to Agent Studio</a></div></main>;
  return <AgentStudioWorkspace key={project.id} projectId={project.id} />;
}
