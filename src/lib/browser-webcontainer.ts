import { WebContainer, configureAPIKey, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";

interface RuntimeState {
  bootPromise: Promise<WebContainer> | null;
  activeProjectId: string | null;
  activePaths: Set<string>;
  lastSyncedFiles: Map<string, string | Uint8Array>;
  devProcess: WebContainerProcess | null;
  shellProcess: WebContainerProcess | null;
  syncQueue: Promise<void>;
  apiKeyConfigured: boolean;
  previewPortUnsubscribe: (() => void) | null;
}

const runtimeState: RuntimeState = import.meta.hot?.data.expertsTeamRuntime ?? {
  bootPromise: null,
  activeProjectId: null,
  activePaths: new Set<string>(),
  lastSyncedFiles: new Map<string, string | Uint8Array>(),
  devProcess: null,
  shellProcess: null,
  syncQueue: Promise.resolve(),
  apiKeyConfigured: false,
  previewPortUnsubscribe: null,
};

if (import.meta.hot) {
  import.meta.hot.data.expertsTeamRuntime = runtimeState;
}

function explainBootFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/service.?worker|storage|cookie|partition|securityerror|not allowed/i.test(message)) {
    return new Error("Your browser blocked the WebContainer project Service Worker or its isolated storage. ExpertsTeam cannot bypass that browser privacy rule. In Chrome, keep the default third-party Storage Partitioning enabled and retry in a normal browser window (not Incognito). Your project files remain safe in Supabase.");
  }
  return error instanceof Error ? error : new Error(message);
}

export function getBrowserRuntime() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The browser runtime can only start in a browser tab."));
  }
  if (!window.isSecureContext) {
    return Promise.reject(new Error("Browser preview requires a secure HTTPS connection."));
  }
  if (!("serviceWorker" in navigator)) {
    return Promise.reject(new Error("This browser does not support Service Workers required by WebContainers."));
  }
  if (!("SharedArrayBuffer" in window) || !window.crossOriginIsolated) {
    return Promise.reject(new Error("This page is not cross-origin isolated. Reload Agent Studio after the WebContainer security headers have been deployed."));
  }
  if (!runtimeState.bootPromise) {
    if (!runtimeState.apiKeyConfigured) {
      const apiKey = import.meta.env.VITE_WEBCONTAINER_API_KEY;
      if (apiKey) configureAPIKey(apiKey);
      runtimeState.apiKeyConfigured = true;
    }
    runtimeState.bootPromise = WebContainer.boot({ workdirName: "experts-project", coep: "require-corp", forwardPreviewErrors: "exceptions-only" }).catch((error) => {
      runtimeState.bootPromise = null;
      throw explainBootFailure(error);
    });
  }
  return runtimeState.bootPromise;
}

function normalizePath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("The project contains an invalid file path: " + path);
  }
  return parts.join("/");
}

type BrowserProjectFiles = Record<string, string | Uint8Array>;

function toFileTree(files: BrowserProjectFiles): FileSystemTree {
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
  await runtime.fs.mkdir(runtime.workdir, { recursive: true });
  const entries = await runtime.fs.readdir(runtime.workdir);
  await Promise.all(entries.map(async (entry) => {
    const name = typeof entry === "string" ? entry : String(entry);
    await runtime.fs.rm(runtime.workdir + "/" + name, { recursive: true, force: true });
  }));
}

export async function syncBrowserProject(projectId: string, files: BrowserProjectFiles) {
  runtimeState.syncQueue = runtimeState.syncQueue.catch(() => undefined).then(async () => {
    const runtime = await getBrowserRuntime();
    if (runtimeState.activeProjectId !== projectId) {
      runtimeState.devProcess?.kill();
      runtimeState.shellProcess?.kill();
      runtimeState.devProcess = null;
      runtimeState.shellProcess = null;
      await clearRuntimeFiles();
      await runtime.fs.mkdir(runtime.workdir, { recursive: true });
      await runtime.mount(toFileTree(files), { mountPoint: runtime.workdir });
      runtimeState.activeProjectId = projectId;
      runtimeState.activePaths = new Set(Object.keys(files).map(normalizePath));
      runtimeState.lastSyncedFiles = new Map(Object.entries(files).map(([path, contents]) => [normalizePath(path), contents]));
      return;
    }

    const nextPaths = new Set(Object.keys(files).map(normalizePath));
    for (const previousPath of runtimeState.activePaths) {
      if (!nextPaths.has(previousPath)) {
        await runtime.fs.rm(runtime.workdir + "/" + previousPath, { recursive: true, force: true });
        runtimeState.lastSyncedFiles.delete(previousPath);
      }
    }
    for (const [path, contents] of Object.entries(files)) {
      const safePath = normalizePath(path);
      const parent = safePath.split("/").slice(0, -1).join("/");
      if (parent) await runtime.fs.mkdir(runtime.workdir + "/" + parent, { recursive: true });
      await runtime.fs.writeFile(runtime.workdir + "/" + safePath, contents);
      runtimeState.lastSyncedFiles.set(safePath, contents);
    }
    runtimeState.activePaths = nextPaths;
  });
  return runtimeState.syncQueue;
}

async function runCommand(
  runtime: WebContainer,
  command: string,
  args: string[],
  onOutput?: (chunk: string) => void,
  onPreviewUrl?: (url: string | null) => void,
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
  files: BrowserProjectFiles,
  environment: Record<string, string> = {},
  onOutput?: (chunk: string) => void,
) {
  await syncBrowserProject(projectId, files);
  const runtime = await getBrowserRuntime();
  runtimeState.previewPortUnsubscribe?.();
  runtimeState.previewPortUnsubscribe = null;
  runtimeState.devProcess?.kill();
  runtimeState.devProcess = null;

  let packageJson: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    const packageContent = files["package.json"];
    if (packageContent && typeof packageContent !== "string") throw new Error("package.json must be a text file.");
    packageJson = JSON.parse(packageContent ?? "{}");
  } catch {
    throw new Error("package.json contains invalid JSON. Fix it before starting the preview.");
  }

  if (!files["package.json"]) {
    const starterPackage = {
      private: true,
      type: "module",
      scripts: { dev: "vite --host 0.0.0.0" },
      devDependencies: { vite: "^6.4.6" },
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

  const packageManager = packageJson.packageManager?.split("@")[0]
    || (files["pnpm-lock.yaml"] ? "pnpm" : files["yarn.lock"] ? "yarn" : "npm");
  const packageManagerCommand = packageManager === "pnpm" || packageManager === "yarn" ? packageManager : "npm";
  const installArgs = packageManagerCommand === "pnpm"
    ? ["install", "--no-frozen-lockfile"]
    : packageManagerCommand === "yarn"
      ? ["install"]
      : ["install", "--no-audit", "--no-fund"];
  onOutput?.("\r\nInstalling project dependencies with " + packageManagerCommand + "…\r\n");
  await runCommand(runtime, packageManagerCommand, installArgs, onOutput);

  const startScript = packageJson.scripts?.dev ? "dev" : "start";
  const isNext = Boolean(packageJson.dependencies?.next || packageJson.devDependencies?.next);
  const devCommand = packageJson.scripts?.dev ?? "";
  const usesHostFlag = /vite|astro|svelte|nuxt|vue-cli-service|webpack-dev-server/i.test(devCommand);
  const runArgs = startScript === "dev" && isNext
    ? ["run", startScript, "--", "--hostname", "0.0.0.0"]
    : startScript === "dev" && usesHostFlag
      ? ["run", startScript, "--", "--host", "0.0.0.0"]
      : ["run", startScript];
  const args = packageManagerCommand === "yarn"
    ? [startScript, ...(runArgs.length > 2 ? runArgs.slice(2) : [])]
    : runArgs;
  let readyTimer = 0;
  let failReady: ((error: Error) => void) | null = null;
  const ready = new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(readyTimer);
      unsubscribeReady();
      unsubscribeError();
    };
    failReady = (error) => { cleanup(); reject(error); };
    const unsubscribeReady = runtime.on("server-ready", (_port, url) => {
      cleanup();
      resolve(url);
    });
    const unsubscribeError = runtime.on("error", ({ message }) => {
      cleanup();
      reject(new Error(message));
    });
    // Follow port opens/closes after initial readiness, including dev-server restarts.
    runtimeState.previewPortUnsubscribe = runtime.on("port", (_port, type, url) => {
      onPreviewUrl?.(type === "open" ? url : null);
    });
    readyTimer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The development server did not become ready. Check the terminal output for build errors."));
    }, 120000);
  });
  try {
    runtimeState.devProcess = await runtime.spawn(packageManagerCommand, args, { env: environment });
  } catch (error) {
    failReady?.(error instanceof Error ? error : new Error(String(error)));
    await ready.catch(() => undefined);
    throw error;
  }
  void runtimeState.devProcess.exit.then((code) => {
    if (code !== 0) failReady?.(new Error("The development server exited with code " + code + " before opening a preview. Check its output above."));
  });
  const reader = runtimeState.devProcess.output.getReader();
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


const ignoredRuntimeDirectories = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".vercel",
  "coverage", ".turbo", ".cache", ".output", "vendor",
]);
const ignoredRuntimeFiles = /^(?:\.env(?:$|\.(?!.*(?:example|sample|template)$).*)|\.npmrc|\.netrc|\.pypirc|id_rsa|id_ed25519|credentials?(?:\..*)?|secrets?(?:\..*)?)$/i;
const binaryRuntimeExtension = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp4|mp3|wav|mov|avi|exe|dll|so|dylib|class|jar|wasm|lockb)$/i;

export async function watchBrowserProject(onFileChange: (path: string, contents: string | null) => void) {
  const runtime = await getBrowserRuntime();
  const watcher = runtime.fs.watch(runtime.workdir, { recursive: true }, (_event, filename) => {
    const rawPath = String(filename).replace(/\\/g, "/");
    const workdirPrefix = runtime.workdir.replace(/^\/+/, "") + "/";
    const relativePath = rawPath.startsWith(workdirPrefix)
      ? rawPath.slice(workdirPrefix.length)
      : rawPath.replace(/^\/+/, "");
    let path: string;
    try {
      path = normalizePath(relativePath);
    } catch {
      return;
    }
    if (runtimeState.lastSyncedFiles.get(path) instanceof Uint8Array) return;
    const segments = path.split("/");
    const fileName = segments[segments.length - 1] ?? "";
    if (segments.some((part) => ignoredRuntimeDirectories.has(part)) || ignoredRuntimeFiles.test(fileName) || binaryRuntimeExtension.test(fileName)) {
      return;
    }

    void runtime.fs.readFile(runtime.workdir + "/" + path, "utf-8").then((contents) => {
      if (runtimeState.lastSyncedFiles.get(path) === contents) return;
      runtimeState.lastSyncedFiles.set(path, contents);
      onFileChange(path, contents);
    }).catch(() => {
      if (!runtimeState.lastSyncedFiles.has(path)) return;
      runtimeState.lastSyncedFiles.delete(path);
      onFileChange(path, null);
    });
  });
  return () => watcher.close();
}

export async function openBrowserTerminal(
  onOutput: (chunk: string) => void,
  dimensions: { cols: number; rows: number },
) {
  const runtime = await getBrowserRuntime();
  runtimeState.shellProcess?.kill();
  runtimeState.shellProcess = await runtime.spawn("jsh", [], { terminal: dimensions });
  const writer = runtimeState.shellProcess.input.getWriter();
  const reader = runtimeState.shellProcess.output.getReader();
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
    resize: (next: { cols: number; rows: number }) => runtimeState.shellProcess?.resize(next),
    close: () => {
      runtimeState.shellProcess?.kill();
      runtimeState.shellProcess = null;
      writer.releaseLock();
    },
  };
}

export function stopBrowserPreview() {
  runtimeState.previewPortUnsubscribe?.();
  runtimeState.previewPortUnsubscribe = null;
  runtimeState.devProcess?.kill();
  runtimeState.devProcess = null;
}
