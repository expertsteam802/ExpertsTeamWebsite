/* eslint-disable no-control-regex */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Code2, Eye, LoaderCircle, Play, Send, SquareTerminal, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { loadProjectBinaryAssets, loadProjectFiles, saveProjectFiles } from "@/lib/project-files";
import { getProjectPublicEnvironment, runCodingAgent } from "@/lib/agent.functions";
import { openBrowserTerminal, startBrowserPreview, stopBrowserPreview, syncBrowserProject, watchBrowserProject, type BrowserPreviewPort } from "@/lib/browser-webcontainer";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { Terminal } from "@xterm/xterm";
import { BoltFileTree } from "@/components/bolt-port/FileTree";
import { BoltPreviewPanel } from "@/components/bolt-port/Preview";
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
  const [binaryAssets, setBinaryAssets] = useState<Record<string, Uint8Array>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [activePath, setActivePath] = useState("");
  const [tab, setTab] = useState<WorkbenchTab>("preview");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewPorts, setPreviewPorts] = useState<BrowserPreviewPort[]>([]);
  const [selectedPreviewPort, setSelectedPreviewPort] = useState<number | null>(null);
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const terminalSessionRef = useRef<{ write: (value: string) => void; resize: (size: { cols: number; rows: number }) => void; close: () => void } | null>(null);
  const runtimeActiveRef = useRef(false);
  const [runtimeOutput, setRuntimeOutput] = useState("");
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [terminalConnected, setTerminalConnected] = useState(false);
  const hydratedRef = useRef("");

  useEffect(() => () => {
    runtimeActiveRef.current = false;
    stopBrowserPreview();
  }, []);

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
      const [files, binaryAssets] = await Promise.all([loadProjectFiles(projectId), loadProjectBinaryAssets(projectId, user.id)]);
      return { project: data, files, binaryAssets, messages: readMessages(data.messages) };
    },
  });

  useEffect(() => {
    if (!projectQuery.data) return;
    const hydrationKey = `${projectId}:${projectQuery.data.project.updated_at}`;
    if (hydratedRef.current === hydrationKey) return;
    hydratedRef.current = hydrationKey;
    setFiles(projectQuery.data.files);
    setBinaryAssets(projectQuery.data.binaryAssets);
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
      void syncBrowserProject(projectId, { ...files, ...binaryAssets }).catch((error) => {
        console.error("[Agent Studio] Browser runtime file sync failed:", error);
        toast.error("Could not sync the latest files to the browser preview.");
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [files, binaryAssets, projectId]);

  useEffect(() => {
    if (!runtimeReady) return;
    let disposed = false;
    let closeWatcher: (() => void) | null = null;
    void watchBrowserProject((path, contents) => {
      if (disposed) return;
      setFiles((current) => {
        if (contents === null) {
          if (!(path in current)) return current;
          const next = { ...current };
          delete next[path];
          return next;
        }
        if (current[path] === contents) return current;
        return { ...current, [path]: contents };
      });
    }).then((close) => {
      if (disposed) close();
      else closeWatcher = close;
    }).catch((error) => {
      console.error("[Agent Studio] Browser filesystem watcher failed:", error);
      toast.error("The browser terminal is running, but terminal file changes may not sync until you refresh.");
    });
    return () => {
      disposed = true;
      closeWatcher?.();
    };
  }, [runtimeReady, projectId]);

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
    setPreviewUrl("");
    setPreviewPorts([]);
    setSelectedPreviewPort(null);
    try {
      const previewFiles = { ...files };
      if (!previewFiles["package.json"]) {
        previewFiles["package.json"] = JSON.stringify({
          private: true,
          type: "module",
          scripts: { dev: "vite --host 0.0.0.0" },
          devDependencies: { vite: "^6.4.6" },
        }, null, 2);
      }
      if (!previewFiles["index.html"]) {
        previewFiles["index.html"] = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ExpertsTeam Preview</title></head><body><h1>Project preview</h1></body></html>';
      }
      setFiles(previewFiles);
      await saveProjectFiles(projectId, user!.id, previewFiles);
      const publicEnvironment = await getProjectPublicEnvironment({ data: { projectId } });
      const result = await startBrowserPreview(
        projectId,
        { ...previewFiles, ...binaryAssets },
        publicEnvironment,
        (chunk) => {
          // This output is rendered in a plain <pre>, not an ANSI terminal.
          // Strip terminal control sequences so logs show readable words.
          const readable = chunk
            .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
            .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
            .replace(/\x1B[P^_].*?\x1B\\/gs, "")
            .replace(/\x1B[@-_]/g, "")
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
          setRuntimeOutput((current) => (current + readable).slice(-12000));
        },
        (url) => setPreviewUrl(url ?? ""),
        (ports) => {
          setPreviewPorts(ports);
          setSelectedPreviewPort((current) => {
            const selected = ports.find((item) => item.port === current) ?? ports.find((item) => item.ready);
            if (selected && selected.port !== current) setPreviewUrl(selected.url);
            return selected?.port ?? null;
          });
        },
      );
      runtimeActiveRef.current = true;
      setRuntimeReady(true);
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
    if (terminalConnected) {
      setTab("terminal");
      return;
    }
    setBusy(true);
    try {
      await saveProjectFiles(projectId, user!.id, files);
      await syncBrowserProject(projectId, { ...files, ...binaryAssets });
      runtimeActiveRef.current = true;
      setRuntimeReady(true);
      setTerminalConnected(true);
      setTab("terminal");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the browser terminal.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!terminalConnected || !terminalHost.current) return;
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
  }, [terminalConnected]);

  if (authLoading) return <main className="grid h-screen place-items-center bg-[#080b12] text-sm text-slate-400">Restoring your session…</main>;
  if (!user) return <main className="grid h-screen place-items-center bg-[#080b12] text-slate-300"><a href="/auth" className="underline">Sign in to open this project</a></main>;
  if (projectQuery.isLoading) return <main className="grid h-screen place-items-center bg-[#080b12] text-sm text-slate-400">Opening your Agent Studio workspace…</main>;
  if (projectQuery.isError || !projectQuery.data) return <main className="grid h-screen place-items-center bg-[#080b12] px-6 text-center text-sm text-rose-300">{(projectQuery.error as Error)?.message ?? "Project unavailable"}</main>;

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#0b0b0c] text-[#e5e5e5]">
      <header className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#111113] px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/ai" className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-[#a1a1aa] transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft size={14}/> Projects</Link>
          <span className="h-5 w-px bg-white/10"/>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-black text-black">E</div>
          <strong className="max-w-[240px] truncate text-[13px] font-medium text-[#e4e4e7]">{projectQuery.data.project.name}</strong>
          <span className="hidden rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#a1a1aa] sm:inline">Agent</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-[#71717a] sm:inline">{saving ? "Saving changes…" : "All changes saved"} · {paths.length} files</span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-[#a1a1aa]">⚡ {profile?.ai_credits ?? 0}</span>
          <Button type="button" size="sm" onClick={() => void openPreview()} disabled={busy || paths.length===0} className="h-7 gap-1.5 rounded-md bg-[#e5e5e5] px-3 text-[11px] font-medium text-black hover:bg-white"><Play size={12}/> Run</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex min-h-0 w-full max-w-[420px] shrink-0 flex-col border-r border-white/[0.08] bg-[#111113] max-md:max-w-[48%] max-sm:max-w-[54%]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#e4e4e7]"><Bot size={15} className="text-cyan-300"/> Chat</div>
            <span className="text-[10px] text-[#71717a]">ExpertsTeam Agent</span>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
            {messages.length === 0 && <div className="mx-auto mt-8 max-w-[280px] text-center"><div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><Bot size={20} className="text-[#a1a1aa]"/></div><h2 className="text-[15px] font-medium text-[#e4e4e7]">What should we build?</h2><p className="mt-2 text-[12px] leading-5 text-[#85858d]">Describe your app or the change you want. The agent will work directly in this project and you can preview the result beside the chat.</p></div>}
            {messages.map((message, index) => <article key={index} className={message.role === "user" ? "ml-5 rounded-xl bg-[#202024] px-3.5 py-3" : "mr-1 px-1 py-2"}>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-[#8b8b94]">{message.role === "user" ? "You" : <><Bot size={12} className="text-cyan-300"/> ExpertsTeam</>}</div>
              <p className="whitespace-pre-wrap break-words text-[12px] leading-[1.65] text-[#dedee2]">{message.content}</p>
            </article>)}
            {busy && <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] text-[#a1a1aa]"><LoaderCircle size={14} className="animate-spin"/> Working on your project…</div>}
          </div>
          <form className="shrink-0 border-t border-white/[0.07] p-3" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <div className="rounded-xl border border-white/[0.12] bg-[#19191c] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.22)] focus-within:border-white/25">
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask ExpertsTeam to build anything…" rows={4} className="min-h-[88px] resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-5 text-white shadow-none placeholder:text-[#686870] focus-visible:ring-0"/>
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[10px] text-[#777780]">Kilo · Free model</span>
                <Button type="submit" size="sm" disabled={!prompt.trim() || busy} className="h-7 gap-1.5 rounded-lg bg-[#e5e5e5] px-3 text-[11px] text-black hover:bg-white disabled:opacity-40"><Send size={12}/> Send</Button>
              </div>
            </div>
            <p className="mt-2 text-center text-[9px] text-[#62626a]">AI can make mistakes. Review generated changes before publishing.</p>
          </form>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0b0c]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#111113] px-3">
            <div className="flex h-full items-stretch gap-1">
              {([{id:"preview",label:"Preview",icon:Eye},{id:"code",label:"Code",icon:Code2},{id:"terminal",label:"Terminal",icon:TerminalSquare}] as const).map((item) => { const Icon=item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 border-b-2 px-3 text-[11px] transition ${tab===item.id?"border-white text-white":"border-transparent text-[#777780] hover:text-[#d4d4d8]"}`}><Icon size={13}/>{item.label}</button>; })}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] text-[#71717a] sm:inline">{runtimeReady ? "Browser runtime ready" : "Local browser runtime"}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void openTerminal()} disabled={busy} className="h-7 gap-1.5 rounded-md border-white/10 bg-transparent px-2.5 text-[10px] text-[#b4b4bc] hover:bg-white/[0.06] hover:text-white"><SquareTerminal size={12}/> Connect terminal</Button>
            </div>
          </div>

          {tab === "preview" && <BoltPreviewPanel
            previewUrl={previewUrl}
            previewPorts={previewPorts}
            selectedPreviewPort={selectedPreviewPort}
            runtimeOutput={runtimeOutput}
            busy={busy}
            canRun={paths.length > 0}
            onStart={() => void openPreview()}
            onSelectPort={(port) => {
              const selected = previewPorts.find((item) => item.port === port);
              if (selected) {
                setSelectedPreviewPort(port);
                setPreviewUrl(selected.url);
              }
            }}
          />}

          {tab === "code" && <div className="flex min-h-0 flex-1">
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/[0.08] bg-[#101012] max-sm:w-[150px]">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#85858d]">Files</span><span className="text-[10px] text-[#66666e]">{paths.length}</span></div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <BoltFileTree paths={paths} selectedPath={activePath} onSelect={setActivePath}/>
              </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-3"><span className="truncate text-[11px] text-[#b4b4bc]">{activePath || "Select a file"}</span><span className="text-[10px] text-[#66666e]">Editing</span></div>
              {activePath ? <CodeMirror value={activeContent} height="100%" theme={oneDark} extensions={[]} onChange={(value) => setFiles(current => ({...current,[activePath]:value}))} basicSetup={{ lineNumbers:true, foldGutter:true }}/> : <div className="grid flex-1 place-items-center text-[11px] text-[#71717a]">Select a file from the explorer</div>}
            </div>
          </div>}

          <div className={`min-h-0 flex-1 flex-col ${tab === "terminal" ? "flex" : "hidden"}`}>
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-3 text-[10px] text-[#85858d]"><span className="flex items-center gap-2"><TerminalSquare size={13}/> Terminal</span><span>{terminalConnected ? "Connected · WebContainer" : "Not connected"}</span></div>
            <div ref={terminalHost} className="min-h-0 flex-1 overflow-hidden bg-[#0b0b0c] p-3"/>
          </div>
        </section>
      </div>
    </main>
  );
}
