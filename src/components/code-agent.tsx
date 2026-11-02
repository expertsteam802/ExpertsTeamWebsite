import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Copy,
  ExternalLink,
  FilePlus2,
  FileCode2,
  Github,
  Globe,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Terminal,
  Play,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { pushProjectToGithub, runCodingAgent } from "@/lib/agent.functions";
import { buildSrcDocWithConsole, slugify, STARTER_FILES, type ProjectFiles } from "@/lib/sandbox";

type Msg = { role: "user" | "assistant"; content: string };
type ProjectRow = {
  id: string;
  name: string;
  files: ProjectFiles;
  messages: Msg[];
  published: boolean;
  slug: string | null;
  github_repo: string | null;
  updated_at: string;
};

export function CodeAgent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const push = useServerFn(pushProjectToGithub);
  const run = useServerFn(runCodingAgent);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Untitled app");
  const [files, setFiles] = useState<ProjectFiles>(STARTER_FILES);
  const [active, setActive] = useState("index.html");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [view, setView] = useState<"code" | "preview" | "console">("preview");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
  const [pagesUrl, setPagesUrl] = useState<string | null>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __agentConsole?: boolean; type: string; message: string };
      if (d && d.__agentConsole)
        setLogs((l) => [...l.slice(-199), { type: d.type, message: d.message }]);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const [published, setPublished] = useState<{ on: boolean; slug: string | null }>({
    on: false,
    slug: null,
  });
  const [ghOpen, setGhOpen] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [ghRepo, setGhRepo] = useState("");

  const srcDoc = useMemo(() => buildSrcDocWithConsole(files), [files]);

  const { data: projects = [] } = useQuery({
    queryKey: ["agent-projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("agent_projects")
        .select("id, name, files, messages, published, slug, github_repo, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ProjectRow[];
    },
  });

  async function persist(
    next: { files?: ProjectFiles; messages?: Msg[]; extra?: Record<string, unknown> } = {},
  ) {
    if (!user) throw new Error("Sign in before saving an app.");
    const payload = {
      user_id: user.id,
      name: name.trim().slice(0, 80) || "Untitled app",
      files: (next.files ?? files) as unknown as Json,
      messages: (next.messages ?? messages).slice(-40) as unknown as Json,
      ...next.extra,
    };
    if (projectId) {
      const { error } = await supabase.from("agent_projects").update(payload).eq("id", projectId);
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ["agent-projects", user?.id] });
      return projectId;
    }
    const { data, error } = await supabase
      .from("agent_projects")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    setProjectId(data.id);
    void queryClient.invalidateQueries({ queryKey: ["agent-projects", user?.id] });
    return data.id;
  }

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    setPrompt("");
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const result = await run({
        data: { prompt: text, files, history: messages.slice(-8) },
      });
      const merged: ProjectFiles = { ...files };
      const changed: string[] = [];
      for (const [path, content] of Object.entries(result.files)) {
        if (content === null) delete merged[path];
        else merged[path] = String(content);
        changed.push(path);
      }
      const reply = `${result.message}${changed.length ? `\n\nFiles: ${changed.join(", ")}` : ""}`;
      const finalMessages: Msg[] = [...nextMessages, { role: "assistant", content: reply }];
      setFiles(merged);
      setMessages(finalMessages);
      if (changed[0] && merged[changed[0]] !== undefined) setActive(changed[0]);
      else if (merged[active] === undefined) setActive(Object.keys(merged)[0] ?? "");
      setPreviewKey((k) => k + 1);
      await persist({ files: merged, messages: finalMessages });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent failed");
    } finally {
      setBusy(false);
    }
  }

  const save = useMutation({
    mutationFn: () => persist(),
    onSuccess: () => toast.success("Project saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (on: boolean) => {
      const slug = published.slug ?? `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
      await persist({ extra: { published: on, slug } });
      return { on, slug };
    },
    onSuccess: (result) => {
      setPublished({ on: result.on, slug: result.slug });
      toast.success(result.on ? "Your app is live" : "App unpublished");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      if (id === projectId) newProject();
      void queryClient.invalidateQueries({ queryKey: ["agent-projects", user?.id] });
    },
  });

  const github = useMutation({
    mutationFn: async () => {
      const result = await push({ data: { token: ghToken, repo: ghRepo, files } });
      if (!result.ok) throw new Error(result.error);
      await persist({ extra: { github_repo: result.url } });
      setPagesUrl(result.pagesUrl);
      return result.url;
    },
    onSuccess: (url) => {
      setGhOpen(false);
      setGhToken("");
      toast.success("Pushed to GitHub", {
        action: { label: "Open", onClick: () => window.open(url, "_blank") },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function newProject() {
    setProjectId(null);
    setName("Untitled app");
    setFiles(STARTER_FILES);
    setMessages([]);
    setActive("index.html");
    setPublished({ on: false, slug: null });
    setPagesUrl(null);
    setGhRepo("");
    setLogs([]);
  }

  function load(p: ProjectRow) {
    setProjectId(p.id);
    setName(p.name);
    setFiles(p.files && Object.keys(p.files).length ? p.files : STARTER_FILES);
    setMessages(Array.isArray(p.messages) ? p.messages : []);
    setActive(Object.keys(p.files ?? {})[0] ?? "index.html");
    setPublished({ on: p.published, slug: p.slug });
    setGhRepo(p.github_repo?.split("/").pop() ?? slugify(p.name));
    setPagesUrl(null);
    setLogs([]);
  }

  function addFile() {
    const fileName = window.prompt("New file name (e.g. about.html, data.json)")?.trim();
    if (!fileName) return;
    setFiles((f) => ({ ...f, [fileName]: f[fileName] ?? "" }));
    setActive(fileName);
    setView("code");
  }

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <Bot className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold">
          Sign in to use the app builder agent
        </h2>
      </Card>
    );
  }

  const liveUrl = published.on && published.slug ? `/apps/${published.slug}` : null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#050d1b] text-white">
      <div className="mx-auto w-full max-w-[1800px] px-3 py-4 lg:px-5">
        <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#081423] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <header className="flex items-center justify-between border-b border-white/10 bg-[#07111d] px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/25">
                E
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-300/80">
                  ExpertsAgent
                </p>
                <h1 className="text-base font-semibold tracking-tight">Full builder workspace</h1>
              </div>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              {[
                "Builder",
                "Files",
                "Terminal",
                "Preview",
                "GitHub",
                "Deploy",
              ].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    item === "Builder"
                      ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
                      : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                Save
              </Button>
              <Button
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={() => publish.mutate(!published.on)}
                disabled={publish.isPending}
              >
                {published.on ? "Unpublish" : "Publish"}
              </Button>
            </div>
          </header>

          <div className="grid gap-0 border-b border-white/10 bg-[#0a1528] p-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-[18px] border border-white/10 bg-[#0e1a2d] p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <span className="font-semibold text-slate-200">Project</span>
                </div>
                <button
                  type="button"
                  onClick={addFile}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                  aria-label="Add file"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                {Object.keys(files).map((file) => (
                  <button
                    key={file}
                    type="button"
                    onClick={() => {
                      setActive(file);
                      setView("code");
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-xs transition ${
                      file === active
                        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                        : "border-transparent bg-transparent text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate">{file}</span>
                    {file === active && <span className="ml-2 h-2 w-2 rounded-full bg-cyan-400" />}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-[#0b1626] p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Live status
                </div>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Build</span>
                    <span className="text-emerald-400">Ready</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Deploy</span>
                    <span className="text-cyan-400">Online</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>GitHub</span>
                    <span className="text-violet-400">Synced</span>
                  </div>
                </div>
              </div>
            </aside>

            <div className="rounded-[18px] border border-white/10 bg-[#081827] p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 max-w-xs border-white/10 bg-white/5 text-white placeholder:text-slate-400"
                  aria-label="App name"
                />
                <Button size="sm" variant="secondary" onClick={newProject} className="bg-white/5 hover:bg-white/10">
                  <Plus className="mr-1 h-3.5 w-3.5" /> New
                </Button>
                <Button size="sm" variant="secondary" onClick={() => save.mutate()} className="bg-white/5 hover:bg-white/10">
                  <Save className="mr-1 h-3.5 w-3.5" /> Save
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setGhRepo((r) => r || slugify(name));
                    setGhOpen(true);
                  }}
                  className="bg-white/5 hover:bg-white/10"
                >
                  <Github className="mr-1 h-3.5 w-3.5" /> Push to GitHub
                </Button>
                <Button
                  size="sm"
                  onClick={() => publish.mutate(!published.on)}
                  disabled={publish.isPending}
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                >
                  <Globe className="mr-1 h-3.5 w-3.5" /> {published.on ? "Unpublish" : "Publish"}
                </Button>
                {pagesUrl && (
                  <a
                    href={pagesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                  >
                    <Github className="h-3 w-3" /> GitHub Pages
                  </a>
                )}
                {liveUrl && published.slug && (
                  <Link
                    to="/apps/$slug"
                    params={{ slug: published.slug }}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> {liveUrl}
                  </Link>
                )}
              </div>

              <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[#0a1320]">
                <div className="flex items-center gap-2 border-b border-white/10 bg-[#0a1320] px-3 py-2.5">
                  <Bot className="h-4 w-4 text-cyan-300" />
                  <span className="text-sm font-semibold text-white">Agent</span>
                </div>

                <div className="grid gap-0 lg:grid-cols-[minmax(0, 320px)_1fr]">
                  <div className="border-r border-white/10 bg-[#0c1828]">
                    <div className="space-y-2 p-3">
                      {messages.length === 0 && (
                        <div className="space-y-2">
                          {[
                            "Build a snake game with a score board",
                            "Make a portfolio page with dark theme and contact form",
                            "Create a todo app saving to localStorage",
                          ].map((idea) => (
                            <button
                              key={idea}
                              type="button"
                              onClick={() => setPrompt(idea)}
                              className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-left text-xs text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
                            >
                              {idea}
                            </button>
                          ))}
                        </div>
                      )}

                      {messages.map((m, i) => (
                        <div
                          key={i}
                          className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-xs ${
                            m.role === "user"
                              ? "ml-5 bg-cyan-500/15 text-cyan-50"
                              : "mr-3 border border-white/10 bg-white/5 text-slate-200"
                          }`}
                        >
                          {m.content}
                        </div>
                      ))}

                      {busy && (
                        <p className="flex items-center gap-2 text-xs text-slate-300">
                          <Loader2 className="h-3 w-3 animate-spin" /> Agent is writing files…
                        </p>
                      )}
                    </div>

                    <div className="flex items-end gap-2 border-t border-white/10 p-3">
                      <Textarea
                        rows={2}
                        value={prompt}
                        placeholder="Describe the app or a change…"
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void send();
                          }
                        }}
                        className="min-h-10 resize-none border-white/10 bg-white/5 text-sm text-white placeholder:text-slate-400"
                      />
                      <Button size="icon" onClick={() => void send()} disabled={busy} aria-label="Send to agent">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-[#081827]">
                    <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-2">
                      <Button size="sm" variant={view === "preview" ? "default" : "ghost"} onClick={() => setView("preview")}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Preview
                      </Button>
                      <Button size="sm" variant={view === "code" ? "default" : "ghost"} onClick={() => setView("code")}>
                        <FileCode2 className="mr-1 h-3.5 w-3.5" /> Code
                      </Button>
                      <Button size="sm" variant={view === "console" ? "default" : "ghost"} onClick={() => setView("console")}>
                        <Terminal className="mr-1 h-3.5 w-3.5" /> Console
                        {logs.some((l) => l.type === "error") && (
                          <span className="ml-1 h-2 w-2 rounded-full bg-destructive" />
                        )}
                      </Button>

                      {view === "preview" && (
                        <div className="ml-2 flex gap-0.5">
                          {(
                            [
                              ["desktop", Monitor],
                              ["tablet", Tablet],
                              ["mobile", Smartphone],
                            ] as const
                          ).map(([d, Icon]) => (
                            <Button
                              key={d}
                              size="icon"
                              variant={device === d ? "secondary" : "ghost"}
                              className="h-8 w-8"
                              aria-label={`${d} view`}
                              onClick={() => setDevice(d)}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </Button>
                          ))}
                        </div>
                      )}

                      <div className="ml-auto flex gap-1">
                        {view === "console" ? (
                          <Button size="sm" variant="ghost" onClick={() => setLogs([])}>
                            Clear
                          </Button>
                        ) : view === "preview" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setLogs([]);
                              setPreviewKey((k) => k + 1);
                            }}
                          >
                            Reload
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void navigator.clipboard.writeText(files[active] ?? "");
                              toast.success(`Copied ${active}`);
                            }}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                          </Button>
                        )}
                      </div>
                    </div>

                    {view === "console" ? (
                      <div className="flex-1 overflow-y-auto bg-[#050d1b] p-2 font-mono text-xs text-slate-200">
                        {!logs.length && <p className="text-slate-400">No console output yet.</p>}
                        {logs.map((l, i) => (
                          <p
                            key={i}
                            className={`border-b border-white/10 py-1 ${
                              l.type === "error" ? "text-red-400" : l.type === "warn" ? "text-cyan-300" : ""
                            }`}
                          >
                            [{l.type}] {l.message}
                          </p>
                        ))}
                      </div>
                    ) : view === "preview" ? (
                      <div className="flex h-[560px] items-center justify-center overflow-auto bg-[#050d1b] p-4">
                        <iframe
                          key={previewKey}
                          title="App sandbox"
                          srcDoc={srcDoc}
                          sandbox="allow-scripts allow-forms allow-modals allow-popups"
                          style={{ width: device === "desktop" ? "100%" : device === "tablet" ? 768 : 375 }}
                          className="h-full max-w-full rounded-xl border border-white/10 bg-white transition-all duration-300"
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-[560px]">
                        <div className="w-44 shrink-0 space-y-1 overflow-y-auto border-r border-white/10 bg-[#0b1626] p-2">
                          {Object.keys(files).map((f) => (
                            <div key={f} className="group flex items-center">
                              <button
                                onClick={() => setActive(f)}
                                className={`flex-1 truncate rounded px-2 py-1 text-left text-xs ${
                                  f === active ? "bg-cyan-500/10 text-cyan-100" : "text-slate-300 hover:bg-white/5"
                                }`}
                              >
                                {f}
                              </button>
                              <button
                                aria-label={`Delete ${f}`}
                                className="hidden px-1 text-slate-400 group-hover:block"
                                onClick={() => {
                                  const next = { ...files };
                                  delete next[f];
                                  setFiles(next);
                                  if (active === f) setActive(Object.keys(next)[0] ?? "");
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <button onClick={addFile} className="flex w-full items-center gap-1 px-2 py-1 text-xs text-cyan-300">
                            <FilePlus2 className="h-3 w-3" /> Add file
                          </button>
                        </div>
                        <textarea
                          aria-label="File contents"
                          disabled={!active}
                          value={files[active] ?? ""}
                          onChange={(e) => setFiles((cur) => ({ ...cur, [active]: e.target.value }))}
                          spellCheck={false}
                          className="h-full flex-1 resize-none bg-[#050d1b] p-3 font-mono text-xs text-slate-200 outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={ghOpen} onOpenChange={setGhOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push to your GitHub</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gh-repo">Repository name</Label>
              <Input id="gh-repo" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gh-token">GitHub access token</Label>
              <Input
                id="gh-token"
                type="password"
                value={ghToken}
                onChange={(e) => setGhToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Create one at github.com → Settings → Developer settings → Tokens with "repo" access.
                It's used once and never saved.
              </p>
            </div>
            <Button className="w-full" onClick={() => github.mutate()} disabled={github.isPending}>
              {github.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              Push files
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
