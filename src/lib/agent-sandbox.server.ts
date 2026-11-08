import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { repairMissingStylesheetImports } from "./agent.server";

export type AgentProjectFiles = Record<string, string>;

const WORKDIR = "/vercel/sandbox";
const META_FILE = ".experts-agent-files.json";
const PACKAGE_HASH_FILE = ".experts-agent-package-hash";

function sandboxName(projectId: string) {
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")

function validateFiles(files: AgentProjectFiles) {
  const entries = Object.entries(files);
  if (entries.length > 120) throw new Error("This project contains too many files for preview.");
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
    if (typeof content !== "string" || content.length > 150_000)
      throw new Error("A project file is too large to preview.");
    total += content.length;
  }
  if (total > 1_000_000) throw new Error("This project is too large to preview.");
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
        } else if (response.status < 500) {
          return;
        }
      } else if (response.status === 410) {
        lastError = "The preview sandbox stopped. Restarting the cloud preview…";
      } else if (response.status < 500) {
        return;
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
  const port = isNext || scriptName === "start" || /react-scripts/.test(devScript) ? 3000 : 5173;
  const name = sandboxName(projectId);
  const sandbox = await Sandbox.getOrCreate({
    name,
    runtime: "node24",
    resources: { vcpus: 1 },
    timeout: 45 * 60 * 1000,
    ports: [port],
    resume: true,
  });

  // Existing named sandboxes keep their original configuration, so update the
  // per-session timeout as well as setting it during creation.
  await sandbox.update({ timeout: 45 * 60 * 1000 });

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

  const packageHash = createHash("sha256").update(files["package.json"]).digest("hex");
  const installedHash = await readText(sandbox, `${WORKDIR}/${PACKAGE_HASH_FILE}`);
  let installOutput = "";
  if (installedHash !== packageHash) {
    installOutput = await runChecked(
      sandbox,
      "npm",
      ["install", "--no-audit", "--no-fund"],
      180_000,
    );
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
      "  const base = typeof userConfig === \"function\" ? await userConfig(environment) : await userConfig;",
      "  const hostConfig = { server: { allowedHosts: [previewHost] }, preview: { allowedHosts: [previewHost] } };",
      "  return Array.isArray(base) ? base.map((entry) => mergeConfig(entry, hostConfig)) : mergeConfig(base ?? {}, hostConfig);",
      "};",
      "",
    ].join("\n");
    await sandbox.writeFiles([{ path: previewConfigPath, content: Buffer.from(previewConfig, "utf8") }]);
  }
  let alreadyRunning = false;
  let blockedByViteHostCheck = false;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1500) });
    const body = response.status === 403 ? await response.text() : "";
    blockedByViteHostCheck =
      isVite && response.status === 403 && /Blocked request|not allowed|allowedHosts/i.test(body);
    alreadyRunning = response.status < 500 && response.status !== 410 && !blockedByViteHostCheck;
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
      else if (isVite) args.push("--", "--host", "0.0.0.0", "--port", String(port), "--config", previewConfigPath);
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
        args: ["vite", "--host", "0.0.0.0", "--port", String(port), "--config", previewConfigPath],
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
  return value
    .replace(/\x1B\\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B\\][^\x07]*(?:\x07|\x1B\\\\)/g, "")
    .replace(/\r\n?/g, "\n")
    .slice(-30_000);
}

export async function runCloudProjectCommand(projectId: string, command: string) {
  if (!command.trim() || command.length > 3000)
    throw new Error("Enter a command under 3,000 characters.");
  const sandbox = await Sandbox.get({ name: sandboxName(projectId) });
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
  await sandbox.writeFiles([
    { path: commandPath, content: Buffer.from(script, "utf8") },
  ]);
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

export async function publishCloudProject(
  projectId: string,
  sourceFiles: AgentProjectFiles,
  slug: string,
) {
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug))
    throw new Error("The public app address is invalid.");

  await startCloudProjectPreview(projectId, sourceFiles);
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
    const build = await sandbox.runCommand({
      cmd: "npm",
      args: ["run", "build"],
      cwd: WORKDIR,
      timeoutMs: 240_000,
    });
    if (build.exitCode !== 0) {
      const stderr = await build.stderr();
      const stdout = await build.stdout();
      throw new Error(
        ("Build failed. Fix the build errors before publishing.\n" + (stderr || stdout)).slice(-6000),
      );
    }

    let outputDirectory = "";
    for (const candidate of ["dist", "build", "out"]) {
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
      throw new Error(
        "The build completed but no static index.html was found in dist/, build/ or out/. This publisher currently supports static frontend builds.",
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
      .filter((path) => path.startsWith(outputDirectory + "/"));
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
    outputFiles = Object.entries(sourceFiles).map(([path, content]) => ({
      path,
      content: Buffer.from(content, "utf8"),
    }));
  }

  if (!outputFiles.some((file) => file.path === "index.html"))
    throw new Error("The production build does not contain index.html.");

  const releaseId = crypto.randomUUID();
  const prefix = `${slug}/${releaseId}`;
  for (let offset = 0; offset < outputFiles.length; offset += 8) {
    const batch = outputFiles.slice(offset, offset + 8);
    const results = await Promise.all(
      batch.map(async (file) => {
        const path = `${prefix}/${file.path}`;
        const { error } = await supabaseAdmin.storage
          .from("published-apps")
          .upload(path, file.content, {
            contentType: publishedContentType(file.path),
            cacheControl: "31536000",
            upsert: true,
          });
        if (error) throw new Error(`Could not publish ${file.path}: ${error.message}`);
      }),
    );
    void results;
  }

  const { data } = supabaseAdmin.storage
    .from("published-apps")
    .getPublicUrl(`${prefix}/index.html`);
  return { url: data.publicUrl, slug, releaseId, fileCount: outputFiles.length };
}

export async function stopCloudProjectPreview(projectId: string) {
  const sandbox = await Sandbox.get({ name: sandboxName(projectId) });
  await sandbox.stop();
  return { stopped: true };
}
