import { createHash, randomBytes } from "node:crypto";
import { posix as path } from "node:path";
import { Daytona } from "@daytona/sdk";

import type { AgentProjectFiles } from "./agent-sandbox.server";

const META_FILE = ".experts-agent-files.json";
const BRIDGE_DIR = ".experts-terminal-bridge";
const TOKEN_FILE = ".experts-terminal-token";
const TERMINAL_PORT = 4175;
const WORKSPACE_IDLE_MINUTES = 30;

type CliName = "kilo" | "opencode" | "aider";
type DaytonaSandbox = any;

function client() {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) throw new Error("Daytona is not configured. Add DAYTONA_API_KEY to the Vercel server environment.");
  const daytona = new Daytona({ apiKey });
  return { daytona, api: daytona.v0 as any };
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

async function getOrCreateSandbox(api: any, name: string): Promise<DaytonaSandbox> {
  let sandbox: DaytonaSandbox | undefined;
  try {
    sandbox = await api.get(name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found|404|does not exist/i.test(message)) throw error;
  }

  if (!sandbox) {
    sandbox = await api.create({
      name,
      language: "typescript",
      public: true,
      autoStopInterval: WORKSPACE_IDLE_MINUTES,
      autoDeleteInterval: -1,
    });
  } else if (String(sandbox.state ?? "").toLowerCase() === "stopped") {
    await sandbox.start(120);
  } else if (String(sandbox.state ?? "").toLowerCase() === "archived") {
    throw new Error("Your Daytona workspace is archived. Restore it from the Daytona dashboard before reconnecting.");
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
    ? 'command -v kilo >/dev/null 2>&1 && exec kilo || printf "\\nKilo Code is not installed. Reconnect the workspace to repair it.\\n"'
    : cli === "opencode"
      ? 'command -v opencode >/dev/null 2>&1 && exec opencode || printf "\\nOpenCode is not installed. Reconnect the workspace to repair it.\\n"'
      : 'command -v aider >/dev/null 2>&1 && exec aider || printf "\\nAider is not installed. Reconnect the workspace to repair it.\\n"';
  const skipEnv = "$" + "{EXPERTS_SKIP_KILO:-0}";
  return "export PS1=" + shellQuote(safeUsername + "@expertsteam:\\w$ ") +
    "\nPROMPT_COMMAND=\nif [ \"" + skipEnv + "\" != \"1\" ]; then\n  " + launch + "\nfi\n";
}

async function ensureCliInstalled(sandbox: DaytonaSandbox, cli: CliName, workdir: string) {
  const home = await command(sandbox, 'printf %s "$HOME"', workdir, undefined, 10);
  const globalBin = path.join(home, ".npm-global", "bin");
  const localBin = path.join(home, ".local", "bin");
  const pathValue = globalBin + ":" + localBin + ":/usr/local/bin:/usr/bin:/bin";

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
        todoread: "allow", todowrite: "allow", external_directory: "deny", bash: "ask", doom_loop: "ask",
      },
    };
    await uploadFiles(sandbox, [
      { destination: path.join(bridgeDir, "package.json"), source: Buffer.from(JSON.stringify({ private: true, type: "commonjs", dependencies: { ws: "^8.18.3" } }), "utf8") },
      { destination: path.join(bridgeDir, "server.cjs"), source: Buffer.from(terminalBridgeSource(workdir, bridgeDir), "utf8") },
      { destination: path.join(bridgeDir, "prompt.rc"), source: Buffer.from(cliPrompt(username, cli), "utf8") },
      { destination: tokenPath, source: Buffer.from(token, "utf8") },
      { destination: path.join(install.home, ".config", "kilo", "kilo.jsonc"), source: Buffer.from(JSON.stringify(kiloPermissions, null, 2) + "\n", "utf8") },
    ]);

    stage = "installing the terminal WebSocket runtime";
    await command(sandbox, "npm install --no-audit --no-fund", bridgeDir, { PATH: install.pathValue }, 180);

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
    return { sandboxName: name, url: url.toString(), token, toolkitStatus: "skipped" as const, cli };
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
  let sandbox: DaytonaSandbox;
  try { sandbox = await api.get(name); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404|does not exist/i.test(message)) return { stopped: true, preserved: true };
    throw error;
  }
  if (String(sandbox.state ?? "").toLowerCase() !== "stopped") await sandbox.stop();
  return { stopped: true, preserved: true };
}

export async function readDaytonaProjectFiles(name: string) {
  const { api } = client();
  const sandbox = await api.get(name) as DaytonaSandbox;
  if (String(sandbox.state ?? "").toLowerCase() === "stopped") await sandbox.start(120);
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
  const sandbox = await api.get(name) as DaytonaSandbox;
  if (String(sandbox.state ?? "").toLowerCase() === "stopped") await sandbox.start(120);
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
