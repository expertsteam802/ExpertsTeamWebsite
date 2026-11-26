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
  installedDependencySignature: string | null;
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
  installedDependencySignature: null,
};

if (import.meta.hot) {
  import.meta.hot.data.expertsTeamRuntime = runtimeState;
}

function explainBootFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/service.?worker|storage|cookie|partition|securityerror|not allowed/i.test(message)) {
    return new Error("This browser blocked a Service Worker or isolated-storage request required by WebContainers. The runtime cannot override browser privacy protections. Your project files remain safely saved in Supabase; try again in a supported browser profile.");
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
      runtimeState.previewPortUnsubscribe?.();
      runtimeState.previewPortUnsubscribe = null;
      runtimeState.devProcess?.kill();
      runtimeState.shellProcess?.kill();
      runtimeState.devProcess = null;
      runtimeState.shellProcess = null;
      await clearRuntimeFiles();
      // Write directly into workdir so npm's default cwd always contains the project.
      for (const [rawPath, contents] of Object.entries(files)) {
        const safePath = normalizePath(rawPath);
        const parent = safePath.split("/").slice(0, -1).join("/");
        if (parent) await runtime.fs.mkdir(runtime.workdir + "/" + parent, { recursive: true });
        await runtime.fs.writeFile(runtime.workdir + "/" + safePath, contents);
      }
      runtimeState.activeProjectId = projectId;
      runtimeState.installedDependencySignature = null;
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
      const previous = runtimeState.lastSyncedFiles.get(safePath);
      const unchanged = typeof contents === "string"
        ? previous === contents
        : previous instanceof Uint8Array
          && previous.byteLength === contents.byteLength
          && previous.every((byte, index) => byte === contents[index]);
      // The in-memory sync cache can outlive an HMR update even if an earlier
      // mount placed files outside workdir. Confirm the actual file exists.
      let existsInWorkdir = true;
      try {
        await runtime.fs.readFile(runtime.workdir + "/" + safePath);
      } catch {
        existsInWorkdir = false;
      }
      if (unchanged && existsInWorkdir) continue;
      const parent = safePath.split("/").slice(0, -1).join("/");
      if (parent) await runtime.fs.mkdir(runtime.workdir + "/" + parent, { recursive: true });
      await runtime.fs.writeFile(runtime.workdir + "/" + safePath, contents);
      runtimeState.lastSyncedFiles.set(safePath, contents);
    }
    runtimeState.activePaths = nextPaths;
  });
  return runtimeState.syncQueue;
}

function dependencySignature(
  packageManager: string,
  files: BrowserProjectFiles,
) {
  // Hash only dependency manifests/lockfiles. Source edits should not trigger a
  // full install, and the hash avoids retaining a second copy of large lockfiles.
  let hash = 2166136261;
  const inputs = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"];
  for (const path of inputs) {
    const value = files[path];
    const text = typeof value === "string" ? value : "";
    const input = path + "\\0" + text + "\\0";
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return packageManager + ":" + (hash >>> 0).toString(16);
}

async function hasInstalledDependencies(runtime: WebContainer) {
  try {
    const entries = await runtime.fs.readdir(runtime.workdir + "/node_modules");
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function runCommand(
  runtime: WebContainer,
  command: string,
  args: string[],
  onOutput?: (chunk: string) => void,
) {
  // Keep package-manager output readable in every terminal renderer. Progress
  // bars and ANSI cursor-control sequences otherwise appear as stray symbols
  // in plain-text logs and can look corrupted in embedded terminals.
  const process = await runtime.spawn(command, args, {
    cwd: runtime.workdir,
    env: {
      CI: "true",
      TERM: "dumb",
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      npm_config_progress: "false",
      npm_config_color: "false",
      npm_config_fund: "false",
      npm_config_audit: "false",
    },
  });
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
  onPreviewUrl?: (url: string | null) => void,
) {
  await syncBrowserProject(projectId, files);
  const runtime = await getBrowserRuntime();
  runtimeState.previewPortUnsubscribe?.();
  runtimeState.previewPortUnsubscribe = null;
  runtimeState.devProcess?.kill();
  runtimeState.devProcess = null;

  let packageJson: { packageManager?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
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

  // Repair and verify the exact manifest npm will read. Never start npm
  // against an empty or stale working directory.
  await runtime.fs.mkdir(runtime.workdir, { recursive: true });
  const manifestPath = runtime.workdir.replace(/\/$/, "") + "/package.json";
  let runtimeManifest = "";
  try {
    runtimeManifest = await runtime.fs.readFile(manifestPath, "utf-8");
  } catch {
    const sourceManifest = files["package.json"];
    if (typeof sourceManifest === "string" && sourceManifest.length > 0) {
      await runtime.fs.writeFile(manifestPath, sourceManifest);
      runtimeManifest = await runtime.fs.readFile(manifestPath, "utf-8");
    }
  }
  if (!runtimeManifest) {
    const entries = await runtime.fs.readdir(runtime.workdir).catch(() => []);
    throw new Error(
      "Cannot install dependencies: package.json is missing from the browser project directory (" +
      runtime.workdir + "). Files currently present: " +
      entries.map((entry) => typeof entry === "string" ? entry : String(entry)).join(", ")
    );
  }
  try {
    packageJson = JSON.parse(runtimeManifest);
  } catch {
    throw new Error("The package.json in the browser runtime is not valid JSON.");
  }

  if (!packageJson.scripts?.dev && !packageJson.scripts?.start) {
    throw new Error("This project has no dev or start script in package.json. Add a development script to run it.");
  }

  const packageManager = packageJson.packageManager?.split("@")[0]
    || (files["pnpm-lock.yaml"] ? "pnpm" : files["yarn.lock"] ? "yarn" : "npm");
  const packageManagerCommand = packageManager === "pnpm" || packageManager === "yarn" ? packageManager : "npm";
  const installSignature = dependencySignature(packageManagerCommand, files);
  const dependenciesPresent = await hasInstalledDependencies(runtime);
  if (!dependenciesPresent || runtimeState.installedDependencySignature !== installSignature) {
    const hasNpmLock = Boolean(files["package-lock.json"] || files["npm-shrinkwrap.json"]);
    const hasPnpmLock = Boolean(files["pnpm-lock.yaml"]);
    const hasYarnLock = Boolean(files["yarn.lock"]);
    const packageManagerVersion = packageJson.packageManager?.split("@")[1] ?? "";
    const yarnMajor = Number.parseInt(packageManagerVersion.split(".")[0] ?? "", 10);
    const isYarnBerry = Boolean(files[".yarnrc.yml"]) || (Number.isFinite(yarnMajor) && yarnMajor >= 2);
    const installArgs = packageManagerCommand === "pnpm"
      ? ["install", ...(hasPnpmLock ? ["--frozen-lockfile"] : [])]
      : packageManagerCommand === "yarn"
        ? ["install", ...(hasYarnLock ? [isYarnBerry ? "--immutable" : "--frozen-lockfile"] : [])]
        : hasNpmLock
          ? ["ci", "--no-audit", "--no-fund", "--no-progress", "--no-color"]
          : ["install", "--no-audit", "--no-fund", "--no-progress", "--no-color"];
    onOutput?.("\r\nInstalling project dependencies with " + packageManagerCommand + "…\r\n");
    onOutput?.("Project directory: " + runtime.workdir + "\\n");
    onOutput?.("Verified package.json in the project directory. Starting dependency installation…\\n");
    await runCommand(runtime, packageManagerCommand, installArgs, onOutput);
    runtimeState.installedDependencySignature = installSignature;
  } else {
    onOutput?.("\r\nDependencies are already installed and lockfiles are unchanged; skipping installation.\r\n");
  }

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
  let activePreviewPort: number | null = null;
  let failReady: ((error: Error) => void) | null = null;
  const ready = new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(readyTimer);
      unsubscribeReady();
      unsubscribeError();
    };
    failReady = (error) => { cleanup(); reject(error); };
    const unsubscribeReady = runtime.on("server-ready", (port, url) => {
      activePreviewPort = port;
      onPreviewUrl?.(url);
      cleanup();
      resolve(url);
    });
    const unsubscribeError = runtime.on("error", ({ message }) => {
      cleanup();
      reject(new Error(message));
    });
    // Follow the selected dev-server port only; apps may expose unrelated ports too.
    runtimeState.previewPortUnsubscribe = runtime.on("port", (port, type, url) => {
      if (activePreviewPort === null && type === "open") activePreviewPort = port;
      if (port !== activePreviewPort) return;
      if (type === "close") onPreviewUrl?.(null);
      else onPreviewUrl?.(url);
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
  "coverage", ".turbo", ".cache", ".output", "vendor", ".yarn", ".pnpm-store",
  ".venv", "venv", "__pycache__", "target", ".svelte-kit", ".angular", ".astro",
  ".vite", ".parcel-cache",
]);
const ignoredRuntimeFiles = /^(?:\.env(?:$|\.(?!.*(?:example|sample|template)$).*)|\.npmrc|\.netrc|\.pypirc|id_rsa|id_ed25519|credentials?(?:\..*)?|secrets?(?:\..*)?)$/i;
const binaryRuntimeExtension = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp4|mp3|wav|mov|avi|exe|dll|so|dylib|class|jar|wasm|lockb)$/i;

export async function watchBrowserProject(onFileChange: (path: string, contents: string | null) => void) {
  const runtime = await getBrowserRuntime();
  const rootPath = runtime.workdir;
  const directoryWatchers = new Map<string, { close: () => void }>();
  let closed = false;

  const handleChange = (watchPath: string, event: string, filename: unknown) => {
    if (closed || filename == null) return;
    const rawPath = String(filename).replace(/\\/g, "/").replace(/^\/+/, "");
    const relativePath = watchPath
      ? watchPath.replace(/^\/+/, "") + "/" + rawPath
      : rawPath;
    let path: string;
    try {
      path = normalizePath(relativePath);
    } catch {
      return;
    }

    // Avoid recursively watching node_modules/build output. This is important
    // on low-memory machines because dependency trees can contain thousands
    // of directories and files.
    const segments = path.split("/");
    const fileName = segments[segments.length - 1] ?? "";
    if (segments.some((part) => ignoredRuntimeDirectories.has(part)) || ignoredRuntimeFiles.test(fileName) || binaryRuntimeExtension.test(fileName)) {
      return;
    }

    if (watchPath === "" && event === "rename") {
      void refreshDirectoryWatchers();
    }

    void runtime.fs.readFile(rootPath + "/" + path, "utf-8").then((contents) => {
      if (runtimeState.lastSyncedFiles.get(path) === contents) return;
      runtimeState.lastSyncedFiles.set(path, contents);
      onFileChange(path, contents);
    }).catch(() => {
      if (!runtimeState.lastSyncedFiles.has(path)) return;
      runtimeState.lastSyncedFiles.delete(path);
      onFileChange(path, null);
    });
  };

  const refreshDirectoryWatchers = async () => {
    if (closed) return;
    let entries: Awaited<ReturnType<typeof runtime.fs.readdir>>;
    try {
      entries = await runtime.fs.readdir(rootPath, { withFileTypes: true });
    } catch {
      return;
    }
    const currentDirectories = new Set<string>();
    for (const entry of entries) {
      const rawName = typeof entry.name === "string"
        ? entry.name
        : new TextDecoder().decode(entry.name);
      if (!entry.isDirectory() || ignoredRuntimeDirectories.has(rawName)) continue;
      currentDirectories.add(rawName);
      if (directoryWatchers.has(rawName)) continue;
      const watcher = runtime.fs.watch(rootPath + "/" + rawName, { recursive: true }, (event, filename) => {
        handleChange(rawName, event, filename);
      });
      directoryWatchers.set(rawName, watcher);
    }
    for (const [name, watcher] of directoryWatchers) {
      if (currentDirectories.has(name)) continue;
      watcher.close();
      directoryWatchers.delete(name);
    }
  };

  // Watch root-level files without recursively subscribing to dependency
  // folders, then attach recursive watchers only to real project directories.
  const rootWatcher = runtime.fs.watch(rootPath, (event, filename) => {
    handleChange("", event, filename);
  });
  await refreshDirectoryWatchers();

  return () => {
    closed = true;
    rootWatcher.close();
    for (const watcher of directoryWatchers.values()) watcher.close();
    directoryWatchers.clear();
  };
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
