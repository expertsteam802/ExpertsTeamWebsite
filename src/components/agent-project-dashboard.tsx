import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Code2, FolderCode, Plus, Search, Copy, ExternalLink, Sparkles, Zap, Github, ImagePlus, MoreHorizontal, X, GitBranch, Lock, Globe, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runCodingAgent } from "@/lib/agent.functions";
import { createFrameworkStarterFiles, detectAgentFramework, FRAMEWORK_OPTIONS, type AgentFramework } from "@/lib/framework-scaffolds";
import { saveProjectFiles } from "@/lib/project-files";
import { listConnectedGitHubRepositories, importConnectedGitHubRepository } from "@/lib/github-import.functions";

type AgentProject = { id:string; name:string; description:string; framework:string; updated_at:string; thumbnail_url:string|null };

function ExpertBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let width = 0, height = 0, frame = 0, raf = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles = Array.from({ length: 76 }, (_, i) => ({
      x: ((i * 7919) % 1000) / 1000,
      y: ((i * 3571 + 173) % 1000) / 1000,
      radius: 0.45 + ((i * 13) % 12) / 10,
      phase: i * 1.71,
      speed: 0.12 + ((i * 7) % 10) / 45,
    }));
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      frame += reducedMotion ? 0.25 : 1;
      const t = frame * 0.006;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#04070f";
      ctx.fillRect(0, 0, width, height);

      // Soft, layered aurora ribbons.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = "blur(42px)";
      const aurora = (color: string, offset: number, lift: number) => {
        const gradient = ctx.createLinearGradient(0, height * 0.04, width, height * 0.54);
        gradient.addColorStop(0, "rgba(4, 7, 15, 0)");
        gradient.addColorStop(0.32, color);
        gradient.addColorStop(0.72, color);
        gradient.addColorStop(1, "rgba(4, 7, 15, 0)");
        ctx.beginPath();
        ctx.moveTo(-width * 0.1, height * (0.25 + lift));
        ctx.bezierCurveTo(width * 0.18, height * (0.02 + Math.sin(t + offset) * 0.08), width * 0.34, height * (0.45 + Math.cos(t * 0.8 + offset) * 0.08), width * 0.57, height * (0.2 + lift));
        ctx.bezierCurveTo(width * 0.76, height * (0.02 + Math.sin(t * 0.7 + offset) * 0.1), width * 0.86, height * (0.36 + Math.cos(t + offset) * 0.08), width * 1.12, height * (0.12 + lift));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = Math.max(54, width * 0.085);
        ctx.lineCap = "round";
        ctx.stroke();
      };
      aurora("rgba(16, 185, 129, 0.36)", 0.4, 0.02);
      aurora("rgba(59, 130, 246, 0.34)", 2.7, 0.12);
      ctx.restore();

      // Floating light forms replace the distracting perspective grids.
      // Slow, translucent orbital halos and soft light blooms add depth without UI-like lines.
      ctx.save();
      const blooms = [
        { x: 0.12, y: 0.36, r: 0.23, color: "rgba(16, 185, 129, 0.10)", phase: 0.2 },
        { x: 0.86, y: 0.28, r: 0.27, color: "rgba(59, 130, 246, 0.11)", phase: 2.1 },
        { x: 0.68, y: 0.72, r: 0.18, color: "rgba(45, 212, 191, 0.07)", phase: 4.0 },
        { x: 0.28, y: 0.78, r: 0.16, color: "rgba(96, 165, 250, 0.06)", phase: 5.2 },
      ];
      for (const bloom of blooms) {
        const driftX = Math.sin(t * 0.22 + bloom.phase) * width * 0.025;
        const driftY = Math.cos(t * 0.18 + bloom.phase) * height * 0.018;
        const x = width * bloom.x + driftX;
        const y = height * bloom.y + driftY;
        const radius = Math.min(width, height) * bloom.r;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, bloom.color);
        glow.addColorStop(0.48, bloom.color.replace(/0\.\d+\)$/, "0.035)"));
        glow.addColorStop(1, "rgba(4, 7, 15, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(125, 211, 252, 0.055)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 0.72, radius * 0.19, Math.sin(t * 0.12 + bloom.phase) * 0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Twinkling particles: independent points, with no connecting lines or grid.
      const points = particles.map((p) => ({
        x: p.x * width + Math.sin(t * p.speed + p.phase) * 10,
        y: p.y * height + Math.cos(t * p.speed + p.phase) * 7,
        alpha: 0.16 + (Math.sin(t * 1.8 + p.phase) + 1) * 0.22,
        radius: p.radius,
      }));
      ctx.save();
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186, 230, 253, ${a.alpha})`;
        ctx.fill();
      }
      ctx.restore();

      // Edge vignette preserves legibility in the central workspace.
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.42, Math.min(width, height) * 0.12, width * 0.5, height * 0.5, Math.max(width, height) * 0.78);
      vignette.addColorStop(0, "rgba(4, 7, 15, 0.02)");
      vignette.addColorStop(0.58, "rgba(4, 7, 15, 0.18)");
      vignette.addColorStop(1, "rgba(2, 4, 10, 0.88)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      if (!reducedMotion) raf = window.requestAnimationFrame(draw);
    };
    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas id="expert-bg-canvas" ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}

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
  const [referenceImages,setReferenceImages] = useState<Array<{name:string;mimeType:"image/png"|"image/jpeg"|"image/webp";data:string;preview:string}>>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [framework,setFramework] = useState<"auto"|AgentFramework>("auto");
  const [modelTier,setModelTier] = useState<"fast"|"architect">("fast");
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState("all");
  const [busy,setBusy] = useState(false);
  const [menuId,setMenuId] = useState<string|null>(null);
  const [githubOpen,setGithubOpen] = useState(false);
  const [githubRepos,setGithubRepos] = useState<Array<{id:number;name:string;full_name:string;description:string|null;private:boolean;default_branch:string;html_url:string;updated_at:string;owner:{login:string;avatar_url:string}}>>([]);
  const [githubLoading,setGithubLoading] = useState(false);
  const [githubImporting,setGithubImporting] = useState<string|null>(null);
  const [githubSearch,setGithubSearch] = useState("");
  const [githubError,setGithubError] = useState("");

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
        user_id:user.id,name,description:initialPrompt.trim().slice(0,500),framework:chosen,files:{},
        messages: blank ? [] : [{ role:"user", content:initialPrompt.trim(), createdAt:new Date().toISOString() }],
        workspace_settings:{}
      }).select("id").single();
      if(error) throw error;
      await saveProjectFiles(data.id,user.id,starter);

      // Open the project workspace as soon as its record and starter files exist.
      // AI generation must never keep the user stranded on the welcome dashboard.
      await queryClient.invalidateQueries({queryKey:["agent-studio-projects",user.id]});
      setReferenceImages([]);
      await navigate({to:"/ai/$projectId",params:{projectId:data.id}});
      toast.success(blank?"Blank project created.":"Workspace opened. Building your project…");

      if(!blank){
        try {
          const result = await runCodingAgent({prompt:initialPrompt,mode:"build",modelTier,framework:chosen,files:starter,history:[],referenceImages:referenceImages.map(({name,mimeType,data})=>({name,mimeType,data}))});
          const generated = (result as {files?:Record<string,string|null>}).files ?? {};
          const merged = {...starter};
          for(const [path,value] of Object.entries(generated)){if(typeof value==="string") merged[path]=value; else if(value===null) delete merged[path];}
          await saveProjectFiles(data.id,user.id,merged);
          const assistantMessage = result.message || (result.complete ? "The initial project has been generated." : "The first implementation batch is ready. Continue asking the Agent to finish the remaining work.");
          const { error: messageError } = await supabase.from("agent_projects").update({
            messages: [
              { role:"user", content:initialPrompt.trim(), createdAt:new Date().toISOString() },
              { role:"assistant", content:assistantMessage, createdAt:new Date().toISOString() }
            ]
          }).eq("id",data.id).eq("user_id",user.id);
          if(messageError) console.warn("[Agent Studio] Project files were saved, but the initial chat response could not be saved:",messageError.message);
          await queryClient.invalidateQueries({queryKey:["agent-studio-workspace",data.id,user.id]});
          toast.success("Project generation completed.");
        } catch (generationError) {
          console.error("[Agent Studio] Initial project generation failed:", generationError);
          const failureText = generationError instanceof Error ? generationError.message : "Generation failed. Your workspace is still available.";
          await supabase.from("agent_projects").update({
            messages: [
              { role:"user", content:initialPrompt.trim(), createdAt:new Date().toISOString() },
              { role:"assistant", content:"I couldn't complete the initial build: " + failureText, createdAt:new Date().toISOString() }
            ]
          }).eq("id",data.id).eq("user_id",user.id);
          await queryClient.invalidateQueries({queryKey:["agent-studio-workspace",data.id,user.id]});
          toast.error(failureText);
        }
      }
    } catch(error) {
      toast.error(error instanceof Error?error.message:"Could not create your project.");
    } finally {setBusy(false);}
  };

  const openGitHubImport = async () => {
    setGithubOpen(true);
    setGithubError("");
    setGithubLoading(true);
    try {
      const repositories = await listConnectedGitHubRepositories({ data: {} });
      setGithubRepos(repositories);
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : "Could not load GitHub repositories.");
    } finally {
      setGithubLoading(false);
    }
  };

  const importGitHubRepo = async (repo: typeof githubRepos[number]) => {
    if (!user || githubImporting) return;
    setGithubImporting(repo.full_name);
    setGithubError("");
    try {
      const imported = await importConnectedGitHubRepository({
        data: { owner: repo.owner.login, repo: repo.name, branch: repo.default_branch },
      });
      const framework = detectAgentFramework(
        "Import existing repository " + repo.full_name + " " + (imported.files["package.json"] ?? ""),
      );
      const { data, error } = await supabase.from("agent_projects").insert({
        user_id: user.id,
        name: repo.name,
        description: repo.description || "Imported from GitHub: " + repo.full_name,
        framework,
        files: {},
        workspace_settings: {},
      }).select("id").single();
      if (error) throw error;
      await saveProjectFiles(data.id, user.id, imported.files);
      const { error: linkError } = await supabase.from("project_repos").upsert({
        project_id: data.id,
        user_id: user.id,
        repo_owner: repo.owner.login,
        repo_name: repo.name,
        default_branch: repo.default_branch,
        active_branch: repo.default_branch,
        auto_sync_enabled: false,
      }, { onConflict: "project_id" });
      if (linkError) console.warn("[Agent Studio] Imported files, but repository link metadata could not be saved:", linkError.message);
      await queryClient.invalidateQueries({ queryKey: ["agent-studio-projects", user.id] });
      setGithubOpen(false);
      toast.success(`Imported ${imported.importedCount} files from ${repo.full_name}.`);
      void navigate({ to: "/ai/$projectId", params: { projectId: data.id } });
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : "Could not import this repository.");
      toast.error(error instanceof Error ? error.message : "Could not import this repository.");
    } finally {
      setGithubImporting(null);
    }
  };

  const filteredGitHubRepos = githubRepos.filter((repo) =>
    (repo.full_name + " " + (repo.description ?? "")).toLowerCase().includes(githubSearch.toLowerCase())
  );

  const copyProjectLink=async(id:string)=>{
    try{await navigator.clipboard.writeText(new URL("/ai/"+id,window.location.origin).toString());toast.success("Project link copied.");}
    catch{toast.error("Could not copy the project link.");}
  };

  if(!user) return <main className="relative isolate min-h-screen overflow-hidden bg-[#04070f] px-5 text-slate-100"><ExpertBackground/><div className="relative z-10 flex min-h-screen items-center justify-center"><div className="max-w-sm text-center"><Code2 className="mx-auto mb-4 h-10 w-10 text-emerald-400"/><h1 className="text-xl font-semibold">Sign in to ExpertAI Studio</h1><p className="mt-2 text-sm text-slate-400">Your projects are saved in your private workspace.</p><Link to="/auth"><Button className="mt-5">Sign in</Button></Link></div></div></main>;

  return <main className="relative isolate min-h-screen overflow-hidden bg-[#04070f] text-slate-100"><ExpertBackground/>
    <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between border-b border-[#1e293b]/80 bg-[#070b14]/75 backdrop-blur-xl px-4 sm:px-7">
      <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Code2 size={18}/></div><span className="text-sm font-semibold">ExpertAI Studio</span><span className="hidden text-xs text-slate-500 sm:inline">·</span><Link to="/" className="hidden text-xs text-slate-400 hover:text-white sm:inline">← Back to ExpertsTeam</Link></div>
      <div className="flex items-center gap-3"><button type="button" onClick={()=>toast.info("Connect the ExpertsTeam Credits offerwall to enable free-credit earning here.")} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">⚡ Credits • +Earn Free</button><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold">{(user.email??"U").slice(0,1).toUpperCase()}</div></div>
    </header>

    {githubOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="github-import-title">
      <div className="flex max-h-[min(760px,92vh)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white"><Github size={21}/></div><div><h2 id="github-import-title" className="text-base font-semibold text-white">Import from GitHub</h2><p className="mt-0.5 text-xs text-slate-400">Choose a repository from your connected account</p></div></div>
          <button type="button" onClick={()=>setGithubOpen(false)} aria-label="Close GitHub import" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18}/></button>
        </div>
        <div className="border-b border-white/10 p-4">
          <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-500"/><Input value={githubSearch} onChange={e=>setGithubSearch(e.target.value)} placeholder="Search your repositories…" className="h-10 border-white/10 bg-[#070c15] pl-9 text-sm text-white"/></div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500"><Lock size={12}/> Private repositories are included when your GitHub authorization allows access.</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {githubLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin"/> Loading your GitHub repositories…</div>
          : githubError && !githubRepos.length ? <div className="py-12 text-center"><Github size={30} className="mx-auto mb-3 text-slate-600"/><p className="mx-auto max-w-md text-sm text-rose-300">{githubError}</p><Button type="button" onClick={()=>void openGitHubImport()} className="mt-4 gap-2 bg-white/10 text-white hover:bg-white/15"><RefreshCw size={14}/> Try again</Button><p className="mt-3 text-xs text-slate-500">If GitHub is not connected yet, connect it from the Connections page.</p><Link to="/connections" onClick={()=>setGithubOpen(false)} className="mt-2 inline-block text-xs text-emerald-300 hover:text-emerald-200">Open Connections</Link></div>
          : filteredGitHubRepos.length ? <div className="space-y-2">{filteredGitHubRepos.map(repo=><div key={repo.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 transition hover:border-emerald-400/25 hover:bg-white/[0.045]">
            <img src={repo.owner.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full border border-white/10"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-slate-100">{repo.full_name}</p>{repo.private?<span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"><Lock size={10}/> Private</span>:<span className="inline-flex items-center gap-1 rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-200"><Globe size={10}/> Public</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{repo.description || "No description"} · <span className="inline-flex items-center gap-1"><GitBranch size={10}/>{repo.default_branch}</span></p></div><Button type="button" size="sm" disabled={Boolean(githubImporting)} onClick={()=>void importGitHubRepo(repo)} className="shrink-0 bg-emerald-500 text-xs font-semibold text-slate-950 hover:bg-emerald-400">{githubImporting===repo.full_name?"Importing…":"Import"}</Button>
          </div>)}</div> : <div className="py-14 text-center text-sm text-slate-500">{githubRepos.length ? "No repositories match your search." : "No repositories were returned for this GitHub account."}</div>}
          {githubError && githubRepos.length>0 && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-300">{githubError}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] text-slate-500"><span>{githubRepos.length} repositories available</span><button type="button" onClick={()=>void openGitHubImport()} disabled={githubLoading||Boolean(githubImporting)} className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw size={12}/> Refresh list</button></div>
      </div>
    </div>}

    <section className="relative z-10 mx-auto max-w-[1100px] px-4 pb-12 pt-14 sm:px-7 sm:pt-20">
      <div className="mx-auto max-w-[780px] text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[11px] font-medium tracking-wide text-emerald-300"><Sparkles size={13}/> EXPERTSTEAM AI BUILDER</div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What do you want to build today?</h1>
        <p className="mt-3 text-sm text-slate-400 sm:text-base">Build full-stack apps, games, and websites for free with ExpertAI.</p>
        <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-[#111827] p-3 text-left shadow-[0_0_45px_rgba(16,185,129,0.08)] focus-within:border-emerald-300/60">
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={async event=>{const selected=Array.from(event.target.files??[]);event.target.value="";const allowed=selected.filter(file=>["image/png","image/jpeg","image/webp"].includes(file.type)&&file.size<=2_000_000).slice(0,3-referenceImages.length);if(!allowed.length){toast.error("Choose up to three PNG, JPG, or WebP images under 2 MB each.");return;}try{const loaded=await Promise.all(allowed.map(file=>new Promise<{name:string;mimeType:"image/png"|"image/jpeg"|"image/webp";data:string;preview:string}>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result??"");const data=value.split(",")[1];if(!data)return reject(new Error("Could not read image."));resolve({name:file.name,mimeType:file.type as "image/png"|"image/jpeg"|"image/webp",data,preview:value});};reader.onerror=()=>reject(new Error("Could not read image."));reader.readAsDataURL(file);})));setReferenceImages(current=>[...current,...loaded].slice(0,3));}catch(error){toast.error(error instanceof Error?error.message:"Could not attach images.");}}}/>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder="Describe your app, game, or website..." className="min-h-[92px] w-full resize-y bg-transparent px-2 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"/>
          {referenceImages.length>0&&<div className="flex flex-wrap gap-2 px-2 pb-3">{referenceImages.map((image,index)=><div key={image.name+index} className="relative"><img src={image.preview} alt={image.name} className="h-14 w-14 rounded-lg border border-white/15 object-cover"/><button type="button" onClick={()=>setReferenceImages(current=>current.filter((_,i)=>i!==index))} aria-label={"Remove "+image.name} className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-1 text-white"><X size={11}/></button></div>)}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2"><button type="button" onClick={()=>imageInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white"><ImagePlus size={14}/> Attach Image{referenceImages.length>0?" ("+referenceImages.length+"/3)":""}</button><button type="button" onClick={()=>void openGitHubImport()} className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white"><Github size={14}/> Import GitHub</button></div>
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
