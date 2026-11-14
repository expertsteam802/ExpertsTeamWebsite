import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  Copy,
  Download,
  ExternalLink,
  Eye,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderInput,
  Github,
  ImagePlus,
  Loader2,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  Pencil,
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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";

import { indentWithTab } from "@codemirror/commands";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  pushProjectToGithub,
  importGitHubProject,
  publishAgentProject,
  runCodingAgent,
  startAgentTerminal,
  stopAgentTerminal,
  syncAgentTerminalFiles,
  startAgentPreview,
  stopAgentPreview,
} from "@/lib/agent.functions";
import { buildSrcDocWithConsole, STARTER_FILES, type ProjectFiles } from "@/lib/sandbox";
type Message = { role: "user" | "assistant"; content: string };
type ReferenceImage = {
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
};

type CheckpointRow = { id: string; name: string; files: ProjectFiles; created_at: string };
type DeveloperVaultGroup = { id: string; name: string; count: number; createdAt: string };

type ProjectRow = {
  id: string;
  name: string;
  files: ProjectFiles;
  messages: Message[];
  published: boolean;
  slug: string | null;
  deployment_url: string | null;
  thumbnail_url: string | null;
  github_repo: string | null;
  updated_at: string;
};

type Panel = "preview" | "code" | "console" | "terminal";

const CODING_AGENT_UNDER_DEVELOPMENT = false;

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

function publishedProjectUrl(slug: string) {
  return `https://expertsteam.giize.com/apps/${encodeURIComponent(slug)}`;
}


function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const [visibleLength, setVisibleLength] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      setVisibleLength(text.length);
      return;
    }
    setVisibleLength(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleLength(Math.min(index, text.length));
      if (index >= text.length) window.clearInterval(timer);
    }, 5);
    return () => window.clearInterval(timer);
  }, [text, animate]);

  return <>{text.slice(0, visibleLength)}</>;
}

async function compressReferenceImage(file: File): Promise<ReferenceImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not decode " + file.name + "."));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 1440 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.78;
    let blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Could not compress image."))),
        "image/jpeg",
        quality,
      ),
    );
    while (blob.size > 520_000 && quality > 0.48) {
      quality -= 0.08;
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Could not compress image."))),
          "image/jpeg",
          quality,
        ),
      );
    }
    if (blob.size > 650_000) throw new Error(file.name + " is too large after compression.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read compressed " + file.name + "."));
      reader.readAsDataURL(blob);
    });
    return {
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      mimeType: "image/jpeg",
      data: dataUrl.split(",")[1] ?? "",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const fileIcon = (name: string) => {
  if (name.endsWith(".css")) return "text-sky-400";
  if (name.endsWith(".html")) return "text-orange-400";
  if (name.endsWith(".json")) return "text-yellow-400";
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "text-blue-400";
  if (name.endsWith(".js") || name.endsWith(".jsx")) return "text-yellow-300";
  return "text-slate-400";
};

export function CodeAgent() {
  const { user, profile, isAdmin, isDeveloper } = useAuth();
  const terminalUsername = (profile?.username || user?.email?.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 39) || "user";
  const queryClient = useQueryClient();
  const run = useServerFn(runCodingAgent);
  const push = useServerFn(pushProjectToGithub);
  const importGithub = useServerFn(importGitHubProject);
  const publish = useServerFn(publishAgentProject);
  const startPreview = useServerFn(startAgentPreview);
  const connectTerminal = useServerFn(startAgentTerminal);
  const stopTerminal = useServerFn(stopAgentTerminal);
  const syncTerminalFiles = useServerFn(syncAgentTerminalFiles);
  const stopPreview = useServerFn(stopAgentPreview);
  const { data: terminalIdleTimeoutMinutes = 0 } = useQuery({
    queryKey: ["site-settings", "terminal-idle-timeout"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("site_branding_settings")
        .limit(1)
        .single();
      if (error) throw error;
      const root =
        data.site_branding_settings &&
        typeof data.site_branding_settings === "object" &&
        !Array.isArray(data.site_branding_settings)
          ? (data.site_branding_settings as Record<string, unknown>)
          : {};
      const terminal =
        root.terminalSettings &&
        typeof root.terminalSettings === "object" &&
        !Array.isArray(root.terminalSettings)
          ? (root.terminalSettings as Record<string, unknown>)
          : {};
      const minutes = Number(terminal.idleTimeoutMinutes ?? 0);
      return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 0;
    },
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Untitled project");
  const [files, setFiles] = useState<ProjectFiles>(STARTER_FILES);
  const [activeFile, setActiveFile] = useState("index.html");
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingMessageIndex, setTypingMessageIndex] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("preview");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [githubOpen, setGithubOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRepoUrl, setImportRepoUrl] = useState("");
  const [importToken, setImportToken] = useState("");
  const [importingRepo, setImportingRepo] = useState(false);
  const [vaultImportOpen, setVaultImportOpen] = useState(false);
  const [importingVault, setImportingVault] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [assistantWidth, setAssistantWidth] = useState(360);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renameFileOpen, setRenameFileOpen] = useState(false);
  const [renameFileFrom, setRenameFileFrom] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [completionsOpen, setCompletionsOpen] = useState(false);
  const [enabledEditorPacks, setEnabledEditorPacks] = useState<string[]>(["react", "html", "css"]);
  const [projectNameEditing, setProjectNameEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null);
  const [previewAddress, setPreviewAddress] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState("Not started");
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalAutoSync, setTerminalAutoSync] = useState(true);
  const [terminalConnection, setTerminalConnection] = useState<{
    url: string;
    token: string;
    sandboxName: string;
    projectId: string;
  } | null>(null);
  const [fileLanguage, setFileLanguage] = useState<Extension[]>([]);
  const runtimeFilesRef = useRef<ProjectFiles>({});
  const autoStartedProjectRef = useRef<string | null>(null);
  const runtimeSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalSocketRef = useRef<WebSocket | null>(null);
  const terminalLastActivityRef = useRef(Date.now());
  const xtermRef = useRef<XTerm | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const srcDoc = useMemo(() => buildSrcDocWithConsole(files), [files]);
  useEffect(() => {
    let cancelled = false;
    const language = LanguageDescription.matchFilename(languages, activeFile);
    if (!language) {
      setFileLanguage([]);
      return () => {
        cancelled = true;
      };
    }
    void language
      .load()
      .then((support) => {
        if (!cancelled) setFileLanguage([support]);
      })
      .catch(() => {
        if (!cancelled) setFileLanguage([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFile]);

  const editorExtensions = useMemo(
    () => [keymap.of([indentWithTab]), ...fileLanguage],
    [fileLanguage],
  );

  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!terminalConnection || !container) return;

    const terminal = new XTerm({
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", Menlo, monospace',
      theme: {
        background: "#050a12",
        foreground: "#dbeafe",
        cursor: "#34d399",
        selectionBackground: "#164e63",
        black: "#0b1220",
        green: "#34d399",
        brightGreen: "#6ee7b7",
        cyan: "#67e8f9",
        brightCyan: "#a5f3fc",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    fit.fit();
    xtermRef.current = terminal;

    const socket = new WebSocket(terminalConnection.url, [
      "experts-terminal",
      terminalConnection.token,
    ]);
    socket.binaryType = "arraybuffer";
    terminalSocketRef.current = socket;

    socket.onopen = () => {
      terminalLastActivityRef.current = Date.now();
      setTerminalReady(true);
      terminal.focus();
      terminal.write("\r\nConnected to the isolated Linux shell.\r\n");
      socket.send(
        "\u0000" + JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
      );
    };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") terminal.write(event.data);
      else if (event.data instanceof ArrayBuffer) terminal.write(new Uint8Array(event.data));
    };
    socket.onerror = () => {
      setTerminalReady(false);
      terminal.writeln("\r\n[terminal connection error]");
    };
    socket.onclose = () => setTerminalReady(false);

    const markTerminalActivity = () => {
      terminalLastActivityRef.current = Date.now();
    };
    container.addEventListener("pointerdown", markTerminalActivity);
    const input = terminal.onData((value) => {
      markTerminalActivity();
      if (socket.readyState === WebSocket.OPEN) socket.send(value);
    });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send("\u0000" + JSON.stringify({ type: "resize", cols, rows }));
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN)
        socket.send(
          "\u0000" + JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
        );
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      container.removeEventListener("pointerdown", markTerminalActivity);
      socket.close();
      terminal.dispose();
      if (terminalSocketRef.current === socket) terminalSocketRef.current = null;
      if (xtermRef.current === terminal) xtermRef.current = null;
      setTerminalReady(false);
    };
  }, [terminalConnection]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["agent-projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("agent_projects")
        .select("id,name,files,messages,published,slug,deployment_url,thumbnail_url,github_repo,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
  });

  const { data: developerVaultRows = [], isLoading: developerVaultLoading } = useQuery({
    queryKey: ["developer-vault-import-list", user?.id],
    enabled: Boolean(user && (isAdmin || isDeveloper)),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_vault_items")
        .select("group_id,group_name,group_kind,relative_path,created_at")
        .eq("group_kind", "project")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const developerVaultGroups = useMemo(() => {
    const grouped = new Map<string, DeveloperVaultGroup>();
    for (const row of developerVaultRows) {
      const current = grouped.get(row.group_id);
      if (current) current.count += 1;
      else grouped.set(row.group_id, {
        id: row.group_id,
        name: row.group_name,
        count: 1,
        createdAt: row.created_at,
      });
    }
    return Array.from(grouped.values());
  }, [developerVaultRows]);

  const { data: checkpoints = [] } = useQuery({
    queryKey: ["agent-project-checkpoints", projectId],
    enabled: Boolean(user && projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_project_checkpoints")
        .select("id,name,files,created_at")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as CheckpointRow[];
    },
  });

  useEffect(() => {
    return () => {
      // Best-effort server-side cleanup when the user leaves ExpertAI Studio.
      void stopTerminal({ data: {} }).catch(() => undefined);
    };
  }, [stopTerminal]);

  // Keep the preview session warm and recover it after Vercel stops an idle sandbox.
  // The server checks whether the dev server is already healthy, so this does not
  // restart a working preview on every heartbeat.
  useEffect(() => {
    if (!runtimeUrl || !projectId) return;
    let active = true;
    let checking = false;
    const heartbeat = window.setInterval(
      async () => {
        if (checking || !active) return;
        checking = true;
        try {
          let result: Awaited<ReturnType<typeof startPreview>> | null = null;
          let lastError: unknown;
          for (let attempt = 1; attempt <= 3 && active; attempt++) {
            try {
              result = await startPreview({ data: { projectId, files } });
              break;
            } catch (error) {
              lastError = error;
              if (attempt < 3) {
                setRuntimeStatus("Preview reconnecting");
                await new Promise((resolve) => window.setTimeout(resolve, attempt * 2500));
              }
            }
          }
          if (!active) return;
          if (!result)
            throw lastError instanceof Error
              ? lastError
              : new Error("Preview health check failed.");
          setRuntimeStatus("Running · Linux sandbox");
          if (result.recovered) {
            setRuntimeUrl(result.url);
            setPreviewKey((value) => value + 1);
            setLogs((current) => [
              ...current.slice(-199),
              {
                type: "runtime",
                message: "Preview automatically recovered after the sandbox stopped.",
              },
            ]);
          }
        } catch (error) {
          if (!active) return;
          const message = error instanceof Error ? error.message : "Preview health check failed.";
          setRuntimeStatus("Preview reconnecting");
          setLogs((current) => [...current.slice(-199), { type: "warn", message }]);
        } finally {
          checking = false;
        }
      },
      10 * 60 * 1000,
    );
    return () => {
      active = false;
      window.clearInterval(heartbeat);
    };
  }, [runtimeUrl, projectId, files, startPreview]);

  useEffect(() => {
    if (!runtimeUrl || !projectId) return;
    if (JSON.stringify(runtimeFilesRef.current) === JSON.stringify(files)) return;
    const nextFiles = files;
    const timer = window.setTimeout(() => {
      runtimeSyncQueueRef.current = runtimeSyncQueueRef.current
        .then(async () => {
          await startPreview({ data: { projectId, files: nextFiles } });
          runtimeFilesRef.current = { ...nextFiles };
          setRuntimeStatus("Running · files synced");
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Could not sync project files.";
          setLogs((current) => [...current.slice(-199), { type: "error", message }]);
          setRuntimeStatus("Sync failed");
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [files, runtimeUrl, projectId]);

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

  async function importTerminalChanges() {
    if (!projectId) return;
    try {
      if (!terminalConnection?.sandboxName) throw new Error("The Linux terminal session is no longer available.");
      if (terminalConnection.projectId !== projectId) throw new Error("This shell is still attached to another project. Switch the shell to this project before importing files.");
      const result = await syncTerminalFiles({ data: { projectId, sandboxName: terminalConnection.sandboxName } });
      const importedFiles = result.files;
      await persist({ files: importedFiles });
      setFiles(importedFiles);
      const nextActiveFile = Object.keys(importedFiles).includes(activeFile)
        ? activeFile
        : Object.keys(importedFiles)[0];
      if (nextActiveFile) setActiveFile(nextActiveFile);
      setDirty(false);
      toast.success("Imported " + Object.keys(importedFiles).length + " project files from Linux");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import terminal changes.");
    }
  }

  async function closeTerminalSession() {
    const sessionName = terminalConnection?.sandboxName;
    const socket = terminalSocketRef.current;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    terminalSocketRef.current = null;
    setTerminalConnection(null);
    setTerminalReady(false);
    try {
      if (sessionName) await stopTerminal({ data: { sandboxName: sessionName } });
    } catch {
      // The sandbox also has a finite provider-side lifetime if the browser disconnects.
    }
  }

  useEffect(() => {
    if (!terminalConnection || terminalIdleTimeoutMinutes <= 0) return;
    const timeoutMs = terminalIdleTimeoutMinutes * 60 * 1000;
    const timer = window.setInterval(() => {
      if (Date.now() - terminalLastActivityRef.current >= timeoutMs) {
        terminalLastActivityRef.current = Date.now();
        void closeTerminalSession();
        toast.info(
          `Linux terminal closed after ${terminalIdleTimeoutMinutes} minutes without activity.`,
        );
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [terminalConnection, terminalIdleTimeoutMinutes]);

  async function openTerminal() {
    if (terminalReady && terminalConnection?.projectId === projectId) {
      terminalLastActivityRef.current = Date.now();
      return;
    }
    try {
      if (terminalConnection && terminalConnection.projectId !== projectId) {
        await closeTerminalSession();
      }
      const activeProjectId = await persist();
      const connection = await connectTerminal({
        data: { projectId: activeProjectId, files, username: terminalUsername },
      });
      setTerminalConnection({ ...connection, projectId: activeProjectId });
      if (connection.toolkitStatus === "installing") toast.info("The CTF starter toolkit is installing in the Linux sandbox.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not connect to the Linux terminal.";
      toast.error(message);
    }
  }

  function downloadProjectBundle() {
    const payload = {
      format: "expertsteam-project",
      version: 1,
      name: name.trim() || "Untitled project",
      exportedAt: new Date().toISOString(),
      files,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (name.trim() || "expertsteam-project").replace(/[^a-z0-9-_]+/gi, "-") + ".expertsteam-project.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Project files exported");
  }

  function navigatePreview() {
    if (!runtimeUrl) return;
    try {
      const base = new URL(runtimeUrl);
      const target = new URL(previewAddress || runtimeUrl, base);
      if (target.origin !== base.origin) {
        toast.error("The preview browser can only open pages inside this sandbox.");
        return;
      }
      setPreviewAddress(target.toString());
      setPreviewKey((value) => value + 1);
    } catch {
      toast.error("Enter a valid preview path or URL.");
    }
  }

  async function runProject() {
    if (runtimeBusy) return;
    setRuntimeBusy(true);
    setRuntimeStatus("Preparing cloud sandbox…");
    setPanel("preview");
    setLogs([]);
    try {
      const activeProjectId = projectId ?? (await persist());
      autoStartedProjectRef.current = activeProjectId;
      const result = await startPreview({ data: { projectId: activeProjectId, files } });
      setRuntimeUrl(result.url);
      setPreviewAddress(result.url);
      setRuntimeStatus("Running · Linux sandbox");
      runtimeFilesRef.current = { ...files };
      if (!terminalConnection) {
        try {
          const connection = await connectTerminal({ data: { projectId: activeProjectId, files, username: terminalUsername } });
          setTerminalConnection({ ...connection, projectId: activeProjectId });
          if (connection.toolkitStatus === "installing") toast.info("The CTF starter toolkit is installing in the Linux sandbox.");
        } catch (terminalError) {
          setLogs((current) => [...current, { type: "warn", message: terminalError instanceof Error ? terminalError.message : "Linux terminal could not auto-connect." }]);
        }
      }
      if (result.installOutput) setLogs([{ type: "runtime", message: result.installOutput }]);
      toast.success("Cloud preview is running");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The cloud preview could not start.";
      setRuntimeStatus("Could not start");
      setRuntimeUrl(null);
      setLogs((current) => [...current, { type: "error", message }]);
      toast.error(message);
    } finally {
      setRuntimeBusy(false);
    }
  }

  useEffect(() => {
    if (!projectId || autoStartedProjectRef.current === projectId) return;
    let scripts: Record<string, string> = {};
    try {
      const manifest = JSON.parse(files["package.json"] ?? "{}") as { scripts?: Record<string, string> };
      scripts = manifest.scripts ?? {};
    } catch {
      return;
    }
    const startCommand = scripts.dev || scripts.start || "";
    if (!/(vite|next|react-scripts|parcel|nodemon|\bnode\s+|tsx\s+|nest\s+start|fastify)/i.test(startCommand)) return;
    autoStartedProjectRef.current = projectId;
    void runProject();
  }, [projectId, files]);

  async function stopProject() {
    if (!projectId || runtimeBusy) return;
    setRuntimeBusy(true);
    try {
      await stopPreview({ data: { projectId } });
      setRuntimeUrl(null);
      setPreviewAddress("");
      setRuntimeStatus("Stopped · project saved to cloud");
      setTerminalReady(false);
      toast.success("Cloud preview stopped");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop the preview.");
    } finally {
      setRuntimeBusy(false);
    }
  }

  function resetRuntimeForProjectChange() {
    autoStartedProjectRef.current = null;
    if (projectId && runtimeUrl) void stopPreview({ data: { projectId } }).catch(() => undefined);
    // Keep the user-scoped terminal connection alive while the project folder changes.
    setRuntimeUrl(null);
    setPreviewAddress("");
    setRuntimeStatus("Not started");
    runtimeFilesRef.current = {};
  }

  async function publishProject() {
    if (publishing) return;
    setPublishing(true);
    setPublishedUrl(null);
    try {
      const activeProjectId = await persist();
      const existingSlug = projects.find((project) => project.id === activeProjectId)?.slug;
      const baseSlug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || "my-app";
      const slug = existingSlug || `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
      const result = await publish({ data: { projectId: activeProjectId, files, slug } });
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user?.id] });
      const url = result.publicUrl;
      setPublishedUrl(url);
      toast.success("Your app is built and published", {
        action: {
          label: "Open app",
          onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish this app.");
    } finally {
      setPublishing(false);
    }
  }

  async function setProjectThumbnail() {
    if (!user) {
      toast.error("Sign in to add a project thumbnail.");
      return;
    }
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/png,image/jpeg,image/webp,image/gif";
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      void (async () => {
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
          toast.error("Choose a PNG, JPG, WebP or GIF image up to 5 MB.");
          return;
        }
        try {
          const activeProjectId = projectId ?? (await persist());
          const extension = file.type === "image/png" ? "png"
            : file.type === "image/webp" ? "webp"
            : file.type === "image/gif" ? "gif" : "jpg";
          const path = `${user.id}/project-thumbnails/${activeProjectId}-${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("uploads")
            .upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type,
            });
          if (uploadError) throw uploadError;
          const publicUrl = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
          const { error: saveError } = await supabase
            .from("agent_projects")
            .update({ thumbnail_url: publicUrl })
            .eq("id", activeProjectId)
            .eq("user_id", user.id);
          if (saveError) throw saveError;
          setThumbnailUrl(publicUrl);
          await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
          toast.success("Project thumbnail or logo uploaded");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not upload the project thumbnail.");
        }
      })();
    };
    picker.click();
  }

  async function saveProjectName() {
    const nextName = name.trim() || "Untitled project";
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
        // Persist the requested name explicitly. React state updates are asynchronous,
        // so persist() must not read the previous value of name immediately after setName().
        await persist({ extra: { name: nextName } });
        setName(nextName);
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
      name: name.trim() || "Untitled project",
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

  // Keep files edited by Kilo/OpenCode in the terminal reflected in the editor
  // and saved project record. Manual editor changes take priority while dirty.
  useEffect(() => {
    if (!terminalAutoSync || !terminalReady || !projectId || !user || busy || dirty) return;
    let cancelled = false;
    let syncing = false;
    const timer = window.setInterval(async () => {
      if (cancelled || syncing || busy || dirty) return;
      syncing = true;
      try {
        if (!terminalConnection?.sandboxName || terminalConnection.projectId !== projectId) return;
        const result = await syncTerminalFiles({ data: { projectId, sandboxName: terminalConnection.sandboxName } });
        if (cancelled) return;
        const importedFiles = result.files;
        const changed =
          Object.keys(importedFiles).length !== Object.keys(files).length ||
          Object.entries(importedFiles).some(([path, content]) => files[path] !== content);
        if (!changed) return;
        const { error } = await supabase
          .from("agent_projects")
          .update({
            files: importedFiles as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .eq("user_id", user.id);
        if (error) throw error;
        setFiles(importedFiles);
        setActiveFile((current) => Object.prototype.hasOwnProperty.call(importedFiles, current)
          ? current
          : Object.keys(importedFiles)[0] ?? "index.html");
        runtimeFilesRef.current = { ...importedFiles };
        setDirty(false);
        await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
        setLogs((current) => [...current.slice(-199), {
          type: "runtime",
          message: "Terminal changes synced and saved to this project.",
        }]);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Terminal auto-sync failed.";
          setLogs((current) => [...current.slice(-199), { type: "warn", message }]);
        }
      } finally {
        syncing = false;
      }
    }, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [terminalAutoSync, terminalReady, terminalConnection?.sandboxName, projectId, user, busy, dirty, files, syncTerminalFiles, queryClient]);

  async function saveCheckpoint(label: string) {
    if (!user) throw new Error("Sign in to create a checkpoint.");
    const activeProjectId = projectId ?? (await persist());
    const { error } = await supabase.from("agent_project_checkpoints").insert({
      project_id: activeProjectId,
      user_id: user.id,
      name: label.slice(0, 120),
      files: files as unknown as Json,
    });
    if (error) throw error;
    await queryClient.invalidateQueries({
      queryKey: ["agent-project-checkpoints", activeProjectId],
    });
  }

  async function restoreLastCheckpoint() {
    if (!user || !projectId) {
      toast.info("Save this project first to create rollback checkpoints.");
      return;
    }
    const { data, error } = await supabase
      .from("agent_project_checkpoints")
      .select("id,name,files,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.info("There is no checkpoint to restore yet.");
      return;
    }
    const restored = data.files as unknown as ProjectFiles;
    setFiles(restored);
    setActiveFile(Object.keys(restored)[0] ?? "index.html");
    setDirty(true);
    setPreviewKey((value) => value + 1);
    try {
      await persist({ files: restored });
      toast.success("Restored checkpoint: " + data.name);
    } catch (restoreError) {
      toast.error(
        restoreError instanceof Error ? restoreError.message : "Could not restore checkpoint.",
      );
    }
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

  async function importDeveloperVaultProject(groupId: string, groupName: string) {
    if (!user || !(isAdmin || isDeveloper) || importingVault) return;
    setImportingVault(true);
    try {
      if (dirty) await persist();
      const { data: rows, error } = await supabase
        .from("developer_vault_items")
        .select("file_name,relative_path,storage_path,size_bytes")
        .eq("group_id", groupId)
        .eq("group_kind", "project")
        .order("relative_path", { ascending: true });
      if (error) throw error;
      const importedFiles: ProjectFiles = {};
      let totalBytes = 0;
      let skipped = 0;
      const textFile = /\\.(html?|css|[cm]?[jt]sx?|json|md|txt|ya?ml|toml|py|sql|sh|xml|svg|vue|svelte|go|rs|java|c|h|cpp|hpp|cs|php|rb|ipynb)$/i;
      for (const row of rows ?? []) {
        const path = row.relative_path || row.file_name;
        const lowerPath = path.toLowerCase();
        if (!textFile.test(path) || /(^|\\/)\\.env($|\\.)/i.test(path) || path.split("/").some((part) => part === "..") || row.size_bytes > 500 * 1024 || totalBytes + row.size_bytes > 3 * 1024 * 1024) {
          skipped += 1;
          continue;
        }
        if (Object.keys(importedFiles).length >= 400) {
          skipped += 1;
          continue;
        }
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("developer-vault")
          .download(row.storage_path);
        if (downloadError || !fileData) throw downloadError ?? new Error("Could not download " + path);
        const content = await fileData.text();
        importedFiles[path] = content;
        totalBytes += row.size_bytes;
      }
      if (!Object.keys(importedFiles).length) {
        throw new Error("This folder has no supported text source files to import. Binary assets and secret files are skipped.");
      }
      const { data: saved, error: saveError } = await supabase
        .from("agent_projects")
        .insert({
          user_id: user.id,
          name: groupName,
          files: importedFiles as unknown as Json,
          messages: [],
          published: false,
        })
        .select("id")
        .single();
      if (saveError) throw saveError;
      resetRuntimeForProjectChange();
      setProjectId(saved.id);
      setPublishedUrl(null);
      setThumbnailUrl(null);
      setName(groupName);
      setFiles(importedFiles);
      setMessages([]);
      setActiveFile(Object.keys(importedFiles).sort()[0] ?? "README.md");
      setGithubRepo("");
      setLogs([]);
      setPanel("code");
      setDirty(false);
      setVaultImportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      toast.success(
        'Imported "' + groupName + '" from Developer Vault (' + Object.keys(importedFiles).length +
        " source files" + (skipped ? ", " + skipped + " skipped" : "") + ").",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this Developer Vault project.");
    } finally {
      setImportingVault(false);
    }
  }

  async function cloneGithubRepository() {
    if (!user || importingRepo) return;
    const repoUrl = importRepoUrl.trim();
    if (!repoUrl) {
      toast.error("Paste a GitHub repository URL.");
      return;
    }
    setImportingRepo(true);
    try {
      // Preserve the workspace currently open before switching to the imported repository.
      if (dirty) await persist();
      const imported = await importGithub({
        data: { repoUrl, token: importToken.trim() || undefined },
      });
      const { data, error } = await supabase
        .from("agent_projects")
        .insert({
          user_id: user.id,
          name: imported.name,
          files: imported.files as unknown as Json,
          messages: [],
          github_repo: imported.repoUrl,
          published: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      resetRuntimeForProjectChange();
      setProjectId(data.id);
      setPublishedUrl(null);
      setThumbnailUrl(null);
      setName(imported.name);
      setFiles(imported.files);
      setMessages([]);
      setActiveFile(Object.keys(imported.files).sort()[0] ?? "README.md");
      setGithubRepo(imported.name);
      setLogs([]);
      setPanel("code");
      setDirty(false);
      setImportOpen(false);
      setImportRepoUrl("");
      setImportToken("");
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      toast.success(
        'Imported "' + imported.name + '" as a project folder (' + imported.fileCount + " files).",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clone this GitHub repository.",
      );
    } finally {
      setImportingRepo(false);
    }
  }

  async function sendPrompt() {
    if (CODING_AGENT_UNDER_DEVELOPMENT) return;
    const text = prompt.trim();
    if (!text || busy) return;

    const userText = referenceImages.length
      ? `${text}\n[Attached visual references: ${referenceImages.map((image) => image.name).join(", ")}]`
      : text;
    const nextMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);
    setPrompt("");
    setBusy(true);

    try {
      await saveCheckpoint(`Before: ${text.slice(0, 96)}`);
      const result = await run({
        data: {
          prompt: text,
          files,
          history: messages.slice(-8),
          referenceImages: referenceImages.length ? referenceImages : undefined,
        },
      });
      setReferenceImages([]);
      if (referenceInputRef.current) referenceInputRef.current.value = "";
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
      setTypingMessageIndex(finalMessages.length - 1);
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
      setTypingMessageIndex(failedMessages.length - 1);
      toast.error(detail);
      await persist({ messages: failedMessages });
    } finally {
      setBusy(false);
      // Keep the Linux terminal available after AI tasks; only the configured
      // inactivity policy or an explicit user action should close the session.
    }
  }

  function createProject() {
    resetRuntimeForProjectChange();
    setProjectId(null);
    setPublishedUrl(null);
    setThumbnailUrl(null);
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
    setPublishedUrl(project.published && project.slug ? publishedProjectUrl(project.slug) : null);
    setThumbnailUrl(project.thumbnail_url);
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
    const { from, to } = editor.state.selection.main;
    editor.dispatch({
      changes: { from, to, insert: value },
      selection: { anchor: from + value.length },
      scrollIntoView: true,
    });
    editor.focus();
    setCompletionsOpen(false);
  }

  function beginPanelResize(
    event: React.PointerEvent<HTMLDivElement>,
    target: "sidebar" | "assistant",
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = target === "sidebar" ? sidebarWidth : assistantWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (target === "sidebar") {
        setSidebarWidth(Math.min(420, Math.max(190, startWidth + delta)));
      } else {
        setAssistantWidth(Math.min(560, Math.max(280, startWidth - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
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

  function renameFile() {
    if (!renameFileFrom) return;
    const nextPath = renameFileName.trim().replace(/^\/+/, "");
    if (!nextPath || nextPath.includes("..") || nextPath.startsWith(".")) {
      toast.error("Enter a valid file path.");
      return;
    }
    if (nextPath !== renameFileFrom && files[nextPath] !== undefined) {
      toast.error("A file with that name already exists.");
      return;
    }
    const updated = { ...files, [nextPath]: files[renameFileFrom] };
    delete updated[renameFileFrom];
    setFiles(updated);
    if (activeFile === renameFileFrom) setActiveFile(nextPath);
    setDirty(true);
    setRenameFileOpen(false);
    setRenameFileFrom(null);
    toast.success("File renamed");
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
          <h2 className="mt-5 text-xl font-semibold">Your ExpertAI development studio</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to create projects, work with the AI agent and save your code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="expert-agent-shell not-prose flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#080e19] text-slate-100">
      {/* Workspace top bar */}
      <header className="expert-agent-topbar flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0d1523] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/agent-mark.svg"
            alt="ExpertAI coding agent"
            className="h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-cyan-500/10"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                ExpertsTeam
              </span>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-200">
                EXPERTAI STUDIO
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
            onClick={() => void setProjectThumbnail()}
            className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
            title="Set project thumbnail or logo"
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            Thumbnail
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void publishProject()}
            disabled={publishing}
            className="h-8 border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
          >
            {publishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
            {publishing ? "Publishing…" : "Publish"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadProjectBundle}
            className="h-8 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
            title="Download all project files as a portable ExpertsTeam project bundle"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
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
            variant="outline"
            onClick={() => void restoreLastCheckpoint()}
            disabled={!checkpoints.length}
            className="h-8 border-amber-400/20 bg-amber-400/[0.06] text-amber-100 hover:bg-amber-400/10"
            title={checkpoints[0] ? `Restore: ${checkpoints[0].name}` : "No saved checkpoints"}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Undo AI change
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
        {publishedUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs">
            <span className="font-semibold text-emerald-200">Live URL</span>
            <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-emerald-100 underline underline-offset-2">{publishedUrl}</a>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-100" onClick={() => void navigator.clipboard.writeText(publishedUrl).then(() => toast.success("Published URL copied")).catch(() => toast.error("Could not copy URL"))}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy URL
            </Button>
          </div>
        )}
      </header>

      {/* Main workspace */}
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden ${sidebarOpen ? "lg:grid-cols-[var(--sidebar-width)_5px_minmax(0,1fr)]" : "lg:grid-cols-1"}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {/* Left sidebar */}
        {sidebarOpen && (
          <aside className="expert-agent-sidebar flex min-h-0 flex-col overflow-y-auto border-b border-white/[0.08] bg-[#0b1320] lg:border-b-0 lg:border-r">
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
                  Project Explorer
                </span>
                <div className="flex items-center gap-1">
                  {(isAdmin || isDeveloper) && (
                    <button
                      onClick={() => setVaultImportOpen(true)}
                      className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-cyan-200"
                      aria-label="Import from Developer Vault"
                      title="Import project from Developer Vault"
                    >
                      <FolderInput className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setImportOpen(true)}
                    className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                    aria-label="Clone from GitHub"
                    title="Clone from GitHub"
                  >
                    <Github className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={createProject}
                    className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-cyan-300"
                    aria-label="Create project"
                    title="New project folder"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto">
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
                      {project.thumbnail_url ? <img src={project.thumbnail_url} alt="" className="h-6 w-6 shrink-0 rounded-md border border-white/10 object-cover" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {project.github_repo && (
                        <Github
                          className="h-3 w-3 shrink-0 text-slate-500"
                          aria-label="GitHub repository"
                        />
                      )}
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
                        type="button"
                        onClick={() => {
                          setRenameFileFrom(path);
                          setRenameFileName(path);
                          setRenameFileOpen(true);
                        }}
                        className="rounded p-1 text-slate-600 opacity-100 transition hover:bg-cyan-400/10 hover:text-cyan-200 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={`Rename ${path}`}
                        title="Rename file"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => deleteFile(path)}
                        className="mr-1 rounded p-1 text-slate-600 opacity-100 transition hover:bg-red-500/10 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
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
                  ExpertAI workspace
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Ask ExpertAI to create or update files, run coding agents in the Linux terminal,
                  and import their changes back into this project.
                </p>
              </div>
            </div>
          </aside>
        )}
        {sidebarOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize project sidebar"
            onPointerDown={(event) => beginPanelResize(event, "sidebar")}
            className="hidden cursor-col-resize bg-white/[0.04] transition-colors hover:bg-cyan-400/40 lg:block"
          />
        )}

        {/* Centre and assistant area */}
        <main className="expert-agent-stage flex min-h-0 min-w-0 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="expert-agent-toolbar flex min-h-[48px] flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0d1726] px-3 py-2">
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
                  onClick={() => void stopProject()}
                  className="h-8 px-2 text-slate-400 hover:text-white"
                  title="Stop cloud sandbox and save the workspace"
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
                aria-label="Toggle ExpertAI assistant"
              >
                <Bot className="h-4 w-4" />
              </button>
              {panel !== "preview" && (
                <button
                  type="button"
                  onClick={() => setPanelExpanded((value) => !value)}
                  className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-cyan-200"
                  aria-label={panelExpanded ? "Restore workspace panel" : "Expand workspace panel"}
                  title={panelExpanded ? "Restore panel" : "Expand panel vertically and horizontally"}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Work area */}
          <div
            className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden ${assistantOpen ? "xl:grid-cols-[minmax(0,1fr)_5px_var(--assistant-width)]" : "xl:grid-cols-1"}`}
            style={{ "--assistant-width": `${assistantWidth}px` } as CSSProperties}
          >
            <section
              className={
                previewExpanded && panel === "preview"
                  ? "expert-agent-canvas fixed inset-x-0 top-0 z-[100] flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden bg-[#080e19] shadow-2xl"
                  : panelExpanded && panel !== "preview"
                    ? "expert-agent-canvas fixed inset-0 z-[110] flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden bg-[#080e19] shadow-2xl"
                    : "expert-agent-canvas relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#080e19]"
              }
            >
              {panel === "preview" && (
                <>
                  <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span
                        className={`h-2 w-2 rounded-full ${runtimeUrl ? "bg-emerald-400" : "bg-amber-400"}`}
                      />
                      {runtimeUrl ? "Running project" : "Project preview"}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="max-w-[55%] truncate text-[10px] text-slate-500">
                        {runtimeUrl
                          ? "Vercel Sandbox · isolated cloud runtime"
                          : runtimeBusy || runtimeStatus !== "Not started"
                            ? runtimeStatus
                            : "HTML quick preview · press Run for React/Vite"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewExpanded((expanded) => !expanded)}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
                        aria-label={previewExpanded ? "Restore preview height" : "Expand preview to full height"}
                        title={previewExpanded ? "Restore preview" : "Expand preview vertically"}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        {previewExpanded ? "Restore" : "Expand"}
                      </button>
                    </div>
                  </div>
                  {runtimeUrl && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[#0a111d] px-3 py-2">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Preview URL</span>
                      <input
                        aria-label="Cloud preview address"
                        value={previewAddress || runtimeUrl}
                        onChange={(event) => setPreviewAddress(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") navigatePreview(); }}
                        className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-cyan-100 outline-none"
                      />
                      <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-slate-300" onClick={navigatePreview}>Go</Button>
                      <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-slate-300" onClick={() => void navigator.clipboard.writeText(previewAddress || runtimeUrl).then(() => toast.success("Preview URL copied")).catch(() => toast.error("Could not copy the preview URL"))}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-slate-300" onClick={() => window.open(previewAddress || runtimeUrl, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                      </Button>
                    </div>
                  )}
                  <div className="flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-[#111a29] p-2 sm:p-3">
                    <iframe
                      ref={iframeRef}
                      key={previewKey}
                      title="ExpertsTeam project preview"
                      src={runtimeUrl ? previewAddress || runtimeUrl : undefined}
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
                    <div className="min-h-0 min-w-0 flex-1 overflow-auto text-sm">
                      <CodeMirror
                        value={files[activeFile] ?? ""}
                        height="100%"
                        theme={oneDark}
                        extensions={editorExtensions}
                        onCreateEditor={(view) => {
                          editorRef.current = view;
                        }}
                        onChange={(value) => updateFile(value)}
                        editable={Boolean(activeFile)}
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                          highlightActiveLine: true,
                          highlightActiveLineGutter: true,
                          bracketMatching: true,
                          autocompletion: true,
                          closeBrackets: true,
                          indentOnInput: true,
                          tabSize: 2,
                        }}
                        className="h-full min-h-full text-[13px]"
                        placeholder="Select a file to start editing…"
                      />
                    </div>
                  </div>
                </>
              )}

              <div
                className={
                  panel === "terminal" ? "flex min-h-0 flex-1 flex-col bg-[#050a12]" : "hidden"
                }
              >
                <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
                  <span className="flex items-center gap-2 text-xs text-slate-300">
                    <Terminal className="h-3.5 w-3.5 text-emerald-300" />
                    {terminalUsername}@expertsteam · Linux terminal
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span
                      className={
                        terminalReady
                          ? "text-[10px] text-emerald-300"
                          : "text-[10px] text-slate-500"
                      }
                    >
                      {terminalReady ? "CONNECTED" : "OFFLINE"}
                    </span>
                    {terminalConnection && terminalConnection.projectId !== projectId && (
                      <button
                        type="button"
                        onClick={() => void openTerminal()}
                        className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200"
                        title="Reconnect the shell to the currently selected project"
                      >
                        SWITCH SHELL TO THIS PROJECT
                      </button>
                    )}
                    {["ls", "pwd", "npm run dev", "npm run build", "npm install -g @kilocode/cli", "kilo", "npm install -g @opencode/cli", "opencode"].map((command) => (
                      <button
                        key={command}
                        type="button"
                        disabled={!terminalReady}
                        onClick={() => {
                          if (terminalSocketRef.current?.readyState === WebSocket.OPEN)
                            terminalSocketRef.current.send(command + "\r");
                        }}
                        className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-slate-400 hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-30"
                      >
                        {command}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!terminalReady}
                      onClick={() => xtermRef.current?.clear()}
                      className="text-xs text-slate-500 hover:text-white disabled:opacity-30"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={!terminalReady}
                      onClick={() => setTerminalAutoSync((value) => !value)}
                      className={`rounded border px-2 py-1 text-[10px] disabled:opacity-30 ${terminalAutoSync ? "border-emerald-400/25 text-emerald-200" : "border-white/10 text-slate-400"}`}
                      title="Automatically save terminal changes into the project files"
                    >
                      Auto-sync {terminalAutoSync ? "ON" : "OFF"}
                    </button>
                    <button
                      type="button"
                      disabled={!terminalReady}
                      onClick={() => void importTerminalChanges()}
                      className="rounded border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-30"
                    >
                      Import now
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
                <div
                  ref={terminalContainerRef}
                  role="region"
                  aria-label="Interactive Linux terminal"
                  className="min-h-0 flex-1 overflow-hidden px-3 py-2"
                />
                <p className="border-t border-white/[0.06] px-4 py-2 text-[10px] leading-5 text-slate-500">
                  Temporary Linux session in an isolated Vercel microVM. Install Kilo with
                  <code className="text-emerald-200">npm install -g @kilocode/cli</code> and run
                  <code className="text-emerald-200">kilo</code>; choose <code className="text-emerald-200">kilo-auto/free</code>
                  for its zero-cost model tier when available. OpenCode is another open-source option:
                  <code className="text-emerald-200">npm install -g @opencode/cli</code> then
                  <code className="text-emerald-200">opencode</code>; use a free model or local Ollama model to avoid inference charges.
                  Terminal edits auto-sync into your saved project every few seconds; use
                  <strong className="text-cyan-200">Import now</strong> for an immediate sync. Free hosted models may be rate limited
                  and some providers log prompts, so never send secrets or private customer data.
                </p>
              </div>

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

            {assistantOpen && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize ExpertAI panel"
                onPointerDown={(event) => beginPanelResize(event, "assistant")}
                className="hidden cursor-col-resize bg-white/[0.04] transition-colors hover:bg-cyan-400/40 xl:block"
              />
            )}

            {/* AI panel */}
            {assistantOpen && (
              <aside className="expert-agent-assistant flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-white/[0.08] bg-[#0c1523] xl:border-l xl:border-t-0">
                <div className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-500/20 text-cyan-200">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">ExpertAI</p>
                      <p className="text-[9px] text-amber-300">AI coding assistant</p>
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

                <div className="mx-3 mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-5 text-amber-100">
                  Describe a change and ExpertAI can update your project files. You can also run
                  Kilo or OpenCode in the Linux terminal; terminal edits automatically sync here.
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
                            disabled={CODING_AGENT_UNDER_DEVELOPMENT}
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
                        <TypewriterText
                          text={message.content}
                          animate={index === typingMessageIndex}
                        />
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
                  {referenceImages.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {referenceImages.map((image, index) => (
                        <div
                          key={image.name + "-" + index}
                          className="flex max-w-full items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-[11px] text-cyan-100"
                        >
                          <ImagePlus className="h-4 w-4 shrink-0" />
                          <span className="max-w-48 truncate">{image.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImages((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              );
                              if (referenceInputRef.current) referenceInputRef.current.value = "";
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                            aria-label={"Remove " + image.name}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={referenceInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      const remaining = Math.max(0, 3 - referenceImages.length);
                      if (!selected.length) return;
                      if (selected.length > remaining) {
                        toast.error("Attach up to three reference images per request.");
                      }
                      const candidates = selected.slice(0, remaining);
                      const valid = candidates.filter((file) => {
                        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                          toast.error(file.name + ": use PNG, JPG or WebP.");
                          return false;
                        }
                        if (file.size > 12 * 1024 * 1024) {
                          toast.error(
                            file.name + ": choose an image under 12 MB before compression.",
                          );
                          return false;
                        }
                        return true;
                      });
                      event.target.value = "";
                      void Promise.all(
                        valid.map(async (file) => {
                          try {
                            return await compressReferenceImage(file);
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not compress " + file.name + ".",
                            );
                            return null;
                          }
                        }),
                      ).then((images) => {
                        setReferenceImages((current) =>
                          [
                            ...current,
                            ...images.filter((image): image is ReferenceImage => Boolean(image)),
                          ].slice(0, 3),
                        );
                      });
                    }}
                  />
                  <div className="rounded-xl border border-white/[0.12] bg-[#101c2d] p-2 focus-within:border-cyan-400/40">
                    <Textarea
                      ref={promptRef}
                      value={prompt}
                      disabled={CODING_AGENT_UNDER_DEVELOPMENT}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendPrompt();
                        }
                      }}
                      rows={3}
                      placeholder="Ask ExpertAI to add a feature, fix a bug, or update your project files…"
                      className="min-h-[76px] resize-none border-0 bg-transparent px-1 text-xs text-white shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                    />
                    <div className="flex items-center justify-between px-1 pt-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => referenceInputRef.current?.click()}
                          disabled={busy || CODING_AGENT_UNDER_DEVELOPMENT}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] text-slate-400 transition hover:bg-white/5 hover:text-cyan-200"
                          title="Attach up to three screenshots or design references"
                        >
                          <ImagePlus className="h-4 w-4" /> Reference images
                        </button>
                        <span className="hidden text-[9px] text-amber-300/80 sm:inline">
                          Project-file editing enabled
                        </span>
                      </div>
                      <Button
                        size="icon"
                        onClick={() => void sendPrompt()}
                        disabled={CODING_AGENT_UNDER_DEVELOPMENT || busy || !prompt.trim()}
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
          <footer className="expert-agent-statusbar flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#0d1523] px-4 py-2">
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

      {/* Rename file dialog */}
      <Dialog open={renameFileOpen} onOpenChange={setRenameFileOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename project file</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rename-file-name">New file path</Label>
              <Input
                id="rename-file-name"
                autoFocus
                value={renameFileName}
                onChange={(event) => setRenameFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") renameFile();
                }}
                placeholder="src/App.tsx"
                className="border-white/10 bg-white/5"
              />
            </div>
            <Button
              onClick={renameFile}
              className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            >
              Rename file
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
          <p className="text-xs leading-5 text-slate-400">
            Syntax highlighting and language modes load automatically from file extensions.
            Supported modes include JavaScript, TypeScript, JSX, TSX, HTML, CSS, JSON, Markdown,
            Python, Java, C, C++, C#, Go, Rust, PHP, SQL, YAML, XML, Vue, Svelte and more. These are
            editor language modes, not marketplace extensions or guaranteed runtimes.
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

      {/* Import a shared project folder from the approved Developer Vault */}
      <Dialog open={vaultImportOpen} onOpenChange={setVaultImportOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderInput className="h-5 w-5" />
              Import from Developer Vault
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-6 text-slate-400">
              Select a shared project folder. ExpertAI Studio imports supported text source files
              into a new project in your account. Binary assets and secret files are not imported.
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {developerVaultLoading ? (
                <p className="py-6 text-center text-sm text-slate-400">Loading team projects…</p>
              ) : developerVaultGroups.length ? developerVaultGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <Folder className="h-5 w-5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{group.name}</p>
                    <p className="text-[11px] text-slate-400">{group.count} stored files</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={importingVault}
                    onClick={() => void importDeveloperVaultProject(group.id, group.name)}
                  >
                    {importingVault ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
                  </Button>
                </div>
              )) : (
                <p className="py-6 text-center text-sm text-slate-400">
                  No project folders are in the Developer Vault yet. Upload one from the team workspace.
                </p>
              )}
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              Import limit: 400 text files, 500 KB per file and 3 MB total source text. Files are
              copied into your own ExpertAI project; the shared vault copy is unchanged.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clone repository dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Clone a GitHub repository
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-400">
              Import a repository into your Project Explorer. It will become its own folder and open
              in the editor.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="clone-repo-url">GitHub repository URL</Label>
              <Input
                id="clone-repo-url"
                value={importRepoUrl}
                onChange={(event) => setImportRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                className="border-white/10 bg-white/5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-github-token">
                GitHub access token{" "}
                <span className="font-normal text-slate-500">(private repositories only)</span>
              </Label>
              <Input
                id="clone-github-token"
                type="password"
                autoComplete="off"
                value={importToken}
                onChange={(event) => setImportToken(event.target.value)}
                placeholder="Optional token for private repositories"
                className="border-white/10 bg-white/5"
              />
              <p className="text-[11px] leading-5 text-slate-500">
                Public repositories can be imported without a token. A token is used only for this
                import and is never saved.
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
              Imports up to 400 text files and 3 MB of source text per project (maximum 500 KB per
              file). Generated folders, binary assets and secret files are skipped. Your GitHub
              repository is not modified.
            </div>
            <Button
              className="w-full bg-white text-slate-950 hover:bg-slate-200"
              disabled={importingRepo || !importRepoUrl.trim()}
              onClick={() => void cloneGithubRepository()}
            >
              {importingRepo ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Folder className="mr-2 h-4 w-4" />
              )}
              {importingRepo ? "Cloning repository…" : "Clone into Project Explorer"}
            </Button>
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
