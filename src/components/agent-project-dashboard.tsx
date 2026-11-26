import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Code2, FolderCode, Plus, Search, Copy, ExternalLink, Sparkles, Zap, Github, ImagePlus, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runCodingAgent } from "@/lib/agent.functions";
import { createFrameworkStarterFiles, detectAgentFramework, FRAMEWORK_OPTIONS, type AgentFramework } from "@/lib/framework-scaffolds";
import { saveProjectFiles } from "@/lib/project-files";

type AgentProject = { id:string; name:string; description:string; framework:string; updated_at:string; thumbnail_url:string|null };

const templates = [
  { label:"🎮 3D Racing Game", prompt:"Build a polished 3D racing game with a playable car, track, lap counter, and responsive controls.", framework:"vite" },
  { label:"🚀 Next.js SaaS Starter", prompt:"Build a full-stack SaaS starter with authentication screens, pricing, dashboard, and API route.", framework:"nextjs" },
  { label:"⚡ TanStack Full-Stack App", prompt:"Build a full-stack application with TanStack Start routes, data views, and server endpoints.", framework:"tanstack" },
  { label:"💚 Vue 3 Dashboard", prompt:"Build a modern Vue 3 analytics dashboard with charts, filters, and responsive navigation.", framework:"vue" },
] as const;

export function AgentProjectDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prompt,setPrompt] = useState("");
  const [framework,setFramework] = useState<"auto"|AgentFramework>("auto");
  const [modelTier,setModelTier] = useState<"fast"|"architect">("fast");
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState("all");
  const [busy,setBusy] = useState(false);
  const [menuId,setMenuId] = useState<string|null>(null);

  const projects = useQuery({
    queryKey:["agent-studio-projects",user?.id], enabled:Boolean(user),
    queryFn:async()=> {
      if(!user) return [];
      const {data,error}=await supabase.from("agent_projects").select("id,name,description,framework,updated_at,thumbnail_url").eq("user_id",user.id).order("updated_at",{ascending:false});
      if(error) throw error; return (data??[]) as AgentProject[];
    }
  });

  const visibleProjects = useMemo(()=> (projects.data??[]).filter(p=>{
    const matchesSearch=(p.name+" "+(p.description??"")).toLowerCase().includes(search.toLowerCase());
    const f=(p.framework??"").toLowerCase();
    const matchesFilter=filter==="all" || (filter==="nextjs" && f.includes("next")) || (filter==="tanstack" && f.includes("tanstack")) || (filter==="vite" && (f.includes("vite")||f==="react")) || (filter==="vue" && f.includes("vue"));
    return matchesSearch&&matchesFilter;
  }),[projects.data,search,filter]);

  const startProject = async (initialPrompt:string, blank=false) => {
    if(!user){toast.error("Sign in to create a project.");return;}
    if(busy)return;
    if(!blank && !initialPrompt.trim()){toast.error("Describe what you want to build first.");return;}
    setBusy(true);
    const chosen = framework==="auto" ? detectAgentFramework(initialPrompt) : framework;
    const name = blank ? "Untitled Project" : (initialPrompt.trim().split(/[.!?\n]/)[0]?.slice(0,56) || "New Project");
    const starter = createFrameworkStarterFiles(chosen,name);
    try {
      const {data,error}=await supabase.from("agent_projects").insert({
        user_id:user.id,name,description:initialPrompt.trim().slice(0,500),framework:chosen,files:{},workspace_settings:{}
      }).select("id").single();
      if(error) throw error;
      await saveProjectFiles(data.id,user.id,starter);
      if(!blank){
        const result = await runCodingAgent({prompt:initialPrompt,mode:"build",modelTier,framework:chosen,files:starter,history:[]});
        const generated = (result as {files?:Record<string,string|null>}).files ?? {};
        const merged = {...starter};
        for(const [path,value] of Object.entries(generated)){if(typeof value==="string") merged[path]=value; else if(value===null) delete merged[path];}
        await saveProjectFiles(data.id,user.id,merged);
      }
      await queryClient.invalidateQueries({queryKey:["agent-studio-projects",user.id]});
      toast.success(blank?"Blank project created.":"Your project is ready to open.");
      void navigate({to:"/ai/$projectId",params:{projectId:data.id}});
    } catch(error) {
      toast.error(error instanceof Error?error.message:"Could not create your project.");
    } finally {setBusy(false);}
  };

  const copyProjectLink=async(id:string)=>{
    try{await navigator.clipboard.writeText(new URL("/ai/"+id,window.location.origin).toString());toast.success("Project link copied.");}
    catch{toast.error("Could not copy the project link.");}
  };

  if(!user) return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-5 text-slate-100"><div className="max-w-sm text-center"><Code2 className="mx-auto mb-4 h-10 w-10 text-emerald-400"/><h1 className="text-xl font-semibold">Sign in to ExpertAI Studio</h1><p className="mt-2 text-sm text-slate-400">Your projects are saved in your private workspace.</p><Link to="/auth"><Button className="mt-5">Sign in</Button></Link></div></main>;

  return <main className="min-h-screen bg-[#0b0f17] text-slate-100">
    <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between border-b border-[#1e293b] bg-[#0b0f17] px-4 sm:px-7">
      <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Code2 size={18}/></div><span className="text-sm font-semibold">ExpertAI Studio</span><span className="hidden text-xs text-slate-500 sm:inline">·</span><Link to="/" className="hidden text-xs text-slate-400 hover:text-white sm:inline">← Back to ExpertsTeam</Link></div>
      <div className="flex items-center gap-3"><button type="button" onClick={()=>toast.info("Connect the ExpertsTeam Credits offerwall to enable free-credit earning here.")} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">⚡ Credits • +Earn Free</button><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold">{(user.email??"U").slice(0,1).toUpperCase()}</div></div>
    </header>

    <section className="mx-auto max-w-[1100px] px-4 pb-12 pt-14 sm:px-7 sm:pt-20">
      <div className="mx-auto max-w-[780px] text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[11px] font-medium tracking-wide text-emerald-300"><Sparkles size={13}/> EXPERTSTEAM AI BUILDER</div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What do you want to build today?</h1>
        <p className="mt-3 text-sm text-slate-400 sm:text-base">Build full-stack apps, games, and websites for free with ExpertAI.</p>
        <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-[#111827] p-3 text-left shadow-[0_0_45px_rgba(16,185,129,0.08)] focus-within:border-emerald-300/60">
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder="Describe your app, game, or website..." className="min-h-[92px] w-full resize-y bg-transparent px-2 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"/>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2"><button type="button" onClick={()=>toast.info("Image attachments will be enabled in the workspace build flow.")} className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white"><ImagePlus size={14}/> Attach Image</button><button type="button" onClick={()=>toast.info("Open a project first, then use GitHub import in the workspace.")} className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white"><Github size={14}/> Import GitHub</button></div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={framework} onChange={e=>setFramework(e.target.value as "auto"|AgentFramework)} className="h-9 max-w-[160px] rounded-lg border border-white/10 bg-[#0b0f17] px-2 text-xs text-slate-200">{FRAMEWORK_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <select value={modelTier} onChange={e=>setModelTier(e.target.value as "fast"|"architect")} className="h-9 rounded-lg border border-white/10 bg-[#0b0f17] px-2 text-xs text-slate-200"><option value="fast">Fast (1 EC)</option><option value="architect">Architect (3 EC)</option></select>
              <Button disabled={busy||!prompt.trim()} onClick={()=>void startProject(prompt)} className="h-9 bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400">{busy?"Building…":"Start Building →"}</Button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">{templates.map(t=><button key={t.label} type="button" onClick={()=>{setPrompt(t.prompt);setFramework(t.framework as AgentFramework);}} className="rounded-full border border-white/10 bg-[#111827] px-3 py-2 text-xs text-slate-300 transition hover:border-emerald-400/40 hover:text-white">{t.label}</button>)}</div>
      </div>

      <section className="mt-16">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-lg font-semibold">Your Projects <span className="ml-1 text-sm font-normal text-slate-500">({projects.data?.length??0})</span></h2><p className="mt-1 text-xs text-slate-500">Your private workspaces, all in one place.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-500"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects" className="h-9 w-[180px] border-white/10 bg-[#111827] pl-8 text-xs"/></div>
            {["all","nextjs","tanstack","vite","vue"].map(f=><button key={f} type="button" onClick={()=>setFilter(f)} className={`rounded-full px-3 py-2 text-[11px] capitalize ${filter===f?"bg-emerald-400/15 text-emerald-300":"text-slate-400 hover:bg-white/5"}`}>{f==="all"?"All":f==="nextjs"?"Next.js":f==="vite"?"Vite":f==="vue"?"Vue":"TanStack"}</button>)}
            <Button onClick={()=>void startProject("",true)} disabled={busy} className="h-9 gap-1.5 bg-white/10 text-xs text-white hover:bg-white/15"><Plus size={14}/> Blank Project</Button>
          </div>
        </div>
        {projects.isLoading?<div className="py-16 text-center text-sm text-slate-500">Loading projects…</div>:projects.isError?<div className="py-16 text-center text-sm text-rose-300">Could not load projects. Refresh and try again.</div>:visibleProjects.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleProjects.map(project=><article key={project.id} className="group overflow-hidden rounded-xl border border-white/10 bg-[#111827] transition hover:border-emerald-400/30">
          <div className="relative h-36 overflow-hidden bg-gradient-to-br from-slate-800 via-[#111827] to-emerald-950/40">{project.thumbnail_url?<img src={project.thumbnail_url} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-emerald-300"><FolderCode size={34}/></div></div>}<span className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-200">{project.framework||"Project"}</span><button type="button" onClick={()=>setMenuId(menuId===project.id?null:project.id)} className="absolute right-3 top-3 rounded-md bg-black/50 p-2 text-white hover:bg-black/70" aria-label="Project menu"><MoreHorizontal size={16}/></button>{menuId===project.id&&<div className="absolute right-3 top-12 z-10 min-w-36 rounded-lg border border-white/10 bg-[#0b0f17] p-1 shadow-xl"><Link to="/ai/$projectId" params={{projectId:project.id}} className="block rounded px-3 py-2 text-xs hover:bg-white/5">Open</Link><button type="button" onClick={()=>void copyProjectLink(project.id)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-white/5">Copy link</button><button type="button" onClick={()=>toast.info("Rename, duplicate, showcase and delete actions are not wired yet.")} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-white/5">More actions…</button></div>}</div>
          <div className="p-4"><h3 className="truncate text-sm font-semibold">{project.name}</h3><p className="mt-1 min-h-8 line-clamp-2 text-xs text-slate-500">{project.description||"No description yet"}</p><div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3"><button type="button" onClick={()=>void copyProjectLink(project.id)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><Copy size={13}/> Share</button><Link to="/ai/$projectId" params={{projectId:project.id}} className="flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">Open <ExternalLink size={13}/></Link></div></div>
        </article>)}</div>:<div className="rounded-2xl border border-dashed border-white/10 px-5 py-16 text-center"><FolderCode className="mx-auto mb-3 h-9 w-9 text-slate-600"/><h3 className="font-medium">No projects found</h3><p className="mt-2 text-sm text-slate-500">Start with a prompt above or create a blank project.</p></div>}
      </section>
    </section>
  </main>;
}
