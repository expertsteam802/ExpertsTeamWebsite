import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { repairMissingStylesheetImports } from "./agent.server";

export type AgentProjectFiles = Record<string, string>;

const WORKDIR = "/vercel/sandbox";
const META_FILE = ".experts-agent-files.json";
const PACKAGE_HASH_FILE = ".experts-agent-package-hash";
const PREVIEW_PORT_FILE = ".experts-agent-preview-port";

function sandboxName(projectId: string) {
  return "experts-agent-ephemeral-v2-" + projectId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
}

function terminalSandboxName(userId: string) {
  return "experts-terminal-ephemeral-v1-" + userId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
}

function validateFiles(files: AgentProjectFiles) {
  const entries = Object.entries(files);
  if (entries.length > 400)
    throw new Error(
      "This project contains more than 400 files; the workspace preview limit is 400.",
    );
  let total = 0;
  for (const [path, content] of entries) {
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      !/^[a-zA-Z0-9_@./-]+$/.test(path)
    )
      throw new Error("The project contains an invalid file path.");
    if (typeof content !== "string" || content.length > 500_000)
      throw new Error("A project file is too large to preview.");
    total += content.length;
  }
  if (total > 3_000_000) throw new Error("This project is too large to preview.");
}

async function readText(sandbox: Awaited<ReturnType<typeof Sandbox.getOrCreate>>, path: string) {
  const buffer = await sandbox.readFileToBuffer({ path });
  return buffer?.toString("utf8") ?? null;
}

async function runChecked(
  sandbox: Awaited<ReturnType<typeof Sandbox.getOrCreate>>,
  cmd: string,
  args: string[],
  timeout = 120_000,
) {
  const result = await sandbox.runCommand({ cmd, args, cwd: WORKDIR, timeoutMs: timeout });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(
      (stderr || stdout || `${cmd} exited with code ${result.exitCode}`).slice(-5000),
    );
  }
  return [stdout, stderr].filter(Boolean).join("\n");
}

async function waitForPreview(url: string) {
  const deadline = Date.now() + 30_000;
  let lastError = "The preview server did not respond.";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2500) });
      if (response.status === 403) {
        const body = await response.text();
        if (body.includes("Blocked request") && body.includes("not allowed")) {
          lastError = "Vite is still blocking the sandbox preview hostname.";
        } else {
          lastError = "The preview server rejected the request (HTTP 403). Check its host and access settings.";
        }
      } else if (response.status === 410) {
        lastError = "The preview sandbox stopped. Restarting the cloud preview…";
      } else if (response.status >= 300 && response.status < 400) {
        return;
      } else if (response.status === 200) {
        const body = await response.text();
        if (body.trim()) return;
        lastError = "The preview server returned an empty page. Check the app entry file and dev script.";
      } else if (response.status === 404) {
        lastError = "The preview server is running, but its root page returned 404. Check that the project has an index.html or a root route.";
      } else if (response.status === 401 || response.status === 403) {
        lastError = `The preview server rejected the request (HTTP ${response.status}). Check the server's host and access settings.`;
      } else {
        lastError = `Preview returned HTTP ${response.status}.`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(lastError);
}

export async function startCloudProjectPreview(projectId: string, sourceFiles: AgentProjectFiles) {
  const files = repairMissingStylesheetImports({ ...sourceFiles });
  validateFiles(files);
  let packageJson: Record<string, unknown> = {};
  try {
    packageJson = JSON.parse(files["package.json"] ?? "{}") as Record<string, unknown>;
  } catch {
    throw new Error("package.json contains invalid JSON. Fix it before running the project.");
  }
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  if (!files["package.json"]) {
    files["package.json"] = JSON.stringify(
      {
        name: "experts-team-project",
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: { dev: "vite" },
        devDependencies: { vite: "latest" },
      },
      null,
      2,
    );
    packageJson = JSON.parse(files["package.json"]) as Record<string, unknown>;
  }
  const activeScripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const scriptName = activeScripts.dev ? "dev" : activeScripts.start ? "start" : null;
  const devScript = activeScripts[scriptName ?? ""] ?? "";
  const isNext = /next\s+dev|next\s+start/.test(devScript);
  const isVite = !scriptName || /vite/.test(devScript);
  // Prefer an explicit script/source port, then the framework default.
  // This matters for Node apps such as Express + Socket.IO: their source may
  // declare "process.env.PORT || 3000", while Vite uses 5173 by default.
  const sourceText = Object.values(files).join("\n");
  const scriptPort = devScript.match(/--port(?:=|\s+)(\d{2,5})/i)?.[1];
  const envPort = sourceText.match(/process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d{2,5})/i)?.[1];
  const listenPort = sourceText.match(/(?:\.listen|listen)\(\s*(\d{2,5})\b/i)?.[1];
  const detectedPort = Number(scriptPort ?? envPort ?? listenPort ?? (isVite ? 5173 : 3000));
  const port = Number.isInteger(detectedPort) && detectedPort > 0 && detectedPort <= 65535
    ? detectedPort
    : isVite ? 5173 : 3000;
  const name = sandboxName(projectId);
  const sandbox = await Sandbox.getOrCreate({
    name,
    // Terminal sessions are scoped to the signed-in user, not a project, so switching folders
    // does not terminate the shell. Project source remains saved in Supabase.
    // Never snapshot this disposable Linux VM.
    persistent: false,
    runtime: "node24",
    resources: { vcpus: 1 },
    timeout: 45 * 60 * 1000,
    networkPolicy: "allow-all",
    ports: [port, 4174],
    resume: true,
  });

  // Existing named sandboxes keep their original configuration, so update the
  // per-session timeout as well as setting it during creation.
  await sandbox.update({
    timeout: 45 * 60 * 1000,
    networkPolicy: "allow-all",
    ports: [port, 4174],
  });

  const previous = await readText(sandbox, `${WORKDIR}/${META_FILE}`);
  let previousManifest: Record<string, string> = {};
  try {
    const parsed = previous ? (JSON.parse(previous) as unknown) : {};
    previousManifest = Array.isArray(parsed)
      ? Object.fromEntries(
          parsed
            .filter((path): path is string => typeof path === "string")
            .map((path) => [path, ""]),
        )
      : (parsed as Record<string, string>);
  } catch {
    previousManifest = {};
  }
  const nextPaths = Object.keys(files);
  const nextManifest = Object.fromEntries(
    nextPaths.map((path) => [path, createHash("sha256").update(files[path]).digest("hex")]),
  );
  const removed = Object.keys(previousManifest).filter((path) => !nextPaths.includes(path));
  if (removed.length) {
    await sandbox.runCommand({ cmd: "rm", args: ["-rf", "--", ...removed], cwd: WORKDIR });
  }
  const changed = nextPaths.filter((path) => previousManifest[path] !== nextManifest[path]);
  if (changed.length) {
    await sandbox.writeFiles(
      changed.map((path) => ({
        path,
        content: Buffer.from(files[path], "utf8"),
      })),
    );
  }
  await sandbox.writeFiles([
    {
      path: META_FILE,
      content: Buffer.from(JSON.stringify(nextManifest), "utf8"),
    },
  ]);
  await sandbox.writeFiles([
    { path: PREVIEW_PORT_FILE, content: Buffer.from(String(port), "utf8") },
  ]);

  const packageHash = createHash("sha256").update(files["package.json"]).digest("hex");
  const installedHash = await readText(sandbox, `${WORKDIR}/${PACKAGE_HASH_FILE}`);
  let installOutput = "";
  if (installedHash !== packageHash) {
    const packageManager = detectProjectPackageManager(files, packageJson);
    const installArgs = packageManager === "pnpm"
      ? ["install", "--no-frozen-lockfile"]
      : packageManager === "yarn"
        ? ["install", "--non-interactive"]
        : packageManager === "bun"
          ? ["install"]
          : ["install", "--no-audit", "--no-fund"];
    const installCommand = packageManagerInvocation(packageManager, installArgs);
    installOutput = await runChecked(sandbox, installCommand.cmd, installCommand.args, 240_000);
    await sandbox.writeFiles([
      {
        path: PACKAGE_HASH_FILE,
        content: Buffer.from(packageHash, "utf8"),
      },
    ]);
  }

  const url = sandbox.domain(port);
  const previewHost = new URL(url).hostname;
  const viteConfigFile = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mts",
    "vite.config.mjs",
    "vite.config.cts",
    "vite.config.cjs",
  ].find((candidate) => typeof files[candidate] === "string");
  const previewConfigPath = ".experts-vite-preview.config.ts";
  if (isVite) {
    const configImport = viteConfigFile
      ? `import userConfig from "./${viteConfigFile}";`
      : "const userConfig = {};";
    const previewConfig = [
      'import { mergeConfig } from "vite";',
      configImport,
      `const previewHost = ${JSON.stringify(previewHost)};`,
      "export default async (environment) => {",
      '  const base = typeof userConfig === "function" ? await userConfig(environment) : await userConfig;',
      "  const hostConfig = { server: { allowedHosts: [previewHost] }, preview: { allowedHosts: [previewHost] } };",
      "  return Array.isArray(base) ? base.map((entry) => mergeConfig(entry, hostConfig)) : mergeConfig(base ?? {}, hostConfig);",
      "};",
      "",
    ].join("\n");
    await sandbox.writeFiles([
      { path: previewConfigPath, content: Buffer.from(previewConfig, "utf8") },
    ]);
  }
  let alreadyRunning = false;
  let blockedByViteHostCheck = false;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1500) });
    const body =
      response.status === 403 || response.status === 200 ? await response.text() : "";
    blockedByViteHostCheck =
      isVite && response.status === 403 && /Blocked request|not allowed|allowedHosts/i.test(body);
    const hasPreviewBody = response.status !== 200 || body.trim().length > 0;
    alreadyRunning =
      response.status >= 200 && response.status < 400 && hasPreviewBody && !blockedByViteHostCheck;
  } catch {
    alreadyRunning = false;
  }

  // Only kill Vite when it is demonstrably serving a blocked-host response.
  // A healthy server should stay up; a stopped/resumed sandbox has no live server
  // and is started by the branch below.
  if (isVite && !alreadyRunning) {
    await sandbox.runCommand({
      cmd: "pkill",
      args: ["-f", "[v]ite"],
      cwd: WORKDIR,
    });
    alreadyRunning = false;
  }
  const recovered = !alreadyRunning;

  if (!alreadyRunning) {
    if (scriptName) {
      const args = ["run", scriptName];
      if (isNext) args.push("--", "--hostname", "0.0.0.0", "--port", String(port));
      else if (isVite)
        args.push("--", "--host", "0.0.0.0", "--port", String(port), "--strictPort", "--config", previewConfigPath);
      await sandbox.runCommand({
        cmd: "npm",
        args,
        cwd: WORKDIR,
        env: {
          HOST: "0.0.0.0",
          PORT: String(port),
          ...(isVite ? { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: previewHost } : {}),
        },
        detached: true,
      });
    } else {
      await sandbox.runCommand({
        cmd: "npx",
        args: ["vite", "--host", "0.0.0.0", "--port", String(port), "--strictPort", "--config", previewConfigPath],
        cwd: WORKDIR,
        env: { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: previewHost },
        detached: true,
      });
    }
  }
  await waitForPreview(url);
  return { url, port, sandboxName: name, installOutput, recovered };
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function cleanTerminalOutput(value: string) {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
      .replace(/\r\n?/g, "\n")
      .slice(-30_000)
  );
}

export async function startCloudProjectTerminal(userId: string, sourceFiles: AgentProjectFiles, username = "ExpertsTeam") {
  const files = repairMissingStylesheetImports({ ...sourceFiles });
  validateFiles(files);
  const name = terminalSandboxName(userId);
  const sandbox = await Sandbox.getOrCreate({
    name,
    // Terminal sessions are scoped to the signed-in user, not a project, so switching folders
    // does not terminate the shell. Project source remains saved in Supabase.
    // Never snapshot this disposable Linux VM.
    persistent: false,
    runtime: "node24",
    resources: { vcpus: 1 },
    timeout: 45 * 60 * 1000,
    networkPolicy: "allow-all",
    ports: [5173, 4175],
    resume: true,
  });
  const savedPort = Number((await readText(sandbox, WORKDIR + "/" + PREVIEW_PORT_FILE))?.trim());
  const previewPort =
    Number.isInteger(savedPort) && savedPort >= 1 && savedPort <= 65535 ? savedPort : 5173;
  await sandbox.update({
    timeout: 45 * 60 * 1000,
    networkPolicy: "allow-all",
    ports: [previewPort, 4175],
  });

  const previous = await readText(sandbox, WORKDIR + "/" + META_FILE);
  let previousManifest: Record<string, string> = {};
  try {
    previousManifest = previous ? (JSON.parse(previous) as Record<string, string>) : {};
  } catch {
    previousManifest = {};
  }
  const nextManifest = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [
      path,
      createHash("sha256").update(content).digest("hex"),
    ]),
  );
  const nextPaths = Object.keys(files);
  const removed = Object.keys(previousManifest).filter((path) => !nextPaths.includes(path));
  if (removed.length)
    await sandbox.runCommand({ cmd: "rm", args: ["-rf", "--", ...removed], cwd: WORKDIR });
  if (nextPaths.length) {
    await sandbox.writeFiles(
      nextPaths.map((path) => ({
        path,
        content: Buffer.from(files[path], "utf8"),
      })),
    );
  }
  await sandbox.writeFiles([
    { path: META_FILE, content: Buffer.from(JSON.stringify(nextManifest), "utf8") },
  ]);
  const bridgeDir = WORKDIR + "/.experts-terminal-bridge";
  const tokenPath = WORKDIR + "/.experts-terminal-token";
  await sandbox.runCommand({ cmd: "mkdir", args: ["-p", bridgeDir], cwd: WORKDIR });
  const token = (await readText(sandbox, tokenPath))?.trim() || randomBytes(32).toString("hex");
  // Keep the terminal bridge pure JavaScript. node-pty requires node-gyp,
  // a compiler toolchain and make, which are not present in Vercel Sandbox images.
  // util-linux "script" allocates a real PTY without compiling native addons.
  const packageJson = JSON.stringify({
    private: true,
    type: "commonjs",
    dependencies: { ws: "^8.18.3" },
  });
  const serverSource = [
    'const http = require("node:http");',
    'const { spawn } = require("node:child_process");',
    'const { WebSocketServer } = require("ws");',
    "let activeShell = null;",
    "const server = http.createServer((request, response) => {",
    '  if (request.url === "/health") { response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); response.end("ok"); return; }',
    "  response.writeHead(404); response.end();",
    "});",
    "const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });",
    'server.on("upgrade", (request, socket, head) => {',
    '  if (request.url !== "/terminal") { socket.destroy(); return; }',
    '  const protocols = String(request.headers["sec-websocket-protocol"] || "").split(",").map((value) => value.trim());',
    '  if (!process.env.TERMINAL_TOKEN || !protocols.includes(process.env.TERMINAL_TOKEN)) { socket.write("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n"); socket.destroy(); return; }',
    '  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client));',
    "});",
    'sockets.on("connection", (client) => {',
    "  if (activeShell) { try { activeShell.kill(); } catch {} activeShell = null; }",
    '  const shell = spawn("script", ["-q", "-f", "-c", "runuser -u experts-shell -- env HOME=/home/experts-shell USER=experts-shell LOGNAME=experts-shell PATH=/home/experts-shell/.npm-global/bin:/usr/local/bin:/usr/bin:/bin ALL_PROXY=socks5h://127.0.0.1:9050 all_proxy=socks5h://127.0.0.1:9050 HTTP_PROXY=socks5h://127.0.0.1:9050 HTTPS_PROXY=socks5h://127.0.0.1:9050 http_proxy=socks5h://127.0.0.1:9050 https_proxy=socks5h://127.0.0.1:9050 NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 /usr/bin/proxychains4 -q -f /vercel/sandbox/.experts-terminal-bridge/proxychains.conf /bin/bash --noprofile --rcfile /vercel/sandbox/.experts-terminal-bridge/prompt.rc -i", "/dev/null"], { cwd: process.env.TERMINAL_CWD || "/vercel/sandbox", env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }, stdio: ["pipe", "pipe", "pipe"] });',
    "  activeShell = shell;",
    '  shell.stdout.on("data", (data) => { if (client.readyState === 1) client.send(data); });',
    '  shell.stderr.on("data", (data) => { if (client.readyState === 1) client.send(data); });',
    '  shell.on("error", (error) => { if (client.readyState === 1) client.send("\\r\\nTerminal startup error: " + error.message + "\\r\\n"); });',
    '  shell.on("close", () => { if (activeShell === shell) activeShell = null; if (client.readyState === 1) client.close(); });',
    '  client.on("message", (buffer) => {',
    "    const value = buffer.toString();",
    '    if (value.charCodeAt(0) === 0) { try { const control = JSON.parse(value.slice(1)); if (control.type === "resize") { /* Keep the shell input stream reserved for user keystrokes. */ } } catch {} return; }',
    "    if (shell.stdin.writable) shell.stdin.write(value);",
    "  });",
    '  client.on("close", () => { try { shell.kill("SIGHUP"); } catch {} if (activeShell === shell) activeShell = null; });',
    "});",
    'server.listen(Number(process.env.TERMINAL_PORT || 4175), "0.0.0.0");',
  ].join("\n");

  await sandbox.writeFiles([
    { path: bridgeDir + "/package.json", content: Buffer.from(packageJson, "utf8") },
    { path: bridgeDir + "/server.cjs", content: Buffer.from(serverSource, "utf8") },
    { path: bridgeDir + "/prompt.rc", content: Buffer.from("PS1=" + shellQuote((username.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 39) || "ExpertsTeam") + "@expertsteam:\\w$ ") + "\nexport PS1\nPROMPT_COMMAND=\n", "utf8") },
    { path: tokenPath, content: Buffer.from(token, "utf8"), mode: 0o600 },
  ]);
  const syntaxCheck = await sandbox.runCommand({
    cmd: "node",
    args: ["--check", bridgeDir + "/server.cjs"],
    cwd: WORKDIR,
    timeoutMs: 10_000,
  });
  if (syntaxCheck.exitCode !== 0)
    throw new Error(
      "The Linux terminal bridge failed its syntax check: " +
        (await syntaxCheck.stderr()).slice(-2000),
    );
  const scriptCheck = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", "command -v script"],
    cwd: WORKDIR,
    timeoutMs: 10_000,
  });
  if (scriptCheck.exitCode !== 0)
    throw new Error(
      "This Vercel Sandbox image does not include the util-linux script command required to allocate a terminal.",
    );
  // The Tor bootstrap packages are installed before the egress lock is applied.
  // The larger optional security toolkit is installed through Tor after the lock is active.
  const toolkitMarker = WORKDIR + "/.experts-ctf-toolkit-v2";
  const toolkitCheck = await sandbox.runCommand({ cmd: "test", args: ["-f", toolkitMarker], cwd: WORKDIR });
  let toolkitStatus: "ready" | "skipped" | "unavailable" = toolkitCheck.exitCode === 0 ? "ready" : "installing";

  // Route terminal child processes through Tor and enforce a dual-stack egress kill switch.
  const torConfigPath = bridgeDir + "/torrc";
  const proxychainsConfigPath = bridgeDir + "/proxychains.conf";
  await sandbox.writeFiles([
    {
      path: torConfigPath,
      content: Buffer.from([
        "ClientOnly 1",
        "SocksPort 127.0.0.1:9050 IsolateSOCKSAuth",
        "SafeSocks 1",
        "TestSocks 1",
        "MaxCircuitDirtiness 600",
        "AvoidDiskWrites 1",
        "DataDirectory /tmp/expersteam-tor-data",
        "Log notice file /tmp/expersteam-tor.log",
      ].join("\n") + "\n", "utf8"),
      mode: 0o600,
    },
    {
      path: proxychainsConfigPath,
      content: Buffer.from([
        "strict_chain",
        "proxy_dns",
        "tcp_read_time_out 15000",
        "tcp_connect_time_out 10000",
        "[ProxyList]",
        "socks5 127.0.0.1 9050",
      ].join("\n") + "\n", "utf8"),
      mode: 0o600,
    },
  ]);
  const torTools = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", [
      "command -v tor >/dev/null && command -v proxychains4 >/dev/null && command -v iptables >/dev/null && command -v ip6tables >/dev/null && command -v runuser >/dev/null && command -v curl >/dev/null && command -v nc >/dev/null && command -v dig >/dev/null",
    ].join(" ")],
    cwd: WORKDIR,
    timeoutMs: 10_000,
  });
  if (torTools.exitCode !== 0) {
    const installTor = await sandbox.runCommand({
      cmd: "sh",
      args: ["-lc", [
        'if [ "$(id -u)" -ne 0 ] || ! command -v apt-get >/dev/null 2>&1; then exit 4; fi',
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update -qq",
        "apt-get install -y --no-install-recommends tor proxychains4 iptables netcat-openbsd dnsutils curl",
      ].join(" && ")],
      cwd: WORKDIR,
      timeoutMs: 180_000,
      sudo: true,
    });
    if (installTor.exitCode !== 0) {
      throw new Error("Could not install the Tor client, SOCKS proxy, and dual-stack firewall packages: " + (await installTor.stderr()).slice(-1800));
    }
  }
  const torUserSetup = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", [
      "id -u experts-tor >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin experts-tor",
      "id -u experts-shell >/dev/null 2>&1 || useradd --create-home --shell /bin/bash experts-shell",
      "mkdir -p /tmp/expersteam-tor-data /home/experts-shell/.npm-global",
      "chown -R experts-tor:experts-tor /tmp/expersteam-tor-data && chmod 700 /tmp/expersteam-tor-data",
      "chown -R experts-shell:experts-shell /home/experts-shell",
      "chown experts-shell:experts-shell " + WORKDIR + " && chmod 1755 " + WORKDIR,
      "find " + WORKDIR + " -mindepth 1 -maxdepth 1 ! -name .experts-terminal-bridge ! -name .experts-terminal-token -exec chown -R experts-shell:experts-shell {} +",
      "chown root:root " + bridgeDir + " && chmod 755 " + bridgeDir,
      "chmod 644 " + torConfigPath + " " + proxychainsConfigPath + " " + bridgeDir + "/prompt.rc",
      "chmod 600 " + tokenPath,
      "printf 'prefix=/home/experts-shell/.npm-global\\n' > /home/experts-shell/.npmrc",
      "chown experts-shell:experts-shell /home/experts-shell/.npmrc",
    ].join(" && ")],
    cwd: WORKDIR,
    timeoutMs: 10_000,
    sudo: true,
  });
  if (torUserSetup.exitCode !== 0) {
    throw new Error("Could not create the isolated Tor service account: " + (await torUserSetup.stderr()).slice(-1200));
  }
  const torCheck = async () => sandbox.runCommand({
    cmd: "curl",
    args: ["--silent", "--show-error", "--fail", "--max-time", "8", "--socks5-hostname", "127.0.0.1:9050", "https://check.torproject.org/api/ip"],
    cwd: WORKDIR,
    timeoutMs: 10_000,
  });
  let torExitIp = "";
  let torReady = false;
  const existingTor = await torCheck();
  if (existingTor.exitCode === 0) {
    try {
      const result = JSON.parse((await existingTor.stdout()).trim()) as { IsTor?: boolean; IP?: string };
      torReady = result.IsTor === true && typeof result.IP === "string";
      torExitIp = torReady ? result.IP! : "";
    } catch {
      torReady = false;
    }
  }
  if (!torReady) {
    await sandbox.runCommand({
      cmd: "runuser",
      args: ["-u", "experts-tor", "--", "tor", "-f", torConfigPath],
      cwd: WORKDIR,
      detached: true,
      sudo: true,
    });
    for (let attempt = 0; attempt < 90; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const check = await torCheck();
      if (check.exitCode === 0) {
        try {
          const result = JSON.parse((await check.stdout()).trim()) as { IsTor?: boolean; IP?: string };
          if (result.IsTor === true && typeof result.IP === "string") {
            torReady = true;
            torExitIp = result.IP;
            break;
          }
        } catch {
          // Wait until Tor has a verified exit circuit.
        }
      }
    }
  }
  if (!torReady) {
    throw new Error("Tor could not bootstrap a verified Tor exit circuit. The terminal was not opened, so it cannot silently fall back to your direct IP. Retry after checking sandbox network access.");
  }

  const installed = await sandbox.runCommand({
    cmd: "test",
    args: ["-d", bridgeDir + "/node_modules/ws"],
    cwd: WORKDIR,
  });
  if (installed.exitCode !== 0) {
    const install = await sandbox.runCommand({
      cmd: "proxychains4",
      args: ["-q", "-f", proxychainsConfigPath, "npm", "install", "--no-audit", "--no-fund"],
      cwd: bridgeDir,
      timeoutMs: 180_000,
      sudo: true,
    });
    if (install.exitCode !== 0)
      throw new Error(
        "Could not install the JavaScript-only terminal runtime through Tor: " +
          (await install.stderr()).slice(-3000),
      );
  }

  const firewallScript = [
    "set -eu",
    "TOR_UID=$(id -u experts-tor)",
    "for FW in iptables ip6tables; do",
    "  $FW -w -N EXPERTS_TOR_EGRESS 2>/dev/null || $FW -w -F EXPERTS_TOR_EGRESS",
    "  $FW -w -A EXPERTS_TOR_EGRESS -o lo -j ACCEPT",
    "  $FW -w -A EXPERTS_TOR_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED --ctdir REPLY -j ACCEPT",
    "  $FW -w -A EXPERTS_TOR_EGRESS -m owner --uid-owner $TOR_UID -p tcp -j ACCEPT",
    "  $FW -w -A EXPERTS_TOR_EGRESS -j REJECT",
    "  $FW -w -C OUTPUT -j EXPERTS_TOR_EGRESS 2>/dev/null || $FW -w -I OUTPUT 1 -j EXPERTS_TOR_EGRESS",
    "done",
  ].join("\n");
  const firewall = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", firewallScript],
    cwd: WORKDIR,
    timeoutMs: 15_000,
    sudo: true,
  });
  if (firewall.exitCode !== 0) {
    throw new Error(
      "Tor connected, but this Vercel Sandbox does not allow the IPv4+IPv6 egress kill switch required to prevent direct-IP leaks. The terminal was not opened. " +
        (await firewall.stderr()).slice(-1500),
    );
  }

  const directLeakTest = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", "if nc -4 -z -w 3 1.1.1.1 443 >/dev/null 2>&1; then exit 9; fi; if nc -6 -z -w 3 2606:4700:4700::1111 443 >/dev/null 2>&1; then exit 10; fi; if dig +time=2 +tries=1 @1.1.1.1 example.com >/dev/null 2>&1; then exit 11; fi; if dig +tcp +time=2 +tries=1 @1.1.1.1 example.com >/dev/null 2>&1; then exit 12; fi; exit 0"],
    cwd: WORKDIR,
    timeoutMs: 16_000,
  });
  if (directLeakTest.exitCode !== 0) {
    throw new Error("The terminal egress kill switch did not block direct IPv4 and IPv6 requests. The terminal was not opened.");
  }
  const torProxyTest = await sandbox.runCommand({
    cmd: "proxychains4",
    args: ["-q", "-f", proxychainsConfigPath, "curl", "-fsS", "--max-time", "15", "https://check.torproject.org/api/ip"],
    cwd: WORKDIR,
    timeoutMs: 20_000,
  });
  if (torProxyTest.exitCode !== 0) {
    throw new Error("The terminal's enforced Tor proxy self-test failed. The terminal was not opened.");
  }
  try {
    const verified = JSON.parse((await torProxyTest.stdout()).trim()) as { IsTor?: boolean };
    if (verified.IsTor !== true) throw new Error("Tor exit verification returned IsTor=false.");
  } catch {
    throw new Error("The terminal's Tor proxy did not return a verified Tor exit response.");
  }

  if (toolkitCheck.exitCode !== 0 && toolkitStatus === "installing") {
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-lc", [
        "export DEBIAN_FRONTEND=noninteractive",
        "proxychains4 -q -f " + proxychainsConfigPath + " apt-get update -qq",
        "proxychains4 -q -f " + proxychainsConfigPath + " apt-get install -y --no-install-recommends nmap sqlmap john hashcat binwalk libimage-exiftool-perl tshark gdb python3-pwntools python3-pip python3-venv git wget jq unzip zip file ripgrep tcpdump",
        "touch " + toolkitMarker,
      ].join(" && ")],
      cwd: WORKDIR,
      detached: true,
      sudo: true,
    });
    toolkitStatus = "installing";
  }

  const ping = () =>
    sandbox.runCommand({
      cmd: "curl",
      args: ["-fsS", "http://127.0.0.1:4175/health"],
      cwd: WORKDIR,
      timeoutMs: 5000,
    });
  const health = await ping();
  if (health.exitCode !== 0) {
    await sandbox.runCommand({
      cmd: "node",
      args: ["server.cjs"],
      cwd: bridgeDir,
      env: { TERMINAL_TOKEN: token, TERMINAL_CWD: WORKDIR, TERMINAL_PORT: "4175", TERMINAL_USERNAME: username.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 39) || "ExpertsTeam" },
      detached: true,
      sudo: true,
    });
  }

  let ready = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const check = await ping();
    if (check.exitCode === 0 && (await check.stdout()).trim() === "ok") {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!ready) throw new Error("The interactive Linux terminal did not start inside the sandbox.");
  const selfTestPath = bridgeDir + "/healthcheck.cjs";
  const selfTestSource = [
    'const WebSocket = require("ws");',
    'let output = "";',
    "let passed = false;",
    'const socket = new WebSocket("ws://127.0.0.1:4175/terminal", ["experts-terminal", process.env.TERMINAL_TOKEN]);',
    "const timeout = setTimeout(() => { socket.terminate(); process.exit(1); }, 12000);",
    'socket.on("open", () => socket.send("echo EXPERTS_TERMINAL_OK\\r"));',
    'socket.on("message", (data) => { output += data.toString(); if (output.includes("EXPERTS_TERMINAL_OK")) { passed = true; clearTimeout(timeout); socket.close(); } });',
    'socket.on("close", () => { clearTimeout(timeout); process.exit(passed ? 0 : 1); });',
    'socket.on("error", () => { clearTimeout(timeout); process.exit(1); });',
  ].join("\n");
  await sandbox.writeFiles([{ path: selfTestPath, content: Buffer.from(selfTestSource, "utf8") }]);
  const selfTestResult = await sandbox.runCommand({
    cmd: "node",
    args: ["healthcheck.cjs"],
    cwd: bridgeDir,
    env: { TERMINAL_TOKEN: token },
    timeoutMs: 15_000,
  });
  if (selfTestResult.exitCode !== 0)
    throw new Error(
      "The Linux PTY failed its interactive shell self-test: " +
        (await selfTestResult.stderr()).slice(-2000),
    );

  return { url: sandbox.domain(4175).replace(/^https:/, "wss:") + "/terminal", token, toolkitStatus, torStatus: "connected" as const, torExitIp, torKillSwitch: true as const, torCircuitMaxAgeSeconds: 600 };
}

export async function stopCloudProjectTerminal(userId: string) {
  try {
    const sandbox = await Sandbox.get({ name: terminalSandboxName(userId) });
    await sandbox.stop();
    return { stopped: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|does not exist|already stopped|404/i.test(message)) return { stopped: true };
    throw error;
  }
}

export async function readCloudProjectFiles(userId: string) {
  const sandbox = await Sandbox.get({ name: terminalSandboxName(userId) });
  const listing = await sandbox.runCommand({
    cmd: "find",
    args: [
      ".",
      "(",
      "-path",
      "./node_modules",
      "-o",
      "-path",
      "./.git",
      "-o",
      "-path",
      "./dist",
      "-o",
      "-path",
      "./build",
      "-o",
      "-path",
      "./out",
      "-o",
      "-path",
      "./.next",
      "-o",
      "-path",
      "./.vercel",
      "-o",
      "-path",
      "./coverage",
      "-o",
      "-path",
      "./.experts-terminal-bridge",
      ")",
      "-prune",
      "-o",
      "-type",
      "f",
      "-print",
    ],
    cwd: WORKDIR,
    timeoutMs: 30_000,
  });
  if (listing.exitCode !== 0) throw new Error("Could not scan the sandbox project files.");
  const paths = (await listing.stdout())
    .split("\n")
    .map((path) => path.trim().replace(/^\.\//, ""))
    .filter((path) => {
      const filename = path.split("/").at(-1) ?? "";
      return (
        path &&
        /^[a-zA-Z0-9_@./-]+$/.test(path) &&
        !path.split("/").some((part) => !part || part === "." || part === "..") &&
        !path.split("/").some((part) => part.startsWith(".experts-")) &&
        ![".npmrc", ".netrc", ".pypirc"].includes(filename) &&
        !/^\.env(?:\.|$)/i.test(filename) &&
        !/^(?:id_rsa|id_ed25519|credentials?|secrets?)(?:\.|$)/i.test(filename) &&
        !/\.(?:pem|key|p12|pfx)$/i.test(filename)
      );
    });
  if (paths.length > 120)
    throw new Error(
      "The project has more than 120 files; remove generated files before importing.",
    );
  const files: AgentProjectFiles = {};
  let totalBytes = 0;
  for (const path of paths) {
    const buffer = await sandbox.readFileToBuffer({ path: WORKDIR + "/" + path });
    if (!buffer) continue;
    totalBytes += buffer.byteLength;
    if (buffer.byteLength > 150_000 || totalBytes > 1_000_000)
      throw new Error("The project files exceed the 1 MB import limit.");
    files[path] = buffer.toString("utf8");
  }
  validateFiles(files);
  return { files };
}

export async function runCloudProjectCommand(userId: string, command: string) {
  if (!command.trim() || command.length > 3000)
    throw new Error("Enter a command under 3,000 characters.");
  const sandbox = await Sandbox.get({ name: terminalSandboxName(userId) });
  const cwdPath = `${WORKDIR}/.experts-terminal-cwd`;
  const envPath = `${WORKDIR}/.experts-terminal-env`;
  const commandPath = `${WORKDIR}/.experts-terminal-command.sh`;
  const savedCwd = (await readText(sandbox, cwdPath))?.trim() || WORKDIR;
  const script = [
    "#!/usr/bin/env bash",
    `cd -- ${shellQuote(savedCwd)} || exit 1`,
    `if [ -f ${shellQuote(envPath)} ]; then source ${shellQuote(envPath)}; fi`,
    command,
    "command_status=$?",
    `pwd > ${shellQuote(cwdPath)}`,
    `export -p > ${shellQuote(envPath)}`,
    'exit "$command_status"',
    "",
  ].join("\n");
  await sandbox.writeFiles([{ path: commandPath, content: Buffer.from(script, "utf8") }]);
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["--login", commandPath],
    cwd: WORKDIR,
    timeoutMs: 120_000,
  });
  return {
    exitCode: result.exitCode,
    stdout: cleanTerminalOutput(await result.stdout()),
    stderr: cleanTerminalOutput(await result.stderr()),
    cwd: (await readText(sandbox, cwdPath))?.trim() || WORKDIR,
  };
}

function isPublishableAsset(path: string) {
  const normalized = path.replace(/\\\\/g, "/");
  const segments = normalized.split("/");
  const filename = segments.at(-1) ?? "";
  if (segments.some((part) => ["node_modules", ".git", ".vercel"].includes(part))) return false;
  if (/^\\.env(?:\\.|$)/i.test(filename)) return false;
  if (/^(?:id_rsa|id_ed25519|credentials?|secrets?)(?:\\.|$)/i.test(filename)) return false;
  if (/\\.(?:pem|key|p12|pfx)$/i.test(filename)) return false;
  return true;
}

function publishedContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    cjs: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    map: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    wasm: "application/wasm",
    txt: "text/plain; charset=utf-8",
    xml: "application/xml",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

type ProjectPackageManager = "npm" | "pnpm" | "yarn" | "bun";

function packageManagerInvocation(
  manager: ProjectPackageManager,
  args: string[],
): { cmd: string; args: string[] } {
  if (manager === "npm") return { cmd: "npm", args };
  if (manager === "bun") return { cmd: "npx", args: ["--yes", "bun", ...args] };
  return { cmd: "corepack", args: [manager, ...args] };
}

function detectProjectPackageManager(
  files: AgentProjectFiles,
  packageJson: Record<string, unknown>,
): ProjectPackageManager {
  const declared = typeof packageJson.packageManager === "string"
    ? packageJson.packageManager.split("@")[0]
    : "";
  if (declared === "pnpm" || declared === "yarn" || declared === "bun" || declared === "npm")
    return declared;
  if (files["bun.lock"] || files["bun.lockb"]) return "bun";
  if (files["pnpm-lock.yaml"]) return "pnpm";
  if (files["yarn.lock"]) return "yarn";
  return "npm";
}

export async function publishCloudProject(
  projectId: string,
  sourceFiles: AgentProjectFiles,
  slug: string,
  userId: string,
  storageClient: SupabaseClient<Database>,
) {
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug))
    throw new Error("The public app address is invalid.");

  // Publishing is a production build, not a preview-health check. Prepare the
  // sandbox first, but do not block a valid production build merely because the
  // temporary preview hostname/server cannot be reached.
  try {
    await startCloudProjectPreview(projectId, sourceFiles);
  } catch (previewError) {
    try {
      await Sandbox.get({ name: sandboxName(projectId) });
    } catch {
      throw previewError;
    }
  }
  const sandbox = await Sandbox.get({ name: sandboxName(projectId) });
  let packageJson: Record<string, unknown> = {};
  try {
    packageJson = JSON.parse(sourceFiles["package.json"] ?? "{}") as Record<string, unknown>;
  } catch {
    throw new Error("package.json contains invalid JSON. Fix it before publishing.");
  }
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const buildScript = typeof scripts.build === "string" ? scripts.build : "";
  let outputFiles: Array<{ path: string; content: Buffer }> = [];

  if (buildScript) {
    const packageManager = detectProjectPackageManager(sourceFiles, packageJson);
    const buildArgs = packageManager === "npm"
      ? ["run", "build"]
      : packageManager === "pnpm"
        ? ["run", "build"]
        : packageManager === "yarn"
          ? ["build"]
          : ["run", "build"];
    const buildEnv: Record<string, string> = {};
    // Use relative assets for static builds served from a release-specific path.
    // Frameworks with their own base-path configuration can override this in
    // their config; avoid injecting Vite-only flags into unrelated builders.
    if (/vite/i.test(buildScript)) buildArgs.push("--", "--base", "./");
    if (/react-scripts/i.test(buildScript)) buildEnv.PUBLIC_URL = ".";
    if (/next/i.test(buildScript) && /export/i.test(buildScript)) buildEnv.NEXT_PUBLIC_BASE_PATH = "";
    const buildCommand = packageManagerInvocation(packageManager, buildArgs);
    const build = await sandbox.runCommand({
      cmd: buildCommand.cmd,
      args: buildCommand.args,
      cwd: WORKDIR,
      env: buildEnv,
      timeoutMs: 300_000,
    });
    if (build.exitCode !== 0) {
      const stderr = await build.stderr();
      const stdout = await build.stdout();
      throw new Error(
        ("Build failed. Fix the build errors before publishing.\n" + (stderr || stdout)).slice(
          -6000,
        ),
      );
    }

    // Framework adapters emit static sites into different locations.
    // Check common outputs first, then discover nested Angular/monorepo outputs.
    let outputDirectory = "";
    const outputCandidates = [
      ".output/public", "dist", "build", "out", "dist/client", "build/client",
      ".svelte-kit/output/client", "public", "www",
    ];
    for (const candidate of outputCandidates) {
      const check = await sandbox.runCommand({
        cmd: "test",
        args: ["-f", `${candidate}/index.html`],
        cwd: WORKDIR,
      });
      if (check.exitCode === 0) {
        outputDirectory = candidate;
        break;
      }
    }
    if (!outputDirectory) {
      const nested = await sandbox.runCommand({
        cmd: "sh",
        args: ["-lc", "if [ -d dist ]; then find dist -type f -name index.html -print -quit; fi"],
        cwd: WORKDIR,
        timeoutMs: 15_000,
      });
      const nestedIndex = (await nested.stdout()).trim();
      if (nested.exitCode === 0 && nestedIndex) {
        outputDirectory = nestedIndex.slice(0, nestedIndex.lastIndexOf("/")) || ".";
      }
    }
    if (!outputDirectory) {
      const serverBuildDetected = [".next", ".output/server", "build/server", "server"].some((candidate) =>
        Object.prototype.hasOwnProperty.call(sourceFiles, candidate + "/index.js") ||
        Object.prototype.hasOwnProperty.call(sourceFiles, candidate + "/entry.mjs"),
      );
      throw new Error(
        serverBuildDetected
          ? "This project builds a server-rendered or backend app. Static publishing cannot run its server process yet; use a server deployment target for this project."
          : "The build finished, but no static site entry (index.html) was found. Configure the framework's static/export adapter (for example Next.js export, Nuxt generate, SvelteKit adapter-static, or Angular browser output) and publish again.",
      );
    }

    const listing = await sandbox.runCommand({
      cmd: "find",
      args: [outputDirectory, "-type", "f", "-print"],
      cwd: WORKDIR,
      timeoutMs: 30_000,
    });
    if (listing.exitCode !== 0) throw new Error("Could not list the production build output.");
    const paths = (await listing.stdout())
      .split("\n")
      .map((path) => path.trim())
      .filter((path) => path.startsWith(outputDirectory + "/"))
      .map((path) => path.slice(outputDirectory.length + 1))
      .filter(isPublishableAsset)
      .map((path) => `${outputDirectory}/${path}`);
    if (!paths.length || paths.length > 500)
      throw new Error("The build must contain between 1 and 500 publishable files.");

    let totalBytes = 0;
    for (const path of paths) {
      const buffer = await sandbox.readFileToBuffer({ path: `${WORKDIR}/${path}` });
      if (!buffer) throw new Error(`Could not read build output file: ${path}`);
      totalBytes += buffer.byteLength;
      if (buffer.byteLength > 10_000_000 || totalBytes > 40_000_000)
        throw new Error("The published build is too large (maximum 40 MB total, 10 MB per file).");
      outputFiles.push({ path: path.slice(outputDirectory.length + 1), content: buffer });
    }
  } else {
    if (!sourceFiles["index.html"])
      throw new Error("Add an index.html file or a package.json build script before publishing.");
    outputFiles = Object.entries(sourceFiles)
      .filter(([path]) => isPublishableAsset(path))
      .map(([path, content]) => ({
        path,
        content: Buffer.from(content, "utf8"),
      }));
  }

  if (!outputFiles.some((file) => file.path === "index.html"))
    throw new Error("The production build does not contain index.html.");

  const releaseId = randomUUID();
  const prefix = `${userId}/${slug}/${releaseId}`;
  for (let offset = 0; offset < outputFiles.length; offset += 8) {
    const batch = outputFiles.slice(offset, offset + 8);
    const results = await Promise.all(
      batch.map(async (file) => {
        const path = `${prefix}/${file.path}`;
        const { error } = await storageClient.storage
          .from("published-apps")
          .upload(path, file.content, {
            contentType: publishedContentType(file.path),
            cacheControl: "31536000",
            upsert: false,
          });
        if (error) throw new Error(`Could not publish ${file.path}: ${error.message}`);
      }),
    );
    void results;
  }

  const { data } = storageClient.storage
    .from("published-apps")
    .getPublicUrl(`${prefix}/index.html`);
  const publicUrl = data.publicUrl;
  if (!publicUrl) throw new Error("The publishing service did not return a public app URL.");

  // Verify the actual HTML response, not just HEAD. A successful HEAD can
  // still hide a text/plain entry point or broken relative asset URLs.
  let entryHtml = "";
  let lastStatus = "no response";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(publicUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        lastStatus = "HTTP " + response.status;
      } else {
        const contentType = response.headers.get("content-type") ?? "";
        // Supabase Storage intentionally serves HTML objects as text/plain.
        // The public app viewer fetches this text and renders it in a sandboxed srcDoc frame.
        if (!/^(?:text\/html|text\/plain)(?:;|$)/i.test(contentType)) {
          lastStatus = "entry point returned " + (contentType || "no content type") + " instead of an HTML-compatible response";
        } else {
          entryHtml = await response.text();
          const normalizedHtml = entryHtml.replace(/^\uFEFF/, "").trimStart().toLowerCase();
          if (normalizedHtml.startsWith("<!doctype html") || normalizedHtml.startsWith("<html")) {
            lastStatus = "";
            break;
          }
          entryHtml = "";
          lastStatus = "entry point response is not an HTML document";
        }
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "network error";
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  if (!entryHtml)
    throw new Error(
      "The files were uploaded, but the public entry point is not serving a valid HTML page (" +
        lastStatus +
        "). Check the published-apps bucket and the project's index.html.",
    );

  // Check the local assets directly referenced by the entry HTML. This catches
  // common broken deployments where the page exists but its CSS or JavaScript
  // is missing because the build used root-relative asset paths.
  const assetUrls = new Set<string>();
  const tagPattern = /<(script|img|source|link)\b[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(entryHtml)) !== null) {
    const tag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    if (tagName === "link" && !/(stylesheet|icon|preload|modulepreload)/.test(rel)) continue;
    const reference = tag.match(tagName === "link" ? /\bhref\s*=\s*["']([^"']+)["']/i : /\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference)) continue;
    try {
      assetUrls.add(new URL(reference, publicUrl).toString());
    } catch {
      // Ignore malformed optional references; the browser will report them.
    }
  }
  if (assetUrls.size > 40)
    throw new Error("The published entry page references more than 40 local assets; simplify the entry page and publish again.");
  for (const assetUrl of assetUrls) {
    const response = await fetch(assetUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(
        "The app entry page is available, but a required asset could not be loaded (" +
          response.status +
          "): " +
          new URL(assetUrl).pathname.split("/").pop(),
      );
  }

  return { url: publicUrl, slug, releaseId, fileCount: outputFiles.length };
}

export async function stopCloudProjectPreview(projectId: string) {
  const sandbox = await Sandbox.get({ name: sandboxName(projectId) });
  await sandbox.stop();
  return { stopped: true };
}
