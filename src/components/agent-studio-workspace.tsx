import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Code2, Eye, FileCode2, Folder, LoaderCircle, Play, Send, SquareTerminal, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { loadProjectFiles, saveProjectFiles } from "@/lib/project-files";
import { runCodingAgent } from "@/lib/agent.functions";
import { openBrowserTerminal, startBrowserPreview, syncBrowserProject } from "@/lib/browser-webcontainer";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type ChatMessage = { role: "user" | "assistant"; content: string; createdAt?: string };
type ProjectFiles = Record<string, string>;
type WorkbenchTab = "preview" | "code" | "terminal";

function readMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatMessage =>
    Boolean(item && typeof item === "object" &&
      ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
      typeof (item as ChatMessage).content === "string"),
  ).slice(-100);
}

function extensionLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "html") return "html";
  if (ext === "css" || ext === "scss") return "css";
  if (ext === "json") return "json";
  return "javascript";
}

export function AgentStudioWorkspace({ projectId }: { projectId: string }) {
  const { user, loading: authLoading, profile } = useAuth();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<ProjectFiles>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [activePath, setActivePath] = useState("");
  const [tab, setTab] = useState<WorkbenchTab>("preview");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const terminalSessionRef = useRef<{ write: (value: string) => void; resize: (size: { cols: number; rows: number }) => void; close: () => void } | null>(null);
  const runtimeActiveRef = useRef(false);
  const [runtimeOutput, setRuntimeOutput] = useState("");
  const hydratedRef = useRef("");

  const projectQuery = useQuery({
    queryKey: ["agent-studio-workspace", projectId, user?.id],
    enabled: Boolean(projectId && user),
    queryFn: async () => {
      if (!user) throw new Error("Sign in to open this private project.");
      const { data, error } = await supabase.from("agent_projects")
        .select("id,name,framework,messages,updated_at")
        .eq("id", projectId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Project not found or you do not have access.");
      return { project: data, files: await loadProjectFiles(projectId), messages: readMessages(data.messages) };
    },
  });

  useEffect(() => {
    if (!projectQuery.data) return;
    const hydrationKey = `${projectId}:${projectQuery.data.project.updated_at}`;
    if (hydratedRef.current === hydrationKey) return;
    hydratedRef.current = hydrationKey;
    setFiles(projectQuery.data.files);
    setMessages(projectQuery.data.messages);
    setActivePath(Object.keys(projectQuery.data.files).sort()[0] ?? "");
  }, [projectQuery.data, projectId, projectQuery.data?.project.updated_at]);

  useEffect(() => {
    if (!user || !projectQuery.data || hydratedRef.current !== `${projectId}:${projectQuery.data.project.updated_at}`) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await saveProjectFiles(projectId, user.id, files);
      } catch (error) {
        console.error("[Agent Studio] Autosave failed:", error);
        toast.error("Could not save your latest code changes.");
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [files, projectId, projectQuery.data, user]);

  const paths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);
  const activeContent = files[activePath] ?? "";

  useEffect(() => {
    if (!runtimeActiveRef.current) return;
    const timer = window.setTimeout(() => {
      void syncBrowserProject(projectId, files).catch((error) => {
        console.error("[Agent Studio] Browser runtime file sync failed:", error);
        toast.error("Could not sync the latest files to the browser preview.");
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [files, projectId]);

  const persistConversation = useCallback(async (next: ChatMessage[]) => {
    if (!user) return;
    const { error } = await supabase.from("agent_projects").update({ messages: next })
      .eq("id", projectId).eq("user_id", user.id);
    if (error) throw error;
    setMessages(next);
    await queryClient.invalidateQueries({ queryKey: ["agent-studio-projects", user.id] });
  }, [projectId, queryClient, user]);

  const sendMessage = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy || !user) return;
    const userMessage: ChatMessage = { role: "user", content: text, createdAt: new Date().toISOString() };
    const nextHistory = [...messages, userMessage].slice(-100);
    setPrompt("");
    setMessages(nextHistory);
    setBusy(true);
    try {
      await persistConversation(nextHistory);
      const result = await runCodingAgent({
        data: {
          prompt: text,
          mode: "build",
          modelTier: "fast",
          framework: projectQuery.data?.project.framework as "nextjs" | "tanstack" | "vite" | "vue" | "sveltekit" | "node" | "html" | undefined,
          files,
          history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content: content.slice(-3000) })),
        },
      });
      const updated = { ...files };
      for (const [path, content] of Object.entries(result.files ?? {})) {
        if (content === null) delete updated[path];
        else if (typeof content === "string") updated[path] = content;
      }
      if (Object.keys(result.files ?? {}).length) {
        await saveProjectFiles(projectId, user.id, updated);
        setFiles(updated);
        if (!activePath || !(activePath in updated)) setActivePath(Object.keys(updated).sort()[0] ?? "");
      }
      const answer = result.message || (result.complete ? "The requested changes have been generated." : "I’ve completed this batch and can continue with the next part.");
      const completedHistory = [...nextHistory, { role: "assistant" as const, content: answer, createdAt: new Date().toISOString() }].slice(-100);
      await persistConversation(completedHistory);
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success(Object.keys(result.files ?? {}).length ? "Workspace files updated." : "Agent replied.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The agent request failed.";
      const failedHistory = [...nextHistory, { role: "assistant" as const, content: "I couldn't complete that request: " + reason, createdAt: new Date().toISOString() }].slice(-100);
      await persistConversation(failedHistory).catch(() => undefined);
      toast.error(reason);
    } finally {
      setBusy(false);
    }
  }, [activePath, busy, files, messages, persistConversation, projectId, projectQuery.data?.project.framework, prompt, user]);

  const openPreview = async () => {
    setBusy(true);
    setRuntimeOutput("");
    try {
      await saveProjectFiles(projectId, user!.id, files);
      const result = await startBrowserPreview(projectId, files, (chunk) => setRuntimeOutput((current) => (current + chunk).slice(-12000)));
      runtimeActiveRef.current = true;
      setPreviewUrl(result.url);
      setTab("preview");
      toast.success("Browser preview is running.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start browser preview.";
      setRuntimeOutput((current) => (current + "\n" + message).slice(-12000));
      toast.error(message);
    } finally { setBusy(false); }
  };

  const openTerminal = async () => {
    setBusy(true);
    try {
      await saveProjectFiles(projectId, user!.id, files);
      await syncBrowserProject(projectId, files);
      runtimeActiveRef.current = true;
      setTab("terminal");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the browser terminal.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (tab !== "terminal" || !terminalHost.current) return;
    const terminal = new Terminal({ cursorBlink: true, convertEol: true, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", theme: { background: "#080b12", foreground: "#dbeafe", cursor: "#60a5fa" } });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalHost.current);
    fit.fit();
    let disposed = false;
    let closeSession: (() => void) | null = null;
    terminal.writeln("\x1b[90mStarting your browser terminal…\x1b[0m");
    void openBrowserTerminal((chunk) => terminal.write(chunk), { cols: terminal.cols, rows: terminal.rows })
      .then((session) => {
        if (disposed) { session.close(); return; }
        terminalSessionRef.current = session;
        closeSession = session.close;
        terminal.onData(session.write);
        terminal.onResize(session.resize);
        terminal.writeln("\r\n\x1b[90mConnected to your browser project runtime.\x1b[0m");
      })
      .catch((error) => terminal.writeln("\r\n\x1b[31m" + (error instanceof Error ? error.message : "Could not start terminal.") + "\x1b[0m"));
    terminalRef.current = terminal;
    const observer = new ResizeObserver(() => { try { fit.fit(); } catch { /* terminal is closing */ } });
    observer.observe(terminalHost.current);
    return () => {
      disposed = true;
      observer.disconnect();
      closeSession?.();
      terminalSessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [tab]);

  if (authLoading) return <main className="grid h-screen place-items-center bg-[#080b12] text-sm text-slate-400">Restoring your session…</main>;
  if (!user) return <main className="grid h-screen place-items-center bg-[#080b12] text-slate-300"><a href="/auth" className="underline">Sign in to open this project</a></main>;
  if (projectQuery.isLoading) return <main className="grid h-screen place-items-center bg-[#080b12] text-sm text-slate-400">Opening your Agent Studio workspace…</main>;
  if (projectQuery.isError || !projectQuery.data) return <main className="grid h-screen place-items-center bg-[#080b12] px-6 text-center text-sm text-rose-300">{(projectQuery.error as Error)?.message ?? "Project unavailable"}</main>;

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#080b12] text-slate-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d121d] px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/ai" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft size={14}/> Projects</Link>
          <span className="h-5 w-px bg-white/10"/>
          <Bot size={17} className="text-cyan-300"/>
          <strong className="truncate text-sm">{projectQuery.data.project.name}</strong>
          <span className="hidden rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-0.5 text-[10px] text-cyan-200 sm:inline">Agent Studio</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400"><span>⚡ {profile?.ai_credits ?? 0} credits</span><span className="hidden sm:inline">{saving ? "Saving…" : "Saved"} · {paths.length} files</span></div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex h-[48%] min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-[#0b101a] md:h-auto md:w-[390px] md:border-b-0 md:border-r">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-4"><Bot size={15} className="text-cyan-300"/><span className="text-xs font-semibold tracking-wide">AI AGENT</span><span className="ml-auto text-[10px] text-slate-500">Project conversation</span></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Bot size={16} className="text-cyan-300"/> Ready to build</div><p className="text-xs leading-5 text-slate-400">Describe a feature, ask for a change, or tell the agent what to create. Your conversation is saved with this project.</p></div>}
            {messages.map((message, index) => <article key={index} className={message.role === "user" ? "ml-7 rounded-xl border border-blue-400/15 bg-blue-400/[0.07] p-3" : "mr-3 rounded-xl border border-white/10 bg-white/[0.035] p-3"}><div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{message.role === "user" ? "You" : <><Bot size={12}/> ExpertsTeam Agent</>}</div><p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">{message.content}</p></article>)}
            {busy && <div className="flex items-center gap-2 text-xs text-cyan-200"><LoaderCircle size={14} className="animate-spin"/> Agent is working…</div>}
          </div>
          <form className="shrink-0 border-t border-white/10 p-3" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask ExpertsTeam Agent to build or change something…" rows={3} className="resize-none border-white/10 bg-[#080b12] text-xs text-slate-100 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"/>
            <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-600">Fast model · 1 credit per build</span><Button type="submit" size="sm" disabled={!prompt.trim() || busy} className="h-8 gap-2 bg-cyan-500 text-slate-950 hover:bg-cyan-400"><Send size={13}/> Send</Button></div>
          </form>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#080b12]">
          <nav className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d121d] px-3"><div className="flex h-full items-stretch gap-1">{([{id:"preview",label:"Preview",icon:Eye},{id:"code",label:"Code",icon:Code2},{id:"terminal",label:"Terminal",icon:TerminalSquare}] as const).map((item) => { const Icon=item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 border-b-2 px-3 text-xs ${tab===item.id?"border-cyan-400 text-cyan-200":"border-transparent text-slate-500 hover:text-slate-200"}`}><Icon size={14}/>{item.label}</button>; })}</div><div className="flex items-center gap-2"><Button type="button" size="sm" onClick={() => void openPreview()} disabled={busy || paths.length===0} className="h-7 gap-1.5 bg-emerald-500 px-2 text-[11px] text-slate-950 hover:bg-emerald-400"><Play size={12}/> Run</Button><Button type="button" size="sm" variant="outline" onClick={() => void openTerminal()} disabled={busy || paths.length===0} className="h-7 gap-1.5 border-white/10 bg-transparent px-2 text-[11px] text-slate-300"><SquareTerminal size={12}/> Connect</Button></div></nav>
          {tab === "preview" && <div className="flex min-h-0 flex-1 flex-col">{previewUrl ? <><div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3 text-[11px] text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400"/> Live browser preview</span><a href={previewUrl} target="_blank" rel="noreferrer" className="hover:text-white">Open separately ↗</a></div><iframe title="Project preview" src={previewUrl} className="min-h-0 flex-1 border-0 bg-white" allow="clipboard-read; clipboard-write; fullscreen"/></> : <div className="grid flex-1 place-items-center p-8 text-center"><div><Eye size={30} className="mx-auto mb-3 text-slate-600"/><h2 className="text-sm font-semibold text-slate-300">Your live preview appears here</h2><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">Run the project in your browser. Your source files remain saved in Supabase.</p><Button type="button" onClick={() => void openPreview()} disabled={busy || paths.length===0} className="mt-4 bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Play size={14} className="mr-2"/> Start preview</Button></div></div>}</div>}
          {tab === "code" && <div className="flex min-h-0 flex-1"><aside className="w-52 shrink-0 overflow-y-auto border-r border-white/10 bg-[#0b101a] p-2"><div className="mb-2 flex items-center gap-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Folder size={13}/> Files</div>{paths.map(path => <button key={path} type="button" onClick={() => setActivePath(path)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${activePath===path?"bg-cyan-400/10 text-cyan-200":"text-slate-400 hover:bg-white/5"}`}><FileCode2 size={13}/><span className="truncate">{path}</span></button>)}</aside><div className="flex min-w-0 flex-1 flex-col"><div className="flex h-9 shrink-0 items-center border-b border-white/10 px-3 text-xs text-slate-400">{activePath || "Select a file"}</div>{activePath ? <CodeMirror value={activeContent} height="100%" theme={oneDark} extensions={[]} onChange={(value) => setFiles(current => ({...current,[activePath]:value}))} basicSetup={{ lineNumbers:true, foldGutter:true }}/> : <div className="grid flex-1 place-items-center text-xs text-slate-500">No source files in this project yet.</div>}</div></div>}
          {tab === "terminal" && <div className="flex min-h-0 flex-1 flex-col"><div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3 text-[11px] text-slate-500"><span className="flex items-center gap-2"><TerminalSquare size={13}/> Browser terminal · Shell</span><span>{terminalInfo ? "Connected workspace" : "Not connected"}</span></div><div ref={terminalHost} className="min-h-0 flex-1 overflow-hidden p-2" />{!terminalInfo && <div className="p-4 text-center text-xs text-slate-500">Connect to start a shell inside this browser tab. No remote preview sandbox is created.</div>}</div>}
        </section>
      </div>
    </main>
  );
}
