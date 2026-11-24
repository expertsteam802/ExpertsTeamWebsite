import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Code2,
  Coins,
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
  History,
  CopyPlus,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  MousePointer2,
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
  Star,
  Tablet,
  Terminal,
  TerminalSquare,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
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

import { AgentPromptLibrary } from "@/components/agent-prompt-library";
import { MyLeadOfferwall } from "@/components/mylead-offerwall";
import { ProjectEnvironmentPanel } from "@/components/project-environment-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { extractZipTextFiles } from "@/lib/zip-text-import";
import { beginGitHubPluginOAuth } from "@/lib/plugin-oauth.functions";
import type { Json } from "@/integrations/supabase/types";
import {
  pushProjectToGithub,
  listGitHubRepositories,
  importGitHubProject,
  publishAgentProject,
  runCodingAgent,
  runAgentSelfHeal,
  startAgentTerminal,
  stopAgentTerminal,
  syncAgentTerminalFiles,
  refreshAgentTerminal,
  startAgentPreview,
  stopAgentPreview,
} from "@/lib/agent.functions";
import { buildSrcDocWithConsole, STARTER_FILES, type ProjectFiles } from "@/lib/sandbox";
import { deleteProjectFile, loadProjectFiles, saveProjectFile, saveProjectFiles } from "@/lib/project-files";
type Message = { role: "user" | "assistant"; content: string };
type ProjectTreeNode = { name: string; path: string; folder: boolean; children: ProjectTreeNode[] };

function isInternalAgentWorkspaceFile(filePath: string) {
  const parts = filePath.split("/");
  return parts.some((part) =>
    part.startsWith(".experts-") ||
    [".kilo", ".kilocode", ".opencode", ".git", ".vercel", ".lovable", "node_modules", ".next", ".nuxt", ".turbo", ".cache", ".npm", ".vite", "dist", "build"].includes(part)
  ) || parts.some((part) => /^\.env($|\.)/i.test(part)) ||
    filePath === ".config/kilo/kilo.jsonc";
}

function buildProjectFileTree(filePaths: string[]): ProjectTreeNode[] {
  const root: ProjectTreeNode[] = [];
  for (const filePath of filePaths) {
    const parts = filePath.split("/").filter(Boolean);
    let level = root;
    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath = currentPath ? currentPath + "/" + part : part;
      const isFolder = index < parts.length - 1;
      let node = level.find((item) => item.name === part);
      if (!node) {
        node = { name: part, path: currentPath, folder: isFolder, children: [] };
        level.push(node);
      }
      if (isFolder) level = node.children;
    });
  }
  const sort = (nodes: ProjectTreeNode[]) => {
    nodes.sort((left, right) => Number(right.folder) - Number(left.folder) || left.name.localeCompare(right.name));
    nodes.forEach((node) => sort(node.children));
  };
  sort(root);
  return root;
}
type ReferenceImage = {
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
};

type CheckpointRow = { id: string; name: string; files: ProjectFiles; created_at: string; is_bookmarked: boolean };
type DeveloperVaultGroup = { id: string; name: string; count: number; kind: "file" | "project"; createdAt: string };

type ProjectRow = {
  id: string;
  name: string;
  files?: ProjectFiles;
  messages: Message[];
  published: boolean;
  slug: string | null;
  deployment_url: string | null;
  thumbnail_url: string | null;
  github_repo: string | null;
  cloud_connection_id: string | null;
  updated_at: string;
};

type Panel = "preview" | "code" | "console" | "terminal";

const CODING_AGENT_UNDER_DEVELOPMENT = false;
// Keep the Agent Builder CLI terminal available. If the configured cloud
// sandbox provider rejects a new session, surface its real error to the user.
const CLOUD_SANDBOX_ENABLED = true;


async function copyTextToSystemClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Clipboard API unavailable; use the textarea fallback below.
  }
  const temporary = document.createElement("textarea");
  temporary.value = value;
  temporary.setAttribute("readonly", "");
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.appendChild(temporary);
  temporary.select();
  const copied = document.execCommand("copy");
  temporary.remove();
  if (!copied) throw new Error("Clipboard access was blocked by the browser.");
}


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


function TypewriterText({ text, animate, onComplete }: { text: string; animate: boolean; onComplete?: () => void }) {
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
    }, 12);
    return () => window.clearInterval(timer);
  }, [text, animate]);

  if (!animate) return <>{text}</>;
  return <>{Array.from(text.slice(0, visibleLength)).map((character, index) => (
    <span key={index} className="et-agent-character" onAnimationEnd={index === visibleLength - 1 ? onComplete : undefined}>
      {character === "\n" ? <br /> : character}
    </span>
  ))}</>;
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
  const { user, session, profile, isAdmin, isDeveloper } = useAuth();
  const githubAccessToken = (session as (typeof session & { provider_token?: string }) | null)?.provider_token ?? "";
  const terminalUsername = (profile?.username || user?.email?.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 39) || "user";
  const queryClient = useQueryClient();
  const runCodeAgent = useServerFn(runCodingAgent);
  const repairRuntimeError = useServerFn(runAgentSelfHeal);
  const beginGithubOAuth = useServerFn(beginGitHubPluginOAuth);
  const push = useServerFn(pushProjectToGithub);
  const listGithubRepos = useServerFn(listGitHubRepositories);
  const importGithub = useServerFn(importGitHubProject);
  const publish = useServerFn(publishAgentProject);
  const startPreview = useServerFn(startAgentPreview);
  const connectTerminal = useServerFn(startAgentTerminal);
  const stopTerminal = useServerFn(stopAgentTerminal);
  const syncTerminalFiles = useServerFn(syncAgentTerminalFiles);
  const refreshTerminal = useServerFn(refreshAgentTerminal);
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
  const [openFileTabs, setOpenFileTabs] = useState<string[]>(["index.html"]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenFileTabs((current) => {
      const existing = current.filter((filePath) => files[filePath] !== undefined);
      if (files[activeFile] !== undefined && !existing.includes(activeFile)) existing.push(activeFile);
      const next = existing.slice(-8);
      return next.length === current.length && next.every((filePath, index) => filePath === current[index])
        ? current
        : next;
    });
  }, [activeFile, files]);
  const projectFileTree = useMemo(() => buildProjectFileTree(Object.keys(files).filter((filePath) => !isInternalAgentWorkspaceFile(filePath))), [files]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingMessageIndex, setTypingMessageIndex] = useState<number | null>(null);
  const agentChatEndRef = useRef<HTMLDivElement>(null);
  const [agentPanelMode, setAgentPanelMode] = useState<"chat" | "terminal" | "chats">("chat");
  const [prompt, setPrompt] = useState("");
  const [agentMode, setAgentMode] = useState<"build" | "plan">("build");
  const [tutorMode, setTutorMode] = useState(false);
  const [planDraft, setPlanDraft] = useState<string | null>(null);
  const [planChecklist, setPlanChecklist] = useState<Record<number, boolean>>({});
  const [latestFileDiffs, setLatestFileDiffs] = useState<Array<{ path: string; before: string; after: string }>>([]);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("preview");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
  const [selfHealBusy, setSelfHealBusy] = useState(false);
  const [selfHealJustApplied, setSelfHealJustApplied] = useState(false);
  const [selfHealAttempts, setSelfHealAttempts] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [githubOpen, setGithubOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [restoringCheckpointId, setRestoringCheckpointId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRepoUrl, setImportRepoUrl] = useState("");
  const [importToken, setImportToken] = useState("");
  const [importingRepo, setImportingRepo] = useState(false);
  const [vaultImportOpen, setVaultImportOpen] = useState(false);
  const [importingVault, setImportingVault] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubRepositories, setGithubRepositories] = useState<{ fullName: string; private: boolean; url: string; defaultBranch: string }[]>([]);
  const [loadingGithubRepositories, setLoadingGithubRepositories] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [projectFilter, setProjectFilter] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [assistantWidth, setAssistantWidth] = useState(420);
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
      setAssistantOpen(false);
    }
  }, []);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [renameFileOpen, setRenameFileOpen] = useState(false);
  const [renameFileFrom, setRenameFileFrom] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [completionsOpen, setCompletionsOpen] = useState(false);
  const [enabledEditorPacks, setEnabledEditorPacks] = useState<string[]>(["react", "html", "css"]);
  const [projectNameEditing, setProjectNameEditing] = useState(false);
  const [cloudConnectionId, setCloudConnectionId] = useState<string | null>(null);
  const [environmentPanelOpen, setEnvironmentPanelOpen] = useState(false);
  const [creditsOfferwallOpen, setCreditsOfferwallOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [visualSelectMode, setVisualSelectMode] = useState(false);
  const [selectedPreviewElement, setSelectedPreviewElement] = useState<{ tag: string; selector: string; id: string; classes: string; text: string; outerHTML: string; styles: Record<string, string> } | null>(null);
  const [visualTextDraft, setVisualTextDraft] = useState("");
  const [visualColorDraft, setVisualColorDraft] = useState("#3b82f6");
  const [visualFontSizeDraft, setVisualFontSizeDraft] = useState("16");
  const [visualWeightDraft, setVisualWeightDraft] = useState("400");
  useEffect(() => {
    if (!selectedPreviewElement) return;
    setVisualTextDraft(selectedPreviewElement.text);
    const rawColor = selectedPreviewElement.styles.color ?? "";
    const rgb = rawColor.match(/\d+/g)?.map(Number);
    if (rgb && rgb.length >= 3) setVisualColorDraft("#" + rgb.slice(0, 3).map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join(""));
    else setVisualColorDraft("#3b82f6");
    setVisualFontSizeDraft(String(Math.round(Number.parseFloat(selectedPreviewElement.styles.fontSize ?? "16") || 16)));
    setVisualWeightDraft(selectedPreviewElement.styles.fontWeight === "700" || selectedPreviewElement.styles.fontWeight === "bold" ? "700" : selectedPreviewElement.styles.fontWeight === "600" || selectedPreviewElement.styles.fontWeight === "semibold" ? "600" : "400");
  }, [selectedPreviewElement]);
  function applyVisualElementEdits() {
    const selected = selectedPreviewElement;
    if (!selected) return;
    const nextFiles = { ...files };
    let textChanged = false;
    const originalText = selected.text.trim();
    const replacementText = visualTextDraft.trim();
    if (replacementText && originalText && replacementText !== originalText) {
      const candidates = Object.entries(nextFiles).filter(([path, source]) =>
        /\.(html?|jsx?|tsx?|vue|svelte)$/i.test(path) && source.includes(originalText)
      );
      const matches = candidates.reduce((count, [, source]) => count + source.split(originalText).length - 1, 0);
      if (matches !== 1) {
        toast.error(matches === 0 ? "Could not find this exact text in project source. Use Ask AI to edit it." : "This text appears more than once. Use Ask AI to target the correct source element.");
        return;
      }
      const [sourcePath, source] = candidates[0];
      const safeText = replacementText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      nextFiles[sourcePath] = source.replace(originalText, safeText);
      textChanged = true;
    }
    const cssPath = Object.keys(nextFiles).find((path) => /\.css$/i.test(path));
    const selector = selected.selector.trim();
    if (!cssPath || !selector || /[{};]/.test(selector)) {
      toast.error("A project CSS file and a valid element selector are required for style edits. Text changes were not saved.");
      return;
    }
    const fontSize = Number(visualFontSizeDraft);
    if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 96) {
      toast.error("Choose a font size between 8 and 96 pixels.");
      return;
    }
    const color = /^#[0-9a-f]{6}$/i.test(visualColorDraft) ? visualColorDraft : "#3b82f6";
    const rule = "\n\n/* ExpertsTeam visual edit */\n" + selector + " {\n  color: " + color + ";\n  font-size: " + fontSize + "px;\n  font-weight: " + visualWeightDraft + ";\n}\n";
    nextFiles[cssPath] = (nextFiles[cssPath] ?? "") + rule;
    setFiles(nextFiles);
    setAutoSaveStatus("saved");
    setDirty(true);
    setSelectedPreviewElement(null);
    setVisualSelectMode(false);
    toast.success(textChanged ? "Text and styles updated in project source." : "Styles saved to " + cssPath + ".");
  }

  useEffect(() => {
    if (!previewExpanded) return;
    const restorePreview = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewExpanded(false);
    };
    document.addEventListener("keydown", restorePreview);
    return () => document.removeEventListener("keydown", restorePreview);
  }, [previewExpanded]);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null);
  const [remoteVisualSelectSupported, setRemoteVisualSelectSupported] = useState(false);
  const [previewAddress, setPreviewAddress] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailDialogOpen, setThumbnailDialogOpen] = useState(false);
  const [thumbnailUrlInput, setThumbnailUrlInput] = useState("");
  const [savingThumbnailUrl, setSavingThumbnailUrl] = useState(false);
  const [panelMotionPhase, setPanelMotionPhase] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState("Not started");
  const [terminalReady, setTerminalReady] = useState(false);
  const [showConnectionCinematic, setShowConnectionCinematic] = useState(false);
  const [connectionProgress, setConnectionProgress] = useState(0);
  useEffect(() => {
    if (!showConnectionCinematic) return;
    const progressTimer = window.setInterval(() => {
      setConnectionProgress((current) => Math.min(94, current + Math.max(0.7, (94 - current) * 0.075)));
    }, 320);
    return () => window.clearInterval(progressTimer);
  }, [showConnectionCinematic]);
  const [terminalConnection, setTerminalConnection] = useState<{
    url: string;
    token: string;
    sandboxName: string;
    projectId: string;
    cli: "kilo" | "opencode" | "aider";
    provider?: "daytona";
  } | null>(null);
  const [fileLanguage, setFileLanguage] = useState<Extension[]>([]);
  const runtimeFilesRef = useRef<ProjectFiles>({});
  const autoStartedProjectRef = useRef<string | null>(null);
  const autoStartedKiloRef = useRef(false);
  const autoConnectCliRef = useRef(false);
  const openTerminalRef = useRef<() => Promise<void>>(async () => {});
  const runtimeSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const legacyTerminalContainerRef = useRef<HTMLDivElement>(null);
  const legacyTerminalRef = useRef<XTerm | null>(null);
  const terminalSocketRef = useRef<WebSocket | null>(null);
  const terminalLastActivityRef = useRef(Date.now());
  const terminalRecoveryFilesRef = useRef<ProjectFiles>(files);
  const terminalRecoveryInProgressRef = useRef(false);
  const terminalSessionClosingRef = useRef(new Set<string>());
  const xtermRef = useRef<XTerm | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const filterProjectTree = (nodes: ProjectTreeNode[], query: string): ProjectTreeNode[] => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return nodes;
    return nodes.flatMap((node) => {
      if (node.folder) {
        const children = filterProjectTree(node.children, normalized);
        return node.name.toLowerCase().includes(normalized) || children.length
          ? [{ ...node, children: node.name.toLowerCase().includes(normalized) ? node.children : children }]
          : [];
      }
      return node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized)
        ? [node]
        : [];
    });
  };
  const visibleProjectFileTree = filterProjectTree(projectFileTree, fileFilter);
  const renderProjectTree = (nodes: ProjectTreeNode[], depth = 0): ReactNode[] =>
    nodes.map((node) => {
      if (node.folder) {
        const isOpen = expandedFolders[node.path] ?? depth === 0;
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => setExpandedFolders((current) => ({ ...current, [node.path]: !(current[node.path] ?? depth === 0) }))}
              className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[11px] font-medium text-slate-300 hover:bg-white/[0.05] hover:text-white"
              style={{ paddingLeft: 8 + depth * 14 }}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" /> : <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />}
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="truncate">{node.name}</span>
            </button>
            {isOpen && <div>{renderProjectTree(node.children, depth + 1)}</div>}
          </div>
        );
      }
      const path = node.path;
      return (
        <div key={path} className={`group flex items-center rounded-lg ${path === activeFile ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
          <button
            type="button"
            onClick={() => { setActiveFile(path); switchPanel("code"); }}
            className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left text-xs ${path === activeFile ? "text-white" : "text-slate-400"}`}
            style={{ paddingLeft: 26 + depth * 14 }}
          >
            <FileCode2 className={`h-3.5 w-3.5 shrink-0 ${fileIcon(path)}`} />
            <span className="truncate">{node.name}</span>
          </button>
          <button type="button" onClick={() => { setRenameFileFrom(path); setRenameFileName(path); setRenameFileOpen(true); }} className="rounded p-1 text-slate-600 opacity-100 transition hover:bg-cyan-400/10 hover:text-cyan-200 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Rename ${path}`} title="Rename file">
            <Pencil className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => deleteFile(path)} className="mr-1 rounded p-1 text-slate-600 opacity-100 transition hover:bg-red-500/10 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Delete ${path}`}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      );
    });

  const srcDoc = useMemo(() => buildSrcDocWithConsole(files), [files]);
  useEffect(() => {
    agentChatEndRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);
  useEffect(() => {
    terminalRecoveryFilesRef.current = files;
  }, [files]);

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
    if (agentPanelMode !== "terminal" || !terminalConnection || !container) return;

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      convertEol: true,
      allowTransparency: false,
      scrollback: 3000,
      fontSize: 14,
      lineHeight: 1.2,
      smoothScrollDuration: 0,
      minimumContrastRatio: 4.5,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, Menlo, monospace',
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
    xtermRef.current = terminal;
    const fitWhenVisible = () => {
      if (container.clientWidth < 2 || container.clientHeight < 2) return;
      fit.fit();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
    };
    void document.fonts?.ready.then(() => requestAnimationFrame(fitWhenVisible));
    requestAnimationFrame(() => requestAnimationFrame(fitWhenVisible));

    const socket = new WebSocket(terminalConnection.url, [
      "experts-terminal",
      terminalConnection.token,
    ]);
    socket.binaryType = "arraybuffer";
    terminalSocketRef.current = socket;

    socket.onopen = () => {
      terminalLastActivityRef.current = Date.now();
      setTerminalReady(true);
      setShowConnectionCinematic(false);
      terminal.focus();
      terminal.writeln("\r\n[ExpertsTeam Agent workspace restored.]");
      terminal.write("\r\nConnected to your project workspace.\r\n");
      socket.send(
        "\u0000" + JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
      );
    };
    socket.onmessage = (event) => {
      // Keep binary PTY frames as bytes. Decoding each WebSocket frame separately
      // can split UTF-8 box-drawing characters and corrupt Kilo's full-screen UI.
      if (typeof event.data === "string") terminal.write(event.data);
      else if (event.data instanceof ArrayBuffer) terminal.write(new Uint8Array(event.data));
    };
    socket.onerror = () => {
      setTerminalReady(false);
      setShowConnectionCinematic(false);
      terminal.writeln("\r\n[connection error]");
    };
    socket.onclose = () => { setTerminalReady(false); setShowConnectionCinematic(false); };

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
    let resizeFrame = 0;
    const fitAndSync = () => {
      if (container.clientWidth < 2 || container.clientHeight < 2) return;
      fit.fit();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
      if (socket.readyState === WebSocket.OPEN)
        socket.send(
          "\u0000" + JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
        );
    };
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(fitAndSync);
    });
    observer.observe(container);
    resizeFrame = window.requestAnimationFrame(fitAndSync);

    return () => {
      window.cancelAnimationFrame(resizeFrame);
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
  }, [terminalConnection, agentPanelMode]);

  useEffect(() => {
    const container = legacyTerminalContainerRef.current;
    if (panel !== "terminal" || !terminalConnection || !container) return;
    const terminal = new XTerm({
      cursorBlink: true, cursorStyle: "bar", convertEol: true, scrollback: 5000,
      fontSize: 13, lineHeight: 1.2, smoothScrollDuration: 0,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, Menlo, monospace',
      theme: { background: "#050a12", foreground: "#dbeafe", cursor: "#34d399", selectionBackground: "#164e63" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit); terminal.open(container); fit.fit();
    legacyTerminalRef.current = terminal;
    const socket = new WebSocket(terminalConnection.url, ["experts-terminal-plain", terminalConnection.token]);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      terminal.writeln("\r\nConnected to your original Linux shell.");
      socket.send("\u0000" + JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
      terminal.focus();
    };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") terminal.write(event.data);
      else if (event.data instanceof ArrayBuffer) terminal.write(new Uint8Array(event.data));
    };
    socket.onerror = () => terminal.writeln("\r\n[Linux shell connection error]");
    const input = terminal.onData((value) => { if (socket.readyState === WebSocket.OPEN) socket.send(value); });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) socket.send("\u0000" + JSON.stringify({ type: "resize", cols, rows }));
    });
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        fit.fit();
        if (socket.readyState === WebSocket.OPEN) socket.send("\u0000" + JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
      });
    });
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame); observer.disconnect();
      input.dispose(); resize.dispose(); socket.close(); terminal.dispose();
      if (legacyTerminalRef.current === terminal) legacyTerminalRef.current = null;
    };
  }, [panel, terminalConnection]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["agent-projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("agent_projects")
        .select("id,name,messages,published,slug,deployment_url,thumbnail_url,github_repo,cloud_connection_id,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
  });

  const { data: cloudConnections = [] } = useQuery({
    queryKey: ["cloud-connections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_cloud_connections")
        .select("id,display_name,project_ref")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: developerVaultRows = [], isLoading: developerVaultLoading } = useQuery({
    queryKey: ["developer-vault-import-list", user?.id],
    enabled: Boolean(user && (isAdmin || isDeveloper)),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_vault_items")
        .select("group_id,group_name,group_kind,relative_path,created_at")
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
        kind: row.group_kind,
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
        .select("id,name,files,created_at,is_bookmarked")
        .eq("project_id", projectId!)
        .order("is_bookmarked", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as CheckpointRow[];
    },
  });

  useEffect(() => {
    const session = terminalConnection;
    if (!session) return;
    return () => {
      if (terminalSessionClosingRef.current.has(session.sandboxName)) {
        terminalSessionClosingRef.current.delete(session.sandboxName);
        return;
      }
      // Leaving Studio persists the authored project files before stopping
      // the disposable VM. If persistence fails, keep the VM alive so the
      // latest edits can still be recovered on the next visit.
      void syncTerminalFiles({
        data: { projectId: session.projectId, sandboxName: session.sandboxName },
      })
        .then(async ({ files: savedFiles }) => {
          if (!user?.id) throw new Error("The signed-in account is no longer available.");
          await saveProjectFiles(session.projectId, user.id, savedFiles);
          const { error } = await supabase.from("agent_projects")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.projectId).eq("user_id", user.id);
          if (error) throw error;
          await stopTerminal({ data: { sandboxName: session.sandboxName } });
        })
        .catch(() => undefined);
    };
  }, [syncTerminalFiles, stopTerminal, terminalConnection?.sandboxName, terminalConnection?.projectId, user?.id]);


  // Persist each generated file separately as soon as it appears or changes
  // in the Daytona project directory. This is intentionally file-by-file,
  // not one large upload after the CLI has finished its entire task.
  useEffect(() => {
    const session = terminalConnection;
    if (!busy || !session || session.projectId !== projectId || !user?.id) return;
    let active = true;
    let saving = false;
    let lastSaveError = "";
    const saveSnapshot = async () => {
      if (!active || saving) return;
      saving = true;
      try {
        const snapshot = await syncTerminalFiles({
          data: { projectId: session.projectId, sandboxName: session.sandboxName },
        });
        if (!active) return;

        const persisted: ProjectFiles = { ...terminalRecoveryFilesRef.current };
        const changedPaths = Object.keys(snapshot.files).filter(
          (filePath) => persisted[filePath] !== snapshot.files[filePath],
        );
        const deletedPaths = Object.keys(persisted).filter(
          (filePath) => !(filePath in snapshot.files),
        );

        // Commit each newly written/updated file individually. If a later
        // write fails, earlier files are already safely stored in the project.
        for (const filePath of changedPaths) {
          if (!active) return;
          const nextFiles: ProjectFiles = {
            ...persisted,
            [filePath]: String(snapshot.files[filePath]),
          };
          await saveProjectFile(session.projectId, user.id, filePath, String(snapshot.files[filePath]));
          Object.assign(persisted, { [filePath]: String(snapshot.files[filePath]) });
          terminalRecoveryFilesRef.current = { ...persisted };
        }

        // Mirror deletions one at a time so removed files do not reappear
        // when the project is reopened.
        for (const filePath of deletedPaths) {
          if (!active) return;
          delete persisted[filePath];
          await deleteProjectFile(session.projectId, filePath);
          terminalRecoveryFilesRef.current = { ...persisted };
        }

        if (changedPaths.length || deletedPaths.length) {
          const { error: touchError } = await supabase.from("agent_projects")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.projectId).eq("user_id", user.id);
          if (touchError) throw touchError;
        }

        lastSaveError = "";
        if (active && (changedPaths.length || deletedPaths.length) && projectId === session.projectId) {
          setFiles({ ...snapshot.files });
          setDirty(false);
        }
      } catch (error) {
        // Retry on the next poll and surface a single warning instead of silently
        // losing the user's confidence that generated files are being saved.
        const message = error instanceof Error ? error.message : "Automatic file saving failed.";
        if (active && message !== lastSaveError) {
          lastSaveError = message;
          setLogs((current) => [...current.slice(-199), { type: "warn", message: "Auto-save will retry: " + message }]);
        }
      } finally {
        saving = false;
      }
    };
    const timer = window.setInterval(() => void saveSnapshot(), 1200);
    void saveSnapshot();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [busy, terminalConnection?.sandboxName, terminalConnection?.projectId, projectId, user?.id, syncTerminalFiles]);

  // Keep the Daytona sandbox's idle timer refreshed while its terminal is open.
  // If the browser disappears unexpectedly, Daytona still auto-stops the workspace.
  useEffect(() => {
    const session = terminalConnection;
    if (!session || session.provider !== "daytona" || session.projectId !== projectId) return;
    const heartbeat = window.setInterval(() => {
      void refreshTerminal({
        data: { projectId: session.projectId, sandboxName: session.sandboxName },
      }).catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(heartbeat);
  }, [terminalConnection?.sandboxName, terminalConnection?.projectId, terminalConnection?.provider, projectId, refreshTerminal]);

  // Rotate the disposable Linux VM before Vercel's 45-minute Hobby limit.
  // Project files are synced first; Kilo starts fresh in the replacement VM.
  // An active CLI process cannot survive a provider VM replacement.
  useEffect(() => {
    const session = terminalConnection;
    const userId = user?.id;
    if (!session || session.projectId !== projectId || !userId || session.provider === "daytona") return;
    let cancelled = false;
    let retryTimer: number | undefined;

    const recoverSession = async () => {
      if (terminalRecoveryInProgressRef.current || cancelled) return;
      terminalRecoveryInProgressRef.current = true;
      try {
        let recoveryFiles: ProjectFiles;
        try {
          const synced = await syncTerminalFiles({
            data: { projectId: session.projectId, sandboxName: session.sandboxName },
          });
          recoveryFiles = synced.files;
          await saveProjectFiles(session.projectId, userId, recoveryFiles);
          const { error } = await supabase.from("agent_projects")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", session.projectId).eq("user_id", userId);
          if (error) throw error;
        } catch {
          if (cancelled) return;
          // The VM may already have expired. Restore this exact project from Supabase,
          // never from whichever project's editor happens to be selected now.
          const { data, error } = await supabase
            .from("agent_projects")
            .select("files")
            .eq("id", session.projectId)
            .eq("user_id", userId)
            .maybeSingle();
          if (error) throw error;
          recoveryFiles = await loadProjectFiles(session.projectId);
          if (!Object.keys(recoveryFiles).length && data?.files && typeof data.files === "object" && !Array.isArray(data.files)) {
            recoveryFiles = data.files as unknown as ProjectFiles;
          }
          if (!Object.keys(recoveryFiles).length) throw new Error("The saved project files could not be recovered.");
        }
        if (cancelled) return;
        if (projectId === session.projectId) {
          terminalRecoveryFilesRef.current = recoveryFiles;
          setFiles(recoveryFiles);
          setDirty(false);
        }

        const replacement = await connectTerminal({
          data: {
            projectId: session.projectId,
            username: terminalUsername,
            cli: session.cli,
          },
        });
        if (cancelled) {
          void stopTerminal({ data: { sandboxName: replacement.sandboxName } }).catch(() => undefined);
          return;
        }

        terminalSessionClosingRef.current.add(session.sandboxName);
        setTerminalConnection({ ...replacement, projectId: session.projectId });
        setTerminalReady(false);
        void stopTerminal({ data: { sandboxName: session.sandboxName } }).catch(() => undefined);
      } catch {
        // Retry quietly. If the old VM expired, restore from the saved project record.
        if (!cancelled) retryTimer = window.setTimeout(recoverSession, 60_000);
      } finally {
        terminalRecoveryInProgressRef.current = false;
      }
    };

    const timer = window.setTimeout(recoverSession, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [terminalConnection?.sandboxName, terminalConnection?.projectId, projectId, user?.id, connectTerminal, syncTerminalFiles, stopTerminal, terminalUsername]);

  // Keep the Daytona preview session warm and recover it after an idle stop.
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
              result = await startPreview({ data: { projectId } });
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
          setRuntimeStatus("Running · Daytona");
          setRemoteVisualSelectSupported(Boolean(result.visualSelectSupported));
          if (result.recovered) {
            setRuntimeUrl(result.url);
            setPreviewKey((value) => value + 1);
            setLogs((current) => [
              ...current.slice(-199),
              {
                type: "runtime",
                message: "Preview automatically recovered after Daytona stopped the workspace.",
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
          await persist({ files: nextFiles });
          await startPreview({ data: { projectId } });
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
        __agentSelection?: boolean;
        element?: { tag: string; selector: string; id: string; classes: string; text: string; outerHTML: string; styles: Record<string, string> };
        type?: string;
        message?: string;
      };
      if (data?.__agentSelection && data.element) {
        setSelectedPreviewElement(data.element);
        setVisualSelectMode(false);
        return;
      }
      if (!data?.__agentConsole) return;
      const logType = data.type ?? "log";
      const logMessage = data.message ?? "";
      setLogs((current) => [
        ...current.slice(-199),
        { type: logType, message: logMessage },
      ]);
      if (logType === "error") setPanel("console");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (runtimeUrl && !remoteVisualSelectSupported) {
      setVisualSelectMode(false);
      setSelectedPreviewElement(null);
      return;
    }
    iframeRef.current?.contentWindow?.postMessage(
      { __agentVisualSelect: true, enabled: visualSelectMode },
      "*",
    );
  }, [visualSelectMode, previewKey, runtimeUrl, remoteVisualSelectSupported]);

  async function importTerminalChanges() {
    if (!projectId) return;
    try {
      if (!terminalConnection?.sandboxName) throw new Error("The Project builder session is no longer available.");
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

  async function closeTerminalSession(): Promise<ProjectFiles | null> {
    const session = terminalConnection;
    let syncedFiles: ProjectFiles | null = null;
    if (session && user) {
      try {
        const result = await syncTerminalFiles({
          data: { projectId: session.projectId, sandboxName: session.sandboxName },
        });
        await saveProjectFiles(session.projectId, user.id, result.files);
        const { error } = await supabase.from("agent_projects")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", session.projectId).eq("user_id", user.id);
        if (error) throw error;
        syncedFiles = result.files;
        if (session.projectId === projectId) {
          terminalRecoveryFilesRef.current = result.files;
          setFiles(result.files);
          setDirty(false);
        }
      } catch (error) {
        // Do not stop or detach a workspace when its final file sync failed.
        // Keeping the session connected gives the user a chance to retry rather
        // than silently throwing away edits that may not have reached storage.
        const detail = error instanceof Error ? error.message : "Unknown sync error";
        throw new Error("Could not safely save the current workspace. The terminal session was kept open. " + detail);
      }
    }
    const sessionName = session?.sandboxName;
    if (sessionName) terminalSessionClosingRef.current.add(sessionName);
    const socket = terminalSocketRef.current;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    terminalSocketRef.current = null;
    setTerminalConnection(null);
    setTerminalReady(false);
    try {
      if (sessionName) await stopTerminal({ data: { sandboxName: sessionName } });
    } catch {
      // The provider may already have expired the disposable VM.
    }
    return syncedFiles;
  }

  // Keep the project sandbox alive for the full lifetime of ExpertAI Studio.
  // It is stopped by the Studio unmount cleanup, not by idle typing time.

  async function chooseTerminalCli(): Promise<"kilo" | "opencode" | "aider"> {
    // Respect the admin-selected default without interrupting users with a browser prompt.
    try {
      const { data } = await supabase.from("site_settings").select("site_branding_settings").eq("id", 1).single();
      const root = data?.site_branding_settings && typeof data.site_branding_settings === "object" && !Array.isArray(data.site_branding_settings)
        ? data.site_branding_settings as Record<string, unknown> : {};
      const terminal = root.terminalSettings && typeof root.terminalSettings === "object" && !Array.isArray(root.terminalSettings)
        ? root.terminalSettings as Record<string, unknown> : {};
      const enabled = Array.isArray(terminal.enabledClis)
        ? terminal.enabledClis.filter((value): value is "kilo" | "opencode" | "aider" => value === "kilo" || value === "opencode" || value === "aider")
        : ["kilo"];
      const preferred = terminal.defaultCli;
      if (typeof preferred === "string" && enabled.includes(preferred as "kilo" | "opencode" | "aider")) return preferred as "kilo" | "opencode" | "aider";
      return (enabled[0] ?? "kilo") as "kilo" | "opencode" | "aider";
    } catch {
      return "kilo";
    }
  }

  async function openTerminal() {
    if (!CLOUD_SANDBOX_ENABLED) {
      setAgentPanelMode("terminal");
      setRuntimeStatus("Cloud terminal temporarily unavailable");
      toast.info("The CLI terminal is temporarily paused because the free Vercel Sandbox quota is exhausted. Your Agent Builder files remain saved.");
      return;
    }
    // Reuse a live socket. A saved connection object alone is not proof that
    // the browser WebSocket is still open: the PTY can exit while the sandbox
    // and its project files remain available.
    const sameProjectSession = terminalConnection?.projectId === projectId;
    if (sameProjectSession && terminalReady && terminalSocketRef.current?.readyState === WebSocket.OPEN) {
      setShowConnectionCinematic(false);
      setAgentPanelMode("terminal");
      terminalLastActivityRef.current = Date.now();
      return;
    }
    // First launch / page refresh gets the connection animation. Reconnecting
    // an existing workspace or switching projects happens quietly in the background.
    setConnectionProgress(0);
    setShowConnectionCinematic(!terminalConnection);
    try {
      const selectedCli = await chooseTerminalCli();
      let nextFiles = files;
      const previousProjectId = terminalConnection?.projectId;
      if (terminalConnection && !sameProjectSession) {
        const syncedFiles = await closeTerminalSession();
        if (syncedFiles && previousProjectId === projectId) nextFiles = syncedFiles;
      } else if (sameProjectSession && terminalConnection) {
        // Save recoverable files if the sandbox is still reachable, but do not
        // stop the workspace just to reconnect its terminal socket.
        try {
          const synced = await syncTerminalFiles({
            data: { projectId: terminalConnection.projectId, sandboxName: terminalConnection.sandboxName },
          });
          nextFiles = synced.files;
        } catch {
          // Keep the last saved editor contents; the server will retry workspace startup.
        }
      }
      const activeProjectId = await persist({ files: nextFiles });
      const connection = await connectTerminal({
        data: { projectId: activeProjectId, username: terminalUsername, cli: selectedCli },
      });
      setTerminalConnection({ ...connection, projectId: activeProjectId, cli: selectedCli });
      setConnectionProgress(100);
      setShowConnectionCinematic(false);
      setRuntimeStatus("CLI connected");
      if (connection.toolkitStatus === "installing") toast.info("The CTF starter toolkit is installing in the Linux sandbox.");
    } catch (error) {
      autoConnectCliRef.current = false;
      setShowConnectionCinematic(false);
      setRuntimeStatus("CLI connection failed");
      const message =
        error instanceof Error ? error.message : "Could not start the project builder.";
      toast.error(message);
    }
  }

  openTerminalRef.current = openTerminal;

  useEffect(() => {
    if (!terminalConnection || terminalConnection.projectId === projectId) return;
    autoConnectCliRef.current = true;
    void openTerminalRef.current();
  }, [projectId, terminalConnection?.projectId]);

  // Restore the latest project first, then automatically connect the admin-selected
  // CLI (OpenCode/Kilo/Aider) once the workspace files are ready.
  useEffect(() => {
    if (!user?.id || projectsLoading || autoStartedKiloRef.current) return;
    if (!projectId && projects.length > 0) {
      const mostRecentSavedProject = projects[0];
      if (mostRecentSavedProject) {
        void openProject(mostRecentSavedProject);
        return;
      }
      toast.error("Your saved projects were found, but none currently contains recoverable source files. No new project was created.");
      return;
    }
    autoStartedKiloRef.current = true;
  }, [user?.id, projectsLoading, projects, projectId]);

  // Start the selected CLI automatically when Studio opens. A blank first-time
  // workspace is persisted by openTerminal before the sandbox is created.
  useEffect(() => {
    if (!CLOUD_SANDBOX_ENABLED) return;
    if (!user?.id || projectsLoading || !autoStartedKiloRef.current) return;
    if (autoConnectCliRef.current || terminalConnection) return;
    if (!projectId && projects.length > 0) return;
    if (!Object.keys(files).length) return;
    autoConnectCliRef.current = true;
    void openTerminalRef.current();
  }, [user?.id, projectsLoading, projects.length, projectId, files, terminalConnection]);

  async function importLocalProjectFiles(selectedFiles: FileList | File[]) {
    const incoming = Array.from(selectedFiles);
    if (!incoming.length) return;
    const nextFiles: ProjectFiles = { ...files };
    let totalBytes = Object.values(nextFiles).reduce((sum, value) => sum + new Blob([value]).size, 0);
    let imported = 0;
    let skipped = 0;
    for (const file of incoming) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (relativePath.toLowerCase().endsWith(".zip")) {
        if (file.size > 100 * 1024 * 1024) { skipped += 1; continue; }
        try {
          const extracted = await extractZipTextFiles(file);
          skipped += extracted.skipped;
          for (const entry of extracted.files) {
            const path = entry.path.replace(/^\/+/, "");
            if (!path || path.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".")) || /(^|\/)\.env($|\.)/i.test(path) || entry.sizeBytes > 10 * 1024 * 1024 || totalBytes + entry.sizeBytes > 25 * 1024 * 1024 || (Object.keys(nextFiles).length >= 2_000 && nextFiles[path] === undefined)) { skipped += 1; continue; }
            nextFiles[path] = entry.content;
            totalBytes += entry.sizeBytes;
            imported += 1;
          }
        } catch { skipped += 1; }
        continue;
      }
      const path = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!path || path.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".")) || /(^|\/)\.env($|\.)/i.test(path) || file.size > 10 * 1024 * 1024 || totalBytes + file.size > 25 * 1024 * 1024 || (Object.keys(nextFiles).length >= 2_000 && nextFiles[path] === undefined)) { skipped += 1; continue; }
      const textLike = file.type.startsWith("text/") || /\.(?:[cm]?[jt]sx?|json|css|scss|html?|md|mdx|xml|ya?ml|toml|ini|py|java|c|h|cpp|cs|go|rs|php|sql|sh|bat|ps1|svg|txt|env\.example)$/i.test(path);
      if (!textLike) { skipped += 1; continue; }
      try {
        nextFiles[path] = await file.text();
        totalBytes += file.size;
        imported += 1;
      } catch { skipped += 1; }
    }
    if (!imported) {
      toast.error("No supported text/source files were imported. Use a ZIP for a project folder; binary files are not stored as source text.");
      return;
    }
    if (!window.confirm("Import " + imported + " file(s) into this project? Existing paths will be replaced.")) return;
    try {
      await persist({ files: nextFiles });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imported files could not be saved.");
      return;
    }
    setFiles(nextFiles);
    setActiveFile(Object.keys(nextFiles).find((path) => !Object.prototype.hasOwnProperty.call(files, path)) ?? Object.keys(nextFiles)[0] ?? "index.html");
    setDirty(false);
    setPreviewKey((value) => value + 1);
    toast.success("Imported and auto-saved " + imported + " file(s)" + (skipped ? " · " + skipped + " skipped" : "") + ".");
  }


  function downloadActiveFile() {
    const content = files[activeFile];
    if (content === undefined) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeFile.split("/").pop() || "project-file.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const packageManifest = (() => {
      try { return JSON.parse(files["package.json"] ?? "{}") as { scripts?: Record<string, string> }; }
      catch { return {}; }
    })();
    const hasRuntimeScript = Boolean(packageManifest.scripts?.dev || packageManifest.scripts?.start);
    const hasHtmlEntry = Boolean(files["index.html"] || Object.keys(files).some((filePath) => filePath.toLowerCase().endsWith(".html")));

    // Plain HTML/CSS/JS runs from srcDoc with no cloud VM or sandbox allocation.
    if (hasHtmlEntry && !hasRuntimeScript) {
      switchPanel("preview");
      setRuntimeUrl(null);
      setRemoteVisualSelectSupported(false);
      setPreviewAddress("");
      setRuntimeStatus("Running · browser preview (no cloud VM)");
      setLogs([{ type: "runtime", message: "HTML, CSS and JavaScript are running directly in your browser. No cloud VM or sandbox quota is used." }]);
      setPreviewKey((current) => current + 1);
      toast.success("Browser preview is running");
      return;
    }

    if (runtimeBusy) return;
    setRuntimeBusy(true);
    setRuntimeStatus("Preparing Daytona runtime…");
    switchPanel("preview");
    setLogs([]);
    try {
      const activeProjectId = await persist({ files });
      autoStartedProjectRef.current = activeProjectId;
      const result = await startPreview({ data: { projectId: activeProjectId } });
      setRuntimeUrl(result.url);
      setRemoteVisualSelectSupported(Boolean(result.visualSelectSupported));
      setPreviewAddress(result.url);
      setRuntimeStatus("Running · Daytona");
      runtimeFilesRef.current = { ...files };
      if (result.installOutput) setLogs([{ type: "runtime", message: result.installOutput }]);
      toast.success("Daytona preview is running");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Daytona preview could not start.";
      setRuntimeStatus("Could not start");
      setRuntimeUrl(null);
      setLogs((current) => [...current, { type: "error", message }]);
      toast.error(message);
    } finally {
      setRuntimeBusy(false);
    }
  }

  useEffect(() => {
    if (!CLOUD_SANDBOX_ENABLED) return;
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
      setRuntimeStatus("Stopped · project files preserved");
      setTerminalReady(false);
      toast.success("Preview stopped");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop the preview.");
    } finally {
      setRuntimeBusy(false);
    }
  }

  function resetRuntimeForProjectChange() {
    autoStartedProjectRef.current = null;
    autoConnectCliRef.current = false;
    if (projectId && runtimeUrl) void stopPreview({ data: { projectId } }).catch(() => undefined);
    // Keep the user-scoped terminal connection alive while the project folder changes.
    setRuntimeUrl(null);
    setPreviewAddress("");
    setRuntimeStatus("Not started");
    runtimeFilesRef.current = {};
  }

  async function publishProject() {
    if (!CLOUD_SANDBOX_ENABLED) {
      toast.info("New app builds are temporarily paused because the free cloud sandbox quota is exhausted. Your saved project and existing published apps are unaffected.");
      return;
    }
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
      const requestedSlug = window.prompt("Choose your public project URL. Use lowercase letters, numbers and hyphens.", existingSlug || baseSlug);
      if (requestedSlug === null) return;
      const slug = requestedSlug.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
      if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
        toast.error("Choose a URL slug with 3–60 characters, using letters, numbers and hyphens.");
        return;
      }
      const result = await publish({ data: { projectId: activeProjectId, slug } });
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

  function switchPanel(nextPanel: Panel) {
    setPanel(nextPanel);
    setPanelMotionPhase((phase) => phase === 0 ? 1 : 0);
  }

  async function attemptRuntimeSelfHeal() {
    if (!user || !projectId) {
      toast.info("Save this project before using automatic repair.");
      return;
    }
    if (selfHealBusy) return;
    if (selfHealAttempts >= 3) {
      toast.error("Automatic repair paused after three attempts. Review the error manually before retrying.");
      return;
    }
    const latestError = [...logs].reverse().find((entry) => entry.type === "error" && entry.message.trim());
    if (!latestError) {
      toast.info("No runtime error is available to repair.");
      return;
    }
    setSelfHealBusy(true);
    setSelfHealJustApplied(false);
    setSelfHealAttempts((count) => count + 1);
    try {
      await saveCheckpoint("Before free runtime repair");
      const repairFiles = Object.fromEntries(Object.entries(files).filter(([path]) => !isInternalAgentWorkspaceFile(path)).slice(0, 18));
      const result = await repairRuntimeError({
        data: { projectId, error: { message: latestError.message.slice(0, 3000) }, files: repairFiles },
      });
      if (!Object.keys(result.files).length) {
        toast.warning(result.message || "The repair model could not safely identify a fix. No files were changed.");
        return;
      }
      const nextFiles = { ...files, ...result.files };
      await saveProjectFiles(projectId, user.id, nextFiles);
      setFiles(nextFiles);
      setPreviewKey((key) => key + 1);
      setLogs([]);
      setSelfHealAttempts(0);
      setSelfHealJustApplied(true);
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      toast.success("Free runtime repair applied. Review the preview to confirm the result.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Automatic repair failed. Your previous files were preserved.");
    } finally {
      setSelfHealBusy(false);
    }
  }

  async function saveProjectThumbnailUrl() {
    const value = thumbnailUrlInput.trim();
    if (!value) { toast.error("Paste an image URL first."); return; }
    let parsed: URL;
    try { parsed = new URL(value); } catch { toast.error("Enter a valid image URL."); return; }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") { toast.error("Image URLs must start with https:// or http://."); return; }
    if (!user) { toast.error("Sign in to save a project thumbnail."); return; }
    setSavingThumbnailUrl(true);
    try {
      const activeProjectId = projectId ?? (await persist());
      const { error } = await supabase.from("agent_projects").update({ thumbnail_url: parsed.toString() }).eq("id", activeProjectId).eq("user_id", user.id);
      if (error) throw error;
      setThumbnailUrl(parsed.toString());
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      setThumbnailDialogOpen(false);
      toast.success("Project thumbnail URL saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the thumbnail URL."); }
    finally { setSavingThumbnailUrl(false); }
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
          setThumbnailUrlInput(publicUrl);
          setThumbnailDialogOpen(false);
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
    targetProjectId?: string,
  ) {
    if (!user) throw new Error("Please sign in to save your project.");

    const filesToSave = next.files ?? files;
    if (!filesToSave || typeof filesToSave !== "object") {
      throw new Error("The workspace file tree is invalid. The saved project was left unchanged.");
    }
    const payload = {
      user_id: user.id,
      name: name.trim() || "Untitled project",
      files: filesToSave as unknown as Json,
      messages: (next.messages ?? messages).slice(-40) as unknown as Json,
      cloud_connection_id: cloudConnectionId,
      ...next.extra,
    };

    const activeProjectId = targetProjectId ?? projectId;
    if (activeProjectId) {
      const { files: _legacyFiles, ...metadataPayload } = payload;
      const { error } = await supabase
        .from("agent_projects")
        .update(metadataPayload)
        .eq("id", activeProjectId)
        .eq("user_id", user.id);
      if (error) throw error;
      await saveProjectFiles(activeProjectId, user.id, filesToSave);
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      if (JSON.stringify(terminalRecoveryFilesRef.current) === JSON.stringify(filesToSave)) {
        setDirty(false);
      }
      return activeProjectId;
    }

    const { data, error } = await supabase
      .from("agent_projects")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;
    await saveProjectFiles(data.id, user.id, filesToSave);
    setProjectId(data.id);
    if (JSON.stringify(terminalRecoveryFilesRef.current) === JSON.stringify(filesToSave)) {
      setDirty(false);
    }
    await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
    return data.id;
  }





  // Keep files edited by Kilo/OpenCode in the terminal reflected in the editor
  // and saved project record. Manual editor changes take priority while dirty.
  useEffect(() => {
    if (!terminalReady || !projectId || !user || busy || dirty) return;
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
        await saveProjectFiles(projectId, user.id, importedFiles);
        const { error } = await supabase.from("agent_projects")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", activeProjectId).eq("user_id", user.id);
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
  }, [terminalReady, terminalConnection?.sandboxName, projectId, user, busy, dirty, files, syncTerminalFiles, queryClient]);

  async function saveCheckpoint(label: string, targetProjectId?: string) {
    if (!user) throw new Error("Sign in to create a checkpoint.");
    const activeProjectId = targetProjectId ?? projectId ?? (await persist());
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
    setAutoSaveStatus("saved");
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

  async function duplicateCurrentProject() {
    if (!user) {
      toast.error("Sign in to duplicate this project.");
      return;
    }
    try {
      const { data: duplicate, error } = await supabase
        .from("agent_projects")
        .insert({
          user_id: user.id,
          name: (name.trim() || "Untitled project") + " copy",
          files: files as unknown as Json,
          messages: messages.slice(-40) as unknown as Json,
        })
        .select("id").single();
      if (error) throw error;
      await saveProjectFiles(duplicate.id, user.id, files);
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      toast.success("Project duplicated and saved. Refresh your project list to open the copy.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate this project.");
    }
  }

  async function toggleCheckpointBookmark(checkpoint: CheckpointRow) {
    if (!user) return;
    const { error } = await supabase
      .from("agent_project_checkpoints")
      .update({ is_bookmarked: !checkpoint.is_bookmarked })
      .eq("id", checkpoint.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["agent-project-checkpoints", projectId] });
  }

  async function restoreCheckpoint(checkpoint: CheckpointRow) {
    if (!user || !projectId || restoringCheckpointId) return;
    if (!window.confirm("Restore this version? Your current project will first be saved as a new checkpoint.")) return;
    setRestoringCheckpointId(checkpoint.id);
    try {
      await saveCheckpoint("Before restore");
      const restored = checkpoint.files;
      if (!restored || typeof restored !== "object" || !Object.keys(restored).length) {
        throw new Error("This version contains no recoverable source files.");
      }
      await persist({ files: restored });
      setFiles(restored);
      setActiveFile(Object.keys(restored)[0] ?? "index.html");
      setDirty(false);
      setPreviewKey((value) => value + 1);
      if (terminalConnection?.projectId === projectId) {
        await stopTerminal({ data: { sandboxName: terminalConnection.sandboxName } });
        setTerminalConnection(null);
        setTerminalReady(false);
      }
      setVersionHistoryOpen(false);
      toast.success("Restored version: " + checkpoint.name + ". Reopen the Agent terminal to sync the restored files.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore this version.");
    } finally {
      setRestoringCheckpointId(null);
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => persist(),
    onSuccess: () => { setAutoSaveStatus("saved"); toast.success("Project saved successfully"); },
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => {
    if (!dirty || busy || !user || autoSaveStatus === "saving" || autoSaveStatus === "error") return;
    const timeout = window.setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await persist();
        setAutoSaveStatus("saved");
      } catch (error) {
        setAutoSaveStatus("error");
        toast.error(error instanceof Error ? "Auto-save failed: " + error.message : "Auto-save failed. Your changes are still in this workspace.");
      }
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [dirty, busy, user?.id, projectId, files, messages, name, cloudConnectionId, autoSaveStatus, persist]);
  useEffect(() => {
    const handleWorkspaceShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.altKey) return;
      if (key === "p") {
        event.preventDefault();
        setQuickOpen(true);
        setQuickOpenQuery("");
        return;
      }
      if (key === "s") {
        event.preventDefault();
        if (!saveMutation.isPending) saveMutation.mutate();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true'], .cm-content, .xterm");
      if (key === "enter" && !typing && !runtimeBusy) {
        event.preventDefault();
        void runProject();
      }
    };
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [saveMutation.isPending, saveMutation.mutate, runtimeBusy, runProject]);

  const githubMutation = useMutation({
    mutationFn: async () => {
      const activeProjectId = await persist({ files });
      const result = await push({
        data: { projectId: activeProjectId, token: githubAccessToken || githubToken, repo: githubRepo },
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

  async function importDeveloperVaultProject(groupId: string, groupName: string, groupKind: "file" | "project") {
    if (!user || !(isAdmin || isDeveloper) || importingVault) return;
    setImportingVault(true);
    try {
      if (dirty) await persist();
      const { data: rows, error } = await supabase
        .from("developer_vault_items")
        .select("file_name,relative_path,storage_path,size_bytes")
        .eq("group_id", groupId)
        .eq("group_kind", groupKind)
        .order("relative_path", { ascending: true });
      if (error) throw error;
      const importedFiles: ProjectFiles = {};
      let totalBytes = 0;
      let skipped = 0;
      const textFile = /\.(html?|css|[cm]?[jt]sx?|json|md|txt|ya?ml|toml|py|sql|sh|xml|svg|vue|svelte|go|rs|java|c|h|cpp|hpp|cs|php|rb|ipynb)$/i;
      for (const row of rows ?? []) {
        const path = row.relative_path || row.file_name;
        if (path.toLowerCase().endsWith(".zip")) {
          if (row.size_bytes > 100 * 1024 * 1024) {
            skipped += 1;
            continue;
          }
          const { data: archive, error: archiveError } = await supabase.storage
            .from("developer-vault")
            .download(row.storage_path);
          if (archiveError || !archive) throw archiveError ?? new Error("Could not download " + path);
          const extracted = await extractZipTextFiles(archive);
          skipped += extracted.skipped;
          for (const entry of extracted.files) {
            if (
              Object.keys(importedFiles).length >= 2_000 ||
              totalBytes + entry.sizeBytes > 25 * 1024 * 1024 ||
              Object.prototype.hasOwnProperty.call(importedFiles, entry.path)
            ) {
              skipped += 1;
              continue;
            }
            importedFiles[entry.path] = entry.content;
            totalBytes += entry.sizeBytes;
          }
          continue;
        }
        if (!textFile.test(path) || /(^|\/)\.env($|\.)/i.test(path) || path.split("/").some((part) => part === "..") || row.size_bytes > 10 * 1024 * 1024 || totalBytes + row.size_bytes > 25 * 1024 * 1024) {
          skipped += 1;
          continue;
        }
        if (Object.keys(importedFiles).length >= 2_000) {
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
      const projectName =
        groupKind === "file" && groupName.toLowerCase().endsWith(".zip")
          ? groupName.slice(0, -4)
          : groupName;
      const { data: saved, error: saveError } = await supabase
        .from("agent_projects")
        .insert({
          user_id: user.id,
          name: projectName,
          files: importedFiles as unknown as Json,
          messages: [],
          published: false,
        })
        .select("id")
        .single();
      if (saveError) throw saveError;
      await saveProjectFiles(saved.id, user.id, importedFiles);
      resetRuntimeForProjectChange();
      setProjectId(saved.id);
      setPublishedUrl(null);
      setThumbnailUrl(null);
      setName(projectName);
      setFiles(importedFiles);
      setMessages([]);
      setActiveFile(Object.keys(importedFiles).sort()[0] ?? "README.md");
      setGithubRepo("");
      setLogs([]);
      switchPanel("code");
      setDirty(false);
      setVaultImportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
      toast.success(
        'Imported "' + projectName + '" from Developer Vault (' + Object.keys(importedFiles).length +
        " source " + (Object.keys(importedFiles).length === 1 ? "file" : "files") + (skipped ? ", " + skipped + " skipped" : "") + ").",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this Developer Vault project.");
    } finally {
      setImportingVault(false);
    }
  }

  async function loadGithubRepositories() {
    const token = githubAccessToken || githubToken.trim();
    if (!token) {
      toast.error("Connect GitHub first to load your repositories.");
      return;
    }
    setLoadingGithubRepositories(true);
    try {
      const repositories = await listGithubRepos({ data: { token } });
      setGithubRepositories(repositories);
      if (!repositories.length) toast.info("No repositories with push access were found.");
      else toast.success("Loaded " + repositories.length + " GitHub repositories.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load GitHub repositories.");
    } finally {
      setLoadingGithubRepositories(false);
    }
  }

  async function connectGitHubAccount() {
    try {
      const { url } = await beginGithubOAuth({ data: {} });
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start GitHub authorization.");
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
        data: { repoUrl, token: githubAccessToken || importToken.trim() || undefined },
      });
      const importedFiles = await loadProjectFiles(imported.id);
      if (!Object.keys(importedFiles).length) {
        throw new Error("The repository was imported, but its saved files could not be loaded.");
      }
      resetRuntimeForProjectChange();
      setProjectId(imported.id);
      setPublishedUrl(null);
      setThumbnailUrl(null);
      setName(imported.name);
      setFiles(importedFiles);
      setMessages([]);
      setActiveFile(Object.keys(importedFiles).sort()[0] ?? "README.md");
      setGithubRepo(imported.name);
      setLogs([]);
      switchPanel("code");
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

  async function attachReferenceImages(fileList: FileList | null) {
    const selected = Array.from(fileList ?? []).slice(0, 3);
    if (!selected.length) return;
    try {
      const compressed = await Promise.all(selected.map(compressReferenceImage));
      setReferenceImages((current) => [...current, ...compressed].slice(0, 3));
      toast.success("Visual reference attached.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach that image.");
    }
  }

  function dismissPlanDraft() {
    const planPrefix = "Plan ready for your review. No project files were changed.\n\n";
    const updatedMessages = messages.map((message) => message.role === "assistant" && message.content.startsWith(planPrefix)
      ? { ...message, content: "Plan discarded. No project files were changed.\n\n" + message.content.slice(planPrefix.length) }
      : message);
    setPlanDraft(null);
    setMessages(updatedMessages);
    void persist({ messages: updatedMessages }).catch(() => undefined);
  }

  function isAgentBuildRequest(value: string) {
    return /\b(build|create|make|implement|add|remove|delete|fix|change|update|refactor|debug|design|generate|write code|develop|integrate|connect|deploy|publish|test|run|install|upgrade|migrate|optimi[sz]e|redesign|rebuild)\b/i.test(value);
  }

  async function sendPrompt(modeOverride: "build" | "plan" = agentMode, promptOverride?: string) {
    if (CODING_AGENT_UNDER_DEVELOPMENT) return;
    const text = (promptOverride ?? prompt).trim();
    if (!text || busy) return;
    const agentPrompt = tutorMode
      ? text + "\n\nTutor Mode is enabled: after implementing this request, include a concise beginner-friendly explanation of the important files and concepts changed, one practical next exercise, and a relevant link to https://expertsteam.giize.com/learn. Do not claim a lesson was completed."
      : text;

    // Both Plan and Build use the server-side Kilo Gateway; neither needs a CLI sandbox.
    const planPrefix = "Plan ready for your review. No project files were changed.\n\n";
    const conversationMessages = modeOverride === "build"
      ? messages.map((message) => message.role === "assistant" && message.content.startsWith(planPrefix)
          ? { ...message, content: "Plan approved; implementation requested.\n\n" + message.content.slice(planPrefix.length) }
          : message)
      : messages;
    const nextMessages: Message[] = [...conversationMessages, { role: "user", content: text }];
    setMessages(nextMessages);
    setPrompt("");
    setBusy(true);
    let activeProjectId: string | null = projectId;

    try {
      // Ordinary conversation must never create a checkpoint, touch files, or start a terminal.
      if (modeOverride === "build" && !isAgentBuildRequest(text) && referenceImages.length === 0) {
        const result = await runCodeAgent({
          data: {
            mode: "chat",
            prompt: agentPrompt,
            files,
            history: messages.slice(-8).map((message) => ({ ...message, content: message.content.slice(-3000) })),
          },
        });
        const finalMessages: Message[] = [...nextMessages, { role: "assistant", content: result.message }];
        setMessages(finalMessages);
        setTypingMessageIndex(finalMessages.length - 1);
        await persist({ messages: finalMessages }, activeProjectId ?? undefined);
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        return;
      }

      activeProjectId = activeProjectId ?? (await persist());
      if (modeOverride === "build") await saveCheckpoint(`Before: ${text.slice(0, 96)}`, activeProjectId);

      if (modeOverride === "plan") {
        const result = await runCodeAgent({
          data: {
            mode: "plan",
            prompt: agentPrompt,
            files,
            history: messages.slice(-8).map((message) => ({ ...message, content: message.content.slice(-3000) })),
            referenceImages,
          },
        });
        setReferenceImages([]);
        const planMessage = "Plan ready for your review. No project files were changed.\n\n" + result.message;
        const finalMessages: Message[] = [...nextMessages, { role: "assistant", content: planMessage }];
        setPlanDraft(result.message);
        setMessages(finalMessages);
        setTypingMessageIndex(finalMessages.length - 1);
        await persist({ messages: finalMessages }, activeProjectId);
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        return;
      }

      // Kilo receives the current project source and recent Agent conversation.
      // Its response is a file patch: omitted files stay untouched, null deletes.
      const result = await runCodeAgent({
        data: {
          prompt: agentPrompt,
          files,
          history: messages.slice(-8).map((message) => ({ ...message, content: message.content.slice(-3000) })),
          referenceImages,
        },
      });
      setReferenceImages([]);
      setPlanDraft(null);

      const updatedFiles: ProjectFiles = { ...files };
      const changed: string[] = [];
      for (const [path, content] of Object.entries(result.files)) {
        if (content === null) {
          if (Object.prototype.hasOwnProperty.call(updatedFiles, path)) {
            delete updatedFiles[path];
            changed.push(path);
          }
          continue;
        }
        if (updatedFiles[path] !== content) changed.push(path);
        updatedFiles[path] = content;
      }

      const answer = `${result.message}${changed.length ? `\n\nUpdated files:\n${changed.map((path) => `- ${path}`).join("\n")}` : ""}`;
      const finalMessages: Message[] = [...nextMessages, { role: "assistant", content: answer }];
      setLatestFileDiffs(changed.map((path) => ({ path, before: files[path] ?? "", after: updatedFiles[path] ?? "" })));
      setFiles(updatedFiles);
      setMessages(finalMessages);
      setTypingMessageIndex(finalMessages.length - 1);
      if (changed.length) {
        setDirty(false);
        const firstExistingFile = changed.find((path) => updatedFiles[path] !== undefined);
        if (firstExistingFile) {
          setActiveFile(firstExistingFile);
          switchPanel("code");
        }
        setPreviewKey((value) => value + 1);
      }
      // Persist the complete resulting project tree and conversation before
      // reporting success, so Explorer, editor and preview share saved files.
      await persist({ files: updatedFiles, messages: finalMessages }, activeProjectId);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Kilo could not complete that request.";
      const failedMessages: Message[] = [
        ...nextMessages,
        { role: "assistant", content: `I couldn't finish that change.\n\n${detail}` },
      ];
      setMessages(failedMessages);
      setTypingMessageIndex(failedMessages.length - 1);
      toast.error(detail);
      await persist({ messages: failedMessages }, activeProjectId ?? undefined).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function createProject() {
    resetRuntimeForProjectChange();
    setProjectId(null);
    setCloudConnectionId(null);
    setPublishedUrl(null);
    setThumbnailUrl(null);
    setName("Untitled project");
    setFiles(STARTER_FILES);
    setMessages([]);
    setPlanDraft(null);
    setAgentMode("build");
    setActiveFile("index.html");
    setLogs([]);
    switchPanel("preview");
    setDirty(false);
    toast.success("New workspace created");
  }

  async function openProject(project: ProjectRow) {
    // Prefer independently persisted file rows. Fall back to the legacy JSONB
    // snapshot for projects created before the per-file migration.
    let sourceFiles: ProjectFiles = {};
    try {
      sourceFiles = await loadProjectFiles(project.id);
    } catch {
      sourceFiles = {};
    }
    if (!Object.keys(sourceFiles).length) {
      const { data: legacyProject, error } = await supabase
        .from("agent_projects")
        .select("files")
        .eq("id", project.id)
        .eq("user_id", user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      if (legacyProject?.files && typeof legacyProject.files === "object" && !Array.isArray(legacyProject.files)) {
        sourceFiles = legacyProject.files as ProjectFiles;
        if (user?.id && Object.keys(sourceFiles).length) {
          await saveProjectFiles(project.id, user.id, sourceFiles);
        }
      }
    }
    // Older workspaces may already contain terminal bookkeeping from before
    // the server-side filter was added. Hide those entries when restoring too.
    const cleanedFiles = Object.fromEntries(
      Object.entries(sourceFiles).filter(([filePath]) => !isInternalAgentWorkspaceFile(filePath)),
    ) as ProjectFiles;
    const savedFiles = Object.keys(cleanedFiles).length ? cleanedFiles : null;
    if (!savedFiles) {
      toast.error("This saved project has no recoverable source files. No new starter project was created.");
      return;
    }
    resetRuntimeForProjectChange();
    setProjectId(project.id);
    setCloudConnectionId(project.cloud_connection_id ?? null);
    setPublishedUrl(project.published && project.slug ? publishedProjectUrl(project.slug) : null);
    setThumbnailUrl(project.thumbnail_url);
    setName(project.name);
    setFiles(savedFiles);
    const savedMessages = Array.isArray(project.messages) ? (project.messages as Message[]) : [];
    const planPrefix = "Plan ready for your review. No project files were changed.\n\n";
    const latestPlan = [...savedMessages].reverse().find((message) => message.role === "assistant" && message.content.startsWith(planPrefix));
    setPlanDraft(latestPlan ? latestPlan.content.slice(planPrefix.length) : null);
    setAgentMode("build");
    setMessages(savedMessages);
    setActiveFile(Object.keys(savedFiles)[0] ?? "index.html");
    setGithubRepo(project.github_repo?.split("/").pop() ?? "");
    setLogs([]);
    switchPanel("preview");
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
        setAssistantWidth(Math.min(560, Math.max(340, startWidth - delta)));
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

  function closeEditorTab(filePath: string) {
    if (openFileTabs.length <= 1) return;
    const remaining = openFileTabs.filter((item) => item !== filePath);
    setOpenFileTabs(remaining);
    if (activeFile === filePath) {
      setActiveFile(remaining.at(-1) ?? Object.keys(files).find((item) => item !== filePath) ?? filePath);
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
    switchPanel("code");
    setAutoSaveStatus("saved");
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
    setAutoSaveStatus("saved");
    setDirty(true);
    setRenameFileOpen(false);
    setRenameFileFrom(null);
    toast.success("File renamed");
  }

  function deleteFile(path: string) {
    if (!Object.prototype.hasOwnProperty.call(files, path)) return;
    const updated = { ...files };
    delete updated[path];
    setFiles(updated);
    if (activeFile === path) setActiveFile(Object.keys(updated)[0] ?? "");
    setOpenFileTabs((current) => current.filter((filePath) => filePath !== path));
    setAutoSaveStatus("saved");
    setDirty(true);
  }

  function updateFile(value: string) {
    setFiles((current) => ({ ...current, [activeFile]: value }));
    setAutoSaveStatus("saved");
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
    <div className="expert-agent-shell not-prose relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0B0F17] text-slate-100">
      <style>{`@keyframes et-agent-character-fade { from { opacity: 0; filter: blur(1px); } to { opacity: 1; filter: blur(0); } } .et-agent-character { display: inline; animation: et-agent-character-fade 180ms ease-out both; }`}</style>
      {showConnectionCinematic && (
        <div className="et-ai-link-cinematic absolute inset-0 z-[100] flex items-center justify-center overflow-hidden" role="status" aria-live="polite">
          <div className="et-ai-link-backdrop absolute inset-0" />
          <div className="et-ai-link-vortex absolute inset-0" />
          <div className="relative z-10 mx-5 flex max-w-lg flex-col items-center text-center">
            <div aria-hidden="true" className="et-ai-egg mb-7"><span /></div>
            <div className="et-ai-link-kicker mb-3 text-[10px] font-bold uppercase tracking-[.42em]">ExpertsTeam Intelligence</div>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Establishing connection</h2>
            <p className="mt-3 text-sm text-white/70">Preparing your workspace and bringing the builder online</p>
            <div className="mt-7 flex w-64 items-center justify-between text-[11px] font-medium tracking-[.16em] text-cyan-100/80"><span>CONNECTING</span><span>{Math.round(connectionProgress)}%</span></div>
            <div className="et-ai-link-progress mt-2 h-1 w-64 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Workspace connection progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(connectionProgress)}><span style={{ width: `${connectionProgress}%` }} /></div>
          </div>
        </div>
      )}
      <ProjectEnvironmentPanel projectId={projectId} open={environmentPanelOpen} onOpenChange={setEnvironmentPanelOpen} />
      {/* Workspace top bar */}
      <header className="expert-agent-topbar flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0d1523] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/agent-mark.svg"
            alt="ExpertAI coding agent"
            className="expert-agent-brand-mark h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-cyan-500/10"
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
              <select
                aria-label="Switch project"
                value={projectId ?? ""}
                onChange={(event) => { const selected = projects.find((project) => project.id === event.target.value); if (selected) void openProject(selected); }}
                className="et-studio-project-switcher h-7 max-w-[170px] rounded-md border border-slate-700 bg-[#0B0F17] px-2 text-[10px] text-slate-200"
              >
                <option value="">New project · {name}</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <span className={dirty ? "rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200" : "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"}>
                {dirty ? (autoSaveStatus === "saving" ? "Saving…" : autoSaveStatus === "error" ? "Save failed" : "Unsaved") : "✓ Saved"}
              </span>
              <select
                aria-label="Project Supabase backend"
                title="Use your own Supabase project for this app's browser data and storage."
                value={cloudConnectionId ?? ""}
                onChange={async (event) => {
                  const nextConnectionId = event.target.value || null;
                  try {
                    const activeProjectId = projectId ?? await persist();
                    const { error } = await supabase.from("agent_projects")
                      .update({ cloud_connection_id: nextConnectionId })
                      .eq("id", activeProjectId).eq("user_id", user.id);
                    if (error) throw error;
                    setCloudConnectionId(nextConnectionId);
                    await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] });
                    toast.success(nextConnectionId ? "This app will use your connected Supabase project in preview and builds." : "External Supabase connection removed from this app.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not update this project's backend.");
                  }
                }}
                className="h-7 max-w-[190px] rounded-lg border border-white/10 bg-[#0b1320] px-2 text-[11px] text-slate-300"
              >
                <option value="">Use no connected Supabase project</option>
                {cloudConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.display_name} · {connection.project_ref}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-white/10 bg-[#0b1320] px-2 text-[11px] text-slate-300 hover:bg-white/10"
                onClick={async () => {
                  try {
                    if (!projectId) await persist();
                    setEnvironmentPanelOpen(true);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not save this project.");
                  }
                }}
              >
                <Settings2 className="mr-1 h-3 w-3" /> Environment
              </Button>
            </div>
          </div>
        </div>

        <input
          ref={projectFileInputRef}
          type="file"
          multiple
          accept=".zip,.txt,.md,.mdx,.html,.htm,.css,.scss,.js,.jsx,.ts,.tsx,.json,.xml,.yaml,.yml,.toml,.ini,.py,.java,.c,.h,.cpp,.cs,.go,.rs,.php,.sql,.sh,.bat,.ps1,.svg,.env.example"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void importLocalProjectFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setCreditsOfferwallOpen(true)} className="h-8 border-amber-300/25 bg-amber-300/[0.08] px-3 text-xs font-semibold text-amber-100 hover:bg-amber-300/[0.14]" title="Earn free AI credits from verified partner offers">
            <Coins className="mr-1.5 h-3.5 w-3.5" /> {profile?.ai_credits ?? 0} credits <span className="ml-1 text-amber-200/80">· Earn free</span>
          </Button>
          <a href="/" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100" title="Return to the ExpertsTeam website">
            <ExternalLink className="h-3.5 w-3.5" /> Back to website
          </a>
          <span className="hidden text-xs text-slate-500 sm:inline">Workspace</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400">
            {dirty ? (autoSaveStatus === "saving" ? "Saving changes…" : autoSaveStatus === "error" ? "Auto-save failed" : "Changes not saved") : "All changes saved"}
          </span>
        </div>
        <div className="et-studio-header-actions">
          <Button type="button" size="sm" variant="outline" onClick={() => setEnvironmentPanelOpen(true)} className="h-8 border-slate-700 bg-slate-800/70 px-3 text-[11px] text-slate-200 hover:border-blue-500/50 hover:bg-slate-700">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> DB &amp; Auth
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setGithubOpen(true)} className="h-8 border-slate-700 bg-slate-800/70 px-3 text-[11px] text-slate-200 hover:border-blue-500/50 hover:bg-slate-700">
            <Github className="mr-1.5 h-3.5 w-3.5" /> GitHub
          </Button>
          <Button type="button" size="sm" onClick={() => void publishProject()} disabled={publishing} className="h-8 bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-500">
            {publishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />} Deploy ↑
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
        className={`expert-agent-workspace-grid grid min-h-0 flex-1 grid-cols-1 overflow-hidden ${sidebarOpen ? "lg:grid-cols-[var(--sidebar-width)_5px_minmax(0,1fr)]" : "lg:grid-cols-1"}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {/* Left sidebar */}
        {sidebarOpen && <button type="button" className="expert-agent-mobile-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close project explorer" />}
        {sidebarOpen && (
          <aside className="expert-agent-sidebar expert-agent-sidebar-drawer flex min-h-0 flex-col overflow-hidden border-b border-white/[0.08] bg-[#0b1320] lg:border-b-0 lg:border-r">
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

            <div className="mb-3 flex items-center gap-2 px-1">
              <Folder className="h-3.5 w-3.5 text-amber-300" />
              <span className="min-w-0 truncate text-xs font-semibold text-slate-200" title={name}>{name || "Current project"}</span>
              <span className="ml-auto text-[10px] text-slate-500">Files</span>
            </div>

            <div className="expert-agent-files-section flex min-h-0 flex-1 flex-col overflow-hidden px-3">
              <div className="mb-2 flex shrink-0 items-center justify-between px-1">
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

              <input
                type="search"
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
                placeholder="Find a file or folder…"
                aria-label="Search project files"
                className="mb-2 h-8 w-full shrink-0 rounded-lg border border-white/10 bg-[#08111e] px-2.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
              />
              <div className="expert-agent-file-tree min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
                {visibleProjectFileTree.length ? renderProjectTree(visibleProjectFileTree) : (
                  <p className="px-2 py-3 text-[11px] text-slate-500">{fileFilter.trim() ? "No files or folders match your search." : "No project files yet."}</p>
                )}
              </div>
            </div>

            <div className="mx-3 my-3 border-t border-white/[0.07]" />
            <div className="grid grid-cols-5 gap-1 px-3">
              <Button size="sm" variant="outline" onClick={() => projectFileInputRef.current?.click()} className="h-8 border-white/10 bg-white/[0.03] px-2 text-[10px] text-slate-300" title="Add files"><FolderInput className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="h-8 border-cyan-400/20 bg-cyan-400/[0.06] px-2 text-[10px] text-cyan-100" title="Save project">{saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}</Button>
              <Button size="sm" variant="outline" onClick={() => setVersionHistoryOpen(true)} disabled={!projectId} className="h-8 border-white/10 bg-white/[0.03] px-2 text-[10px] text-slate-300" title="Version history"><History className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" onClick={() => void duplicateCurrentProject()} className="h-8 border-white/10 bg-white/[0.03] px-2 text-[10px] text-slate-300" title="Duplicate project"><CopyPlus className="h-3.5 w-3.5" /></Button>
            </div>

            <div className="mt-auto p-3">
              <div className="rounded-xl border border-white/[0.07] bg-[#101c2d] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                  ExpertAI workspace
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Use the interactive project builder to create apps, run commands, and sync changes into this project.
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
        <nav className="et-studio-activity-rail" aria-label="Studio tools">
          <button type="button" onClick={() => { setAssistantOpen(true); setAgentPanelMode("chat"); }} title="AI Agent Chat" aria-label="AI Agent Chat"><Bot /></button>
          <button type="button" onClick={() => setVersionHistoryOpen(true)} title="Version history and checkpoints" aria-label="Version history"><History /></button>
          <button type="button" onClick={() => setEnvironmentPanelOpen(true)} title="Database, secrets and environment" aria-label="Database and secrets"><Settings2 /></button>
          <a href="/community" title="Community and Showcase" aria-label="Community and Showcase"><Sparkles /></a>
          <div className="et-studio-activity-spacer" />
          <a href="/learn" title="Learn to Code" aria-label="Learn to Code"><ExternalLink /></a>
          <button type="button" onClick={() => setEnvironmentPanelOpen(true)} title="Studio settings and help" aria-label="Studio settings"><Settings2 /></button>
        </nav>
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
              <button
                type="button"
                onClick={() => { setQuickOpenQuery(""); setQuickOpen(true); }}
                className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[10px] text-slate-400 transition hover:border-blue-400/30 hover:bg-blue-400/10 hover:text-blue-100"
                title="Quick open any project file (Ctrl+P)"
              >
                <Command className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Quick open</span>
                <kbd className="hidden rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] md:inline">Ctrl P</kbd>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  ["preview", Eye, "Preview"],
                  ["code", Code2, "Code"],
                  ["console", Terminal, "Console"],
                  ["terminal", TerminalSquare, "Terminal"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  onClick={() => switchPanel(value)}
                  className={`expert-agent-workspace-tab flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    panel === value
                      ? "bg-cyan-400/10 text-cyan-200"
                      : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`expert-agent-workspace-tab flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${sidebarOpen ? "bg-blue-400/10 text-blue-200" : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"}`}
                title="Open project explorer"
              >
                <Folder className="h-3.5 w-3.5" />
                Explorer
              </button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const linkedRepo = projects.find((project) => project.id === projectId)?.github_repo;
                  if (linkedRepo) {
                    try {
                      const repoName = new URL(linkedRepo).pathname.split("/").filter(Boolean).at(-1)?.replace(/\.git$/i, "");
                      if (repoName) setGithubRepo(repoName);
                    } catch {
                      // A malformed legacy repository URL should not block opening GitHub settings.
                    }
                  }
                  setGithubOpen(true);
                }}
                className="h-8 border-white/10 bg-white/[0.04] px-3 text-xs text-slate-200 hover:border-blue-400/30 hover:bg-blue-400/10"
                title="Connect GitHub or push this project"
              >
                <Github className="mr-1.5 h-3.5 w-3.5" /> GitHub
              </Button>
              <a
                href="https://vercel.com/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08]"
                title="Import your GitHub repository into Vercel and configure automatic deployments"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Vercel
              </a>
              <Button
                size="sm"
                onClick={() => void publishProject()}
                disabled={publishing}
                className="ml-1 h-8 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-400"
                title="Publish this project"
              >
                {publishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
                {publishing ? "Publishing…" : "Publish"}
              </Button>
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
                <>
                  <button
                    onClick={() => {
                      void copyTextToSystemClipboard(files[activeFile] ?? "")
                        .then(() => toast.success("Active file copied"))
                        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not copy file."));
                    }}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
                    aria-label="Copy active file to computer clipboard"
                    title="Copy active file"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={downloadActiveFile}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
                    aria-label="Download active file to computer"
                    title="Download active file"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </>
              )}

              <button
                onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) setAssistantOpen(true); else setAssistantOpen((value) => !value); }}
                className={`ml-1 rounded-lg p-2 ${
                  assistantOpen ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500 hover:bg-white/5"
                }`}
                aria-label="Toggle ExpertAI builder"
              >
                <Bot className="h-4 w-4" /><span className="hidden text-[10px] font-semibold lg:inline">Agent</span>
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
              style={{ animation: panel === "terminal" ? (panelMotionPhase ? "expertTerminalRevealB 1050ms cubic-bezier(.16,1,.3,1) both" : "expertTerminalRevealA 1050ms cubic-bezier(.16,1,.3,1) both") : (panelMotionPhase ? "expertStudioTabB 420ms cubic-bezier(.2,.8,.2,1) both" : "expertStudioTabA 420ms cubic-bezier(.2,.8,.2,1) both") }}
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
                          ? "Cloud runtime · isolated environment"
                          : runtimeBusy || runtimeStatus !== "Not started"
                            ? runtimeStatus
                            : "HTML quick preview · press Run for React/Vite"}
                      </span>
                      {(!runtimeUrl || remoteVisualSelectSupported) && (
                        <button
                          type="button"
                          onClick={() => { setSelectedPreviewElement(null); setVisualSelectMode((enabled) => !enabled); }}
                          className={visualSelectMode ? "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-cyan-300/40 bg-cyan-300/15 px-2 text-[10px] font-semibold text-cyan-100" : "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[10px] font-semibold text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"}
                          title={runtimeUrl ? "Select an element in the cloud Vite preview" : "Select an element in the local preview"}
                        >
                          <MousePointer2 className="h-3.5 w-3.5" /> {visualSelectMode ? "Visual Edit: ON" : "Visual Edit: OFF"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPreviewExpanded((expanded) => !expanded)}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
                        aria-label={previewExpanded ? "Restore preview height" : "Expand preview to full height"}
                        title={previewExpanded ? "Exit extended preview and return to Studio" : "Expand preview vertically"}
                      >
                        {previewExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                        {previewExpanded ? "Exit extended preview" : "Expand preview"}
                      </button>
                    </div>
                  </div>
                  {runtimeUrl && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[#0a111d] px-3 py-2">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Preview URL</span>
                      <input
                        aria-label="Preview address"
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
                  <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-[#111a29] p-2 sm:p-3">
                    <iframe
                      ref={iframeRef}
                      key={previewKey}
                      title="ExpertsTeam project preview"
                      onLoad={() => { if (!runtimeUrl || remoteVisualSelectSupported) iframeRef.current?.contentWindow?.postMessage({ __agentVisualSelect: true, enabled: visualSelectMode }, "*"); }}
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
                    {selectedPreviewElement && (
                      <div className="et-visual-property-popover" role="dialog" aria-label="Visual element properties">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-2">
                          <div className="min-w-0"><p className="text-[11px] font-semibold text-slate-100">Edit {selectedPreviewElement.tag}</p><p className="truncate font-mono text-[9px] text-slate-400">{selectedPreviewElement.selector}</p></div>
                          <button type="button" onClick={() => setSelectedPreviewElement(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-white" aria-label="Close visual editor"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <label className="block pt-2 text-[10px] font-medium text-slate-300">Text content</label>
                        <textarea value={visualTextDraft} onChange={(event) => setVisualTextDraft(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-[11px] text-slate-100 outline-none focus:border-blue-500" />
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <label className="block text-[10px] font-medium text-slate-300">Text color
                            <div className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-[#0B0F17] px-2"><input aria-label="Text color" type="color" value={visualColorDraft} onChange={(event) => setVisualColorDraft(event.target.value)} className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0" /><span className="font-mono text-[10px] text-slate-400">{visualColorDraft}</span></div>
                          </label>
                          <label className="block text-[10px] font-medium text-slate-300">Font size
                            <div className="mt-1 flex h-9 items-center rounded-lg border border-slate-700 bg-[#0B0F17] px-2"><input aria-label="Font size in pixels" type="number" min="8" max="96" value={visualFontSizeDraft} onChange={(event) => setVisualFontSizeDraft(event.target.value)} className="w-full bg-transparent text-[11px] text-slate-100 outline-none" /><span className="text-[10px] text-slate-500">px</span></div>
                          </label>
                        </div>
                        <label className="mt-2 block text-[10px] font-medium text-slate-300">Style
                          <select value={visualWeightDraft} onChange={(event) => setVisualWeightDraft(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-2 text-[11px] text-slate-100 outline-none focus:border-blue-500">
                            <option value="400">Regular</option><option value="600">Semibold</option><option value="700">Bold</option>
                          </select>
                        </label>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <button type="button" onClick={() => { const item = selectedPreviewElement; setPrompt("Edit this selected element in my project.\nSelector: " + item.selector + "\nTag: " + item.tag + "\nCurrent text: " + item.text + "\nCurrent HTML: " + item.outerHTML + "\nCurrent styles: " + JSON.stringify(item.styles) + "\nMake the requested changes only to this element and preserve the rest of the page."); setSelectedPreviewElement(null); switchPanel("chat"); }} className="rounded-lg border border-slate-700 px-2.5 py-2 text-[10px] font-medium text-slate-300 hover:bg-slate-700">Ask AI</button>
                          <button type="button" onClick={applyVisualElementEdits} className="rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-blue-500">Apply edits</button>
                        </div>
                        <p className="mt-2 text-[9px] leading-4 text-slate-500">Direct source edits; no AI credits. Ambiguous text changes are blocked.</p>
                      </div>
                    )}
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
                  <div className="expert-agent-editor-tabs flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-white/[0.07] bg-[#0d1520] px-2" role="tablist" aria-label="Open project files">
                    {openFileTabs.map((filePath) => (
                      <div key={filePath} className={`group flex h-8 max-w-56 shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2 ${activeFile === filePath ? "border-white/10 bg-[#182538] text-slate-100" : "border-transparent text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"}`}>
                        <button type="button" role="tab" aria-selected={activeFile === filePath} onClick={() => setActiveFile(filePath)} className="flex min-w-0 items-center gap-2 text-[11px]">
                          <File className={`h-3 w-3 shrink-0 ${fileIcon(filePath)}`} />
                          <span className="truncate">{filePath.split("/").at(-1)}</span>
                        </button>
                        <button type="button" onClick={() => closeEditorTab(filePath)} disabled={openFileTabs.length <= 1} className="rounded p-0.5 text-slate-500 opacity-100 transition hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 disabled:pointer-events-none" aria-label={`Close ${filePath}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
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

              {panel === "terminal" && (
                <div className="flex min-h-0 flex-1 flex-col bg-[#050a12]">
                  <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
                    <span className="flex items-center gap-2 text-xs text-slate-300"><TerminalSquare className="h-3.5 w-3.5 text-emerald-300" /> Original Linux terminal</span>
                    <span className="text-[10px] text-slate-500">Independent shell · same project workspace</span>
                  </div>
                  <div ref={legacyTerminalContainerRef} className="min-h-0 flex-1 overflow-hidden px-3 py-3" />
                </div>
              )}
              {panel === "console" && (
                <>
                  <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-4">
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <Terminal className="h-3.5 w-3.5 text-cyan-300" />
                      Browser console
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600">Preview logs only</span>
                      {logs.some((entry) => entry.type === "error") && (
                        <button
                          type="button"
                          onClick={() => void attemptRuntimeSelfHeal()}
                          disabled={selfHealBusy || !projectId || selfHealAttempts >= 3}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/[0.08] px-2.5 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-300/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
                          title="Create a checkpoint and attempt a guarded repair without charging user credits"
                        >
                          {selfHealBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          {selfHealBusy ? "Repairing…" : "Free auto-fix"}
                        </button>
                      )}
                    </div>
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
            <aside className={`${assistantOpen ? "flex" : "hidden"} expert-agent-assistant expert-agent-assistant-drawer min-h-0 min-w-0 flex-col overflow-hidden border-t border-white/[0.08] bg-[#080f1b] xl:border-l xl:border-t-0`}>
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 text-cyan-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">AI Agent Chat</p>
                    <p className="text-[10px] text-slate-500">{isAdmin ? "Workspace controls · project builder" : "AI-powered project builder"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-blue-400/25 bg-gradient-to-r from-blue-400/15 to-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-cyan-100">Expert 1.0</span>
                  <button type="button" onClick={() => setAssistantOpen(false)} className="expert-agent-mobile-close rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close builder panel"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] bg-[#091321] px-3 py-2">
                <span className="rounded-md bg-cyan-400/15 px-3 py-1.5 text-[10px] font-semibold text-cyan-100">Agent</span>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-[#0a1422] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-[10px] text-slate-400">
                  <span className="max-w-[150px] truncate">{name}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-cyan-200">{"ExpertsTeam workspace terminal"}</span>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${CLOUD_SANDBOX_ENABLED ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
                  {CLOUD_SANDBOX_ENABLED ? (terminalReady ? "Connected" : "Not connected") : "Temporarily unavailable"}
                </span>
              </div>
              {agentPanelMode === "chat" ? (
                <>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-live="polite">
                    {messages.length === 0 ? (
                      <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-5 text-center">
                        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"><Sparkles className="h-6 w-6" /></div>
                        <p className="text-sm font-semibold text-white">What should we build?</p>
                        <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">Describe a feature, fix, or complete app. ExpertsTeam Agent will work directly with your project files.</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          {suggestions.map((item) => <button key={item} type="button" onClick={() => setPrompt(item)} className="rounded-full border border-white/10 px-3 py-2 text-[10px] text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10">{item}</button>)}
                        </div>
                      </div>
                    ) : messages.map((message, index) => (
                      <div key={`${message.role}-${index}-${message.content}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[94%] rounded-2xl px-3.5 py-3 text-xs leading-6 ${message.role === "user" ? "rounded-br-md bg-cyan-400/15 text-cyan-50" : "rounded-bl-md border border-white/[0.07] bg-white/[0.035] text-slate-200"}`}
                        >
                          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{message.role === "user" ? "You" : "ExpertsTeam Agent"}</div>
                          <p className="whitespace-pre-wrap break-words"><TypewriterText text={message.content} animate={message.role === "assistant" && typingMessageIndex === index} onComplete={() => setTypingMessageIndex((current) => current === index ? null : current)} /></p>
                        </div>
                      </div>
                    ))}
                    {selfHealJustApplied && (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-2">
                        <span className="flex items-center gap-2 text-[10px] font-semibold text-emerald-200"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15">✓</span>Free Auto-Fix Applied</span>
                        <span className="text-[9px] text-emerald-100/70">Review preview</span>
                      </div>
                    )}
                    <button type="button" onClick={() => setVersionHistoryOpen(true)} className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-left hover:border-blue-400/30">
                      <span className="flex items-center gap-2 text-[10px] text-slate-300"><History className="h-3.5 w-3.5 text-blue-300" /> Latest checkpoint</span>
                      <span className="text-[10px] font-semibold text-blue-300">Restore →</span>
                    </button>
                    {planDraft && (
                      <details open className="rounded-xl border border-blue-400/25 bg-blue-500/[0.07] p-3">
                        <summary className="cursor-pointer list-none text-[11px] font-semibold text-blue-100">Plan &amp; Architecture <span className="ml-2 font-normal text-slate-400">Review before building</span></summary>
                        <div className="mt-3 space-y-2">
                          {planDraft.split("\n").map((line, index) => line.trim() && !/^#{1,4}\s/.test(line) ? (
                            <label key={index} className="flex items-start gap-2 text-[10px] leading-5 text-slate-300">
                              <input type="checkbox" checked={Boolean(planChecklist[index])} onChange={(event) => setPlanChecklist((current) => ({ ...current, [index]: event.target.checked }))} className="mt-1 accent-blue-500" />
                              <span>{line.replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, "")}</span>
                            </label>
                          ) : null)}
                        </div>
                        <div className="mt-3 flex justify-end gap-2 border-t border-blue-400/15 pt-3">
                          <button type="button" onClick={dismissPlanDraft} className="rounded-lg px-2.5 py-1.5 text-[10px] text-slate-400 hover:bg-white/5">Discard</button>
                          <button type="button" onClick={() => { const approved = planDraft; setPlanDraft(null); setPlanChecklist({}); setAgentMode("build"); void sendPrompt("build", "Implement this approved plan. Follow the steps in order and verify the result:\n\n" + approved); }} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40">Implement plan</button>
                        </div>
                      </details>
                    )}
                    {latestFileDiffs.length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-slate-700 bg-[#0b1220]">
                        <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
                          <span className="text-[10px] font-semibold text-slate-200">File diff</span>
                          <span className="text-[9px] text-emerald-300">{latestFileDiffs.length} file{latestFileDiffs.length === 1 ? "" : "s"} changed</span>
                        </div>
                        {latestFileDiffs.map((diff) => {
                          const beforeLines = diff.before.split("\n");
                          const afterLines = diff.after.split("\n");
                          const removed = beforeLines.filter((line) => !afterLines.includes(line)).slice(0, 6);
                          const added = afterLines.filter((line) => !beforeLines.includes(line)).slice(0, 6);
                          return <div key={diff.path} className="border-b border-slate-800 last:border-0">
                            <div className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] text-slate-300"><FileCode2 className="h-3 w-3 text-blue-300" />{diff.path}</div>
                            <div className="max-h-36 overflow-auto bg-[#080d16] px-3 py-2 font-mono text-[9px] leading-5">
                              {removed.map((line, index) => <div key={"r"+index} className="whitespace-pre-wrap break-all text-red-300"><span className="mr-2 text-red-500">−</span>{line || " "}</div>)}
                              {added.map((line, index) => <div key={"a"+index} className="whitespace-pre-wrap break-all text-emerald-300"><span className="mr-2 text-emerald-500">+</span>{line || " "}</div>)}
                              {!removed.length && !added.length && <div className="text-slate-500">File updated · open Code to inspect the full source</div>}
                            </div>
                          </div>;
                        })}
                      </div>
                    )}
                    {busy && <div className="flex items-center gap-2 px-2 py-2 text-xs text-cyan-200"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working on your project…</div>}
                    <div ref={agentChatEndRef} />
                  </div>
                  {referenceImages.length > 0 && <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/[0.06] px-3 pt-2">{referenceImages.map((image) => <span key={image.name} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-slate-300">{image.name}</span>)}</div>}
                  <div className="shrink-0 border-t border-white/[0.08] bg-[#0a1422] p-3">
                    <div className="rounded-2xl border border-white/10 bg-[#0c1727] p-2 focus-within:border-cyan-400/40">
                      <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(); } }} placeholder="Ask ExpertAI anything…" className="min-h-[76px] resize-none border-0 bg-transparent text-xs text-white shadow-none focus-visible:ring-0" disabled={busy} />
                      <div className="flex items-center justify-between gap-2 px-1 pt-2">
                        <div className="flex items-center gap-1">
                          <AgentPromptLibrary currentPrompt={prompt} onUse={setPrompt} />
                          <button type="button" onClick={() => setAgentMode((mode) => mode === "plan" ? "build" : "plan")} disabled={busy} className={agentMode === "plan" ? "rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-200" : "rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white"}>{agentMode === "plan" ? "Plan mode on" : "Plan first"}</button>
                          <button type="button" onClick={() => { setSelectedPreviewElement(null); setVisualSelectMode(true); switchPanel("preview"); }} disabled={busy} aria-pressed={visualSelectMode} className={visualSelectMode ? "inline-flex items-center gap-1.5 rounded-lg border border-blue-400/40 bg-blue-400/15 px-2.5 py-2 text-[10px] font-semibold text-blue-200" : "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white"}><MousePointer2 className="h-3 w-3" /> Select Element</button>
                          <button type="button" onClick={() => { setTutorMode((enabled) => !enabled); }} disabled={busy} aria-pressed={tutorMode} className={tutorMode ? "rounded-lg border border-blue-300/30 bg-blue-300/10 px-2.5 py-2 text-[10px] font-semibold text-blue-200" : "rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white"}>Tutor Mode</button>
                          <input ref={referenceInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => { void attachReferenceImages(event.target.files); event.currentTarget.value = ""; }} />
                          <button type="button" onClick={() => referenceInputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-40" title="Attach visual references"><ImagePlus className="h-3 w-3" /> Attach</button>
                          <span className="rounded-lg border border-blue-400/20 bg-blue-400/10 px-2.5 py-2 text-[10px] font-semibold text-blue-200">Expert 1.0</span>
                        </div>
                        <button type="button" onClick={() => void sendPrompt()} disabled={!prompt.trim() || busy} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-3.5 w-3.5" /> {busy ? "Working" : agentMode === "plan" ? "Create plan" : "Build"}</button>
                      </div>
                    </div>
                    <p className="mt-2 text-center text-[9px] text-slate-600">Usage display shows your remaining ExpertsTeam AI credits.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
                    <span className="text-[10px] text-slate-500">{CLOUD_SANDBOX_ENABLED ? `Advanced CLI session · ${terminalConnection?.cli ?? "not connected"}` : "Cloud CLI paused · project files remain saved"}</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" disabled={!terminalReady} onClick={() => xtermRef.current?.clear()} className="rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-white/5 hover:text-white disabled:opacity-30">Clear</button>
                      <button type="button" disabled={!terminalReady} onClick={() => void importTerminalChanges()} className="rounded border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-30">Save files</button>
                      {!terminalReady && <button type="button" onClick={() => void openTerminal()} className="rounded-md bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/25">{CLOUD_SANDBOX_ENABLED ? "Connect CLI" : "Unavailable"}</button>}
                    </div>
                  </div>
                  <div ref={terminalContainerRef} role="region" aria-label="Advanced coding CLI terminal" className="expert-agent-kilo-surface min-h-0 flex-1 overflow-hidden" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) void importLocalProjectFiles(event.dataTransfer.files); }} onPaste={(event) => { const pastedFiles = event.clipboardData?.files; if (pastedFiles?.length) { event.preventDefault(); void importLocalProjectFiles(pastedFiles); } }} />
                  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2 text-[9px] text-slate-600"><span>CLI output · project files sync automatically</span><span>{Object.keys(files).length} files</span></div>
                </>
              )}
            </aside>
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

      <nav className="expert-agent-mobile-dock" aria-label="Workspace navigation">
        <div className="expert-agent-mobile-actions">
          <Button size="sm" onClick={() => void runProject()} disabled={runtimeBusy} className="h-9 flex-1 bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Play className="mr-1.5 h-4 w-4" />{runtimeBusy ? "Starting…" : "Run"}</Button>
          <Button size="sm" onClick={() => void publishProject()} disabled={publishing} className="h-9 flex-1 bg-emerald-500 text-white hover:bg-emerald-400"><ExternalLink className="mr-1.5 h-4 w-4" />{publishing ? "Publishing…" : "Publish"}</Button>
        </div>
        <div className="expert-agent-mobile-tabs">
          <button type="button" onClick={() => { setAssistantOpen(false); setPanelExpanded(false); switchPanel("preview"); }} className={panel === "preview" && !assistantOpen ? "active" : ""}><Eye /><span>Preview</span></button>
          <button type="button" onClick={() => { setAssistantOpen(false); setSidebarOpen(true); }} className={sidebarOpen ? "active" : ""}><Folder /><span>Files</span></button>
          <button type="button" onClick={() => { setAssistantOpen(false); switchPanel("console"); }} className={panel === "console" && !assistantOpen ? "active" : ""}><Terminal /><span>Console</span></button>
          <button type="button" onClick={() => { setAssistantOpen(false); switchPanel("terminal"); }} className={panel === "terminal" && !assistantOpen ? "active" : ""}><TerminalSquare /><span>Terminal</span></button>
          <button type="button" onClick={() => { setSidebarOpen(false); setAssistantOpen(true); }} className={assistantOpen ? "active" : ""}><Bot /><span>Agent</span></button>
        </div>
      </nav>

      <style>{`\n        @keyframes et-agent-answer-reveal { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }\n        .et-agent-answer-reveal { animation: et-agent-answer-reveal 360ms ease-out both; }\n        @media (prefers-reduced-motion: reduce) { .et-agent-answer-reveal { animation: none; } }\n        @keyframes expertStudioTabA { from { opacity: .35; transform: translate3d(0, 13px, 0) scale(.992); filter: blur(3px); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); } }\n        @keyframes expertStudioTabB { from { opacity: .35; transform: translate3d(0, -10px, 0) scale(.992); filter: blur(3px); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); } }\n        @keyframes expertTerminalRevealA { 0% { opacity: 0; transform: perspective(1200px) translateY(34px) scale(.965); filter: blur(12px) brightness(.45); box-shadow: inset 0 0 0 1px rgba(34,211,238,0); } 38% { opacity: 1; filter: blur(1px) brightness(1.45); box-shadow: inset 0 0 90px rgba(34,211,238,.18); } 100% { opacity: 1; transform: perspective(1200px) translateY(0) scale(1); filter: blur(0) brightness(1); box-shadow: inset 0 0 0 rgba(34,211,238,0); } }\n        @keyframes expertTerminalRevealB { 0% { opacity: 0; transform: perspective(1200px) translateY(-30px) scale(.965); filter: blur(12px) brightness(.45); box-shadow: inset 0 0 0 1px rgba(59,130,246,0); } 38% { opacity: 1; filter: blur(1px) brightness(1.5); box-shadow: inset 0 0 100px rgba(59,130,246,.2); } 100% { opacity: 1; transform: perspective(1200px) translateY(0) scale(1); filter: blur(0) brightness(1); box-shadow: inset 0 0 0 rgba(59,130,246,0); } }\n        .expert-agent-light { background:#f5f7fb!important; color:#172033!important; color-scheme:light; }
        .expert-agent-light .expert-agent-topbar { background:#ffffff!important; border-color:#dce3ed!important; color:#172033!important; }
        .expert-agent-light .expert-agent-sidebar { background:#f0f3f8!important; border-color:#dce3ed!important; }
        .expert-agent-light .expert-agent-toolbar { background:#ffffff!important; border-color:#dce3ed!important; }
        .expert-agent-light .expert-agent-canvas { background:#f8fafc!important; color:#172033!important; }
        .expert-agent-light .expert-agent-assistant { background:#f2f5fa!important; border-color:#dce3ed!important; color:#172033!important; }
        .expert-agent-light [class*="border-white/"] { border-color:#dce3ed!important; }
        .expert-agent-light [class*="text-white"], .expert-agent-light [class*="text-slate-100"], .expert-agent-light [class*="text-slate-200"], .expert-agent-light [class*="text-slate-300"] { color:#263449!important; }
        .expert-agent-light [class*="text-slate-400"], .expert-agent-light [class*="text-slate-500"], .expert-agent-light [class*="text-slate-600"] { color:#66758a!important; }
        .expert-agent-light [class*="bg-[#0"], .expert-agent-light [class*="bg-[#1"], .expert-agent-light [class*="bg-black/"] { background-color:#edf1f7!important; }
        .expert-agent-light .expert-agent-canvas iframe { background:#fff!important; border-color:#d6deea!important; }
        .expert-agent-light .expert-agent-assistant textarea, .expert-agent-light .expert-agent-assistant input { background:#fff!important; color:#172033!important; border-color:#d6deea!important; }
        .expert-agent-light .expert-agent-assistant button:hover, .expert-agent-light .expert-agent-sidebar button:hover { background-color:#e5ebf4!important; }
        .expert-agent-kilo-surface .xterm { height: 100%; }
        .expert-agent-kilo-surface .xterm-viewport { overflow-y: scroll !important; overscroll-behavior: contain; scrollbar-width: thin; touch-action: pan-y; }
        @media (prefers-reduced-motion: reduce) { .expert-agent-canvas { animation: none !important; } }
        @media (min-width: 1280px) {
          .expert-agent-topbar { min-height:60px; padding-top:8px; padding-bottom:8px; flex-wrap:nowrap; }
          .expert-agent-toolbar { min-height:52px; flex-wrap:nowrap; padding-top:6px; padding-bottom:6px; gap:6px; }
          .expert-agent-toolbar > div { flex-shrink:0; }
          .expert-agent-toolbar button { white-space:nowrap; }
        }
        .expert-agent-mobile-dock,.expert-agent-mobile-close,.expert-agent-mobile-backdrop { display:none; }
        @media (max-width: 767px) {
          .expert-agent-shell { height:100%; min-height:0; overflow:hidden; }
          .expert-agent-topbar { min-height:56px; padding:8px 12px; gap:8px; }
          .expert-agent-brand-mark { width:32px; height:32px; }
          .expert-agent-topbar .text-sm.font-semibold { max-width:48vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .expert-agent-workspace-grid { display:flex; min-height:0; flex:1 1 auto; overflow:hidden; padding-bottom:108px; }
          .expert-agent-stage { min-height:0; width:100%; flex:1 1 auto; }
          .expert-agent-toolbar,.expert-agent-statusbar { display:none !important; }
          .expert-agent-sidebar-drawer { position:fixed; top:56px; bottom:108px; left:0; z-index:91; width:min(86vw,340px); max-width:calc(100vw - 36px); border:1px solid rgba(148,163,184,.2); border-left:0; border-radius:0 18px 18px 0; box-shadow:24px 0 70px rgba(0,0,0,.55); }
          .expert-agent-mobile-backdrop { display:block; position:fixed; inset:56px 0 108px; z-index:90; border:0; background:rgba(2,6,15,.62); backdrop-filter:blur(3px); }
          .expert-agent-assistant-drawer { position:fixed; top:56px; right:8px; bottom:108px; left:8px; z-index:92; width:auto; border:1px solid rgba(34,211,238,.22); border-radius:18px; box-shadow:0 24px 80px rgba(0,0,0,.65); }
          .expert-agent-mobile-close { display:inline-flex; align-items:center; justify-content:center; }
          .expert-agent-mobile-dock { position:fixed; z-index:95; right:0; bottom:0; left:0; display:flex; flex-direction:column; gap:7px; padding:8px 10px calc(7px + env(safe-area-inset-bottom)); border-top:1px solid rgba(148,163,184,.18); background:rgba(7,14,26,.97); backdrop-filter:blur(18px); box-shadow:0 -12px 40px rgba(0,0,0,.28); }
          .expert-agent-mobile-actions { display:flex; gap:8px; }
          .expert-agent-mobile-tabs { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:2px; }
          .expert-agent-mobile-tabs button { display:flex; min-width:0; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:5px 2px; border-radius:9px; color:#94a3b8; font-size:10px; font-weight:600; }
          .expert-agent-mobile-tabs button svg { width:17px; height:17px; }
          .expert-agent-mobile-tabs button.active { color:#67e8f9; background:rgba(34,211,238,.12); }
          .expert-agent-canvas { min-height:0; flex:1 1 auto; }
          .expert-agent-canvas iframe { width:100% !important; max-width:100% !important; }
          .expert-agent-assistant .min-h-0.flex-1 { overscroll-behavior:contain; }
          .expert-agent-kilo-surface { min-height:0; }
        }
        @media (min-width: 768px) and (max-width: 1279px) {
          .expert-agent-assistant-drawer { position:fixed; top:56px; right:12px; bottom:12px; left:auto; z-index:92; width:min(460px,calc(100vw - 24px)); border:1px solid rgba(34,211,238,.22); border-radius:18px; box-shadow:0 24px 80px rgba(0,0,0,.55); }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .expert-agent-workspace-grid { display:flex; min-height:0; flex:1 1 auto; overflow:hidden; }
          .expert-agent-sidebar-drawer { position:fixed; top:56px; bottom:12px; left:0; z-index:91; width:min(340px,86vw); border:1px solid rgba(148,163,184,.2); border-left:0; border-radius:0 18px 18px 0; box-shadow:24px 0 70px rgba(0,0,0,.55); }
          .expert-agent-mobile-backdrop { display:block; position:fixed; inset:56px 0 0; z-index:90; border:0; background:rgba(2,6,15,.62); backdrop-filter:blur(3px); }
        }
        @media (max-width: 380px) {
          .expert-agent-mobile-tabs button { font-size:9px; }
          .expert-agent-mobile-tabs button svg { width:16px; height:16px; }
          .expert-agent-assistant-drawer { left:5px; right:5px; }
        }

        /* Bolt-inspired, ExpertsTeam-branded builder workspace */
        .expert-agent-shell {
          --et-builder-accent: #5b9cff;
          --et-builder-accent-soft: rgba(91,156,255,.13);
          --et-builder-line: #273344;
          background: #0b111b !important;
          color: #e7edf6;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          letter-spacing: -.01em;
        }
        .expert-agent-topbar {
          min-height: 56px !important; padding: 7px 14px !important; gap: 10px !important;
          background: #111a27 !important; border-color: var(--et-builder-line) !important;
          box-shadow: 0 1px 0 rgba(0,0,0,.16);
        }
        .expert-agent-brand-mark { width: 30px !important; height: 30px !important; border-radius: 8px !important; }
        .expert-agent-topbar [class*="text-[10px]"].font-bold { letter-spacing: .12em; color: #8bbcff !important; }
        .expert-agent-topbar [class*="border-cyan-400/20"] { border-color: rgba(91,156,255,.24) !important; background: var(--et-builder-accent-soft) !important; color: #a9ceff !important; }
        .expert-agent-topbar .text-sm.font-semibold { font-size: 13px !important; font-weight: 600 !important; color: #edf3fb !important; }
        .expert-agent-topbar select, .expert-agent-topbar button, .expert-agent-topbar a { border-radius: 7px !important; }
        .expert-agent-workspace-grid { background: #0b111b; }
        .expert-agent-sidebar { background: #101925 !important; border-color: var(--et-builder-line) !important; scrollbar-width: thin; scrollbar-color: #34445a transparent; }
        .expert-agent-sidebar > div:first-child { padding-top: 13px; }
        .expert-agent-sidebar [class*="text-[10px]"].font-bold { color: #7f91a8 !important; letter-spacing: .13em; }
        .expert-agent-sidebar .text-xs.font-semibold { color: #d7e1ef !important; }
        .expert-agent-sidebar .max-h-64 { max-height: 34vh; }
        .expert-agent-sidebar button { transition: background-color .14s ease, color .14s ease; }
        .expert-agent-sidebar .mt-auto > div { background: #162235 !important; border-color: #2b3c53 !important; border-radius: 9px !important; }
        .expert-agent-stage { background: #0b111b !important; }
        .expert-agent-toolbar { min-height: 48px !important; padding: 6px 12px !important; gap: 8px !important; background: #111a27 !important; border-color: var(--et-builder-line) !important; }
        .expert-agent-workspace-tab { min-height: 32px; border: 1px solid transparent; border-radius: 7px !important; padding: 6px 11px !important; color: #91a0b4 !important; }
        .expert-agent-workspace-tab:hover { color: #e4edf8 !important; background: rgba(255,255,255,.045) !important; }
        .expert-agent-workspace-tab[class*="bg-cyan-400/10"] { color: #b8d7ff !important; background: rgba(91,156,255,.14) !important; border-color: rgba(91,156,255,.2) !important; }
        .expert-agent-toolbar > div:last-child button { border-radius: 7px !important; }
        .expert-agent-toolbar > div:last-child button[class*="bg-emerald-500"] { background: #2563b8 !important; color: white !important; }
        .expert-agent-toolbar > div:last-child button[class*="border-cyan-400"] { background: rgba(91,156,255,.14) !important; border-color: rgba(91,156,255,.28) !important; color: #c1dcff !important; }
        .expert-agent-assistant { background: #111a27 !important; border-color: var(--et-builder-line) !important; }
        .expert-agent-assistant > div:first-child { min-height: 52px; border-color: var(--et-builder-line) !important; }
        .expert-agent-assistant > div:nth-child(2), .expert-agent-assistant > div:nth-child(3) { background: #0e1723 !important; border-color: var(--et-builder-line) !important; }
        .expert-agent-assistant .bg-gradient-to-br { background: rgba(91,156,255,.15) !important; color: #a9ceff !important; }
        .expert-agent-assistant textarea { min-height: 92px !important; line-height: 1.55 !important; }
        .expert-agent-assistant [class*="border-white/10"] { background: #0d1622 !important; border-color: #33445b !important; border-radius: 11px !important; }
        .expert-agent-assistant button[class*="bg-cyan-400"] { background: #4f91ed !important; color: #07111e !important; }
        .expert-agent-assistant button[class*="bg-cyan-400"]:hover { background: #75adfa !important; }
        .expert-agent-canvas { background: #e8edf4 !important; }
        .expert-agent-canvas iframe { border-color: #2b3748 !important; border-radius: 8px !important; }
        .expert-agent-statusbar { min-height: 30px; padding: 5px 12px !important; background: #111a27 !important; border-color: var(--et-builder-line) !important; }
        .expert-agent-kilo-surface { background: #080e17 !important; }
        .expert-agent-editor-tabs { scrollbar-width: thin; scrollbar-color: #34445a transparent; }
        .expert-agent-editor-tabs > div { transition: background-color .12s ease, color .12s ease; }
        .expert-agent-light .expert-agent-editor-tabs { background: #f0f3f8 !important; border-color: #dce3ed !important; }
        .expert-agent-light .expert-agent-editor-tabs > div[class*="bg-[#182538]"] { background: #ffffff !important; border-color: #dce3ed !important; color: #1e293b !important; }
        .expert-agent-mobile-dock { background: rgba(14,22,34,.98) !important; border-color: var(--et-builder-line) !important; }
        @media (min-width: 1280px) {
          .expert-agent-topbar { flex-wrap: wrap !important; }
          .expert-agent-sidebar { min-width: 0; }
          .expert-agent-toolbar { flex-wrap: nowrap !important; }
          .expert-agent-assistant { min-width: 340px; }
        }
        @media (max-width: 1279px) { .expert-agent-assistant-drawer { background: #111a27 !important; } }
        @media (max-width: 767px) {
          .expert-agent-topbar { background: #111a27 !important; }
          .expert-agent-sidebar-drawer { background: #101925 !important; }
        }

        /* Bolt-style composition: AI agent on the left, live workspace on the right. */
        @media (min-width: 768px) {
          .expert-agent-workspace-grid { display:grid !important; grid-template-columns:minmax(0,1fr) !important; }
          .expert-agent-sidebar-drawer {
            position:fixed !important; top:64px !important; bottom:14px !important; left:12px !important;
            z-index:130 !important; width:min(var(--sidebar-width),calc(100vw - 24px)) !important;
            border:1px solid rgba(91,156,255,.25) !important; border-radius:12px !important;
            box-shadow:0 24px 80px rgba(0,0,0,.58) !important;
          }
          .expert-agent-mobile-backdrop {
            display:block !important; position:fixed !important; inset:56px 0 0 !important;
            z-index:125 !important; border:0 !important; background:rgba(3,9,18,.52) !important;
            backdrop-filter:blur(2px) !important;
          }
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) {
            grid-template-columns:var(--assistant-width) 5px minmax(0,1fr) !important;
          }
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > .expert-agent-canvas { grid-column:3 !important; grid-row:1 !important; }
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > [aria-label="Resize ExpertAI panel"] { grid-column:2 !important; grid-row:1 !important; }
          .expert-agent-stage > .grid > aside.expert-agent-assistant {
            grid-column:1 !important; grid-row:1 !important; border-right:1px solid var(--et-builder-line) !important;
            border-left:0 !important; border-top:0 !important;
          }
          .expert-agent-stage > .grid:not(:has(> aside.expert-agent-assistant)) { grid-template-columns:minmax(0,1fr) !important; }
          .expert-agent-assistant { min-width:280px !important; }
        }
        @media (min-width:768px) and (max-width:1279px) {
          .expert-agent-assistant-drawer {
            position:relative !important; inset:auto !important; width:auto !important; max-width:none !important;
            border-radius:0 !important; box-shadow:none !important;
          }
        }
        .expert-agent-shell.expert-agent-light {
          --et-builder-line: #dce3ed;
          background: #f5f7fb !important;
          color: #172033 !important;
        }
        .expert-agent-light .expert-agent-stage { background: #f5f7fb !important; }
        .expert-agent-light .expert-agent-toolbar,
        .expert-agent-light .expert-agent-statusbar { background: #ffffff !important; border-color: #dce3ed !important; }
        .expert-agent-light .expert-agent-workspace-tab[class*="bg-cyan-400/10"] {
          background: rgba(59,130,246,.12) !important;
          border-color: rgba(59,130,246,.2) !important;
          color: #1d4ed8 !important;
        }
        .expert-agent-light .expert-agent-workspace-tab { color: #64748b !important; }
        .expert-agent-light .expert-agent-workspace-tab:hover { color: #1e293b !important; background: #edf2f8 !important; }
        .expert-agent-light .expert-agent-mobile-dock { background: rgba(255,255,255,.98) !important; border-color: #dce3ed !important; }
        @media (prefers-reduced-motion: reduce) {
          .expert-agent-shell *, .expert-agent-shell *::before, .expert-agent-shell *::after {
            scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important;
          }
        }
        /* ExpertsTeam Studio — unified dark IDE workspace */
        .expert-agent-shell {
          --et-studio-bg:#0B0F17; --et-studio-panel:#111827; --et-studio-line:#1E293B;
          background:var(--et-studio-bg)!important;color:#e5edf8!important;
          font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:dark;
        }
        .expert-agent-shell.expert-agent-light { background:#0B0F17!important;color:#e5edf8!important; }
        .expert-agent-topbar {
          box-sizing:border-box;height:48px!important;min-height:48px!important;max-height:48px!important;
          flex:0 0 48px!important;flex-wrap:nowrap!important;gap:10px!important;padding:0 12px!important;
          overflow:hidden;background:#111827!important;border-bottom:1px solid #1E293B!important;box-shadow:none!important;
        }
        .expert-agent-topbar .expert-agent-brand-mark { width:27px!important;height:27px!important; }
        .expert-agent-topbar > div:first-child { min-width:0;flex:1 1 auto;gap:9px!important; }
        .expert-agent-topbar > div:first-child > div { min-width:0; }
        .expert-agent-topbar > div:first-child > div > div:first-child { display:none!important; }
        .expert-agent-topbar > div:first-child > div > div:nth-child(2) { gap:7px!important; }
        .expert-agent-topbar .text-sm.font-semibold { max-width:190px;color:#f1f5f9!important; }
        .expert-agent-topbar .et-studio-header-actions { display:flex;align-items:center;gap:7px;flex:0 0 auto; }
        .expert-agent-topbar > div:nth-of-type(2) { gap:7px!important;flex:0 0 auto; }
        .expert-agent-topbar > div:nth-of-type(2) > a,.expert-agent-topbar > div:nth-of-type(2) > span { display:none!important; }
        .expert-agent-topbar button,.expert-agent-topbar a { white-space:nowrap; }
        .expert-agent-workspace-grid { display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;min-height:0!important;background:#0B0F17!important; }
        .et-studio-activity-rail {
          grid-column:1;grid-row:1;display:flex;min-height:0;flex-direction:column;align-items:center;gap:8px;
          padding:10px 6px;background:#0d1421;border-right:1px solid #1E293B;z-index:4;
        }
        .et-studio-activity-rail button,.et-studio-activity-rail a {
          display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:1px solid transparent;
          border-radius:9px;color:#94a3b8;background:transparent;transition:all .15s ease;
        }
        .et-studio-activity-rail svg { width:17px;height:17px; }
        .et-studio-activity-rail button:hover,.et-studio-activity-rail a:hover {
          color:#dbeafe;background:rgba(59,130,246,.13);border-color:rgba(59,130,246,.24);
        }
        .et-studio-activity-spacer { flex:1 1 auto; }
        .expert-agent-workspace-grid > .expert-agent-stage { grid-column:2;grid-row:1;min-width:0;background:#0B0F17!important; }
        .expert-agent-sidebar-drawer { z-index:30!important; }
        .expert-agent-stage > .expert-agent-toolbar {
          min-height:46px!important;height:46px!important;flex:0 0 46px!important;flex-wrap:nowrap!important;
          padding:0 12px!important;background:#111827!important;border-bottom:1px solid #1E293B!important;
        }
        .expert-agent-stage > .expert-agent-toolbar > div:first-child { display:none!important; }
        .expert-agent-stage > .expert-agent-toolbar > div:nth-child(2) { margin-right:auto; }
        .expert-agent-stage > .expert-agent-toolbar > div:nth-child(2) .expert-agent-workspace-tab {
          height:32px;border-radius:7px!important;padding:0 12px!important;color:#94a3b8!important;
        }
        .expert-agent-stage > .expert-agent-toolbar > div:nth-child(2) .expert-agent-workspace-tab[class*="bg-cyan-400/10"] {
          color:#bfdbfe!important;background:rgba(59,130,246,.13)!important;border:1px solid rgba(59,130,246,.26)!important;
        }
        .expert-agent-stage > .expert-agent-toolbar > div:last-child { gap:5px!important; }
        .expert-agent-stage > .expert-agent-toolbar > div:last-child > button[aria-label="Toggle ExpertAI builder"],
        .expert-agent-stage > .expert-agent-toolbar > div:last-child > a { display:none!important; }
        .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) {
          grid-template-columns:minmax(300px,var(--assistant-width,420px)) 5px minmax(0,1fr)!important;background:#0B0F17!important;
        }
        .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > aside.expert-agent-assistant {
          grid-column:1!important;grid-row:1!important;min-width:0!important;width:auto!important;
          background:#111827!important;border:0!important;border-right:1px solid #1E293B!important;
        }
        .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > [aria-label="Resize ExpertAI panel"] {
          grid-column:2!important;grid-row:1!important;background:#1E293B!important;
        }
        .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > .expert-agent-canvas {
          grid-column:3!important;grid-row:1!important;min-width:0!important;background:#0B0F17!important;
        }
        .expert-agent-assistant > div:first-child {
          height:48px!important;min-height:48px!important;padding:0 14px!important;
          background:#111827!important;border-bottom:1px solid #1E293B!important;
        }
        .expert-agent-assistant > div:first-child .bg-gradient-to-br { background:rgba(59,130,246,.16)!important;color:#93c5fd!important; }
        .expert-agent-assistant > div:nth-child(2) { display:none!important; }
        .expert-agent-assistant > div:nth-child(3) { min-height:38px!important;padding:6px 12px!important;background:#111827!important;border-color:#1E293B!important; }
        .expert-agent-assistant > div:nth-child(3) > div { color:#94a3b8!important; }
        .expert-agent-assistant > div:nth-child(3) > span { color:#6ee7b7!important; }
        .expert-agent-assistant .min-h-0.flex-1 { padding:14px!important;scrollbar-width:thin;scrollbar-color:#334155 transparent; }
        .expert-agent-assistant .min-h-0.flex-1 > div > div { border-radius:12px!important; }
        .expert-agent-assistant .shrink-0.border-t { background:#111827!important;border-color:#1E293B!important; }
        .expert-agent-assistant .shrink-0.border-t > div { border-radius:12px!important;background:#0B0F17!important;border:1px solid #334155!important; }
        .expert-agent-assistant textarea { min-height:68px!important;font-size:12px!important;line-height:1.5!important; }
        .expert-agent-assistant button[class*="bg-cyan-400"] { background:#3B82F6!important;color:white!important; }
        .expert-agent-assistant button[class*="bg-cyan-400"]:hover { background:#2563eb!important; }
        .expert-agent-canvas { background:#0B0F17!important; }
        .expert-agent-canvas > div:first-child { min-height:40px!important;background:#111827!important;border-color:#1E293B!important; }
        .expert-agent-canvas iframe { border:1px solid #1E293B!important;border-radius:10px!important; }
        .expert-agent-canvas > div:has(> iframe) { padding:12px!important;background:#0B0F17!important; }
        .expert-agent-topbar > div:first-child > div > div:nth-child(2) > select {
          display:block!important;max-width:138px!important;height:26px!important;padding:0 6px!important;
          border-color:#334155!important;background:#0B0F17!important;color:#cbd5e1!important;font-size:10px!important;
        }
        .expert-agent-topbar > div:first-child > div > div:nth-child(2) > button:last-of-type { display:none!important; }
        .expert-agent-workspace-grid > [aria-label="Resize project sidebar"] { display:none!important; }
        .expert-agent-statusbar,.expert-agent-mobile-dock { display:none!important; }
        @media (min-width:768px) {
          .expert-agent-topbar { flex-wrap:nowrap!important; }
          .expert-agent-sidebar-drawer { top:48px!important;left:48px!important;bottom:0!important; }
          .expert-agent-mobile-backdrop { inset:48px 0 0 48px!important; }
        }
        @media (max-width:1100px) {
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) { grid-template-columns:minmax(260px,var(--assistant-width,360px)) 5px minmax(0,1fr)!important; }
          .expert-agent-topbar .et-studio-header-actions button:first-child { font-size:0!important;gap:0!important;padding:0 8px!important; }
          .expert-agent-topbar .et-studio-header-actions button:first-child svg { margin:0!important; }
        }
        @media (max-width:767px) {
          .expert-agent-workspace-grid { padding-bottom:0!important; }
          .expert-agent-sidebar-drawer { top:48px!important;bottom:0!important;left:0!important; }
          .expert-agent-mobile-backdrop { inset:48px 0 0!important; }
          .expert-agent-stage > .expert-agent-toolbar > div:last-child > button[aria-label="Toggle ExpertAI builder"] { display:inline-flex!important; }
          .expert-agent-topbar { height:48px!important;min-height:48px!important;max-height:48px!important;padding:0 8px!important; }
          .expert-agent-topbar .et-studio-header-actions button:first-child { display:none!important; }
          .expert-agent-workspace-grid { display:flex!important; }
          .et-studio-activity-rail { display:none!important; }
          .expert-agent-stage { width:100%; }
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) { display:flex!important; }
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > .expert-agent-canvas { display:none!important; }
          .expert-agent-stage > .grid:has(> aside.expert-agent-assistant) > aside.expert-agent-assistant {
            display:flex!important;position:fixed!important;inset:48px 0 0!important;width:100%!important;z-index:92!important;border-radius:0!important;
          }
          .expert-agent-topbar .et-studio-header-actions button { height:30px!important;font-size:10px!important; }
        }
        .et-visual-property-popover {
          position:absolute;z-index:35;top:16px;right:16px;width:min(330px,calc(100% - 32px));
          max-height:calc(100% - 32px);overflow:auto;padding:13px;border:1px solid rgba(96,165,250,.34);
          border-radius:14px;background:rgba(15,23,42,.94);backdrop-filter:blur(18px);
          box-shadow:0 18px 55px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.04);
        }
        .et-visual-property-popover input[type="color"]::-webkit-color-swatch-wrapper { padding:0; }
        .et-visual-property-popover input[type="color"]::-webkit-color-swatch { border:0;border-radius:5px; }
        .expert-agent-assistant .min-h-0.flex-1 { font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
        .expert-agent-kilo-surface,.expert-agent-canvas .cm-editor { font-family:"JetBrains Mono",ui-monospace,monospace; }
      `}</style>

      <Dialog open={thumbnailDialogOpen} onOpenChange={setThumbnailDialogOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Project thumbnail</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Paste a public image URL or upload an image from your device.</p>
            <div className="space-y-1.5"><Label htmlFor="project-thumbnail-url">Image URL</Label><Input id="project-thumbnail-url" value={thumbnailUrlInput} onChange={(event) => setThumbnailUrlInput(event.target.value)} placeholder="https://example.com/project-cover.png" className="border-white/10 bg-white/5" /></div>
            {thumbnailUrlInput.trim() && <img src={thumbnailUrlInput} alt="Thumbnail preview" referrerPolicy="no-referrer" className="h-36 w-full rounded-lg border border-white/10 bg-black/20 object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} onLoad={(event) => { event.currentTarget.style.visibility = "visible"; }} />}
            <div className="flex flex-wrap gap-2"><Button onClick={() => void saveProjectThumbnailUrl()} disabled={savingThumbnailUrl} className="flex-1 bg-cyan-400 text-slate-950 hover:bg-cyan-300">{savingThumbnailUrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save image URL</Button><Button variant="outline" onClick={() => void setProjectThumbnail()} className="border-white/15 bg-white/5 text-white hover:bg-white/10"><ImagePlus className="mr-2 h-4 w-4" />Upload image</Button></div>
            {thumbnailUrl && <Button variant="ghost" className="w-full text-slate-400 hover:text-red-300" onClick={async () => { if (!user || !projectId) { setThumbnailUrl(null); setThumbnailUrlInput(""); setThumbnailDialogOpen(false); return; } const { error } = await supabase.from("agent_projects").update({ thumbnail_url: null }).eq("id", activeProjectId).eq("user_id", user.id); if (error) { toast.error(error.message); return; } setThumbnailUrl(null); setThumbnailUrlInput(""); await queryClient.invalidateQueries({ queryKey: ["agent-projects", user.id] }); setThumbnailDialogOpen(false); toast.success("Project thumbnail removed."); }}>Remove thumbnail</Button>}
          </div>
        </DialogContent>
      </Dialog>

      {/* New file dialog */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="border-slate-700 bg-[#101a29] p-0 text-white sm:max-w-xl">
          <DialogHeader className="border-b border-white/10 px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Command className="h-4 w-4 text-blue-300" /> Quick open file
              <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">Ctrl P</span>
            </DialogTitle>
          </DialogHeader>
          <div className="p-3">
            <Input
              autoFocus
              value={quickOpenQuery}
              onChange={(event) => setQuickOpenQuery(event.target.value)}
              placeholder="Search project files by name or path…"
              className="border-white/10 bg-white/5 text-sm"
            />
            <div className="mt-3 max-h-[min(55vh,420px)] space-y-1 overflow-y-auto">
              {Object.keys(files)
                .filter((filePath) => filePath.toLowerCase().includes(quickOpenQuery.trim().toLowerCase()))
                .sort((left, right) => left.localeCompare(right))
                .map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => {
                      setOpenFileTabs((current) => current.includes(filePath) ? current : [...current, filePath]);
                      setActiveFile(filePath);
                      switchPanel("code");
                      setQuickOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-blue-400/10"
                  >
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-300" />
                    <span className="min-w-0 flex-1 truncate">{filePath}</span>
                    {activeFile === filePath && <span className="text-[10px] text-blue-300">Active</span>}
                  </button>
                ))}
              {!Object.keys(files).some((filePath) => filePath.toLowerCase().includes(quickOpenQuery.trim().toLowerCase())) && (
                <p className="px-3 py-8 text-center text-xs text-slate-500">No matching files found.</p>
              )}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Search includes complete folder paths across this project</p>
          </div>
        </DialogContent>
      </Dialog>

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
              Select a project folder, a source file or a ZIP archive (up to 25 MB). ExpertAI Studio
              imports supported text files into a new project. Binary assets and secret files are skipped.
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {developerVaultLoading ? (
                <p className="py-6 text-center text-sm text-slate-400">Loading team projects…</p>
              ) : developerVaultGroups.length ? developerVaultGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <Folder className="h-5 w-5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{group.name}</p>
                    <p className="text-[11px] text-slate-400">{group.kind === "project" ? "Project folder · " : group.name.toLowerCase().endsWith(".zip") ? "ZIP archive · " : "File · "}{group.count} stored {group.count === 1 ? "file" : "files"}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={importingVault}
                    onClick={() => void importDeveloperVaultProject(group.id, group.name, group.kind)}
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
              Imports up to 2,000 text files, 10 MB per file and 25 MB total source text. ZIP archives can be up to 100 MB. Files are
              copied into your own ExpertsAI Agent project; the shared vault copy is unchanged.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creditsOfferwallOpen} onOpenChange={setCreditsOfferwallOpen}>
        <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto border-slate-700 bg-[#101a29] p-4 text-white sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-amber-300" /> Earn free ExpertAI credits
            </DialogTitle>
          </DialogHeader>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3">
            <div>
              <p className="text-xs text-slate-400">Your available balance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-amber-100">{profile?.ai_credits ?? 0} credits</p>
            </div>
            <a href="/earn" className="text-xs font-semibold text-cyan-200 underline underline-offset-4 hover:text-cyan-100">Open full rewards history</a>
          </div>
          <MyLeadOfferwall />
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
              <Button type="button" variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => void connectGitHubAccount()}>
                <Github className="mr-2 h-4 w-4" />{githubAccessToken ? "GitHub connected" : "Connect GitHub for private repositories"}
              </Button>
              <p className="text-[11px] leading-5 text-slate-500">
                Public repositories work without authorization. Connecting GitHub uses the OAuth
                session token; a one-time token can still be pasted above if needed.
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
              Imports up to 2,000 text files and 25 MB of source text per project (maximum 10 MB per
              file, subject to the cloud runtime's own limits). Generated folders, binary assets and
              secret files are skipped. Your GitHub repository is not modified.
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
              <Label htmlFor="github-repo">Repository (owner/name)</Label>
              <Input
                id="github-repo"
                value={githubRepo}
                onChange={(event) => setGithubRepo(event.target.value)}
                placeholder="your-account/my-awesome-project"
                className="border-white/10 bg-white/5"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="github-repository-picker">Your repositories</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 border-white/15 bg-white/5 px-2 text-xs text-white hover:bg-white/10" onClick={() => void loadGithubRepositories()} disabled={loadingGithubRepositories || !(githubAccessToken || githubToken.trim())}>
                  {loadingGithubRepositories ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Github className="mr-1.5 h-3 w-3" />}
                  Refresh list
                </Button>
              </div>
              <select
                id="github-repository-picker"
                value={githubRepo}
                onChange={(event) => setGithubRepo(event.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-[#0b1320] px-3 text-sm text-slate-100"
              >
                <option value="">Choose a repository…</option>
                {githubRepositories.map((repository) => (
                  <option key={repository.fullName} value={repository.fullName}>
                    {repository.fullName}{repository.private ? " · Private" : ""}
                  </option>
                ))}
              </select>
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
              <Button type="button" variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => void connectGitHubAccount()}>
                <Github className="mr-2 h-4 w-4" />{githubAccessToken ? "GitHub connected" : "Connect GitHub account"}
              </Button>
              <p className="text-[11px] leading-5 text-slate-500">
                OAuth is preferred. A one-time personal access token is only used for this operation
                and is not saved in your project.
              </p>
            </div>
            <Button
              className="w-full bg-white text-slate-950 hover:bg-slate-200"
              disabled={githubMutation.isPending || !(githubAccessToken || githubToken.trim()) || !githubRepo.trim()}
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
      <Dialog open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
        <DialogContent className="max-h-[80dvh] overflow-hidden border-slate-700 bg-[#101a29] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Project version history</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 space-y-2 overflow-y-auto">
            {checkpoints.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
                No saved versions yet. ExpertsTeam automatically creates a checkpoint before each Agent change.
              </div>
            ) : checkpoints.map((checkpoint) => (
              <div key={checkpoint.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{checkpoint.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{new Date(checkpoint.created_at).toISOString().replace("T", " ").slice(0, 16)} UTC · {Object.keys(checkpoint.files ?? {}).length} files</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => void toggleCheckpointBookmark(checkpoint)} className={checkpoint.is_bookmarked ? "rounded-lg bg-amber-300/10 p-2 text-amber-300" : "rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-amber-300"} title={checkpoint.is_bookmarked ? "Remove bookmark" : "Bookmark version"} aria-label={checkpoint.is_bookmarked ? "Remove version bookmark" : "Bookmark version"}>
                    <Star className="h-4 w-4" />
                  </button>
                  <Button size="sm" variant="outline" disabled={restoringCheckpointId !== null} onClick={() => void restoreCheckpoint(checkpoint)} className="shrink-0 border-cyan-400/20 text-cyan-100">
                    {restoringCheckpointId === checkpoint.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Restore"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
