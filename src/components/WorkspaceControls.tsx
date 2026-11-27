/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, Database, Github, KeyRound, Layers3, MessageSquare, Plus, RotateCcw, Save, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { MyLeadOfferwall } from "@/components/mylead-offerwall";
import { DeploymentHistoryPanel } from "@/components/deployment-history-panel";
import { supabase } from "@/integrations/supabase/client";
import { beginGitHubPluginOAuth, beginSupabasePluginOAuth } from "@/lib/plugin-oauth.functions";
import { listConnectedGitHubRepositories, syncAgentProjectGitHub } from "@/lib/github-import.functions";
import { deleteProjectEnvironmentVariable, listProjectEnvironmentKeys, saveProjectEnvironmentVariable } from "@/lib/project-secrets.functions";
import { addProjectCustomDomain, verifyProjectCustomDomain } from "@/lib/deployment.functions";

export type WorkspaceModal = "credits" | "db" | "github" | "deploy" | null;
type Drawer = "checkpoints" | "secrets" | "community" | null;
type Files = Record<string, string>;

export function WorkspaceControls({ projectId, userId, files, onRestore, onFocusChat, onSave, onReload, onPublish, publishing, publishedUrl, modal, onModalChange }: {
  projectId: string; userId: string; files: Files; onRestore: (files: Files) => void | Promise<void>;
  onFocusChat: () => void; onSave: () => Promise<void>; onReload: () => Promise<void>; onPublish: () => void; publishing: boolean; publishedUrl: string; modal: WorkspaceModal; onModalChange: (modal: WorkspaceModal) => void;
}) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const githubOAuth = useServerFn(beginGitHubPluginOAuth);
  const listRepos = useServerFn(listConnectedGitHubRepositories);
  const syncGitHub = useServerFn(syncAgentProjectGitHub);
  const supabaseOAuth = useServerFn(beginSupabasePluginOAuth);
  const listSecrets = useServerFn(listProjectEnvironmentKeys);
  const saveSecret = useServerFn(saveProjectEnvironmentVariable);
  const deleteSecret = useServerFn(deleteProjectEnvironmentVariable);
  const addDomain = useServerFn(addProjectCustomDomain);
  const verifyDomain = useServerFn(verifyProjectCustomDomain);

  const checkpoints = useQuery({
    queryKey: ["agent-project-checkpoints", projectId], enabled: Boolean(userId && drawer === "checkpoints"),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("agent_project_checkpoints").select("id,name,created_at,files")
        .eq("project_id", projectId).eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; created_at: string; files: Files }[];
    },
  });
  const githubRepositories = useQuery({ queryKey: ["agent-github-repositories"], enabled: Boolean(userId && modal === "github"), queryFn: () => listRepos({ data: {} }) });
  const githubLink = useQuery({ queryKey: ["agent-github-link", projectId], enabled: Boolean(userId && modal === "github"), queryFn: async () => { const { data, error } = await (supabase as any).from("project_repos").select("repo_owner,repo_name,default_branch,active_branch,last_synced_sha").eq("project_id",projectId).eq("user_id",userId).maybeSingle(); if(error)throw error; return data; } });
  const domains = useQuery({
    queryKey: ["agent-project-domains", projectId], enabled: Boolean(userId && modal === "deploy"),
    queryFn: async () => { const { data, error } = await (supabase as any).from("agent_project_domains").select("id,domain,status,verification_host,verification_token,dns_target").eq("project_id",projectId).eq("user_id",userId).order("created_at",{ascending:false}); if(error)throw error; return data ?? []; },
  });
  const communityPosts = useQuery({
    queryKey: ["agent-community-showcase"], enabled: Boolean(drawer === "community"),
    queryFn: async () => { const { data, error } = await supabase.from("community_posts").select("id,title,kind,created_at,profiles:profiles!community_posts_profile_fk(username,display_name)").order("created_at",{ascending:false}).limit(6); if(error)throw error; return (data ?? []) as unknown as {id:string;title:string;kind:string;created_at:string;profiles:{username:string;display_name:string|null}|null}[]; },
  });
  const secrets = useQuery({
    queryKey: ["agent-project-secrets", projectId], enabled: Boolean(userId && drawer === "secrets"),
    queryFn: () => listSecrets({ data: { projectId } }),
  });

  useEffect(() => {
    if (!drawer && !modal) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawer(null); onModalChange(null); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawer, modal, onModalChange]);

  const createCheckpoint = async () => {
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("agent_project_checkpoints").insert({
        project_id: projectId, user_id: userId, name: "Manual checkpoint", files,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["agent-project-checkpoints", projectId] });
      toast.success("Checkpoint created.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create checkpoint."); }
    finally { setBusy(false); }
  };

  const activeRepository = selectedRepo || (githubLink.data ? githubLink.data.repo_owner + "/" + githubLink.data.repo_name : "");
  const linkedBranch = githubLink.data?.active_branch || githubLink.data?.default_branch || "";
  const branchNeedsLink = Boolean(selectedBranch && selectedBranch !== linkedBranch);
  const linkRepository = async () => {
    if (!selectedRepo) { toast.error("Choose a GitHub repository first."); return; }
    const repository = githubRepositories.data?.find(item => item.full_name === selectedRepo);
    if (!repository) { toast.error("The selected repository is no longer available. Refresh and try again."); return; }
    const [owner, name] = selectedRepo.split("/");
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("project_repos").upsert({
        project_id: projectId, user_id: userId, repo_owner: owner, repo_name: name,
        default_branch: repository.default_branch, active_branch: selectedBranch || repository.default_branch,
        last_synced_sha: null, auto_sync_enabled: false, updated_at: new Date().toISOString(),
      }, { onConflict: "project_id" });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["agent-github-link", projectId] });
      toast.success("GitHub repository linked.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not link repository."); }
    finally { setBusy(false); }
  };
  const syncRepository = async (direction: "push" | "pull") => {
    if (!activeRepository) { toast.error("Connect GitHub and select a repository first."); return; }
    const linkedRepository = githubLink.data ? githubLink.data.repo_owner + "/" + githubLink.data.repo_name : "";
    if (selectedRepo && selectedRepo !== linkedRepository) { toast.error("Link the selected repository before syncing."); return; }
    if (branchNeedsLink) { toast.error("Link the selected branch before syncing."); return; }
    if (direction === "pull" && !window.confirm("Pulling replaces the current local project files. Continue?")) return;
    setBusy(true);
    try {
      if (direction === "push") await onSave();
      const result = await syncGitHub({ data: { projectId, direction, ...(direction === "push" ? { files } : {}) } });
      if ("files" in result && result.files) {
        await onRestore(result.files);
        toast.success("Pulled " + result.count + " files from " + result.repository + ".");
      } else {
        await queryClient.invalidateQueries({ queryKey: ["agent-github-link", projectId] });
        toast.success("Pushed " + result.count + " files to " + result.repository + " (" + result.branch + ").");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "GitHub sync failed."); }
    finally { setBusy(false); }
  };

  const createDomain = async () => { setBusy(true); try { await addDomain({data:{projectId,domain:domainInput}}); setDomainInput(""); await queryClient.invalidateQueries({queryKey:["agent-project-domains",projectId]}); toast.success("Domain verification details created."); } catch(error) { toast.error(error instanceof Error?error.message:"Could not add custom domain."); } finally { setBusy(false); } };
  const checkDomain = async (id:string) => { setBusy(true); try { const result = await verifyDomain({data:{domainId:id}}); await queryClient.invalidateQueries({queryKey:["agent-project-domains",projectId]}); toast.success(result.status==="active"?"Custom domain is active.":"DNS verification is still pending."); } catch(error) { toast.error(error instanceof Error?error.message:"Could not verify custom domain."); } finally { setBusy(false); } };

  const connect = async (provider: "github" | "supabase") => {
    setBusy(true);
    try {
      const result = provider === "github" ? await githubOAuth({ data: {} }) : await supabaseOAuth({ data: {} });
      window.location.assign(result.url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start OAuth."); setBusy(false); }
  };

  const saveSecretValue = async () => {
    setBusy(true);
    try {
      await saveSecret({ data: { projectId, key: secretKey.trim(), value: secretValue } });
      setSecretKey(""); setSecretValue("");
      await queryClient.invalidateQueries({ queryKey: ["agent-project-secrets", projectId] });
      toast.success("Encrypted secret saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save secret."); }
    finally { setBusy(false); }
  };

  const rail = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "checkpoints", label: "Checkpoints", icon: Clock3 },
    { id: "secrets", label: "Secrets", icon: KeyRound },
    { id: "community", label: "Community Showcase", icon: Share2 },
  ] as const;

  return <>
    <aside className="z-20 flex w-12 shrink-0 flex-col items-center gap-2 border-r border-[#1E293B] bg-[#0D1322] py-3">
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-[#2563EB]/15 text-[#60A5FA]"><Layers3 size={17}/></div>
      {rail.map(item => { const Icon=item.icon; return <button key={item.id} type="button" title={item.label} aria-label={item.label}
        onClick={() => item.id==="chat" ? onFocusChat() : setDrawer(drawer===item.id?null:item.id)}
        className={`grid h-9 w-9 place-items-center rounded-lg transition ${drawer===item.id?"bg-[#2563EB]/20 text-[#60A5FA]":"text-[#94A3B8] hover:bg-white/[0.06] hover:text-white"}`}><Icon size={17}/></button>; })}
      <div className="flex-1"/>
      <button type="button" title="DB & Auth" onClick={()=>onModalChange("db")} className="grid h-9 w-9 place-items-center rounded-lg text-[#94A3B8] hover:bg-white/[0.06] hover:text-white"><Database size={17}/></button>
    </aside>

    {drawer && <section className="z-30 flex w-[310px] max-w-[calc(100vw-48px)] shrink-0 flex-col border-r border-[#1E293B] bg-[#0D1322]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#1E293B] px-3"><h2 className="text-xs font-semibold text-[#E2E8F0]">{drawer==="checkpoints"?"Checkpoints · Version History":drawer==="secrets"?"Secrets · .env Vault":"Community Showcase"}</h2><button type="button" onClick={()=>setDrawer(null)} aria-label="Close drawer" className="rounded p-1 text-[#94A3B8] hover:bg-white/10"><X size={15}/></button></header>
      {drawer==="checkpoints" && <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <button type="button" disabled={busy} onClick={()=>void createCheckpoint()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#2563EB]/40 bg-[#2563EB]/15 px-3 py-2 text-xs font-semibold text-[#93C5FD] hover:bg-[#2563EB]/25"><Save size={14}/> Save checkpoint</button>
        {checkpoints.isLoading?<p className="p-3 text-xs text-[#94A3B8]">Loading history…</p>:checkpoints.data?.length?checkpoints.data.map(point=><article key={point.id} className="mb-2 rounded-lg border border-[#1E293B] bg-[#070B14] p-3"><p className="text-xs font-medium text-[#E2E8F0]">{point.name}</p><p className="mt-1 text-[10px] text-[#94A3B8]">{new Date(point.created_at).toLocaleString()} · {Object.keys(point.files??{}).length} files</p><button type="button" onClick={()=>{if(window.confirm("Restore this checkpoint? Current files will be replaced.")){void Promise.resolve(onRestore(point.files??{})).then(()=>toast.success("Checkpoint restored and saved.")).catch(error=>toast.error(error instanceof Error?error.message:"Could not restore checkpoint."));}}} className="mt-2 flex items-center gap-1.5 text-[11px] text-[#60A5FA]"><RotateCcw size={12}/> Restore version</button></article>):<p className="p-3 text-xs text-[#94A3B8]">No checkpoints yet.</p>}
      </div>}
      {drawer==="secrets" && <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-[11px] leading-5 text-[#94A3B8]">Secrets are encrypted at rest and never shown again after saving.</p>
        <div className="space-y-2 rounded-lg border border-[#1E293B] bg-[#070B14] p-3">
          <input value={secretKey} onChange={e=>setSecretKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_"))} placeholder="SECRET_KEY" className="h-9 w-full rounded-md border border-[#1E293B] bg-[#0D1322] px-2 text-xs text-white outline-none placeholder:text-[#64748B]"/>
          <input type="password" value={secretValue} onChange={e=>setSecretValue(e.target.value)} placeholder="Secret value" className="h-9 w-full rounded-md border border-[#1E293B] bg-[#0D1322] px-2 text-xs text-white outline-none placeholder:text-[#64748B]"/>
          <button type="button" disabled={busy||!secretKey.trim()||!secretValue} onClick={()=>void saveSecretValue()} className="w-full rounded-md bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3B82F6] disabled:opacity-50"><Plus size={13} className="mr-1 inline"/> Save encrypted secret</button>
        </div>
        <div className="mt-4 space-y-2">{secrets.data?.variables.map(item=><div key={item.key} className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#070B14] px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate font-mono text-[11px] text-[#E2E8F0]">{item.key}</p><p className="text-[10px] text-[#94A3B8]">Encrypted · configured</p></div><button type="button" title={"Delete "+item.key} onClick={async()=>{if(!window.confirm("Delete "+item.key+"?"))return;try{await deleteSecret({data:{projectId,key:item.key}});await queryClient.invalidateQueries({queryKey:["agent-project-secrets",projectId]});toast.success("Secret deleted.");}catch(error){toast.error(error instanceof Error?error.message:"Could not delete secret.");}}} className="rounded p-1.5 text-[#94A3B8] hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13}/></button></div>)}</div>
      </div>}
      {drawer==="community" && <div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="mb-3 rounded-xl border border-[#1E293B] bg-[#070B14] p-3"><div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-[#2563EB]/15 text-[#60A5FA]"><Share2 size={18}/></div><h3 className="text-sm font-semibold text-[#E2E8F0]">Community Showcase</h3><p className="mt-1 text-[11px] leading-5 text-[#94A3B8]">Recent ideas, questions and projects shared by builders.</p><a href="/community" className="mt-3 inline-flex rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3B82F6]">Open Community ↗</a></div>{communityPosts.isLoading?<p className="p-3 text-xs text-[#94A3B8]">Loading community posts…</p>:communityPosts.isError?<p className="p-3 text-xs text-rose-300">Could not load the community feed.</p>:communityPosts.data?.length?communityPosts.data.map(post=><article key={post.id} className="mb-2 rounded-lg border border-[#1E293B] bg-[#070B14] p-3"><p className="text-[10px] uppercase tracking-wide text-[#60A5FA]">{post.kind}</p><p className="mt-1 text-xs font-medium text-[#E2E8F0]">{post.title}</p><p className="mt-2 text-[10px] text-[#94A3B8]">{post.profiles?.display_name||post.profiles?.username||"Community member"} · {new Date(post.created_at).toLocaleDateString()}</p></article>):<p className="p-3 text-xs text-[#94A3B8]">No public posts yet. Be the first to share an idea.</p>}</div>}
    </section>}

    {modal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={e=>{if(e.target===e.currentTarget)onModalChange(null);}}>
      <section className="flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#1E293B] bg-[#0D1322] shadow-2xl shadow-black/50">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#1E293B] px-4"><h2 className="text-sm font-semibold text-[#E2E8F0]">{modal==="credits"?"Earn free credits":modal==="db"?"Supabase · Database & Auth":modal==="github"?"GitHub · Repository sync":"Publish & Custom Domain"}</h2><button type="button" onClick={()=>onModalChange(null)} className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/10"><X size={16}/></button></header>
        <div className="min-h-0 overflow-y-auto p-4">
          {modal==="credits" && <MyLeadOfferwall/>}
          {modal==="db" && <div className="rounded-xl border border-[#1E293B] bg-[#070B14] p-4"><div className="flex items-center gap-2 text-[#60A5FA]"><Database size={18}/><strong className="text-sm text-[#E2E8F0]">Supabase Management OAuth</strong></div><p className="mt-2 text-xs leading-5 text-[#94A3B8]">Authorize ExpertsTeam to access your Supabase organizations and projects. This requires the Supabase OAuth app to be configured on the server.</p><button type="button" disabled={busy} onClick={()=>void connect("supabase")} className="mt-4 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3B82F6] disabled:opacity-50">{busy?"Connecting…":"Connect Supabase with OAuth"}</button><p className="mt-3 text-[11px] text-[#94A3B8]">You can also manage API-key connections in <a href="/connections" className="text-[#60A5FA] underline">Connections</a>.</p></div>}
          {modal==="github" && <div className="rounded-xl border border-[#1E293B] bg-[#070B14] p-4"><div className="flex items-center gap-2 text-[#E2E8F0]"><Github size={18}/><strong className="text-sm">GitHub repository access</strong></div><p className="mt-2 text-xs leading-5 text-[#94A3B8]">Connect GitHub, select a repository, then link it to this project. Push commits your saved workspace; Pull imports the selected branch and replaces current project files.</p><button type="button" disabled={busy} onClick={()=>void connect("github")} className="mt-3 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3B82F6] disabled:opacity-50">{busy?"Connecting…":"Connect GitHub OAuth"}</button><div className="mt-4 space-y-2"><label className="block text-[10px] font-medium text-[#94A3B8]">Repository</label><select value={selectedRepo || (githubLink.data ? githubLink.data.repo_owner + "/" + githubLink.data.repo_name : "")} onChange={e=>setSelectedRepo(e.target.value)} className="h-9 w-full rounded-md border border-[#1E293B] bg-[#0D1322] px-3 text-xs text-[#E2E8F0]"><option value="">Choose a repository…</option>{githubRepositories.data?.map(repo=><option key={repo.full_name} value={repo.full_name}>{repo.full_name}{repo.private?" · Private":""}</option>)}</select><input value={selectedBranch} onChange={e=>setSelectedBranch(e.target.value)} placeholder={githubLink.data?.active_branch || "Branch (default branch)"} className="h-9 w-full rounded-md border border-[#1E293B] bg-[#0D1322] px-3 text-xs text-[#E2E8F0] placeholder:text-[#64748B]"/><div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!selectedRepo} onClick={()=>void linkRepository()} className="rounded-md border border-[#1E293B] px-3 py-2 text-[11px] text-[#CBD5E1] hover:bg-white/5 disabled:opacity-50">Link repository</button><button type="button" disabled={busy||!activeRepository||branchNeedsLink||Boolean(selectedRepo && selectedRepo !== (githubLink.data ? githubLink.data.repo_owner + "/" + githubLink.data.repo_name : ""))} onClick={()=>void syncRepository("pull")} className="rounded-md border border-[#1E293B] px-3 py-2 text-[11px] text-[#CBD5E1] hover:bg-white/5 disabled:opacity-50">↓ Pull</button><button type="button" disabled={busy||!activeRepository||Boolean(selectedRepo && selectedRepo !== (githubLink.data ? githubLink.data.repo_owner + "/" + githubLink.data.repo_name : ""))} onClick={()=>void syncRepository("push")} className="rounded-md border border-[#2563EB]/40 bg-[#2563EB]/15 px-3 py-2 text-[11px] text-[#93C5FD] hover:bg-[#2563EB]/25 disabled:opacity-50">↑ Push</button></div></div><p className="mt-3 text-[11px] text-[#94A3B8]">Manage connected accounts at <a href="/connections" className="text-[#60A5FA] underline">Connections</a>.</p></div>}
          {modal==="deploy" && <div className="space-y-4"><div className="rounded-xl border border-[#1E293B] bg-[#070B14] p-4"><h3 className="text-sm font-semibold text-[#E2E8F0]">Publish to ExpertsTeam</h3><p className="mt-1 text-[11px] leading-5 text-[#94A3B8]">Build a production bundle and publish it to a public ExpertsTeam URL.</p><button type="button" disabled={publishing} onClick={onPublish} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-[#3B82F6] disabled:opacity-50">{publishing?<><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white"/> Publishing…</>:"Publish production ↑"}</button>{publishedUrl&&<a href={publishedUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[11px] text-[#60A5FA] underline">Open published app: {publishedUrl}</a>}</div><div className="rounded-xl border border-[#1E293B] bg-[#070B14] p-4"><h3 className="text-sm font-semibold text-[#E2E8F0]">Production releases</h3><p className="mt-2 text-xs leading-5 text-[#94A3B8]">Review deployment history and roll back to a previous successful release.</p><DeploymentHistoryPanel projectId={projectId}/></div><div className="rounded-xl border border-[#1E293B] bg-[#070B14] p-4"><h3 className="text-sm font-semibold text-[#E2E8F0]">Custom domain</h3><p className="mt-1 text-[11px] leading-5 text-[#94A3B8]">Add a domain after a production release is published. DNS verification is required before it becomes active.</p><div className="mt-3 flex gap-2"><input value={domainInput} onChange={e=>setDomainInput(e.target.value)} placeholder="app.example.com" className="h-9 min-w-0 flex-1 rounded-md border border-[#1E293B] bg-[#0D1322] px-3 text-xs text-white outline-none placeholder:text-[#64748B]"/><button type="button" disabled={busy||!domainInput.trim()} onClick={()=>void createDomain()} className="rounded-md bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#3B82F6] disabled:opacity-50">Add domain</button></div>{domains.data?.map((domain:any)=><div key={domain.id} className="mt-3 rounded-lg border border-[#1E293B] bg-[#0D1322] p-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#E2E8F0]">{domain.domain}</span><span className="text-[10px] text-[#94A3B8]">{domain.status}</span></div><p className="mt-2 break-all text-[10px] text-[#CBD5E1]">TXT host: {domain.verification_host}</p><p className="mt-1 break-all font-mono text-[10px] text-[#93C5FD]">TXT value: {domain.verification_token}</p><p className="mt-1 break-all text-[10px] text-[#CBD5E1]">CNAME target: {domain.dns_target}</p><button type="button" disabled={busy||domain.status==="active"} onClick={()=>void checkDomain(domain.id)} className="mt-2 rounded-md border border-[#2563EB]/40 px-3 py-1.5 text-[10px] text-[#93C5FD] hover:bg-[#2563EB]/10 disabled:opacity-50">Verify DNS</button></div>)}</div><p className="text-[11px] leading-5 text-[#94A3B8]">Custom-domain activation requires this site’s Netlify domain integration to be configured. After adding the domain, publish the TXT verification record and point the domain to the CNAME target shown above, then select Verify DNS.</p></div>}
        </div>
      </section>
    </div>}
  </>;
}
