/* eslint-disable no-control-regex */
import { WebContainer, configureAPIKey, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";

export type BrowserPreviewPort = { port: number; url: string; ready: boolean };

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

export function isGeneratedVitePreviewManifest(content: string | undefined): boolean {
  if (!content) return false;
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    const scripts = value.scripts as Record<string, unknown> | undefined;
    const devDependencies = value.devDependencies as Record<string, unknown> | undefined;
    const dependencies = value.dependencies as Record<string, unknown> | undefined;
    return value.private === true
      && value.type === "module"
      && scripts?.dev === "vite --host 0.0.0.0"
      && Object.keys(scripts).length === 1
      && devDependencies?.vite === "^6.4.6"
      && Object.keys(devDependencies).length === 1
      && (!dependencies || Object.keys(dependencies).length === 0)
      && Object.keys(value).every((key) => ["private", "type", "scripts", "devDependencies"].includes(key));
  } catch {
    return false;
  }
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
  onPreviewPorts?: (ports: BrowserPreviewPort[]) => void,
) {
  const runtimeFiles = { ...files };
  let forceCleanInstall = false;
  // Vite 8 uses Rolldown. Its WASI fallback can exhaust WebContainer's
  // WebAssembly memory and fail before the preview server starts. Use the
  // WebContainer-compatible Vite 6/esbuild toolchain inside the isolated
  // runtime only; never rewrite the user's saved project manifest.
  if (typeof runtimeFiles["package.json"] === "string") {
    try {
      const manifest = JSON.parse(runtimeFiles["package.json"]) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const viteSection = manifest.devDependencies?.vite ? "devDependencies"
        : manifest.dependencies?.vite ? "dependencies" : null;
      const viteVersion = viteSection ? manifest[viteSection]?.vite ?? "" : "";
      if (viteSection && /^(?:\^|~|>=)?\s*8(?:\.|$)/.test(viteVersion)) {
        manifest[viteSection]!.vite = "^6.4.6";
        runtimeFiles["package.json"] = JSON.stringify(manifest, null, 2) + "\n";
        for (const lockfile of ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]) {
          delete runtimeFiles[lockfile];
        }
        forceCleanInstall = true;
        onOutput?.("\r\nVite 8/Rolldown detected. Using Vite 6 in the WebContainer runtime to avoid WASI memory exhaustion; your saved project files are unchanged.\r\n");
      }
    } catch {
      // The normal manifest validation below will show the actionable error.
    }
  }
  // Older preview code persisted a synthetic Vite manifest into otherwise
  // static HTML projects. Remove that exact generated manifest before syncing
  // or classifying the project; never remove a real user-authored manifest.
  if (runtimeFiles["index.html"] && isGeneratedVitePreviewManifest(
    typeof runtimeFiles["package.json"] === "string" ? runtimeFiles["package.json"] : undefined,
  )) {
    delete runtimeFiles["package.json"];
  }
  await syncBrowserProject(projectId, runtimeFiles);
  const runtime = await getBrowserRuntime();
  if (forceCleanInstall) {
    await runtime.fs.rm(runtime.workdir + "/node_modules", { recursive: true, force: true });
    runtimeState.installedDependencySignature = null;
  }
  runtimeState.previewPortUnsubscribe?.();
  runtimeState.previewPortUnsubscribe = null;
  runtimeState.devProcess?.kill();
  runtimeState.devProcess = null;

  let packageJson: { packageManager?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  const packageContent = runtimeFiles["package.json"];
  if (packageContent && typeof packageContent !== "string") throw new Error("package.json must be a text file.");
  if (packageContent) {
    try { packageJson = JSON.parse(packageContent); }
    catch { throw new Error("package.json contains invalid JSON. Fix it before starting the preview."); }
  }

  // Static HTML/CSS/JS projects need no npm manifest or dependency install.
  const hasStaticEntry = Boolean(runtimeFiles["index.html"] || runtimeFiles["public/index.html"]);
  const hasRunScript = Boolean(packageJson.scripts?.dev || packageJson.scripts?.start);
  const hasDependencies = Boolean(
    Object.keys(packageJson.dependencies ?? {}).length ||
    Object.keys(packageJson.devDependencies ?? {}).length
  );
  const useStaticServer = hasStaticEntry && !hasRunScript && !hasDependencies;
  let commandToRun = "npm";
  let args: string[] = [];

  if (useStaticServer) {
    const staticServer = [
      "const http = require('node:http');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const root = process.cwd();",
      "const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon' };",
      "http.createServer((req,res) => {",
      "  let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }",
      "  let target = path.resolve(root, '.' + pathname);",
      "  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }",
      "  try { if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html'); } catch {}",
      "  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) target = path.join(root, 'index.html');",
      "  if (!fs.existsSync(target)) { res.writeHead(404); return res.end('Not found'); }",
      "  res.setHeader('Content-Type', types[path.extname(target).toLowerCase()] || 'application/octet-stream');",
      "  fs.createReadStream(target).pipe(res);",
      "}).listen(4173, '0.0.0.0', () => console.log('Static project ready on port 4173'));",
    ].join("\n");
    commandToRun = "node";
    args = ["-e", staticServer];
    onOutput?.("\r\nPlain HTML project detected. Skipping npm installation; starting the built-in static server…\r\n");
  } else {
    if (!packageContent) throw new Error("This project has no package.json or plain HTML entry point (index.html).");
    if (!hasRunScript) throw new Error("This project has dependencies but no dev or start script in package.json.");

    // Use one explicit project root for filesystem checks, npm, and the dev server.
    await runtime.fs.mkdir(runtime.workdir, { recursive: true });
    const manifestPath = runtime.workdir.replace(/\/$/, "") + "/package.json";
    const runtimeManifest = await runtime.fs.readFile(manifestPath, "utf-8").catch(() => "");
    if (!runtimeManifest) {
      const entries = await runtime.fs.readdir(runtime.workdir).catch(() => []);
      throw new Error(
        "Project root mismatch: npm's working directory is " + runtime.workdir +
        " but package.json is not present there. Root entries: " +
        entries.map((entry) => typeof entry === "string" ? entry : String(entry)).join(", ")
      );
    }
    try { packageJson = JSON.parse(runtimeManifest); }
    catch { throw new Error("The package.json in the browser runtime is not valid JSON."); }

    const packageManager = packageJson.packageManager?.split("@")[0]
      || (runtimeFiles["pnpm-lock.yaml"] ? "pnpm" : runtimeFiles["yarn.lock"] ? "yarn" : "npm");
    const packageManagerCommand = packageManager === "pnpm" || packageManager === "yarn" ? packageManager : "npm";
    commandToRun = packageManagerCommand;
    const installSignature = dependencySignature(packageManagerCommand, runtimeFiles);
    const dependenciesPresent = await hasInstalledDependencies(runtime);
    if (!dependenciesPresent || runtimeState.installedDependencySignature !== installSignature) {
      const hasNpmLock = Boolean(runtimeFiles["package-lock.json"] || runtimeFiles["npm-shrinkwrap.json"]);
      const hasPnpmLock = Boolean(runtimeFiles["pnpm-lock.yaml"]);
      const hasYarnLock = Boolean(runtimeFiles["yarn.lock"]);
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
      onOutput?.("Project directory: " + runtime.workdir + "\r\n");
      onOutput?.("Verified package.json in the exact npm working directory. Starting dependency installation…\r\n");
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
    args = packageManagerCommand === "yarn"
      ? [startScript, ...(runArgs.length > 2 ? runArgs.slice(2) : [])]
      : runArgs;
  }

  let readyTimer = 0;
  let activePreviewPort: number | null = null;
  let failReady: ((error: Error) => void) | null = null;
  const availablePorts = new Map<number, BrowserPreviewPort>();
  const publishPorts = () => onPreviewPorts?.(
    [...availablePorts.values()].sort((left, right) => left.port - right.port),
  );
  const ready = new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(readyTimer);
      unsubscribeReady();
      unsubscribeError();
    };
    failReady = (error) => { cleanup(); reject(error); };
    const unsubscribeReady = runtime.on("server-ready", (port, url) => {
      activePreviewPort = port;
      const known = availablePorts.get(port);
      availablePorts.set(port, { port, url, ready: true });
      publishPorts();
      onPreviewUrl?.(url);
      cleanup();
      resolve(known?.url ?? url);
    });
    const unsubscribeError = runtime.on("error", ({ message }) => {
      cleanup();
      reject(new Error(message));
    });
    // Match Bolt's preview store: retain every open port and remove it only
    // when WebContainer reports close. Apps can expose multiple preview ports.
    runtimeState.previewPortUnsubscribe = runtime.on("port", (port, type, url) => {
      if (type === "close") {
        availablePorts.delete(port);
        publishPorts();
        if (activePreviewPort === port) {
          const fallback = [...availablePorts.values()].find((item) => item.ready);
          activePreviewPort = fallback?.port ?? null;
          onPreviewUrl?.(fallback?.url ?? null);
        }
        return;
      }
      availablePorts.set(port, { port, url, ready: type === "open" });
      if (activePreviewPort === null && type === "open") {
        activePreviewPort = port;
        onPreviewUrl?.(url);
      } else if (activePreviewPort === port) {
        onPreviewUrl?.(url);
      }
      publishPorts();
    });
    readyTimer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The development server did not become ready. Check the terminal output for build errors."));
    }, 120000);
  });
  try {
    runtimeState.devProcess = await runtime.spawn(commandToRun, args, { cwd: runtime.workdir, env: environment });
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
  return { url, runtime, ports: [...availablePorts.values()].sort((left, right) => left.port - right.port) };
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
  const process = await runtime.spawn("/bin/jsh", ["--osc"], {
    terminal: {
      cols: dimensions.cols || 80,
      rows: dimensions.rows || 15,
    },
  });
  runtimeState.shellProcess = process;

  const writer = process.input.getWriter();
  const reader = process.output.getReader();
  let interactive = false;
  let handshakeBuffer = "";
  let resolveInteractive!: () => void;
  const interactiveReady = new Promise<void>((resolve) => {
    resolveInteractive = resolve;
  });

  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        // OSC sequences may be split across WebContainer output chunks.
        // Keep a short tail until Bolt's JSH interactive marker is complete.
        if (!interactive) {
          handshakeBuffer = (handshakeBuffer + value).slice(-128);
          if (/\x1b\]654;interactive\x07/.test(handshakeBuffer)) {
            interactive = true;
            resolveInteractive();
            handshakeBuffer = "";
          }
        }
        onOutput(value);
      }
    } catch {
      // Shell closed.
    }
  })();

  let handshakeTimer: number | undefined;
  try {
    await Promise.race([
      interactiveReady,
      new Promise<never>((_, reject) => {
        handshakeTimer = window.setTimeout(
          () => reject(new Error("The browser shell did not enter interactive mode.")),
          15000,
        );
      }),
    ]);
  } catch (error) {
    process.kill();
    if (runtimeState.shellProcess === process) runtimeState.shellProcess = null;
    writer.releaseLock();
    throw error;
  } finally {
    if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer);
  }

  return {
    write: (value: string) => {
      if (interactive) void writer.write(value);
    },
    resize: (next: { cols: number; rows: number }) => process.resize(next),
    close: () => {
      process.kill();
      if (runtimeState.shellProcess === process) runtimeState.shellProcess = null;
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
