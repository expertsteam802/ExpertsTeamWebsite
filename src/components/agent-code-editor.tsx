import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  Download,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonacoEditor } from "@/components/monaco-editor";
import { STARTER_FILES, type ProjectFiles } from "@/lib/sandbox";

const WORKSPACE_KEY = "expertsteam-agent-studio-editor-v1";

function readWorkspace(): ProjectFiles {
  if (typeof window === "undefined") return { ...STARTER_FILES };
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return { ...STARTER_FILES };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...STARTER_FILES };
    const files = Object.fromEntries(
      Object.entries(parsed).filter(([path, value]) =>
        typeof value === "string" && path.length > 0 && !path.startsWith("/") && !path.split("/").includes(".."),
      ),
    );
    return Object.keys(files).length ? files : { ...STARTER_FILES };
  } catch {
    return { ...STARTER_FILES };
  }
}

function languageLabel(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const labels: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React",
    html: "HTML", css: "CSS", scss: "SCSS", json: "JSON", md: "Markdown",
    py: "Python", sql: "SQL", yml: "YAML", yaml: "YAML", svg: "SVG",
  };
  return labels[extension] ?? "Plain Text";
}

function fileIcon(path: string) {
  return /\.(tsx?|jsx?|html|css|json|py|sql|svg|md)$/i.test(path) ? FileCode2 : File;
}

function downloadFile(path: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = path.split("/").pop() || "file.txt";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AgentCodeEditor() {
  const [files, setFiles] = useState<ProjectFiles>(() => readWorkspace());
  const [activePath, setActivePath] = useState(() => Object.keys(readWorkspace()).sort()[0] ?? "index.html");
  const [openPaths, setOpenPaths] = useState<string[]>(() => Object.keys(readWorkspace()).sort().slice(0, 3));
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [filter, setFilter] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState("");

  const paths = useMemo(
    () => Object.keys(files).sort((a, b) => a.localeCompare(b)),
    [files],
  );
  const activeContent = files[activePath] ?? "";

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(files));
      setSavedAt(new Date());
      setSaveError("");
    } catch {
      setSaveError("Could not save in this browser. Export your files to keep a backup.");
    }
  }, [files]);

  const openFile = useCallback((path: string) => {
    setActivePath(path);
    setOpenPaths((current) => current.includes(path) ? current : [...current, path]);
  }, []);

  const updateActiveFile = useCallback((value: string) => {
    setFiles((current) => ({ ...current, [activePath]: value }));
  }, [activePath]);

  const createFile = useCallback(() => {
    const path = newFileName.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) return;
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      openFile(path);
      setNewFileName("");
      setShowNewFile(false);
      return;
    }
    setFiles((current) => ({ ...current, [path]: "" }));
    openFile(path);
    setNewFileName("");
    setShowNewFile(false);
  }, [files, newFileName, openFile]);

  const closeTab = useCallback((path: string) => {
    setOpenPaths((current) => {
      const next = current.filter((item) => item !== path);
      if (activePath === path && next.length) setActivePath(next[next.length - 1]!);
      return next;
    });
  }, [activePath]);

  const deleteActiveFile = useCallback(() => {
    if (!activePath || paths.length <= 1) return;
    const nextFiles = { ...files };
    delete nextFiles[activePath];
    const nextPaths = paths.filter((path) => path !== activePath);
    setFiles(nextFiles);
    setOpenPaths((current) => current.filter((path) => path !== activePath));
    setActivePath(nextPaths[0] ?? "");
  }, [activePath, files, paths]);

  const exportWorkspace = useCallback(() => {
    const payload = JSON.stringify(files, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "expertsteam-workspace.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [files]);

  const visiblePaths = paths.filter((path) => path.toLowerCase().includes(filter.toLowerCase()));

  return (
    <main className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#0b0e14] text-slate-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#10141d] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 text-blue-300"><Code2 size={16} /></div>
          <span className="truncate text-sm font-semibold">Agent Studio</span>
          <span className="hidden rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 sm:inline">Code Editor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {saveError || (savedAt ? "Saved on this device" : "Saving…")}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-slate-300 hover:bg-white/10 hover:text-white" onClick={exportWorkspace}>
            <Download size={14} /><span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#0e121a] sm:w-[260px]">
          <div className="flex h-10 items-center justify-between border-b border-white/10 px-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <FolderOpen size={14} /> Explorer
            </div>
            <button type="button" aria-label="Create file" title="Create file" onClick={() => setShowNewFile((value) => !value)} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
              <FilePlus2 size={15} />
            </button>
          </div>
          <div className="border-b border-white/10 p-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files" className="h-8 border-white/10 bg-[#090c12] pl-8 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-blue-500/40" />
            </div>
          </div>
          {showNewFile && (
            <form className="flex gap-1 border-b border-white/10 p-2" onSubmit={(event) => { event.preventDefault(); createFile(); }}>
              <Input autoFocus value={newFileName} onChange={(event) => setNewFileName(event.target.value)} placeholder="src/App.tsx" className="h-8 min-w-0 border-white/10 bg-[#090c12] text-xs" />
              <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!newFileName.trim()}><FilePlus2 size={14} /></Button>
            </form>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            <div className="flex items-center gap-2 px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              <Folder size={13} /> Workspace
            </div>
            {visiblePaths.length ? visiblePaths.map((path) => {
              const Icon = fileIcon(path);
              const selected = activePath === path;
              return (
                <button key={path} type="button" onClick={() => openFile(path)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${selected ? "bg-blue-500/15 text-blue-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                  <Icon size={14} className={selected ? "text-blue-300" : "text-slate-500"} />
                  <span className="truncate">{path}</span>
                </button>
              );
            }) : <p className="px-3 py-3 text-xs text-slate-600">No matching files</p>}
          </div>
          <div className="border-t border-white/10 px-3 py-2 text-[10px] text-slate-600">{paths.length} files · Local workspace</div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#0b0e14]">
          <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-white/10 bg-[#10141d]">
            {openPaths.map((path) => {
              const selected = path === activePath;
              const Icon = fileIcon(path);
              return (
                <div key={path} className={`group flex shrink-0 items-center border-r border-white/10 ${selected ? "border-t-2 border-t-blue-400 bg-[#0b0e14]" : "border-t-2 border-t-transparent"}`}>
                  <button type="button" onClick={() => setActivePath(path)} className={`flex h-full items-center gap-2 px-3 text-xs ${selected ? "text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>
                    <Icon size={13} />{path.split("/").pop()}
                  </button>
                  <button type="button" aria-label={`Close ${path}`} onClick={() => closeTab(path)} className="mr-2 rounded p-1 text-slate-600 opacity-0 hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100 focus:opacity-100">
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {activePath ? (
            <>
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/5 px-3 text-[11px] text-slate-500">
                <div className="min-w-0 truncate">{activePath}</div>
                <div className="flex shrink-0 items-center gap-3">
                  <span>{languageLabel(activePath)}</span>
                  <button type="button" title="Download current file" aria-label="Download current file" onClick={() => downloadFile(activePath, activeContent)} className="hover:text-white"><Download size={13} /></button>
                  <button type="button" title="Delete current file" aria-label="Delete current file" disabled={paths.length <= 1} onClick={deleteActiveFile} className="hover:text-rose-300 disabled:opacity-30"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <MonacoEditor
                  value={activeContent}
                  filePath={activePath}
                  editable
                  onChange={updateActiveFile}
                  className="h-full min-h-0"
                  fallback={
                    <CodeMirror
                      value={activeContent}
                      height="100%"
                      theme={oneDark}
                      extensions={[EditorView.lineWrapping]}
                      onChange={updateActiveFile}
                      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, tabSize: 2 }}
                      className="h-full text-[13px]"
                    />
                  }
                />
              </div>
              <footer className="flex h-7 shrink-0 items-center justify-between border-t border-white/10 bg-[#10141d] px-3 text-[10px] text-slate-500">
                <span>ExpertsTeam Editor</span>
                <span>{activeContent.split("\n").length} lines · UTF-8</span>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Code2 size={34} className="text-slate-700" />
              <p className="text-sm text-slate-400">Open a file to start editing</p>
              <Button type="button" size="sm" onClick={() => setShowNewFile(true)} className="gap-2"><FilePlus2 size={14} /> New file</Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
