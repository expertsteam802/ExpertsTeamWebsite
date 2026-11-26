import { WebContainer, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";

let bootPromise: Promise<WebContainer> | null = null;
let activeProjectId: string | null = null;
let activePaths = new Set<string>();
let devProcess: WebContainerProcess | null = null;
let shellProcess: WebContainerProcess | null = null;
let syncQueue: Promise<void> = Promise.resolve();

export function getBrowserRuntime() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The browser runtime can only start in a browser tab."));
  }
  if (!window.isSecureContext) {
    return Promise.reject(new Error("Browser preview requires a secure HTTPS connection."));
  }
  if (!("SharedArrayBuffer" in window) || !window.crossOriginIsolated) {
    return Promise.reject(new Error("This page is not cross-origin isolated. Reload Agent Studio after the WebContainer security headers have been deployed."));
  }
  if (!bootPromise) {
    bootPromise = WebContainer.boot({ workdirName: "experts-project", forwardPreviewErrors: "exceptions-only" }).catch((error) => {
      bootPromise = null;
      throw error;
    });
  }
  return bootPromise;
}

function normalizePath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("The project contains an invalid file path: " + path);
  }
  return parts.join("/");
}

function toFileTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [rawPath, contents] of Object.entries(files)) {
    const parts = normalizePath(rawPath).split("/");
    let cursor = tree;
    for (const part of parts.slice(0, -1)) {
      const existing = cursor[part];
      if (!existing) cursor[part] = { directory: {} };
      const node = cursor[part];
      if (!("directory" in node)) throw new Error("A project file conflicts with a directory: " + rawPath);
      cursor = node.directory;
    }
    cursor[parts[parts.length - 1]] = { file: { contents } };
  }
  return tree;
}

async function clearRuntimeFiles() {
  const runtime = await getBrowserRuntime();
  const entries = await runtime.fs.readdir(runtime.workdir);
  await Promise.all(entries.map(async (entry) => {
    const name = typeof entry === "string" ? entry : String(entry);
    await runtime.fs.rm(runtime.workdir + "/" + name, { recursive: true, force: true });
  }));
}

export async function syncBrowserProject(projectId: string, files: Record<string, string>) {
  syncQueue = syncQueue.then(async () => {
    const runtime = await getBrowserRuntime();
    if (activeProjectId !== projectId) {
      devProcess?.kill();
      shellProcess?.kill();
      devProcess = null;
      shellProcess = null;
      await clearRuntimeFiles();
      await runtime.mount(toFileTree(files));
      activeProjectId = projectId;
      activePaths = new Set(Object.keys(files).map(normalizePath));
      return;
    }

    const nextPaths = new Set(Object.keys(files).map(normalizePath));
    for (const previousPath of activePaths) {
      if (!nextPaths.has(previousPath)) {
        await runtime.fs.rm(runtime.workdir + "/" + previousPath, { recursive: true, force: true });
      }
    }
    for (const [path, contents] of Object.entries(files)) {
      const safePath = normalizePath(path);
      const parent = safePath.split("/").slice(0, -1).join("/");
      if (parent) await runtime.fs.mkdir(runtime.workdir + "/" + parent, { recursive: true });
      await runtime.fs.writeFile(runtime.workdir + "/" + safePath, contents);
    }
    activePaths = nextPaths;
  });
  return syncQueue;
}

async function runCommand(
  runtime: WebContainer,
  command: string,
  args: string[],
  onOutput?: (chunk: string) => void,
) {
  const process = await runtime.spawn(command, args);
  const reader = process.output.getReader();
  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onOutput?.(value);
      }
    } catch {
      // Process termination closes the output stream.
    }
  })();
  const exitCode = await process.exit;
  if (exitCode !== 0) throw new Error(command + " exited with code " + exitCode + ".");
}

export async function startBrowserPreview(
  projectId: string,
  files: Record<string, string>,
  onOutput?: (chunk: string) => void,
) {
  await syncBrowserProject(projectId, files);
  const runtime = await getBrowserRuntime();
  devProcess?.kill();
  devProcess = null;

  let packageJson: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    packageJson = JSON.parse(files["package.json"] ?? "{}");
  } catch {
    throw new Error("package.json contains invalid JSON. Fix it before starting the preview.");
  }

  if (!files["package.json"]) {
    const starterPackage = {
      private: true,
      type: "module",
      scripts: { dev: "vite --host 0.0.0.0" },
      devDependencies: { vite: "^6.4.1" },
    };
    await runtime.fs.writeFile(runtime.workdir + "/package.json", JSON.stringify(starterPackage, null, 2));
    if (!files["index.html"]) {
      await runtime.fs.writeFile(runtime.workdir + "/index.html", '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ExpertsTeam Preview</title></head><body><h1>Project preview</h1></body></html>');
    }
    packageJson = starterPackage;
  }

  if (!packageJson.scripts?.dev && !packageJson.scripts?.start) {
    throw new Error("This project has no dev or start script in package.json. Add a development script to run it.");
  }

  onOutput?.("\r\nInstalling project dependencies…\r\n");
  await runCommand(runtime, "npm", ["install", "--no-audit", "--no-fund"], onOutput);

  const startScript = packageJson.scripts?.dev ? "dev" : "start";
  const isNext = /next/i.test((packageJson.dependencies?.next ?? packageJson.devDependencies?.next) || "");
  const args = startScript === "dev"
    ? ["run", startScript, "--", ...(isNext ? ["--hostname", "0.0.0.0"] : ["--host", "0.0.0.0"])]
    : ["run", startScript];
  let readyTimer = 0;
  const ready = new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(readyTimer);
      unsubscribeReady();
      unsubscribeError();
    };
    const unsubscribeReady = runtime.on("server-ready", (_port, url) => {
      cleanup();
      resolve(url);
    });
    const unsubscribeError = runtime.on("error", ({ message }) => {
      cleanup();
      reject(new Error(message));
    });
    readyTimer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The development server did not become ready. Check the terminal output for build errors."));
    }, 120000);
  });
  devProcess = await runtime.spawn("npm", args);
  const reader = devProcess.output.getReader();
  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onOutput?.(value);
      }
    } catch {
      // Server stopped.
    }
  })();
  const url = await ready;
  return { url, runtime };
}

export async function openBrowserTerminal(
  onOutput: (chunk: string) => void,
  dimensions: { cols: number; rows: number },
) {
  const runtime = await getBrowserRuntime();
  shellProcess?.kill();
  shellProcess = await runtime.spawn("jsh", [], { terminal: dimensions });
  const writer = shellProcess.input.getWriter();
  const reader = shellProcess.output.getReader();
  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onOutput(value);
      }
    } catch {
      // Shell closed.
    }
  })();
  return {
    write: (value: string) => writer.write(value),
    resize: (next: { cols: number; rows: number }) => shellProcess?.resize(next),
    close: () => {
      shellProcess?.kill();
      shellProcess = null;
      writer.releaseLock();
    },
  };
}

export function stopBrowserPreview() {
  devProcess?.kill();
  devProcess = null;
}
