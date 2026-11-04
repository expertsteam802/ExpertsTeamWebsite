import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  Copy,
  ExternalLink,
  Eye,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  Github,
  Loader2,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Smartphone,
  Square,
  Sparkles,
  Tablet,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { pushProjectToGithub, runCodingAgent } from "@/lib/agent.functions";
import { buildSrcDocWithConsole, STARTER_FILES, type ProjectFiles } from "@/lib/sandbox";
import {
  installDependencies,
  mountProjectFiles,
  removeProjectFile,
  startDevServer,
  startTerminalSession,
  stopTerminalSession,
  stopDevServer,
  writeTerminalInput,
  writeProjectFile,
} from "@/lib/webcontainer-runtime";

type Message = { role: "user" | "assistant"; content: string };

type ProjectRow = {
  id: string;
  name: string;
  files: ProjectFiles;
  messages: Message[];
  published: boolean;
  slug: string | null;
  github_repo: string | null;
  updated_at: string;
};

type Panel = "preview" | "code" | "console" | "terminal";

const EDITOR_SNIPPETS = [
  {
    pack: "react",
    label: "React component",
    value:
      "export default function App() {\n  return (\n    <main>\n      <h1>Hello, ExpertsTeam</h1>\n    </main>\n  );\n}",
  },
  { pack: "react", label: "useState hook", value: 'const [value, setValue] = useState("");' },
  {
    pack: "react",
    label: "useEffect hook",
    value: "useEffect(() => {\n  // Run side effects here\n}, []);",
  },
  {
    pack: "html",
    label: "HTML page",
    value:
      '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>New page</title>\n  </head>\n  <body>\n    <main></main>\n  </body>\n</html>',
  },
  {
    pack: "html",
    label: "Accessible button",
    value: '<button type="button" aria-label="Action">Click me</button>',
  },
  {
    pack: "css",
    label: "Responsive layout",
    value:
      ".container {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 1rem;\n}",
  },
  {
    pack: "css",
    label: "Mobile breakpoint",
    value: "@media (max-width: 640px) {\n  .container {\n    grid-template-columns: 1fr;\n  }\n}",
  },
];

const suggestions = [
  "Build a modern landing page for my business",
  "Create a responsive dashboard with charts",
  "Make this project look more professional",
];

const fileIcon = (name: string) => {
  if (name.endsWith(".css")) return "text-sky-400";
  if (name.endsWith(".html")) return "text-orange-400";
  if (name.endsWith(".json")) return "text-yellow-400";
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "text-blue-400";
  if (name.endsWith(".js") || name.endsWith(".jsx")) return "text-yellow-300";
  return "text-slate-400";
};

export function CodeAgent() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const run = useServerFn(runCodingAgent);
  const push = useServerFn(pushProjectToGithub);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Untitled project");
  const [files, setFiles] = useState<ProjectFiles>(STARTER_FILES);
  const [activeFile, setActiveFile] = useState("index.html");
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("preview");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [completionsOpen, setCompletionsOpen] = useState(false);
  const [enabledEditorPacks, setEnabledEditorPacks] = useState<string[]>(["react", "html", "css"]);
  const [projectNameEditing, setProjectNameEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState("Not started");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalReady, setTerminalReady] = useState(false);
  const runtimeFilesRef = useRef<ProjectFiles>({});
  const runtimeInstallKeyRef = useRef<string | null>(null);
  const runtimeSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const srcDoc = useMemo(() => buildSrcDocWithConsole(files), [files]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["agent-projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("agent_projects")
        .select("id,name,files,messages,published,slug,github_repo,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
  });

  useEffect(() => {
    return () => {
      stopDevServer();
      stopTerminalSession();
    };
  }, []);

  useEffect(() => {
    if (!runtimeUrl) return;

    const previousFiles = runtimeFilesRef.current;
    const nextFiles = files;
    const changedPaths = new Set([...Object.keys(previousFiles), ...Object.keys(nextFiles)]);

    runtimeSyncQueueRef.current = runtimeSyncQueueRef.current
      .then(async () => {
        for (const path of changedPaths) {
          if (previousFiles[path] === nextFiles[path]) continue;
          if (nextFiles[path] === undefined) {
            await removeProjectFile(path);
          } else {
            await writeProjectFile(path, nextFiles[path]);
          }
        }
        runtimeFilesRef.current = { ...nextFiles };
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Could not sync project files.";
        setLogs((current) => [...current.slice(-199), { type: "error", message }]);
      });
  }, [files, runtimeUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        __agentConsole?: boolean;
        type?: string;
        message?: string;
      };
      if (!data?.__agentConsole) return;
      setLogs((current) => [
        ...current.slice(-199),
        { type: data.type ?? "log", message: data.message ?? "" },
      ]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function openTerminal() {
    if (terminalReady) return;
    setTerminalOutput((current) => current || "Starting browser shell…\r\n");
    try {
      // A terminal must open in the active project, not an empty WebContainer home.
      await runtimeSyncQueueRef.current;
      const runtimeAlreadyHasFiles =
        JSON.stringify(runtimeFilesRef.current) === JSON.stringify(files);
      if (!runtimeAlreadyHasFiles) {
        await mountProjectFiles(files, {
          onOutput: (output) => setTerminalOutput((current) => (current + output).slice(-40000)),
          onError: (message) =>
            setTerminalOutput((current) =>
              (current + `\\r\n[setup error] ${message}\\r\n`).slice(-40000),
            ),
        });
        runtimeFilesRef.current = { ...files };
      }
      const installKey = JSON.stringify({
        packageJson: files["package.json"] ?? "default-vite",
        packageLock: files["package-lock.json"] ?? "",
        npmShrinkwrap: files["npm-shrinkwrap.json"] ?? "",
      });
      if (runtimeInstallKeyRef.current !== installKey) {
        const exitCode = await installDependencies(
          {
            onOutput: (output) => setTerminalOutput((current) => (current + output).slice(-40000)),
            onError: (message) =>
              setTerminalOutput((current) =>
                (current + `\\r\n[setup error] ${message}\\r\n`).slice(-40000),
              ),
          },
          installKey,
        );
        if (exitCode !== 0)
          throw new Error(
            "Project dependencies could not be installed. Review the terminal output.",
          );
        runtimeInstallKeyRef.current = installKey;
      }
      await startTerminalSession(
        (chunk) => setTerminalOutput((current) => (current + chunk).slice(-40000)),
        (exitCode) => {
          setTerminalReady(false);
          setTerminalOutput(
            (current) => `${current}\r\n[process exited with code ${exitCode}]\r\n`,
          );
        },
      );
      setTerminalReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the terminal.";
      setTerminalOutput((current) => `${current}\r\n[terminal error] ${message}\r\n`);
      toast.error(message);
    }
  }

  async function submitTerminalCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput;
    if (!command.trim()) return;
    if (!terminalReady) {
      toast.error("Start the terminal before entering a command.");
      return;
    }
    try {
      await writeTerminalInput(`${command}\n`);
      setTerminalInput("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the command.");
    }
  }

  async function runProject() {
    if (runtimeBusy) return;

    setRuntimeBusy(true);
    setRuntimeStatus("Starting browser runtime…");
    setRuntimeUrl(null);
    stopDevServer();
    setPanel("preview");
    setLogs([]);

    const callbacks = {
      onOutput: (output: string) => {
        setLogs((current) => [...current.slice(-199), { type: "runtime", message: output }]);
      },
      onError: (message: string) => {
        setLogs((current) => [...current.slice(-199), { type: "error", message }]);
      },
      onServerReady: (_port: number, url: string) => {
        setRuntimeUrl(url);
        setRuntimeStatus("Running");
      },
    };

    try {
      await runtimeSyncQueueRef.current;
      const runtimeAlreadyHasFiles =
        JSON.stringify(runtimeFilesRef.current) === JSON.stringify(files);
      if (!runtimeAlreadyHasFiles) {
        await mountProjectFiles(files, callbacks);
        runtimeFilesRef.current = { ...files };
      }

      const installKey = JSON.stringify({
        packageJson: files["package.json"] ?? "default-vite",
        packageLock: files["package-lock.json"] ?? "",
        npmShrinkwrap: files["npm-shrinkwrap.json"] ?? "",
      });

      if (runtimeInstallKeyRef.current !== installKey) {
        setRuntimeStatus("Installing npm packages…");
        const exitCode = await installDependencies(callbacks, installKey);
        if (exitCode !== 0) {
          throw new Error("Package installation failed. Review the Console for details.");
        }
        runtimeInstallKeyRef.current = installKey;
      }

      setRuntimeStatus("Starting development server…");
      await startDevServer(callbacks);
      setPanel("preview");
      toast.success("Your project is running");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The project runtime could not start.";
      setRuntimeStatus("Could not start");
      setRuntimeUrl(null);
      setLogs((current) => [...current.slice(-199), { type: "error", message }]);
      toast.error(message);
    } finally {
      setRuntimeBusy(false);
    }
  }

  function resetRuntimeForProjectChange() {
    stopDevServer();
    stopTerminalSession();
    setTerminalReady(false);
    setTerminalInput("");
    setTerminalOutput("");
    setRuntimeUrl(null);
    setRuntimeStatus("Not started");
    runtimeFilesRef.current = {};
    runtimeInstallKeyRef.current = null;
  }

  async function saveProjectName() {
    const nextName = name.trim().slice(0, 80) || "Untitled project";
    const previousName = projects.find((project) => project.id === projectId)?.name ?? name;
    try {
      if (projectId && user) {
        const { data, error } = await supabase
          .from("agent_projects")
          .update({ name: nextName })
          .eq("id", projectId)
          .eq("user_id", user.id)
          .select("id,name")
          .maybeSingle();
        if (error) throw error;
        if (!data)
          throw new Error(
            "The project was not renamed. It may no longer belong to this account; refresh your projects and try again.",
          );
        setName(data.name);
        await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      } else {
        setName(nextName);
        await persist({ extra: { name: nextName } });
      }
      setProjectNameEditing(false);
      toast.success("Project name saved");
    } catch (error) {
      setName(previousName);
      toast.error(error instanceof Error ? error.message : "Could not rename project.");
    }
  }

  async function persist(
    next: {
      files?: ProjectFiles;
      messages?: Message[];
      extra?: Record<string, unknown>;
    } = {},
  ) {
    if (!user) throw new Error("Please sign in to save your project.");

    const payload = {
      user_id: user.id,
      name: name.trim().slice(0, 80) || "Untitled project",
      files: (next.files ?? files) as unknown as Json,
      messages: (next.messages ?? messages).slice(-40) as unknown as Json,
      ...next.extra,
    };

    if (projectId) {
      const { error } = await supabase
        .from("agent_projects")
        .update(payload)
        .eq("id", projectId)
        .eq("user_id", user.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      setDirty(false);
      return projectId;
    }

    const { data, error } = await supabase
      .from("agent_projects")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;
    setProjectId(data.id);
    setDirty(false);
    await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
    return data.id;
  }

  const saveMutation = useMutation({
    mutationFn: () => persist(),
    onSuccess: () => toast.success("Project saved successfully"),
    onError: (error: Error) => toast.error(error.message),
  });

  const githubMutation = useMutation({
    mutationFn: async () => {
      const result = await push({
        data: { token: githubToken, repo: githubRepo, files },
      });
      if (!result.ok) throw new Error(result.error || "GitHub push failed");
      await persist({ extra: { github_repo: result.url } });
      return result.url;
    },
    onSuccess: (url) => {
      setGithubOpen(false);
      setGithubToken("");
      toast.success("Project pushed to GitHub", {
        action: {
          label: "Open repository",
          onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
        },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function sendPrompt() {
    const text = prompt.trim();
    if (!text || busy) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setPrompt("");
    setBusy(true);

    try {
      const result = await run({
        data: { prompt: text, files, history: messages.slice(-8) },
      });
      const updatedFiles: ProjectFiles = { ...files };
      const changed: string[] = [];

      for (const [path, content] of Object.entries(result.files)) {
        if (content === null) delete updatedFiles[path];
        else updatedFiles[path] = String(content);
        changed.push(path);
      }

      const answer = `${result.message}${changed.length ? `\n\nUpdated files:\n${changed.map((path) => `- ${path}`).join("\n")}` : ""}`;
      const finalMessages: Message[] = [...nextMessages, { role: "assistant", content: answer }];

      setFiles(updatedFiles);
      setMessages(finalMessages);
      if (changed.length) {
        setDirty(true);
        const firstExistingFile = changed.find((path) => updatedFiles[path] !== undefined);
        if (firstExistingFile) {
          setActiveFile(firstExistingFile);
          setPanel("code");
        }
        setPreviewKey((value) => value + 1);
      }
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      await persist({ files: updatedFiles, messages: finalMessages });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "ExpertAI could not complete that change.";
      const failedMessages: Message[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: `I couldn't finish that change. Your existing project files were left unchanged.\n\n${detail}`,
        },
      ];
      setMessages(failedMessages);
      toast.error(detail);
      await persist({ messages: failedMessages });
    } finally {
      setBusy(false);
    }
  }

  function createProject() {
    resetRuntimeForProjectChange();
    setProjectId(null);
    setName("Untitled project");
    setFiles(STARTER_FILES);
    setMessages([]);
    setActiveFile("index.html");
    setLogs([]);
    setPanel("preview");
    setDirty(false);
    toast.success("New workspace created");
  }

  function openProject(project: ProjectRow) {
    resetRuntimeForProjectChange();
    setProjectId(project.id);
    setName(project.name);
    setFiles(project.files && Object.keys(project.files).length ? project.files : STARTER_FILES);
    const savedMessages = Array.isArray(project.messages) ? (project.messages as Message[]) : [];
    setMessages(savedMessages);
    setActiveFile(Object.keys(project.files ?? {})[0] ?? "index.html");
    setGithubRepo(project.github_repo?.split("/").pop() ?? "");
    setLogs([]);
    setPanel("preview");
    setDirty(false);
  }

  async function deleteProject(project: ProjectRow) {
    const confirmed = window.confirm(
      `Delete "${project.name}" permanently? This removes its saved project and files.`,
    );
    if (!confirmed || !user) return;

    const { error } = await supabase
      .from("agent_projects")
      .delete()
      .eq("id", project.id)
      .eq("user_id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (projectId === project.id) {
      resetRuntimeForProjectChange();
      setProjectId(null);
      setName("Untitled project");
      setFiles(STARTER_FILES);
      setMessages([]);
      setActiveFile("index.html");
      setLogs([]);
      setDirty(false);
    }

    await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
    toast.success("Project deleted");
  }

  const availableEditorSnippets = EDITOR_SNIPPETS.filter(
    (snippet) =>
      enabledEditorPacks.includes(snippet.pack) &&
      (snippet.pack === "react"
        ? /\.tsx?$|\.jsx?$/.test(activeFile)
        : snippet.pack === "html"
          ? activeFile.endsWith(".html")
          : activeFile.endsWith(".css")),
  );

  function insertEditorSnippet(value: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const nextValue = editor.value.slice(0, start) + value + editor.value.slice(end);
    updateFile(nextValue);
    setCompletionsOpen(false);
    window.setTimeout(() => {
      editor.focus();
      editor.setSelectionRange(start + value.length, start + value.length);
    }, 0);
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const editor = event.currentTarget;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveMutation.mutate();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      setCompletionsOpen(true);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
      updateFile(editor.value);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const before = editor.value.slice(0, editor.selectionStart);
      const line = before.split("\n").pop() ?? "";
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const trimmedBefore = before.trimEnd();
      const extraIndent = ["{", "(", "["].some((character) => trimmedBefore.endsWith(character))
        ? "  "
        : "";
      editor.setRangeText(
        "\n" + indent + extraIndent,
        editor.selectionStart,
        editor.selectionEnd,
        "end",
      );
      updateFile(editor.value);
      return;
    }
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
    const closing = pairs[event.key];
    if (closing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText(event.key + closing, start, end, "end");
      editor.setSelectionRange(start + 1, start + 1);
      updateFile(editor.value);
    }
  }

  function createFile() {
    const path = newFileName.trim().replace(/^\/+/, "");
    if (!path || path.includes("..") || path.startsWith(".")) {
      toast.error("Enter a valid file name.");
      return;
    }
    if (files[path] !== undefined) {
      toast.error("That file already exists.");
      return;
    }
    setFiles((current) => ({ ...current, [path]: "" }));
    setActiveFile(path);
    setNewFileName("");
    setNewFileOpen(false);
    setPanel("code");
    setDirty(true);
  }

  function deleteFile(path: string) {
    if (Object.keys(files).length <= 1) {
      toast.error("A project must contain at least one file.");
      return;
    }
    const updated = { ...files };
    delete updated[path];
    setFiles(updated);
    if (activeFile === path) setActiveFile(Object.keys(updated)[0]);
    setDirty(true);
  }

  function updateFile(value: string) {
    setFiles((current) => ({ ...current, [activeFile]: value }));
    setDirty(true);
  }

  if (!user) {
    return (
      <div className="flex min-h-[620px] items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Your AI development studio</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to create projects, work with the AI agent and save your code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="not-prose flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#080e19] text-slate-100">
      {/* Workspace top bar */}
      <header className="flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0d1523] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                ExpertsTeam
              </span>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-200">
                AI STUDIO
              </span>
            </div>
            <div className="flex items-center gap-2">
              {projectNameEditing ? (
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => void saveProjectName()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") setProjectNameEditing(false);
                  }}
                  className="h-6 w-48 border-white/10 bg-white/5 px-2 text-sm"
                />
              ) : (
                <button
                  onClick={() => setProjectNameEditing(true)}
                  className="max-w-[220px] truncate text-sm font-semibold hover:text-cyan-200"
                  title="Rename project"
                >
                  {name}
                </button>
              )}
              <span className="text-xs text-slate-500">
                {dirty ? "• Unsaved changes" : "• Saved"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={createProject}
            className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New project
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setGithubRepo((value) => value || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
              setGithubOpen(true);
            }}
            className="h-8 bg-white text-slate-950 hover:bg-slate-200"
          >
            <Github className="mr-1.5 h-3.5 w-3.5" />
            GitHub
          </Button>
        </div>
      </header>

      {/* Main workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left sidebar */}
        {sidebarOpen && (
          <aside className="flex min-h-0 flex-col overflow-y-auto border-b border-white/[0.08] bg-[#0b1320] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Workspace
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                aria-label="Hide sidebar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Folder className="h-3.5 w-3.5 text-cyan-300" />
                  Your projects
                </span>
                <button
                  onClick={createProject}
                  className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-cyan-300"
                  aria-label="Create project"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="max-h-40 space-y-1 overflow-y-auto">
                {projectsLoading && (
                  <p className="px-2 py-2 text-xs text-slate-500">Loading projects…</p>
                )}
                {!projectsLoading && projects.length === 0 && (
                  <p className="px-2 py-2 text-xs leading-5 text-slate-500">
                    Your saved projects will appear here.
                  </p>
                )}
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`group flex items-center gap-1 rounded-lg pr-1 transition ${
                      project.id === projectId ? "bg-cyan-400/10" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <button
                      onClick={() => openProject(project)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${
                        project.id === projectId
                          ? "text-cyan-200"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Code2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteProject(project)}
                      className="rounded p-1.5 text-slate-600 opacity-100 transition hover:bg-red-500/10 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Delete project ${project.name}`}
                      title="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-3 my-4 border-t border-white/[0.07]" />

            <div className="px-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Folder className="h-3.5 w-3.5 text-amber-300" />
                  Project files
                </span>
                <button
                  onClick={() => setNewFileOpen(true)}
                  className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-cyan-300"
                  aria-label="Add file"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-0.5">
                {Object.keys(files)
                  .sort()
                  .map((path) => (
                    <div
                      key={path}
                      className={`group flex items-center rounded-lg ${
                        path === activeFile ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setActiveFile(path);
                          setPanel("code");
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs ${
                          path === activeFile ? "text-white" : "text-slate-400"
                        }`}
                      >
                        <FileCode2 className={`h-3.5 w-3.5 shrink-0 ${fileIcon(path)}`} />
                        <span className="truncate">{path}</span>
                      </button>
                      <button
                        onClick={() => deleteFile(path)}
                        className="mr-1 hidden rounded p-1 text-slate-600 hover:bg-red-500/10 hover:text-red-300 group-hover:block"
                        aria-label={`Delete ${path}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="mt-auto p-3">
              <div className="rounded-xl border border-white/[0.07] bg-[#101c2d] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                  AI workspace
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Describe a feature, ask for a change or let the agent create project files.
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Centre and assistant area */}
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0d1726] px-3 py-2">
            <div className="flex items-center gap-1">
              {!sidebarOpen && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSidebarOpen(true)}
                  className="h-8 w-8 text-slate-400"
                >
                  <Folder className="h-4 w-4" />
                </Button>
              )}
              <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
                <ChevronRight className="h-3 w-3" />
                {activeFile}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  ["preview", Eye, "Preview"],
                  ["code", Code2, "Code"],
                  ["console", Terminal, "Console"],
                  ["terminal", Terminal, "Terminal"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  onClick={() => setPanel(value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    panel === value
                      ? "bg-cyan-400/10 text-cyan-200"
                      : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runProject()}
                disabled={runtimeBusy}
                className="h-8 border-cyan-400/25 bg-cyan-400/10 px-2.5 text-cyan-100 hover:bg-cyan-400/20"
                title="Install dependencies and run this project"
              >
                {runtimeBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {runtimeBusy ? "Starting…" : runtimeUrl ? "Restart" : "Run"}
              </Button>
              {runtimeUrl && !runtimeBusy && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    stopDevServer();
                    setRuntimeUrl(null);
                    setRuntimeStatus("Stopped");
                  }}
                  className="h-8 px-2 text-slate-400 hover:text-white"
                  title="Stop the development server"
                >
                  <Square className="mr-1 h-3 w-3" />
                  Stop
                </Button>
              )}
              {panel === "preview" && (
                <>
                  {(
                    [
                      ["desktop", Monitor],
                      ["tablet", Tablet],
                      ["mobile", Smartphone],
                    ] as const
                  ).map(([value, Icon]) => (
                    <button
                      key={value}
                      onClick={() => setDevice(value)}
                      className={`rounded-lg p-2 ${
                        device === value
                          ? "bg-white/10 text-cyan-200"
                          : "text-slate-500 hover:bg-white/5"
                      }`}
                      aria-label={`${value} preview`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                  <button
                    onClick={() => setPreviewKey((value) => value + 1)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
                    aria-label="Reload preview"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {panel === "console" && (
                <button
                  onClick={() => setLogs([])}
                  className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white/5 hover:text-white"
                >
                  Clear
                </button>
              )}
              {panel === "code" && (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(files[activeFile] ?? "");
                    toast.success("Code copied");
                  }}
                  className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
                  aria-label="Copy code"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setAssistantOpen((value) => !value)}
                className={`ml-1 rounded-lg p-2 ${
                  assistantOpen ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500 hover:bg-white/5"
                }`}
                aria-label="Toggle AI assistant"
              >
                <Bot className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Work area */}
          <div
            className={`grid min-h-0 flex-1 overflow-hidden ${assistantOpen ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"}`}
          >
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#080e19]">
              {panel === "preview" && (
                <>
                  <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span
                        className={`h-2 w-2 rounded-full ${runtimeUrl ? "bg-emerald-400" : "bg-amber-400"}`}
                      />
                      {runtimeUrl ? "Running project" : "Project preview"}
                    </div>
                    <span className="max-w-[55%] truncate text-[10px] text-slate-500">
                      {runtimeUrl
                        ? "WebContainer · Vite / npm"
                        : runtimeBusy || runtimeStatus !== "Not started"
                          ? runtimeStatus
                          : "HTML quick preview · press Run for React/Vite"}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-[#111a29] p-2 sm:p-3">
                    <iframe
                      ref={iframeRef}
                      key={previewKey}
                      title="ExpertsTeam project preview"
                      src={runtimeUrl ?? undefined}
                      srcDoc={runtimeUrl ? undefined : srcDoc}
                      sandbox={
                        runtimeUrl
                          ? "allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-downloads"
                          : "allow-scripts allow-forms allow-modals allow-popups"
                      }
                      className="h-full min-h-0 max-w-full rounded-lg border border-slate-300/20 bg-white shadow-2xl"
                      style={{
                        width:
                          device === "desktop" ? "100%" : device === "tablet" ? "768px" : "375px",
                      }}
                    />
                  </div>
                </>
              )}

              {panel === "code" && (
                <>
                  <div className="flex h-10 items-center justify-between gap-2 border-b border-white/[0.07] px-4">
                    <span className="flex min-w-0 items-center gap-2 truncate text-xs text-slate-300">
                      <File className={`h-3.5 w-3.5 ${fileIcon(activeFile)}`} />
                      {activeFile || "Select a file"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCompletionsOpen((value) => !value)}
                        className="h-7 px-2 text-[10px] text-slate-400"
                      >
                        Autocomplete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExtensionsOpen(true)}
                        className="h-7 px-2 text-[10px] text-slate-400"
                      >
                        <Settings2 className="mr-1 h-3 w-3" /> Extensions
                      </Button>
                    </div>
                  </div>
                  <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#080e19]">
                    <div className="select-none border-r border-white/[0.06] px-3 py-3 text-right font-mono text-xs leading-6 text-slate-600">
                      {Array.from(
                        { length: Math.max(1, (files[activeFile] ?? "").split("\n").length) },
                        (_, index) => (
                          <div key={index}>{index + 1}</div>
                        ),
                      )}
                    </div>
                    {completionsOpen && (
                      <div className="absolute right-3 top-3 z-20 w-64 overflow-hidden rounded-lg border border-slate-700 bg-[#111c2c] shadow-2xl">
                        <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Built-in completions · Ctrl+Space
                        </div>
                        {availableEditorSnippets.map((snippet) => (
                          <button
                            key={snippet.label}
                            type="button"
                            onClick={() => insertEditorSnippet(snippet.value)}
                            className="block w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-cyan-400/10"
                          >
                            {snippet.label}
                            <span className="ml-2 text-[10px] text-slate-500">{snippet.pack}</span>
                          </button>
                        ))}
                        {!availableEditorSnippets.length && (
                          <p className="px-3 py-3 text-xs text-slate-500">
                            Enable a matching snippet pack in Extensions.
                          </p>
                        )}
                      </div>
                    )}
                    <textarea
                      ref={editorRef}
                      onKeyDown={handleEditorKeyDown}
                      aria-label="Code editor"
                      value={files[activeFile] ?? ""}
                      onChange={(event) => updateFile(event.target.value)}
                      spellCheck={false}
                      disabled={!activeFile}
                      className="min-h-0 min-w-0 flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-xs leading-6 text-slate-200 outline-none selection:bg-cyan-500/30"
                      placeholder="Select a file to start editing…"
                    />
                  </div>
                </>
              )}

              {panel === "terminal" && (
                <div className="flex min-h-0 flex-1 flex-col bg-[#050a12]">
                  <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <Terminal className="h-3.5 w-3.5 text-emerald-300" />
                      Expert Terminal · Kali-inspired workspace
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-500">
                        {terminalReady ? "WORKSPACE ONLINE" : "SHELL OFFLINE"}
                      </span>
                      {["ls", "pwd", "npm run dev", "npm run build"].map((command) => (
                        <button
                          key={command}
                          type="button"
                          disabled={!terminalReady}
                          onClick={() =>
                            void writeTerminalInput(command + "\n").catch((error) =>
                              toast.error(
                                error instanceof Error ? error.message : "Command failed",
                              ),
                            )
                          }
                          className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-slate-400 hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-30"
                        >
                          {command}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTerminalOutput("")}
                        className="text-xs text-slate-500 hover:text-white"
                      >
                        Clear
                      </button>
                      {!terminalReady && (
                        <button
                          type="button"
                          onClick={() => void openTerminal()}
                          className="rounded-md bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-400/25"
                        >
                          Start shell
                        </button>
                      )}
                    </div>
                  </div>
                  <pre
                    aria-live="polite"
                    className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-emerald-200"
                  >
                    {terminalOutput || "Start the shell to run commands in your project workspace."}
                  </pre>
                  <form
                    onSubmit={(event) => void submitTerminalCommand(event)}
                    className="flex shrink-0 items-center gap-2 border-t border-white/[0.08] p-3"
                  >
                    <span className="font-mono text-sm text-emerald-400">$</span>
                    <input
                      aria-label="Terminal command"
                      value={terminalInput}
                      onChange={(event) => setTerminalInput(event.target.value)}
                      disabled={!terminalReady}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={
                        terminalReady ? "Type a command, e.g. ls" : "Start the shell first"
                      }
                      className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!terminalReady || !terminalInput.trim()}
                      className="h-8 bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Run
                    </Button>
                  </form>
                  <p className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-600">
                    Browser-based project shell with a Kali-inspired look. It is not a full Kali
                    Linux machine: privileged tools, sudo, apt, and unrestricted host access are
                    unavailable.
                  </p>
                </div>
              )}

              {panel === "console" && (
                <>
                  <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-4">
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <Terminal className="h-3.5 w-3.5 text-cyan-300" />
                      Browser console
                    </span>
                    <span className="text-[10px] text-slate-600">Preview logs only</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto bg-[#050a12] p-4 font-mono text-xs">
                    {logs.length === 0 && (
                      <div className="py-8 text-center text-slate-600">
                        <Terminal className="mx-auto mb-3 h-6 w-6 opacity-50" />
                        <p>No browser console messages yet.</p>
                        <p className="mt-1 text-[10px]">
                          Run the preview to see JavaScript logs and errors here.
                        </p>
                      </div>
                    )}
                    {logs.map((log, index) => (
                      <div
                        key={index}
                        className={`border-b border-white/[0.05] py-2 ${
                          log.type === "error"
                            ? "text-red-300"
                            : log.type === "warn"
                              ? "text-amber-300"
                              : "text-slate-300"
                        }`}
                      >
                        <span className="mr-2 text-slate-600">[{log.type}]</span>
                        {log.message}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* AI panel */}
            {assistantOpen && (
              <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-white/[0.08] bg-[#0c1523] xl:border-l xl:border-t-0">
                <div className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-500/20 text-cyan-200">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Experts Agent</p>
                      <p className="text-[9px] text-emerald-400">AI coding assistant</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMessages([])}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"
                    title="Clear conversation"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.length === 0 && (
                    <div className="flex min-h-[400px] flex-col justify-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                        <Bot className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold text-white">What are we building?</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Describe your idea. I'll work with your project files and help you build it.
                      </p>
                      <div className="mt-6 space-y-2">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => setPrompt(suggestion)}
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left text-xs leading-5 text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-white"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex gap-2.5 ${
                        message.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          message.role === "user"
                            ? "bg-blue-500/15 text-blue-200"
                            : "bg-cyan-400/10 text-cyan-200"
                        }`}
                      >
                        {message.role === "user" ? (
                          <span className="text-[10px] font-bold">YOU</span>
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div
                        className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-xs leading-6 ${
                          message.role === "user"
                            ? "bg-blue-500/15 text-blue-50"
                            : "border border-white/[0.07] bg-white/[0.035] text-slate-200"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}

                  {busy && (
                    <div className="flex items-center gap-2 text-xs text-cyan-200">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Working on your project…
                    </div>
                  )}
                </div>

                <div className="border-t border-white/[0.08] p-3">
                  <div className="rounded-xl border border-white/[0.12] bg-[#101c2d] p-2 focus-within:border-cyan-400/40">
                    <Textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendPrompt();
                        }
                      }}
                      rows={3}
                      placeholder="Ask the agent to build or change something…"
                      className="min-h-[76px] resize-none border-0 bg-transparent px-1 text-xs text-white shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                    />
                    <div className="flex items-center justify-between px-1 pt-2">
                      <span className="text-[9px] text-slate-600">
                        Enter to send · Shift + Enter for new line
                      </span>
                      <Button
                        size="icon"
                        onClick={() => void sendPrompt()}
                        disabled={busy || !prompt.trim()}
                        className="h-8 w-8 bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                        aria-label="Send prompt"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-[9px] text-slate-600">
                    AI can make mistakes. Review generated changes before publishing.
                  </p>
                </div>
              </aside>
            )}
          </div>

          {/* Bottom status bar */}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#0d1523] px-4 py-2">
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Workspace ready
              </span>
              <span>{Object.keys(files).length} files</span>
              <span className="text-cyan-300">{profile?.ai_credits ?? 0} AI credits</span>
              <span>{activeFile || "No file selected"}</span>
            </div>
            <span className="text-[10px] text-slate-600">ExpertsTeam · ExpertAI Studio</span>
          </footer>
        </main>
      </div>

      {/* New file dialog */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project file</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-file-name">File name</Label>
              <Input
                id="new-file-name"
                autoFocus
                value={newFileName}
                onChange={(event) => setNewFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createFile();
                }}
                placeholder="src/App.tsx"
                className="border-white/10 bg-white/5"
              />
            </div>
            <Button
              onClick={createFile}
              className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create file
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Built-in editor extension packs */}
      <Dialog open={extensionsOpen} onOpenChange={setExtensionsOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editor extensions</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-400">
            Enable lightweight built-in completion and snippet packs for the languages you use.
          </p>
          <div className="space-y-2">
            {[
              {
                id: "react",
                title: "React & TypeScript",
                detail: "Components and common React hooks",
              },
              {
                id: "html",
                title: "HTML & accessibility",
                detail: "Page structure and accessible elements",
              },
              {
                id: "css",
                title: "CSS & responsive layouts",
                detail: "Grid, media queries and layout snippets",
              },
            ].map((pack) => {
              const enabled = enabledEditorPacks.includes(pack.id);
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() =>
                    setEnabledEditorPacks((current) =>
                      enabled ? current.filter((item) => item !== pack.id) : [...current, pack.id],
                    )
                  }
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 p-3 text-left hover:bg-white/5"
                >
                  <span>
                    <span className="block text-sm font-medium">{pack.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{pack.detail}</span>
                  </span>
                  <span
                    className={
                      enabled
                        ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] text-emerald-300"
                        : "rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-500"
                    }
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* GitHub dialog */}
      <Dialog open={githubOpen} onOpenChange={setGithubOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Push project to GitHub
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="github-repo">Repository name</Label>
              <Input
                id="github-repo"
                value={githubRepo}
                onChange={(event) => setGithubRepo(event.target.value)}
                placeholder="my-awesome-project"
                className="border-white/10 bg-white/5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="github-token">GitHub personal access token</Label>
              <Input
                id="github-token"
                type="password"
                autoComplete="off"
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder="Paste token for this push"
                className="border-white/10 bg-white/5"
              />
              <p className="text-[11px] leading-5 text-slate-500">
                The token is sent to the server for this operation and is not saved in your project.
                Never share it with anyone.
              </p>
            </div>
            <Button
              className="w-full bg-white text-slate-950 hover:bg-slate-200"
              disabled={githubMutation.isPending || !githubToken.trim() || !githubRepo.trim()}
              onClick={() => githubMutation.mutate()}
            >
              {githubMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              Push files to GitHub
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
