import { createHash, randomBytes, randomUUID } from "node:crypto";
import { posix as path } from "node:path";
import { Daytona } from "@daytona/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AgentProjectFiles = Record<string, string>;

const META_FILE = ".experts-agent-files.json";
const BRIDGE_DIR = ".experts-terminal-bridge";
const TOKEN_FILE = ".experts-terminal-token";
const TERMINAL_PORT = 4175;
const WORKSPACE_IDLE_MINUTES = 30;

type CliName = "kilo" | "opencode" | "aider";
type CommandResponse = { result?: string; artifacts?: { stdout?: string }; exitCode?: number };
type DaytonaSandbox = {
  name?: string;
  state?: string;
  start: (timeout?: number) => Promise<void>;
  stop: () => Promise<void>;
  setAutostopInterval?: (interval: number) => Promise<void>;
  setAutoDeleteInterval?: (interval: number) => Promise<void>;
  setPublic?: (isPublic: boolean) => Promise<void>;
  refreshActivity?: () => Promise<void>;
  getWorkDir?: () => Promise<string>;
  getPreviewLink: (port: number) => Promise<{ url: string }>;
  fs: {
    downloadFile: (filePath: string) => Promise<Buffer>;
    uploadFile: (file: Buffer, filePath: string) => Promise<void>;
    uploadFiles: (files: Array<{ destination: string; source: Buffer }>) => Promise<void>;
  };
  process: {
    executeCommand: (script: string, cwd?: string, env?: Record<string, string>, timeout?: number) => Promise<CommandResponse>;
  };
};
type DaytonaApi = {
  get: (name: string) => Promise<DaytonaSandbox>;
  list: () => AsyncIterable<DaytonaSandbox>;
  create: (options: Record<string, unknown>) => Promise<DaytonaSandbox>;
};

/* eslint-disable no-control-regex */
function client() {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) throw new Error("Daytona is not configured. Add DAYTONA_API_KEY to the server environment.");
  // Pin the stable pre-namespace SDK API used by this adapter. SDK 2.1.x
  // lazily imports its bundled v0 compatibility layer, which currently fails
  // in this server bundle before any sandbox request can be made.
  const api = new Daytona({ apiKey }) as unknown as DaytonaApi;
  return { api };
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function cleanOutput(value: string) {
  return value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .replace(/\r\n?/g, "\n")
    .slice(-30_000);
}

export function daytonaTerminalSandboxName(userId: string) {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  return "experts-terminal-" + owner;
}
export function assertDaytonaTerminalSandboxName(userId: string, name: string) {
  const stable = daytonaTerminalSandboxName(userId);
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  const legacyPrefix = "experts-terminal-" + owner + "-";
  const legacyId = name.startsWith(legacyPrefix) ? name.slice(legacyPrefix.length) : "";
  const isLegacy = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(legacyId);
  if (name !== stable && !isLegacy) throw new Error("This terminal session does not belong to the signed-in account.");
  return name;
}

async function findSandboxByName(api: DaytonaApi, name: string): Promise<DaytonaSandbox | undefined> {
  for await (const sandbox of api.list()) {
    if (sandbox?.name === name) return sandbox;
  }
  return undefined;
}

async function getOrCreateSandbox(api: DaytonaApi, name: string): Promise<DaytonaSandbox> {
  let sandbox = await findSandboxByName(api, name);

  if (!sandbox) {
    try {
      sandbox = await api.create({
        name,
        language: "typescript",
        public: true,
        autoStopInterval: WORKSPACE_IDLE_MINUTES,
        autoDeleteInterval: -1,
      });
    } catch (createError) {
      // Preview and Publish can race after both list() calls. Reuse the
      // sandbox that won the unique-name reservation instead of failing.
      const racedSandbox = await findSandboxByName(api, name);
      if (!racedSandbox) throw createError;
      sandbox = racedSandbox;
    }
  }
  if (["stopped", "archived"].includes(String(sandbox.state ?? "").toLowerCase())) {
    await sandbox.start(120);
  }

  if (typeof sandbox.setAutostopInterval === "function") await sandbox.setAutostopInterval(WORKSPACE_IDLE_MINUTES);
  if (typeof sandbox.setAutoDeleteInterval === "function") await sandbox.setAutoDeleteInterval(-1);
  if (typeof sandbox.setPublic === "function") await sandbox.setPublic(true);
  if (typeof sandbox.refreshActivity === "function") await sandbox.refreshActivity();
  return sandbox;
}

async function workspacePath(sandbox: DaytonaSandbox) {
  const candidate = typeof sandbox.getWorkDir === "function" ? await sandbox.getWorkDir() : "";
  return typeof candidate === "string" && candidate.startsWith("/") ? candidate : "/workspace";
}

async function command(
  sandbox: DaytonaSandbox,
  script: string,
  cwd: string,
  env?: Record<string, string>,
  timeoutSeconds = 120,
) {
  const response = await sandbox.process.executeCommand(script, cwd, env, timeoutSeconds);
  const output = String(response?.result ?? response?.artifacts?.stdout ?? "");
  if (Number(response?.exitCode ?? 0) !== 0) {
    throw new Error(output.slice(-5000) || "Sandbox command failed with exit code " + response.exitCode + ".");
  }
  return output;
}

async function readText(sandbox: DaytonaSandbox, filePath: string): Promise<string | null> {
  try {
    const buffer = await sandbox.fs.downloadFile(filePath);
    return buffer?.toString("utf8") ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|no such file|404/i.test(message)) return null;
    throw error;
  }
}

async function uploadFiles(sandbox: DaytonaSandbox, files: Array<{ destination: string; source: Buffer }>) {
  for (let offset = 0; offset < files.length; offset += 12) {
    await sandbox.fs.uploadFiles(files.slice(offset, offset + 12));
  }
}

function terminalBridgeSource(workdir: string, bridgeDir: string) {
  const ttyFile = path.join(workdir, ".experts-terminal-tty");
  return [
    'const http = require("node:http");',
    'const { spawn } = require("node:child_process");',
    'const fs = require("node:fs");',
    'const { WebSocketServer } = require("ws");',
    "const activeShells = new Set();",
    "let shellCounter = 0;",
    'const server = http.createServer((request, response) => {',
    '  if (request.url === "/health") { response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); response.end("ok"); return; }',
    "  response.writeHead(404); response.end();",
    "});",
    'const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });',
    'server.on("upgrade", (request, socket, head) => {',
    '  if (request.url !== "/terminal") { socket.destroy(); return; }',
    '  const protocols = String(request.headers["sec-websocket-protocol"] || "").split(",").map((value) => value.trim());',
    '  if (!process.env.TERMINAL_TOKEN || !protocols.includes(process.env.TERMINAL_TOKEN)) { socket.write("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n"); socket.destroy(); return; }',
    '  sockets.handleUpgrade(request, socket, head, (client) => { client.expertsSkipKilo = protocols.includes("experts-terminal-probe") || protocols.includes("experts-terminal-plain"); sockets.emit("connection", client); });',
    "});",
    'sockets.on("connection", (client) => {',
    "  const ttyFile = " + JSON.stringify(ttyFile) + ' + "-" + (++shellCounter);',
    "  const command = " + JSON.stringify("stty rows 40 cols 120 2>/dev/null || true; tty > ") + " + ttyFile + " + JSON.stringify("; /bin/bash --noprofile --rcfile " + bridgeDir + "/prompt.rc -i") + ";",
    '  const shell = spawn("script", ["-q", "-f", "-c", command, "/dev/null"], { cwd: process.env.TERMINAL_CWD || process.cwd(), env: { ...process.env, EXPERTS_SKIP_KILO: client.expertsSkipKilo ? "1" : "0", TERM: "xterm-256color", COLORTERM: "truecolor" }, stdio: ["pipe", "pipe", "pipe"] });',
    "  activeShells.add(shell);",
    '  shell.stdout.on("data", (data) => { if (client.readyState === 1) client.send(data); });',
    '  shell.stderr.on("data", (data) => { if (client.readyState === 1) client.send(data); });',
    '  shell.on("error", (error) => { if (client.readyState === 1) client.send(String.fromCharCode(13, 10) + "Terminal startup error: " + error.message + String.fromCharCode(13, 10)); });',
    '  shell.on("close", () => { activeShells.delete(shell); try { fs.unlinkSync(ttyFile); } catch {} if (client.readyState === 1) client.close(); });',
    '  client.on("message", (buffer) => {',
    "    const value = buffer.toString();",
    "    if (value.charCodeAt(0) === 0) { try { const control = JSON.parse(value.slice(1)); if (control.type === \"resize\") { const cols = Math.max(2, Math.min(300, Number(control.cols) || 120)); const rows = Math.max(2, Math.min(100, Number(control.rows) || 40)); const ttyPath = fs.readFileSync(ttyFile, \"utf8\").trim(); if (/^\\/dev\\/pts\\/\\d+$/.test(ttyPath)) { const resize = spawn(\"stty\", [\"-F\", ttyPath, \"rows\", String(rows), \"cols\", String(cols)], { stdio: \"ignore\" }); resize.on(\"close\", () => { const signal = spawn(\"pkill\", [\"-WINCH\", \"-t\", ttyPath.slice(5)], { stdio: \"ignore\" }); signal.on(\"error\", () => {}); }); } } } catch {} return; }",
    "    if (shell.stdin.writable) shell.stdin.write(value);",
    "  });",
    '  client.on("close", () => { try { shell.kill("SIGHUP"); } catch {} activeShells.delete(shell); });',
    "});",
    'server.listen(Number(process.env.TERMINAL_PORT || ' + TERMINAL_PORT + '), "0.0.0.0");',
  ].join("\n");
}

function cliPrompt(username: string, cli: CliName) {
  const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 39) || "ExpertsTeam";
  const launch = cli === "kilo"
    ? 'command -v kilo >/dev/null 2>&1 && exec kilo || printf "\\nThe agent runtime is unavailable. Reconnect the workspace to repair it.\\n"'
    : cli === "opencode"
      ? 'command -v opencode >/dev/null 2>&1 && exec opencode || printf "\\nThe agent runtime is unavailable. Reconnect the workspace to repair it.\\n"'
      : 'command -v aider >/dev/null 2>&1 && exec aider || printf "\\nThe agent runtime is unavailable. Reconnect the workspace to repair it.\\n"';
  const skipEnv = "$" + "{EXPERTS_SKIP_KILO:-0}";
  return "export PS1=" + shellQuote(safeUsername + "@expertsteam:\\w$ ") +
    "\nPROMPT_COMMAND=\nif [ \"" + skipEnv + "\" != \"1\" ]; then\n  " + launch + "\nfi\n";
}

async function ensureCliInstalled(sandbox: DaytonaSandbox, cli: CliName, workdir: string) {
  const home = await command(sandbox, 'printf %s "$HOME"', workdir, undefined, 10);
  const globalBin = path.join(home, ".npm-global", "bin");
  const localBin = path.join(home, ".local", "bin");
  // Keep the image's original PATH: Daytona images may expose npm from a
  // version-manager directory that is not one of the standard system paths.
  // Replacing PATH with only the CLI install directories makes later direct
  // process commands fail with "zsh: command not found: npm".
  const systemPath = (await command(sandbox, 'printf %s "$PATH"', workdir, undefined, 10)).trim();
  const pathValue = [globalBin, localBin, systemPath, "/usr/local/bin", "/usr/bin", "/bin"]
    .filter(Boolean)
    .join(":");
  const existing = await command(
    sandbox,
    "bash -lc " + shellQuote("export PATH=" + shellQuote(pathValue) + ":$PATH; command -v " + cli + " || true"),
    workdir,
    { PATH: pathValue },
    20,
  );
  if (existing.trim()) {
    if (cli !== "kilo") return { home, globalBin, localBin, pathValue };

    // Kilo CLI versions before 7.8.12 could stop a task on retryable
    // "Connection reset by server" stream errors instead of retrying.
    // Refresh only outdated/unknown Kilo installs; preserve ~/.config/kilo
    // so the user's existing Gateway sign-in and settings remain in place.
    const versionOutput = await command(
      sandbox,
      "bash -lc " + shellQuote("export PATH=" + shellQuote(pathValue) + ":$PATH; kilo --version 2>/dev/null || true"),
      workdir,
      { PATH: pathValue },
      20,
    );
    const versionMatch = versionOutput.match(/(\\d+)\\.(\\d+)\\.(\\d+)/);
    const installedVersion = versionMatch
      ? versionMatch.slice(1).map(Number)
      : null;
    const minimumVersion = [7, 8, 12];
    const isSupported = Boolean(
      installedVersion &&
      (installedVersion[0] > minimumVersion[0] ||
        (installedVersion[0] === minimumVersion[0] &&
          (installedVersion[1] > minimumVersion[1] ||
            (installedVersion[1] === minimumVersion[1] && installedVersion[2] >= minimumVersion[2])))),
    );
    if (isSupported) return { home, globalBin, localBin, pathValue };
  }

  if (cli === "aider") {
    const install = [
      "export PATH=" + shellQuote(pathValue) + ":$PATH",
      "if ! command -v uv >/dev/null 2>&1; then curl -LsSf https://aider.chat/install.sh | sh; fi",
      "export PATH=" + shellQuote(pathValue) + ":$PATH",
      "command -v uv >/dev/null 2>&1 && uv tool install --force --python 3.12 aider-chat@latest",
    ].join(" && ");
    await command(sandbox, "bash -lc " + shellQuote(install), workdir, { PATH: pathValue }, 300);
  } else {
    const packageName = cli === "kilo" ? "@kilocode/cli" : "@opencode/cli";
    const install = [
      "mkdir -p " + shellQuote(globalBin),
      "npm config set prefix " + shellQuote(path.join(home, ".npm-global")),
      "npm install --global --no-audit --no-fund " + shellQuote(packageName),
    ].join(" && ");
    await command(sandbox, "bash -lc " + shellQuote(install), workdir, { PATH: pathValue }, 300);
  }

  const check = await command(
    sandbox,
    "bash -lc " + shellQuote("export PATH=" + shellQuote(pathValue) + ":$PATH; command -v " + cli),
    workdir,
    { PATH: pathValue },
    20,
  );
  if (!check.trim()) throw new Error(cli + " installed but its command is not available in the workspace.");
  return { home, globalBin, localBin, pathValue };
}


const PREVIEW_PORT = 5173;
const PREVIEW_META_FILE = ".experts-preview-files.json";
function previewSandboxName(projectId: string) {
  return "experts-preview-" + projectId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
}
function safePreviewPath(filePath: string) {
  return Boolean(filePath && !filePath.startsWith("/") && !filePath.includes("\\\\") &&
    !filePath.split("/").some((part) => !part || part === "." || part === "..") &&
    /^[a-zA-Z0-9_@./-]+$/.test(filePath));
}
export async function startDaytonaProjectPreview(projectId: string, sourceFiles: AgentProjectFiles) {
  const entries = Object.entries(sourceFiles);
  if (!entries.length) throw new Error("Add project files before starting the preview.");
  if (entries.length > 2_000 || entries.some(([filePath, content]) => !safePreviewPath(filePath) || content.length > 10_000_000))
    throw new Error("The project contains invalid or oversized files.");
  if (entries.reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0) > 25_000_000)
    throw new Error("The project exceeds the 25 MB preview workspace limit.");
  const { api } = client();
  const name = previewSandboxName(projectId);
  let stage = "connecting to Daytona";
  try {
    const sandbox = await getOrCreateSandbox(api, name);
    const workdir = await workspacePath(sandbox);
    stage = "syncing project files";
    await command(sandbox, "mkdir -p " + shellQuote(workdir), workdir, undefined, 20);
    const oldText = await readText(sandbox, path.join(workdir, PREVIEW_META_FILE));
    let oldManifest: Record<string, string> = {};
    try { oldManifest = oldText ? JSON.parse(oldText) as Record<string, string> : {}; } catch { oldManifest = {}; }
    const nextManifest = Object.fromEntries(entries.map(([filePath, content]) => [filePath, createHash("sha256").update(content).digest("hex")]));
    const removed = Object.keys(oldManifest).filter((filePath) => !(filePath in sourceFiles));
    if (removed.length) await command(sandbox, "rm -rf -- " + removed.map((filePath) => shellQuote(path.join(workdir, filePath))).join(" "), workdir, undefined, 45);
    const changed = entries.filter(([filePath]) => oldManifest[filePath] !== nextManifest[filePath]);
    if (changed.length) {
      const dirs = [...new Set(changed.map(([filePath]) => path.dirname(path.join(workdir, filePath))))];
      await command(sandbox, "mkdir -p " + dirs.map(shellQuote).join(" "), workdir, undefined, 30);
      await uploadFiles(sandbox, changed.map(([filePath, content]) => ({ destination: path.join(workdir, filePath), source: Buffer.from(content, "utf8") })));
    }
    await sandbox.fs.uploadFile(Buffer.from(JSON.stringify(nextManifest), "utf8"), path.join(workdir, PREVIEW_META_FILE));
    let pkg: Record<string, unknown> = {};
    try { pkg = JSON.parse(sourceFiles["package.json"] ?? "{}") as Record<string, unknown>; }
    catch { throw new Error("package.json contains invalid JSON. Fix it before previewing."); }
    const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts as Record<string, string> : {};
    const scriptName = scripts.dev ? "dev" : scripts.start ? "start" : "";
    if (!scriptName) throw new Error("This project has no dev or start script. Add one to package.json.");
    const script = String(scripts[scriptName] ?? "");
    const isVite = /vite/i.test(script);
    const isNext = /next\s+(dev|start)/i.test(script);
    const scriptPort = script.match(/--port(?:=|\s+)(\d{2,5})/i)?.[1];
    const sourceText = entries.map(([, content]) => content).join("\n");
    const envPort = sourceText.match(/process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d{2,5})/i)?.[1];
    const port = Number(scriptPort ?? envPort ?? (isVite ? PREVIEW_PORT : 3000));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("The app's preview port is invalid.");
    stage = "installing project dependencies";
    const nodeModules = await command(sandbox, "test -d node_modules && echo yes || echo no", workdir, undefined, 10);
    if (nodeModules.trim() !== "yes" || changed.some(([filePath]) => filePath === "package.json" || /lock/.test(filePath))) {
      const install = sourceFiles["pnpm-lock.yaml"] ? "pnpm install --no-frozen-lockfile"
        : sourceFiles["yarn.lock"] ? "corepack yarn install --non-interactive"
        : sourceFiles["bun.lock"] || sourceFiles["bun.lockb"] ? "bun install"
        : "npm install --no-audit --no-fund";
      await command(sandbox, install, workdir, undefined, 300);
    }
    stage = "starting the development server";
    const link = await sandbox.getPreviewLink(port);
    const previewUrl = link.url;
    const host = new URL(previewUrl).hostname;
    if (isVite) {
      const configNames = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"];
      const userConfigName = configNames.find((candidate) => Boolean(sourceFiles[candidate]));
      const configImport = userConfigName ? 'import userConfig from "./' + userConfigName + '";' : "const userConfig = {};";
      const config = [
        'import { mergeConfig } from "vite";', configImport,
        "const previewHost = " + JSON.stringify(host) + ";",
        "export default async (environment) => {",
        ' const base = typeof userConfig === "function" ? await userConfig(environment) : await userConfig;',
        " const hostConfig = { server: { allowedHosts: [previewHost] }, preview: { allowedHosts: [previewHost] } };",
        " return Array.isArray(base) ? base.map((entry) => mergeConfig(entry, hostConfig)) : mergeConfig(base ?? {}, hostConfig);",
        "};",
      ].join("\n");
      await sandbox.fs.uploadFile(Buffer.from(config, "utf8"), path.join(workdir, ".experts-vite-preview.config.ts"));
    }
    const extraArgs = isNext ? " -- --hostname 0.0.0.0 --port " + port
      : isVite ? " -- --host 0.0.0.0 --port " + port + " --strictPort --config .experts-vite-preview.config.ts" : "";
    stage = "checking the live preview";
    let ready = false;
    let lastError = "The preview server did not respond.";
    try {
      const existing = await fetch(previewUrl, { cache: "no-store", signal: AbortSignal.timeout(1500) });
      ready = existing.ok || (existing.status >= 300 && existing.status < 400);
      if (!ready) lastError = "Preview returned HTTP " + existing.status + ".";
    } catch { ready = false; }
    if (!ready) {
      const start = "nohup npm run " + scriptName + extraArgs + " > .experts-preview.log 2>&1 < /dev/null & echo $! > .experts-preview.pid";
      await command(sandbox, start, workdir,
        { HOST: "0.0.0.0", PORT: String(port), ...(isVite ? { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: host } : {}) }, 30);
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const response = await fetch(previewUrl, { cache: "no-store", signal: AbortSignal.timeout(2500) });
          if (response.ok || (response.status >= 300 && response.status < 400)) { ready = true; break; }
          lastError = "Preview returned HTTP " + response.status + ".";
        } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    if (!ready) {
      const logs = await readText(sandbox, path.join(workdir, ".experts-preview.log"));
      throw new Error(lastError + (logs ? "\n" + logs.slice(-3500) : ""));
    }
    return { url: previewUrl, port, sandboxName: name, installOutput: "", recovered: false, provider: "daytona" as const };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error("Daytona preview failed while " + stage + ": " + detail);
  }
}
export async function stopDaytonaProjectPreview(projectId: string) {
  const { api } = client();
  const sandbox = await findSandboxByName(api, previewSandboxName(projectId));
  if (!sandbox) return { stopped: true };
  if (!["stopped", "archived"].includes(String(sandbox.state ?? "").toLowerCase())) await sandbox.stop();
  return { stopped: true };
}


function publishableFile(filePath: string) {
  const parts = filePath.replace(/\\\\/g, "/").split("/");
  const filename = parts.at(-1) ?? "";
  return !parts.some((part) => ["node_modules", ".git", ".vercel"].includes(part)) &&
    !/^\.env(?:\.|$)/i.test(filename) &&
    !/^(?:id_rsa|id_ed25519|credentials?|secrets?)(?:\.|$)/i.test(filename) &&
    /\.(?:pem|key|p12|pfx)$/i.test(filename);
}
function publishMime(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html:"text/html; charset=utf-8", css:"text/css; charset=utf-8", js:"text/javascript; charset=utf-8",
    mjs:"text/javascript; charset=utf-8", cjs:"text/javascript; charset=utf-8", json:"application/json; charset=utf-8",
    map:"application/json; charset=utf-8", svg:"image/svg+xml", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg",
    webp:"image/webp", gif:"image/gif", ico:"image/x-icon", woff:"font/woff", woff2:"font/woff2",
    ttf:"font/ttf", otf:"font/otf", wasm:"application/wasm", txt:"text/plain; charset=utf-8", xml:"application/xml",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}
export async function publishDaytonaProject(
  projectId: string,
  sourceFiles: AgentProjectFiles,
  slug: string,
  userId: string,
  storageClient: SupabaseClient<Database>,
) {
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) throw new Error("The public app address is invalid.");
  const entries = Object.entries(sourceFiles);
  if (!entries.length || entries.length > 2_000 || entries.some(([filePath]) => !safePreviewPath(filePath)))
    throw new Error("The project contains invalid or oversized files.");
  const { api } = client();
  const name = previewSandboxName(projectId);
  let stage = "connecting to Daytona";
  try {
    const sandbox = await getOrCreateSandbox(api, name);
    const workdir = await workspacePath(sandbox);
    stage = "syncing project files";
    await command(sandbox, "mkdir -p " + shellQuote(workdir), workdir, undefined, 20);
    const oldText = await readText(sandbox, path.join(workdir, PREVIEW_META_FILE));
    let oldManifest: Record<string, string> = {};
    try { oldManifest = oldText ? JSON.parse(oldText) as Record<string, string> : {}; } catch { oldManifest = {}; }
    const nextManifest = Object.fromEntries(entries.map(([filePath, content]) => [filePath, createHash("sha256").update(content).digest("hex")]));
    const removed = Object.keys(oldManifest).filter((filePath) => !(filePath in sourceFiles));
    if (removed.length) await command(sandbox, "rm -rf -- " + removed.map((filePath) => shellQuote(path.join(workdir, filePath))).join(" "), workdir, undefined, 45);
    const changed = entries.filter(([filePath]) => oldManifest[filePath] !== nextManifest[filePath]);
    if (changed.length) {
      const dirs = [...new Set(changed.map(([filePath]) => path.dirname(path.join(workdir, filePath))))];
      await command(sandbox, "mkdir -p " + dirs.map(shellQuote).join(" "), workdir, undefined, 30);
      await uploadFiles(sandbox, changed.map(([filePath, content]) => ({ destination: path.join(workdir, filePath), source: Buffer.from(content, "utf8") })));
    }
    await sandbox.fs.uploadFile(Buffer.from(JSON.stringify(nextManifest), "utf8"), path.join(workdir, PREVIEW_META_FILE));

    let pkg: Record<string, unknown> = {};
    try { pkg = JSON.parse(sourceFiles["package.json"] ?? "{}") as Record<string, unknown>; }
    catch { throw new Error("package.json contains invalid JSON. Fix it before publishing."); }
    const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts as Record<string, string> : {};
    const buildScript = typeof scripts.build === "string" ? scripts.build : "";
    let outputFiles: Array<{ path: string; content: Buffer }> = [];

    if (buildScript) {
      stage = "installing production dependencies";
      const install = sourceFiles["pnpm-lock.yaml"] ? "pnpm install --no-frozen-lockfile"
        : sourceFiles["yarn.lock"] ? "corepack yarn install --non-interactive"
        : sourceFiles["bun.lock"] || sourceFiles["bun.lockb"] ? "bun install"
        : "npm install --no-audit --no-fund";
      await command(sandbox, install, workdir, undefined, 300);
      stage = "building the production app";
      const baseArgs = /vite/i.test(buildScript) ? " --base ./" : "";
      const buildCommand = sourceFiles["pnpm-lock.yaml"] ? "pnpm run build" + (baseArgs ? " --" + baseArgs : "")
        : sourceFiles["yarn.lock"] ? "corepack yarn build" + baseArgs
        : sourceFiles["bun.lock"] || sourceFiles["bun.lockb"] ? "bun run build" + (baseArgs ? " --" + baseArgs : "")
        : "npm run build" + (baseArgs ? " --" + baseArgs : "");
      await command(sandbox, buildCommand, workdir, undefined, 600);

      stage = "collecting build output";
      const candidates = [".output/public", "dist", "build", "out", "dist/client", "build/client", ".svelte-kit/output/client", "public", "www"];
      let outputDirectory = "";
      for (const candidate of candidates) {
        const found = await command(sandbox, "test -f " + shellQuote(path.join(workdir, candidate, "index.html")) + " && echo yes || true", workdir, undefined, 10);
        if (found.trim() === "yes") { outputDirectory = candidate; break; }
      }
      if (!outputDirectory) {
        const nested = await command(sandbox, "find dist -type f -name index.html -print -quit 2>/dev/null || true", workdir, undefined, 15);
        if (nested.trim()) outputDirectory = path.dirname(nested.trim().replace(/^\.\//, ""));
      }
      if (!outputDirectory) {
        throw new Error("The build finished, but no static index.html was found. Configure a static/export build adapter before publishing. Server-rendered apps need a server-hosting target.");
      }
      const listing = await command(sandbox, "find " + shellQuote(path.join(workdir, outputDirectory)) + " -type f -print", workdir, undefined, 30);
      const outputPaths = listing.split("\n").map((value) => value.trim())
        .filter((value) => value.startsWith(path.join(workdir, outputDirectory) + "/"))
        .map((value) => value.slice(path.join(workdir, outputDirectory).length + 1))
        .filter(publishableFile);
      if (!outputPaths.length || outputPaths.length > 500) throw new Error("The build must contain between 1 and 500 publishable files.");
      let totalBytes = 0;
      for (const relativePath of outputPaths) {
        const buffer = await sandbox.fs.downloadFile(path.join(workdir, outputDirectory, relativePath));
        totalBytes += buffer.byteLength;
        if (buffer.byteLength > 10_000_000 || totalBytes > 40_000_000)
          throw new Error("The published build is too large (maximum 40 MB total, 10 MB per file).");
        outputFiles.push({ path: relativePath, content: buffer });
      }
    } else {
      if (!sourceFiles["index.html"]) throw new Error("Add an index.html file or a package.json build script before publishing.");
      outputFiles = entries.filter(([filePath]) => publishableFile(filePath))
        .map(([filePath, content]) => ({ path: filePath, content: Buffer.from(content, "utf8") }));
    }

    if (!outputFiles.some((file) => file.path === "index.html")) throw new Error("The production build does not contain index.html.");
    const entry = outputFiles.find((file) => file.path === "index.html");
    if (entry) {
      let html = entry.content.toString("utf8");
      if (!/<link\b[^>]*rel=["'][^"']*icon/i.test(html)) {
        const icon = '<link rel="icon" type="image/png" href="https://expertsteam.giize.com/logo.svg?v=20261121-3">';
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, icon + "</head>") : html;
      }
      if (!/<meta\b[^>]*name=["']application-name["']/i.test(html))
        html = html.replace(/<\/head>/i, '<meta name="application-name" content="ExpertsTeam"></head>');
      entry.content = Buffer.from(html, "utf8");
    }

    stage = "uploading the published app to Supabase";
    const releaseId = randomUUID();
    const prefix = userId + "/" + slug + "/" + releaseId;
    for (let offset = 0; offset < outputFiles.length; offset += 8) {
      await Promise.all(outputFiles.slice(offset, offset + 8).map(async (file) => {
        const { error } = await storageClient.storage.from("published-apps").upload(
          prefix + "/" + file.path, file.content,
          { contentType: publishMime(file.path), cacheControl: "31536000", upsert: false },
        );
        if (error) throw new Error("Could not publish " + file.path + ": " + error.message);
      }));
    }
    const { data } = storageClient.storage.from("published-apps").getPublicUrl(prefix + "/index.html");
    const publicUrl = data.publicUrl;
    if (!publicUrl) throw new Error("The publishing service did not return a public app URL.");
    stage = "verifying the published entry page";
    let html = "";
    let lastError = "No response from Supabase Storage.";
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await fetch(publicUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const contentType = response.headers.get("content-type") ?? "";
          if (!/^(?:text\/html|text\/plain)(?:;|$)/i.test(contentType)) lastError = "The entry point did not return an HTML-compatible content type.";
          else {
            const body = await response.text();
            const normalized = body.replace(/^\uFEFF/, "").trimStart().toLowerCase();
            if (normalized.startsWith("<!doctype html") || normalized.startsWith("<html")) { html = body; break; }
            lastError = "The published entry point is not a valid HTML document.";
          }
        } else lastError = "Supabase returned HTTP " + response.status + ".";
      } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
    if (!html) throw new Error("The files uploaded, but the public entry point failed verification: " + lastError);
    return { url: publicUrl, slug, releaseId, fileCount: outputFiles.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error("Daytona publishing failed while " + stage + ": " + detail);
  }
}

export async function startDaytonaProjectTerminal(
  name: string,
  sourceFiles: AgentProjectFiles,
  username = "ExpertsTeam",
  cli: CliName = "kilo",
) {
  if (Object.keys(sourceFiles).length === 0) {
    throw new Error("Cannot start the CLI with an empty workspace. Reload the saved project files and reconnect.");
  }

  const { api } = client();
  let stage = "connecting to your saved Daytona workspace";
  try {
    const sandbox = await getOrCreateSandbox(api, name);
    const workdir = await workspacePath(sandbox);
    stage = "preparing the project directory";
    await command(sandbox, "mkdir -p " + shellQuote(path.join(workdir, BRIDGE_DIR)), workdir, undefined, 30);

    stage = "restoring project files";
    const previous = await readText(sandbox, path.join(workdir, META_FILE));
    let previousManifest: Record<string, string> = {};
    try { previousManifest = previous ? JSON.parse(previous) as Record<string, string> : {}; } catch { previousManifest = {}; }

    const nextManifest = Object.fromEntries(
      Object.entries(sourceFiles).map(([filePath, content]) => [
        filePath,
        createHash("sha256").update(content).digest("hex"),
      ]),
    );
    const nextPaths = Object.keys(sourceFiles);
    const removed = Object.keys(previousManifest).filter((filePath) => !nextPaths.includes(filePath));
    if (removed.length) {
      const removeScript = removed.map((filePath) => "rm -rf -- " + shellQuote(path.join(workdir, filePath))).join(" && ");
      await command(sandbox, removeScript, workdir, undefined, 60);
    }

    const changed = nextPaths.filter((filePath) => previousManifest[filePath] !== nextManifest[filePath]);
    if (changed.length) {
      const uploads = changed.map((filePath) => ({
        destination: path.join(workdir, filePath),
        source: Buffer.from(sourceFiles[filePath], "utf8"),
      }));
      const dirs = [...new Set(changed.map((filePath) => path.dirname(path.join(workdir, filePath))))];
      await command(sandbox, "mkdir -p " + dirs.map(shellQuote).join(" "), workdir, undefined, 30);
      await uploadFiles(sandbox, uploads);
    }
    await sandbox.fs.uploadFile(Buffer.from(JSON.stringify(nextManifest), "utf8"), path.join(workdir, META_FILE));

    stage = "installing the selected coding CLI";
    const install = await ensureCliInstalled(sandbox, cli, workdir);
    const bridgeDir = path.join(workdir, BRIDGE_DIR);
    const tokenPath = path.join(workdir, TOKEN_FILE);
    const token = (await readText(sandbox, tokenPath))?.trim() || randomBytes(32).toString("hex");
    const kiloPermissions = {
      permission: {
        read: { "*": "allow", "*.env": "deny", "*.env.*": "deny", "**/.env": "deny", "**/.env.*": "deny" },
        edit: { "*": "allow", "*.env": "deny", "*.env.*": "deny", "**/.env": "deny", "**/.env.*": "deny" },
        glob: "allow", grep: "allow", list: "allow", task: "allow", skill: "allow", lsp: "allow",
        todoread: "allow", todowrite: "allow",
        // Let the coding agent fetch user-provided URLs and run project setup/build commands
        // directly inside its isolated Daytona workspace without asking for every command.
        webfetch: "allow", websearch: "allow", bash: "allow",
        // Keep access outside the project workspace blocked; project files remain writable.
        external_directory: "deny", doom_loop: "ask",
      },
    };
    await command(sandbox, "mkdir -p " + shellQuote(path.join(install.home, ".config", "kilo")), workdir, undefined, 15);
    await uploadFiles(sandbox, [
      { destination: path.join(bridgeDir, "package.json"), source: Buffer.from(JSON.stringify({ private: true, type: "commonjs", dependencies: { ws: "^8.18.3" } }), "utf8") },
      { destination: path.join(bridgeDir, "server.cjs"), source: Buffer.from(terminalBridgeSource(workdir, bridgeDir), "utf8") },
      { destination: path.join(bridgeDir, "prompt.rc"), source: Buffer.from(cliPrompt(username, cli), "utf8") },
      { destination: tokenPath, source: Buffer.from(token, "utf8") },
      { destination: path.join(install.home, ".config", "kilo", "kilo.jsonc"), source: Buffer.from(JSON.stringify(kiloPermissions, null, 2) + "\n", "utf8") },
    ]);

    stage = "installing the terminal WebSocket runtime";
    const wsInstalled = await command(sandbox, "test -d node_modules/ws && echo ready || true", bridgeDir, { PATH: install.pathValue }, 15);
    if (!wsInstalled.trim()) {
      const bridgeInstall = "export PATH=" + shellQuote(install.pathValue) + ":$PATH; npm install --no-audit --no-fund";
      await command(sandbox, "bash -lc " + shellQuote(bridgeInstall), bridgeDir, { PATH: install.pathValue }, 180);
    }

    stage = "starting the interactive terminal bridge";
    const healthScript = "node -e " + shellQuote('fetch("http://127.0.0.1:4175/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))');
    let healthy = false;
    try { await command(sandbox, healthScript, bridgeDir, undefined, 10); healthy = true; } catch { healthy = false; }
    if (!healthy) {
      await command(
        sandbox,
        "nohup node server.cjs > server.log 2>&1 < /dev/null &",
        bridgeDir,
        {
          TERMINAL_TOKEN: token,
          TERMINAL_CWD: workdir,
          TERMINAL_PORT: String(TERMINAL_PORT),
          PATH: install.pathValue,
        },
        15,
      );
    }

    for (let attempt = 0; attempt < 25; attempt++) {
      try { await command(sandbox, healthScript, bridgeDir, undefined, 10); healthy = true; break; }
      catch { healthy = false; await new Promise((resolve) => setTimeout(resolve, 400)); }
    }
    if (!healthy) {
      const logs = await command(sandbox, "tail -n 80 server.log 2>/dev/null || true", bridgeDir, undefined, 10).catch(() => "");
      throw new Error("The terminal bridge did not start. " + logs.slice(-2500));
    }

    stage = "verifying the interactive terminal";
    const selfTest = [
      'const WebSocket = require("ws");',
      'let output = "";',
      "let passed = false;",
      'const socket = new WebSocket("ws://127.0.0.1:4175/terminal", ["experts-terminal-probe", process.env.TERMINAL_TOKEN]);',
      "const timeout = setTimeout(() => { socket.terminate(); process.exit(1); }, 12000);",
      'socket.on("open", () => socket.send("echo EXPERTS_TERMINAL_OK\\r"));',
      'socket.on("message", (data) => { output += data.toString(); if (output.includes("EXPERTS_TERMINAL_OK")) { passed = true; clearTimeout(timeout); socket.close(); } });',
      'socket.on("close", () => { clearTimeout(timeout); process.exit(passed ? 0 : 1); });',
      'socket.on("error", () => { clearTimeout(timeout); process.exit(1); });',
    ].join("\n");
    await sandbox.fs.uploadFile(Buffer.from(selfTest, "utf8"), path.join(bridgeDir, "healthcheck.cjs"));
    await command(sandbox, "node healthcheck.cjs", bridgeDir, {
      TERMINAL_TOKEN: token,
      PATH: install.pathValue,
    }, 20);

    const preview = await sandbox.getPreviewLink(TERMINAL_PORT);
    const url = new URL(preview.url);
    url.protocol = "wss:";
    url.pathname = "/terminal";
    url.search = "";
    url.hash = "";
    return { sandboxName: name, url: url.toString(), token, toolkitStatus: "skipped" as const, cli, provider: "daytona" as const };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/401|unauthorized|invalid.*api.?key/i.test(detail)) {
      throw new Error("Daytona rejected DAYTONA_API_KEY. Check the key in the original Vercel project's server environment variables.");
    }
    throw new Error("Daytona terminal startup failed while " + stage + ": " + detail);
  }
}

export async function stopDaytonaProjectTerminal(name: string) {
  const { api } = client();
  const sandbox = await findSandboxByName(api, name);
  if (!sandbox) return { stopped: true, preserved: true };
  if (String(sandbox.state ?? "").toLowerCase() !== "stopped") await sandbox.stop();
  return { stopped: true, preserved: true };
}

export async function readDaytonaProjectFiles(name: string) {
  const { api } = client();
  const sandbox = await findSandboxByName(api, name) as DaytonaSandbox | undefined;
  if (!sandbox) throw new Error("Your saved Daytona workspace could not be found.");
  if (["stopped", "archived"].includes(String(sandbox.state ?? "").toLowerCase())) await sandbox.start(120);
  const workdir = await workspacePath(sandbox);
  const listing = await command(
    sandbox,
    "find . -type d \\( -name node_modules -o -name .git -o -name .kilo -o -name .kilocode -o -name .opencode -o -name dist -o -name build -o -name out -o -name .next -o -name .vercel -o -name coverage -o -name .experts-terminal-bridge \\) -prune -o -type f -print",
    workdir,
    undefined,
    30,
  );
  const paths = listing.split("\n").map((item) => item.trim().replace(/^\.\//, "")).filter((filePath) => {
    const filename = filePath.split("/").at(-1) ?? "";
    return filePath &&
      !filePath.startsWith("/") &&
      !filePath.split("/").some((part) => !part || part === "." || part === "..") &&
      !filePath.split("/").some((part) => part.startsWith(".experts-") || [".kilo", ".kilocode", ".opencode"].includes(part)) &&
      ![".npmrc", ".netrc", ".pypirc"].includes(filename) &&
      !/^\.env(?:\.|$)/i.test(filename) &&
      !/^(?:id_rsa|id_ed25519|credentials?|secrets?)(?:\.|$)/i.test(filename) &&
      !/\.(?:pem|key|p12|pfx)$/i.test(filename);
  });
  if (paths.length > 2_000) throw new Error("The project has more than 2,000 files; remove generated files before importing.");
  const files: AgentProjectFiles = {};
  let totalBytes = 0;
  for (const filePath of paths) {
    const buffer = await sandbox.fs.downloadFile(path.join(workdir, filePath));
    totalBytes += buffer.byteLength;
    if (buffer.byteLength > 10_000_000 || totalBytes > 25_000_000) {
      throw new Error("The project files exceed the 25 MB workspace limit.");
    }
    files[filePath] = buffer.toString("utf8");
  }
  if (Object.keys(files).length === 0) {
    throw new Error("The Linux workspace returned no project files. The saved project was not changed.");
  }
  return { files };
}

export async function runDaytonaProjectCommand(name: string, commandText: string) {
  if (!commandText.trim() || commandText.length > 48_000) throw new Error("The agent command is too long.");
  const { api } = client();
  const sandbox = await findSandboxByName(api, name) as DaytonaSandbox | undefined;
  if (!sandbox) throw new Error("Your saved Daytona workspace could not be found.");
  if (["stopped", "archived"].includes(String(sandbox.state ?? "").toLowerCase())) await sandbox.start(120);
  const workdir = await workspacePath(sandbox);
  const cwdPath = path.join(workdir, ".experts-terminal-cwd");
  const envPath = path.join(workdir, ".experts-terminal-env");
  const commandPath = path.join(workdir, ".experts-terminal-command.sh");
  const savedCwd = (await readText(sandbox, cwdPath))?.trim() || workdir;
  const script = [
    "#!/usr/bin/env bash",
    "cd -- " + shellQuote(savedCwd) + " || exit 1",
    "if [ -f " + shellQuote(envPath) + " ]; then source " + shellQuote(envPath) + "; fi",
    commandText,
    "command_status=$?",
    "pwd > " + shellQuote(cwdPath),
    "export -p > " + shellQuote(envPath),
    'exit "$command_status"',
    "",
  ].join("\n");
  await sandbox.fs.uploadFile(Buffer.from(script, "utf8"), commandPath);
  const result = await sandbox.process.executeCommand("bash --login " + shellQuote(commandPath), workdir, undefined, 600);
  const output = cleanOutput(String(result?.result ?? result?.artifacts?.stdout ?? ""));
  return {
    exitCode: Number(result?.exitCode ?? 0),
    stdout: output,
    stderr: "",
    cwd: (await readText(sandbox, cwdPath))?.trim() || workdir,
  };
}

export async function refreshDaytonaProjectTerminal(name: string) {
  const { api } = client();
  const sandbox = await findSandboxByName(api, name);
  if (!sandbox) throw new Error("Your Daytona terminal workspace could not be found.");
  if (["stopped", "archived"].includes(String(sandbox.state ?? "").toLowerCase())) {
    await sandbox.start(120);
  }
  if (typeof sandbox.refreshActivity === "function") await sandbox.refreshActivity();
  return { refreshed: true };
}
