import { useEffect, useRef, useState, type ReactNode } from "react";

const MONACO_BASE = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";

interface MonacoEditorInstance {
  getValue(): string;
  setValue(value: string): void;
  updateOptions(options: Record<string, unknown>): void;
  onDidChangeModelContent(listener: () => void): { dispose(): void };
  getModel(): MonacoModel | null;
  getSelection(): MonacoSelection | null;
  getPosition(): { lineNumber: number; column: number } | null;
  executeEdits(source: string, edits: Array<{ range: MonacoSelection; text: string; forceMoveMarkers: boolean }>): boolean;
  revealLineInCenter(lineNumber: number): void;
  setPosition(position: { lineNumber: number; column: number }): void;
  focus(): void;
  dispose(): void;
}
interface MonacoSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
interface MonacoModel {
  getValueInRange(range: MonacoSelection): string;
}
interface MonacoApi {
  editor: {
    create(container: HTMLElement, options: Record<string, unknown>): MonacoEditorInstance;
    setModelLanguage(model: unknown, language: string): void;
  };
}
type MonacoAmdRequire = ((modules: string[], callback: () => void) => void) & {
  config(options: { paths: Record<string, string> }): void;
};

declare global {
  interface Window {
    monaco?: MonacoApi;
    require?: MonacoAmdRequire;
    MonacoEnvironment?: { getWorkerUrl?: (moduleId: string, label: string) => string };
  }
}

let monacoLoader: Promise<MonacoApi> | null = null;

function loadMonaco(): Promise<MonacoApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Monaco is only available in the browser."));
  if (window.monaco?.editor) return Promise.resolve(window.monaco);
  if (!monacoLoader) {
    monacoLoader = new Promise((resolve, reject) => {
      const workerMain = MONACO_BASE + "/base/worker/workerMain.js";
      window.MonacoEnvironment = {
        getWorkerUrl: () => {
          const source = "self.MonacoEnvironment={baseUrl:'" + MONACO_BASE + "/'};importScripts('" + workerMain + "');";
          return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        },
      };
      const initialize = () => {
        const amd = window.require;
        if (!amd) {
          reject(new Error("Monaco loader did not initialize."));
          return;
        }
        amd.config({ paths: { vs: MONACO_BASE } });
        amd(["vs/editor/editor.main"], () => {
          if (window.monaco?.editor) resolve(window.monaco);
          else reject(new Error("Monaco editor failed to load."));
        });
      };
      const existing = document.querySelector<HTMLScriptElement>('script[data-experts-monaco-loader="true"]');
      if (existing) {
        if (window.require) initialize();
        else {
          existing.addEventListener("load", initialize, { once: true });
          existing.addEventListener("error", () => reject(new Error("Could not load Monaco from the CDN.")), { once: true });
        }
        return;
      }
      const script = document.createElement("script");
      script.dataset.expertsMonacoLoader = "true";
      script.src = MONACO_BASE + "/loader.js";
      script.async = true;
      script.onload = initialize;
      script.onerror = () => reject(new Error("Could not load Monaco from the CDN."));
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      monacoLoader = null;
      throw error;
    });
  }
  return monacoLoader;
}

function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const languages: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "json", html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    md: "markdown", mdx: "markdown", yaml: "yaml", yml: "yaml", sql: "sql", py: "python", sh: "shell",
    bash: "shell", xml: "xml", svg: "xml", toml: "ini", ini: "ini", go: "go", rs: "rust", java: "java",
    php: "php", graphql: "graphql",
  };
  return languages[extension] ?? "plaintext";
}

export interface MonacoEditorHandle {
  getSelectionText(): string | null;
  replaceSelection(text: string): void;
  revealLine(line: number): void;
}

export function MonacoEditor({
  value,
  filePath,
  editable,
  onChange,
  fallback,
  onEditorReady,
  className = "h-full min-h-0",
}: {
  value: string;
  filePath: string;
  editable: boolean;
  onChange: (value: string) => void;
  fallback: ReactNode;
  onEditorReady?: (editor: MonacoEditorHandle | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const onEditorReadyRef = useRef(onEditorReady);
  const initialValueRef = useRef(value);
  const initialFilePathRef = useRef(filePath);
  const initialEditableRef = useRef(editable);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  onChangeRef.current = onChange;
  onEditorReadyRef.current = onEditorReady;

  useEffect(() => {
    let cancelled = false;
    let changeSubscription: { dispose(): void } | null = null;
    void loadMonaco().then((monaco) => {
      if (cancelled || !containerRef.current) return;
      const editor = monaco.editor.create(containerRef.current, {
        value: initialValueRef.current,
        language: languageForPath(initialFilePathRef.current),
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: true, renderCharacters: false, scale: 0.75 },
        fontSize: 13,
        lineNumbers: "on",
        tabSize: 2,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        bracketPairColorization: { enabled: true },
        readOnly: !initialEditableRef.current,
        padding: { top: 10, bottom: 10 },
      });
      editorRef.current = editor;
      onEditorReadyRef.current?.({
        getSelectionText: () => {
          const selection = editor.getSelection();
          if (!selection || (selection.startLineNumber === selection.endLineNumber && selection.startColumn === selection.endColumn)) return null;
          return editor.getModel()?.getValueInRange(selection) ?? null;
        },
        replaceSelection: (text) => {
          const selection = editor.getSelection();
          if (!selection) return;
          editor.executeEdits("expertsteam-inline-edit", [{ range: selection, text, forceMoveMarkers: true }]);
        },
        revealLine: (line) => {
          const safeLine = Math.max(1, line);
          editor.revealLineInCenter(safeLine);
          editor.setPosition({ lineNumber: safeLine, column: 1 });
          editor.focus();
        },
      });
      changeSubscription = editor.onDidChangeModelContent(() => onChangeRef.current(editor.getValue()));
      setLoaded(true);
    }).catch((error: unknown) => {
      if (!cancelled) {
        setFailed(true);
        console.warn("[ExpertsTeam Monaco] Falling back to CodeMirror:", error);
      }
    });
    return () => {
      cancelled = true;
      changeSubscription?.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
      onEditorReadyRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = window.monaco;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, languageForPath(filePath));
    editor.updateOptions({ readOnly: !editable });
  }, [filePath, editable]);

  return (
    <div className={className + " relative min-h-0 min-w-0"}>
      <div ref={containerRef} className={loaded ? "h-full min-h-0 w-full" : "hidden"} />
      {!loaded && <div className="h-full min-h-0 w-full">{fallback}</div>}
      {failed && <span className="sr-only">Monaco is unavailable; CodeMirror is active.</span>}
    </div>
  );
}
