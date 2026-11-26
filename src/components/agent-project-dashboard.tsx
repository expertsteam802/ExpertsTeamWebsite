import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Code2, FolderCode, Plus, Clock3, ExternalLink, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { STARTER_FILES } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AgentProject = {
  id: string;
  name: string;
  description: string;
  framework: string;
  updated_at: string;
  thumbnail_url: string | null;
};

export function AgentProjectDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const projects = useQuery({
    queryKey: ["agent-studio-projects", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("agent_projects")
        .select("id,name,description,framework,updated_at,thumbnail_url")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentProject[];
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to create a project.");
      const name = newName.trim();
      if (name.length < 2) throw new Error("Project name must be at least 2 characters.");
      const { data, error } = await supabase
        .from("agent_projects")
        .insert({
          user_id: user.id,
          name: name.slice(0, 80),
          description: "",
          framework: "vite",
          files: STARTER_FILES,
          workspace_settings: {},
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["agent-studio-projects", user?.id] });
      toast.success("Project created.");
      void navigate({ to: "/ai/$projectId", params: { projectId: id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyProjectLink = async (id: string) => {
    const url = new URL(`/ai/${id}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Project link copied.");
    } catch {
      toast.error("Could not copy the project link.");
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-[70dvh] items-center justify-center bg-[#0b0e14] px-5 text-slate-100">
        <div className="max-w-sm text-center">
          <Code2 className="mx-auto mb-4 h-10 w-10 text-blue-400" />
          <h1 className="text-xl font-semibold">Sign in to Agent Studio</h1>
          <p className="mt-2 text-sm text-slate-400">Your projects are saved to your private workspace.</p>
          <Link to="/auth"><Button className="mt-5">Sign in</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#0b0e14] px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><Code2 size={22} /></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-blue-300">ExpertsTeam</p><h1 className="text-2xl font-semibold">Your projects</h1><p className="mt-1 text-sm text-slate-400">Open a workspace or create something new.</p></div>
          </div>
          <Button onClick={() => setShowCreate(v => !v)} className="gap-2"><Plus size={16} /> New project</Button>
        </header>

        {showCreate && (
          <form className="mt-6 flex max-w-xl flex-col gap-3 rounded-xl border border-white/10 bg-[#111722] p-4 sm:flex-row" onSubmit={e => { e.preventDefault(); createProject.mutate(); }}>
            <Input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="My first app" maxLength={80} className="border-white/10 bg-[#090c12] text-slate-100" />
            <Button type="submit" disabled={createProject.isPending || newName.trim().length < 2}>{createProject.isPending ? "Creating…" : "Create project"}</Button>
          </form>
        )}

        {projects.isLoading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading your projects…</div>
        ) : projects.isError ? (
          <div className="py-20 text-center text-sm text-rose-300">Could not load your projects. Please refresh and try again.</div>
        ) : projects.data?.length ? (
          <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map(project => (
              <article key={project.id} className="group overflow-hidden rounded-xl border border-white/10 bg-[#111722] transition hover:border-blue-400/40 hover:bg-[#141c29]">
                <Link to="/ai/$projectId" params={{ projectId: project.id }} className="block p-5">
                  <div className="mb-5 flex h-28 items-center justify-center rounded-lg border border-white/5 bg-gradient-to-br from-blue-500/10 via-slate-900 to-indigo-500/10 text-blue-300">
                    {project.thumbnail_url ? <img src={project.thumbnail_url} alt="" className="h-full w-full object-cover" /> : <FolderCode size={38} />}
                  </div>
                  <h2 className="truncate font-semibold text-slate-100 group-hover:text-blue-200">{project.name}</h2>
                  <p className="mt-1 min-h-10 line-clamp-2 text-sm text-slate-400">{project.description || "No description yet"}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Clock3 size={13} /> Updated {new Date(project.updated_at).toLocaleDateString()}</div>
                </Link>
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-slate-500">{project.framework || "Project"}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" title="Copy project link" onClick={() => void copyProjectLink(project.id)}><Copy size={14} /></Button>
                    <Link to="/ai/$projectId" params={{ projectId: project.id }}><Button variant="ghost" size="icon" title="Open project"><ExternalLink size={14} /></Button></Link>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="mt-12 rounded-2xl border border-dashed border-white/15 px-5 py-16 text-center">
            <FolderCode className="mx-auto mb-4 h-10 w-10 text-slate-600" />
            <h2 className="text-lg font-semibold">Your workspace starts here</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Create your first project. Every project gets its own permanent workspace link.</p>
            <Button className="mt-5 gap-2" onClick={() => setShowCreate(true)}><Plus size={16} /> Create project</Button>
          </div>
        )}
      </div>
    </main>
  );
}
