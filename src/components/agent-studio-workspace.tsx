/* eslint-disable no-control-regex, @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Code2, Eye, FileCode2, Play, Save, SquareTerminal, TerminalSquare, Database, Github, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { loadProjectBinaryAssets, loadProjectFiles, saveProjectFiles } from "@/lib/project-files";
import { getProjectPublicEnvironment, runCodingAgent } from "@/lib/agent.functions";
import { getBrowserRuntime, openBrowserTerminal, startBrowserPreview, stopBrowserPreview, syncBrowserProject, watchBrowserProject, type BrowserPreviewPort } from "@/lib/browser-webcontainer";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { Terminal } from "@xterm/xterm";
import { BoltFileTree } from "@/components/bolt-port/FileTree";
import { BoltChatPanel } from "@/components/bolt-port/Chat";
import { BoltPreviewPanel } from "@/components/bolt-port/Preview";
import { WorkspaceControls, type WorkspaceModal } from "@/components/WorkspaceControls";
import { FitAddon } from "@xterm/addon-fit";
import { baseProjectSlug } from "@/lib/agent-project-slug";
import "@xterm/xterm/css/xterm.css";

type ChatMessage = { role: "user" | "assistant"; content: string; createdAt?: string };
type ProjectFiles = Record<string, string>;
type WorkbenchTab = "preview" | "code";

function editorLanguage(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "html" || extension === "htm") return html();
  if (extension === "css" || extension === "scss") return css();
  if (extension === "json") return json();
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(extension ?? "")) {
    return javascript({ typescript: extension === "ts" || extension === "tsx", jsx: extension === "jsx" || extension === "tsx" });
  }
  return javascript();
}

const VISUAL_INSPECTOR_SCRIPT = String.raw`<script id="experts-visual-inspector">(()=>{let active=false;let hovered=null;const outline=(el)=>{if(hovered&&hovered!==el)hovered.style.outline=hovered.dataset.expertsOldOutline||"";hovered=el;if(el){if(el.dataset.expertsOldOutline===undefined)el.dataset.expertsOldOutline=el.style.outline;el.style.outline="2px solid #2563EB";}};window.addEventListener("message",e=>{if(e.data?.type==="experts:visual-edit"){active=!!e.data.enabled;document.documentElement.style.cursor=active?"crosshair":"";if(!active)outline(null);}});document.addEventListener("pointerover",e=>{if(active&&e.target instanceof HTMLElement)outline(e.target);},true);document.addEventListener("click",e=>{if(!active)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const el=e.target instanceof HTMLElement?e.target:null;if(!el)return;const parts=[];let node=el;while(node&&node!==document.body&&parts.length<4){let selector=node.tagName.toLowerCase();if(node.id)selector+="#"+node.id;else if(node.classList.length)selector+="."+Array.from(node.classList).slice(0,2).join(".");parts.unshift(selector);node=node.parentElement;}const detail="Selector: "+parts.join(" > ")+"\nElement: "+el.outerHTML.slice(0,1800);parent.postMessage({type:"experts:element-selected",detail},"*");active=false;document.documentElement.style.cursor="";outline(null);},true);})();</script>`;

function stripVisualInspector(html: string) {
  const start = html.indexOf('<script id="experts-visual-inspector">');
  if (start < 0) return html;
  const end = html.indexOf("</script>", start);
  return end < 0 ? html : html.slice(0, start) + html.slice(end + 9);
}

function withVisualInspector(files: Record<string, string | Uint8Array>) {
  const previewFiles = { ...files };
  const html = previewFiles["index.html"];
  if (typeof html !== "string" || html.includes("experts-visual-inspector")) return previewFiles;
  const closingBody = html.toLowerCase().lastIndexOf("</body>");
  previewFiles["index.html"] = closingBody >= 0
    ? html.slice(0, closingBody) + VISUAL_INSPECTOR_SCRIPT + html.slice(closingBody)
    : html + VISUAL_INSPECTOR_SCRIPT;
  return previewFiles;
}

function readMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatMessage =>
    Boolean(item && typeof item === "object" &&
      ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
      typeof (item as ChatMessage).content === "string"),
  ).slice(-100);
}

const expertsEditorTheme = EditorView.theme({
  "&": { backgroundColor: "#070B14", color: "#E2E8F0" },
  ".cm-content": { caretColor: "#3B82F6" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#3B82F6" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "rgba(37,99,235,.25)" },
  ".cm-gutters": { backgroundColor: "#0D1322", color: "#94A3B8", borderRight: "1px solid #1E293B" },
  ".cm-activeLine": { backgroundColor: "rgba(37,99,235,.08)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(37,99,235,.12)" },
});

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
  const [chatWidth, setChatWidth] = useState(440);
  const [activePath, setActivePath] = useState("");
  const [tab, setTab] = useState<WorkbenchTab>("preview");
  const [busy, setBusy] = useState(false);
  const [filesReady, setFilesReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [previewBooting, setPreviewBooting] = useState(false);
  const [previewVisualEdit, setPreviewVisualEdit] = useState(false);
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModal>(null);
  const [tutorMode, setTutorMode] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ name: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; data: string } | null>(null);
  const [selectedElement, setSelectedElement] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [previewPorts, setPreviewPorts] = useState<BrowserPreviewPort[]>([]);
  const [selectedPreviewPort, setSelectedPreviewPort] = useState<number | null>(null);
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const terminalSessionRef = useRef<{ write: (value: string) => void; resize: (size: { cols: number; rows: number }) => void; close: () => void } | null>(null);
  const runtimeActiveRef = useRef(false);
  const [runtimeOutput, setRuntimeOutput] = useState("");
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [terminalConnected, setTerminalConnected] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const hydratedRef = useRef("");
  const persistedFilesRef = useRef<ProjectFiles | null>(null);
  const autoBootStarted = useRef(false);

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
        .select("id,name,framework,messages,updated_at,slug,published")
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
    persistedFilesRef.current = projectQuery.data.files;
    setBinaryAssets(projectQuery.data.binaryAssets);
    setMessages(projectQuery.data.messages);
    if (projectQuery.data.project.published && projectQuery.data.project.slug) setPublishedUrl(window.location.origin + "/apps/" + projectQuery.data.project.slug);
    setActivePath(Object.keys(projectQuery.data.files).sort()[0] ?? "");
    setFilesReady(true);
    setSaveStatus("saved");
  }, [projectQuery.data, projectId, projectQuery.data?.project.updated_at]);

  useEffect(() => {
    if (!user || !projectQuery.data || !filesReady || hydratedRef.current !== `${projectId}:${projectQuery.data.project.updated_at}` || persistedFilesRef.current === files) return;
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await saveProjectFiles(projectId, user.id, files);
        persistedFilesRef.current = files;
        setSaveStatus("saved");
      } catch (error) {
        console.error("[Agent Studio] Autosave failed:", error);
        setSaveStatus("error");
        toast.error("Could not save your latest code changes.");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [files, filesReady, projectId, projectQuery.data, user]);

  const paths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);
  const activeContent = files[activePath] ?? "";

  useEffect(() => {
    if (!runtimeActiveRef.current) return;
    const timer = window.setTimeout(() => {
      void syncBrowserProject(projectId, withVisualInspector({ ...files, ...binaryAssets })).catch((error) => {
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
      const sourceContents = path === "index.html" && contents !== null ? stripVisualInspector(contents) : contents;
      setFiles((current) => {
        if (sourceContents === null) {
          if (!(path in current)) return current;
          const next = { ...current };
          delete next[path];
          return next;
        }
        if (current[path] === sourceContents) return current;
        return { ...current, [path]: sourceContents };
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

  const sendMessage = useCallback(async (options: { modelTier: "fast" | "architect"; tutorMode: boolean } = { modelTier: "fast", tutorMode: false }) => {
    const text = (selectedElement ? prompt + "\n\nSelected element context:\n" + selectedElement : prompt).trim();
    if (!text || busy || !user) return;
    const userMessage: ChatMessage = { role: "user", content: text, createdAt: new Date().toISOString() };
    const nextHistory = [...messages, userMessage].slice(-100);
    setPrompt("");
    setMessages(nextHistory);
    setBusy(true);
    try {
      await persistConversation(nextHistory);
      try { await (supabase as any).from("agent_project_checkpoints").insert({ project_id: projectId, user_id: user.id, name: "Before AI change", files }); } catch (checkpointError) { console.warn("[Agent Studio] Could not create pre-change checkpoint:", checkpointError); }
      const result = await runCodingAgent({
        data: {
          prompt: options.tutorMode ? "Tutor Mode: explain the reasoning and teach me while making the requested changes. " + text : text,
          mode: "build",
          modelTier: options.modelTier,
          framework: projectQuery.data?.project.framework as "nextjs" | "tanstack" | "vite" | "vue" | "sveltekit" | "node" | "html" | undefined,
          files,
          history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content: content.slice(-3000) })),
          ...(attachedImage ? { referenceImage: attachedImage } : {}),
        },
      });
      const updated = { ...files };
      for (const [path, content] of Object.entries(result.files ?? {})) {
        if (content === null) delete updated[path];
        else if (typeof content === "string") updated[path] = content;
      }
      if (Object.keys(result.files ?? {}).length) {
        await saveProjectFiles(projectId, user.id, updated);
        persistedFilesRef.current = updated;
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
      setSelectedElement("");
      setAttachedImage(null);
    }
  }, [activePath, attachedImage, busy, files, messages, persistConversation, projectId, projectQuery.data?.project.framework, prompt, selectedElement, user]);

  const openPreview = async () => {
    if (previewBooting) return;
    setPreviewBooting(true);
    setRuntimeOutput("");
    setPreviewUrl("");
    setPreviewPorts([]);
    setSelectedPreviewPort(null);
    try {
      const sourceFiles = { ...files };
      let addedStarterFiles = false;
      if (!sourceFiles["package.json"]) {
        sourceFiles["package.json"] = JSON.stringify({
          private: true,
          type: "module",
          scripts: { dev: "vite --host 0.0.0.0" },
          devDependencies: { vite: "^6.4.6" },
        }, null, 2);
        addedStarterFiles = true;
      }
      if (!sourceFiles["index.html"]) {
        sourceFiles["index.html"] = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ExpertsTeam Preview</title></head><body><h1>Project preview</h1></body></html>';
        addedStarterFiles = true;
      }
      if (addedStarterFiles) {
        setFiles(sourceFiles);
        await saveProjectFiles(projectId, user!.id, sourceFiles);
        persistedFilesRef.current = sourceFiles;
      }
      const previewFiles = withVisualInspector(sourceFiles);
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
    } finally { setPreviewBooting(false); }
  };

  useEffect(() => {
    if (!filesReady || !projectQuery.data || autoBootStarted.current) return;
    autoBootStarted.current = true;
    void openPreview();
  }, [filesReady, projectQuery.data]);

  const publishProject = async () => {
    if (publishing) return;
    setPublishing(true);
    const uploadedPaths: string[] = [];
    try {
      if (!runtimeReady) {
        await openPreview();
        if (!runtimeActiveRef.current) throw new Error("Start the browser preview successfully before publishing.");
      }
      const runtime = await getBrowserRuntime();
      const manifestText = await runtime.fs.readFile(runtime.workdir + "/package.json", "utf-8").catch(() => "");
      let manifest: { scripts?: Record<string, string>; packageManager?: string } = {};
      if (manifestText) {
        try { manifest = JSON.parse(manifestText) as { scripts?: Record<string, string>; packageManager?: string }; }
        catch { throw new Error("The project's package.json is invalid."); }
      }
      const buildScript = manifest.scripts?.build;
      let outputDirectory = runtime.workdir;
      if (buildScript) {
        toast.message("Building a production release…");
        const declaredManager = manifest.packageManager?.split("@")[0];
        const manager = declaredManager === "pnpm" || declaredManager === "yarn" || declaredManager === "npm" ? declaredManager : (files["pnpm-lock.yaml"] ? "pnpm" : files["yarn.lock"] ? "yarn" : "npm");
        const publicEnvironment = await getProjectPublicEnvironment({ data: { projectId } });
        const build = await runtime.spawn(manager, ["run", "build"], { env: publicEnvironment });
        let buildOutput = "";
        const reader = build.output.getReader();
        void (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) buildOutput = (buildOutput + value).slice(-8000);
            }
          } catch (error) { console.debug("[Agent Studio] Build output stream closed.", error); }
        })();
        const exitCode = await build.exit;
        if (exitCode !== 0) throw new Error("Production build failed. " + buildOutput.slice(-1800));
        const candidates = ["dist", "build", "out"];
        let found = false;
        for (const candidate of candidates) {
          try {
            const stat = await runtime.fs.stat(runtime.workdir + "/" + candidate);
            if (stat.isDirectory()) { outputDirectory = runtime.workdir + "/" + candidate; found = true; break; }
          } catch (error) { console.debug("[Agent Studio] Build output directory not found:", candidate, error); }
        }
        if (!found) throw new Error("Build completed, but no dist/, build/, or out/ directory was created. Configure a static output directory to publish this app.");
      }
      const publishedFiles: Array<{ path: string; body: Blob; size: number; contentType: string }> = [];
      const mimeType = (path: string) => {
        const ext = path.split(".").pop()?.toLowerCase();
        return ({ html: "text/html", css: "text/css", js: "application/javascript", mjs: "application/javascript", cjs: "application/javascript", json: "application/json", map: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", wasm: "application/wasm", txt: "text/plain", xml: "application/xml" } as Record<string,string>)[ext ?? ""] ?? "application/octet-stream";
      };
      const walk = async (directory: string, relative = ""): Promise<void> => {
        const entries = await runtime.fs.readdir(directory);
        for (const entry of entries) {
          const name = typeof entry === "string" ? entry : String(entry);
          if (["node_modules", ".git", ".next", ".turbo", ".kilo", ".kilocode", ".config", ".supabase", ".aws", ".ssh", ".firebase", "coverage"].includes(name)) continue;
          const absolute = directory + "/" + name;
          const nextRelative = relative ? relative + "/" + name : name;
          const stat = await runtime.fs.stat(absolute);
          if (stat.isDirectory()) { await walk(absolute, nextRelative); continue; }
          const pathSegments = nextRelative.split("/").map(segment => segment.toLowerCase());
          const fileName = pathSegments[pathSegments.length - 1] ?? "";
          if (pathSegments.some(segment => segment === ".env" || segment.startsWith(".env.") || [".npmrc", ".netrc", ".pypirc", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"].includes(segment) || (segment.startsWith("service-account") && segment.endsWith(".json"))) || ["pem", "key", "p12", "pfx", "crt", "cer", "secret"].includes(fileName.split(".").pop() ?? "")) continue;
          const bytes = nextRelative === "index.html"
            ? new TextEncoder().encode(stripVisualInspector(await runtime.fs.readFile(absolute, "utf-8")))
            : await runtime.fs.readFile(absolute);
          if (bytes.byteLength > 49_000_000) throw new Error("The file " + nextRelative + " exceeds the 49 MB publish limit.");
          const body = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType(nextRelative) });
          publishedFiles.push({ path: nextRelative, body, size: bytes.byteLength, contentType: mimeType(nextRelative) });
          if (publishedFiles.length > 1000) throw new Error("This release contains more than 1,000 files.");
        }
      };
      await walk(outputDirectory);
      if (!publishedFiles.some(file => file.path === "index.html")) throw new Error("The production output must contain an index.html file.");
      const totalBytes = publishedFiles.reduce((total, file) => total + file.size, 0);
      if (totalBytes > 45_000_000) throw new Error("The production output exceeds the 45 MB total publish limit.");
      const slug = projectQuery.data!.project.slug || (baseProjectSlug(projectQuery.data!.project.name).slice(0, 48).replace(/-+$/,"") + "-" + projectId.slice(0, 6));
      const releaseId = new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 8);
      const root = user!.id + "/" + projectId + "/" + releaseId;
      for (let index = 0; index < publishedFiles.length; index += 4) {
        const batch = publishedFiles.slice(index, index + 4);
        const results = await Promise.allSettled(batch.map(async file => {
          const path = root + "/" + file.path;
          const { error } = await supabase.storage.from("published-apps").upload(path, file.body, { contentType: file.contentType, cacheControl: "31536000", upsert: false });
          if (error) throw new Error("Could not upload " + file.path + ": " + error.message);
          uploadedPaths.push(path);
        }));
        const failedUpload = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failedUpload) throw failedUpload.reason;
      }
      const indexPath = root + "/index.html";
      const deploymentUrl = supabase.storage.from("published-apps").getPublicUrl(indexPath).data.publicUrl;
      const publicUrl = window.location.origin + "/apps/" + slug;
      const { error: recordError } = await supabase.rpc("record_agent_project_deployment", {
        p_project_id: projectId, p_slug: slug, p_environment: "production", p_release_id: releaseId,
        p_deployment_url: deploymentUrl, p_public_url: publicUrl, p_file_count: publishedFiles.length,
      });
      if (recordError) throw new Error("Files uploaded, but the production release could not be recorded: " + recordError.message);
      setPublishedUrl(publicUrl);
      await queryClient.invalidateQueries({ queryKey: ["agent-project-deployments", projectId] });
      toast.success("Your app is published: " + publicUrl);
    } catch (error) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from("published-apps").remove(uploadedPaths);
        if (cleanupError) console.warn("[Agent Studio] Could not clean up an incomplete release:", cleanupError);
      }
      toast.error(error instanceof Error ? error.message : "Could not publish this project.");
    } finally {
      setPublishing(false);
    }
  };

  const openTerminal = async () => {
    if (terminalOpen) {
      setTerminalOpen(false);
      return;
    }
    if (terminalConnected) {
      setTerminalOpen(true);
      setTab("code");
      return;
    }
    setBusy(true);
    try {
      await saveProjectFiles(projectId, user!.id, files);
      persistedFilesRef.current = files;
      await syncBrowserProject(projectId, withVisualInspector({ ...files, ...binaryAssets }));
      runtimeActiveRef.current = true;
      setRuntimeReady(true);
      setTerminalConnected(true);
      setTerminalOpen(true);
      setTab("code");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the browser terminal.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!terminalConnected || !terminalOpen || !terminalHost.current) return;
    const terminal = new Terminal({ cursorBlink: true, convertEol: true, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", theme: { background: "#070B14", foreground: "#E2E8F0", cursor: "#3B82F6" } });
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
    const observer = new ResizeObserver(() => { try { fit.fit(); } catch (error) { console.debug("[Agent Studio] Terminal resize skipped during shutdown.", error); } });
    observer.observe(terminalHost.current);
    return () => {
      disposed = true;
      observer.disconnect();
      closeSession?.();
      terminalSessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [terminalConnected, terminalOpen]);

  if (authLoading) return <main className="grid h-screen place-items-center bg-[#070B14] text-sm text-[#94A3B8]">Restoring your session…</main>;
  if (!user) return <main className="grid h-screen place-items-center bg-[#070B14] text-[#CBD5E1]"><a href="/auth" className="underline">Sign in to open this project</a></main>;
  if (projectQuery.isLoading) return <main className="grid h-screen place-items-center bg-[#070B14] text-sm text-[#94A3B8]">Opening your Agent Studio workspace…</main>;
  if (projectQuery.isError || !projectQuery.data) return <main className="grid h-screen place-items-center bg-[#070B14] px-6 text-center text-sm text-rose-300">{(projectQuery.error as Error)?.message ?? "Project unavailable"}</main>;

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#070B14] text-[#E2E8F0]">
      <header className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-[#1E293B] bg-[#0D1322] px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/ai" className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-[#CBD5E1] transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft size={14}/> Projects</Link>
          <span className="h-5 w-px bg-[#1E293B]"/>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2563EB] text-[11px] font-black text-white shadow-lg shadow-blue-500/25">E</div>
          <strong className="max-w-[110px] truncate text-[13px] font-medium text-[#F8FAFC] sm:max-w-[240px]">{projectQuery.data.project.name}</strong>
          <span className="hidden rounded-md border border-[#1E293B] bg-[#070B14] px-2 py-1 text-[10px] text-[#CBD5E1] sm:inline">Agent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`hidden rounded-md border px-2 py-1 text-[10px] font-medium sm:inline ${saveStatus==="saved"?"border-[#10B981]/30 bg-[#10B981]/10 text-[#6EE7B7]":saveStatus==="error"?"border-rose-500/30 bg-rose-500/10 text-rose-300":"border-[#1E293B] bg-[#070B14] text-[#CBD5E1]"}`}>{saveStatus==="saved"?"✓ Saved":saveStatus==="error"?"Save failed":saveStatus==="saving"?"Saving changes…":"Loading files…"}</span>
          <button type="button" onClick={()=>setWorkspaceModal("credits")} aria-label={`⚡ ${profile?.ai_credits ?? 0} Credits • +Earn Free`} className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 px-2.5 py-1.5 text-[10px] font-semibold text-[#F59E0B] hover:bg-[#F59E0B]/20 sm:px-3"><span className="hidden sm:inline">⚡ {profile?.ai_credits ?? 0} Credits • +Earn Free</span><span className="sm:hidden">⚡ {profile?.ai_credits ?? 0}</span></button>
          <button type="button" onClick={()=>setWorkspaceModal("db")} className="flex h-8 items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#0D1322] px-2 text-[10px] text-[#CBD5E1] hover:border-[#2563EB]/50 sm:px-2.5"><Database size={12}/><span className="hidden md:inline">DB &amp; Auth</span></button>
          <button type="button" onClick={()=>setWorkspaceModal("github")} className="flex h-8 items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#0D1322] px-2 text-[10px] text-[#CBD5E1] hover:border-[#2563EB]/50 sm:px-2.5"><Github size={12}/><span className="hidden md:inline">GitHub</span></button>
          <button type="button" onClick={()=>setWorkspaceModal("deploy")} className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-2 text-[10px] font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-[#3B82F6] sm:px-3"><Upload size={12}/><span className="hidden md:inline">Deploy ↑</span></button>
          <Button type="button" size="sm" onClick={() => void openPreview()} disabled={busy || previewBooting} className="h-8 gap-1.5 rounded-md bg-[#10B981] px-3 text-[11px] font-semibold text-[#052E24] hover:bg-[#34D399]"><Play size={12}/><span className="hidden sm:inline">Run</span></Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <WorkspaceControls projectId={projectId} userId={user.id} files={files} onRestore={async (next) => { await saveProjectFiles(projectId, user.id, next); persistedFilesRef.current = next; setFiles(next); setActivePath(Object.keys(next).sort()[0] ?? ""); if (runtimeActiveRef.current) await syncBrowserProject(projectId, withVisualInspector({ ...next, ...binaryAssets })); setSaveStatus("saved"); }} onSave={async () => { await saveProjectFiles(projectId, user.id, files); persistedFilesRef.current = files; setSaveStatus("saved"); }} onReload={async () => { const [next, assets] = await Promise.all([loadProjectFiles(projectId), loadProjectBinaryAssets(projectId, user.id)]); setFiles(next); persistedFilesRef.current = next; setBinaryAssets(assets); setActivePath(Object.keys(next).sort()[0] ?? ""); await syncBrowserProject(projectId, withVisualInspector({ ...next, ...assets })); runtimeActiveRef.current = true; setRuntimeReady(true); setSaveStatus("saved"); }} onPublish={() => void publishProject()} publishing={publishing} publishedUrl={publishedUrl} onFocusChat={() => { document.querySelector<HTMLTextAreaElement>('textarea[placeholder="How can ExpertsTeam help you today?"]')?.focus(); }} modal={workspaceModal} onModalChange={setWorkspaceModal}/>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <BoltChatPanel
          projectName={projectQuery.data.project.name}
          messages={messages}
          prompt={prompt}
          busy={busy}
          onPromptChange={setPrompt}
          onSend={(options) => void sendMessage(options)}
          onAttachImage={(file) => { if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>2_000_000){toast.error("Choose a PNG, JPG or WebP image under 2 MB.");return;} const reader=new FileReader(); reader.onload=()=>{const value=String(reader.result??"");const data=value.split(",")[1];if(data)setAttachedImage({name:file.name,mimeType:file.type as "image/png"|"image/jpeg"|"image/webp",data});};reader.readAsDataURL(file); }}
          attachedImageName={attachedImage?.name}
          onRemoveImage={() => setAttachedImage(null)}
          tutorMode={tutorMode}
          onTutorModeChange={setTutorMode}
          onSelectElement={() => { setTab("preview"); setPreviewVisualEdit(true); }}
          width={chatWidth}
        />
        <div role="separator" aria-label="Resize chat panel" aria-orientation="vertical" tabIndex={0}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (event.buttons === 1) setChatWidth(Math.max(320, Math.min(700, event.clientX - 48)) ); }}
          onKeyDown={(event) => { if (event.key === "ArrowLeft") setChatWidth((value) => Math.max(320, value - 20)); if (event.key === "ArrowRight") setChatWidth((value) => Math.min(700, value + 20)); }}
          className="hidden w-1 shrink-0 cursor-col-resize bg-white/[0.035] transition hover:bg-[#2563EB]/40 focus-visible:bg-[#2563EB]/50 md:block" />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#070B14]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#1E293B] bg-[#0D1322] px-3">
            <div className="flex h-full items-stretch gap-1">
              {([{id:"code",label:"Code",icon:Code2},{id:"preview",label:"Preview",icon:Eye}] as const).map((item) => { const Icon=item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 border-b-2 px-3 text-[11px] transition ${tab===item.id?"border-[#2563EB] text-[#93C5FD]":"border-transparent text-[#94A3B8] hover:text-[#E2E8F0]"}`}><Icon size={13}/>{item.label}</button>; })}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] text-[#94A3B8] sm:inline">{runtimeReady ? "Browser runtime ready" : "Local browser runtime"}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void openTerminal()} disabled={busy} className="h-7 gap-1.5 rounded-md border-white/10 bg-transparent px-2.5 text-[10px] text-[#CBD5E1] hover:bg-white/[0.06] hover:text-white"><SquareTerminal size={12}/>{terminalOpen ? "Hide terminal" : terminalConnected ? "Show terminal" : "Terminal"}</Button>
            </div>
          </div>

          {tab === "preview" && <BoltPreviewPanel
            previewUrl={previewUrl}
            previewPorts={previewPorts}
            selectedPreviewPort={selectedPreviewPort}
            runtimeOutput={runtimeOutput}
            busy={busy}
            booting={previewBooting}
            canRun={filesReady}
            visualEdit={previewVisualEdit}
            onToggleVisualEdit={setPreviewVisualEdit}
            onElementSelected={(details) => { setSelectedElement(details); setPrompt(current => (current ? current + "\n\n" : "") + "Please update the selected element: " + details); toast.success("Element selected. Describe the change and send it in chat."); }}
            onStart={() => void openPreview()}
            onSelectPort={(port) => {
              const selected = previewPorts.find((item) => item.port === port);
              if (selected) {
                setSelectedPreviewPort(port);
                setPreviewUrl(selected.url);
              }
            }}
          />}

          {tab === "code" && <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#1E293B] bg-[#0D1322] max-sm:w-[150px]">
                <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">Files</span><span className="text-[10px] text-[#94A3B8]">{paths.length}</span></div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <BoltFileTree paths={paths} selectedPath={activePath} onSelect={setActivePath}/>
                </div>
              </aside>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0D1322] px-3"><span className="flex min-w-0 items-center gap-2 truncate text-[11px] text-[#CBD5E1]">{activePath ? <><FileCode2 size={13} className="shrink-0 text-[#60A5FA]"/><span className="truncate">{activePath}</span></> : "Select a file"}</span><span className={`flex items-center gap-1.5 text-[10px] ${saveStatus === "saved" ? "text-[#10B981]" : saveStatus === "error" ? "text-rose-300" : "text-[#CBD5E1]"}`}><Save size={11}/>{saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving changes…" : "Save failed"}</span></div>
                {activePath ? <div className="min-h-0 flex-1 overflow-hidden"><CodeMirror value={activeContent} height="100%" theme={oneDark} extensions={[editorLanguage(activePath), expertsEditorTheme]} onChange={(value) => setFiles(current => ({...current,[activePath]:value}))} basicSetup={{ lineNumbers:true, foldGutter:true, highlightActiveLine:true, highlightActiveLineGutter:true, bracketMatching:true, closeBrackets:true, autocompletion:true, indentOnInput:true }} /></div> : <div className="grid flex-1 place-items-center text-[11px] text-[#94A3B8]">Select a file from the explorer</div>}
              </div>
            </div>
            {terminalOpen && <div className="flex h-[30%] min-h-[150px] shrink-0 flex-col border-t border-white/[0.09] bg-[#070B14]">
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/[0.07] px-3 text-[10px] text-[#94A3B8]"><span className="flex items-center gap-2"><TerminalSquare size={12}/> Terminal</span><span>Browser WebContainer</span></div>
              <div ref={terminalHost} className="min-h-0 flex-1 overflow-hidden p-2"/>
            </div>}
          </div>}

        </section>
        </div>
      </div>
    </main>
  );
}
