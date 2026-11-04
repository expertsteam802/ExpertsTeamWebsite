import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

export type AgentProjectFiles = Record<string, string>;

const WORKDIR = "/vercel/sandbox";
const META_FILE = ".experts-agent-files.json";
const PACKAGE_HASH_FILE = ".experts-agent-package-hash";

function sandboxName(projectId: string) {
  return `experts-agent-${projectId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36)}`;
}

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
      if (response.status < 500) return;
      lastError = `Preview returned HTTP ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(lastError);
}

export async function startCloudProjectPreview(projectId: string, sourceFiles: AgentProjectFiles) {
  validateFiles(sourceFiles);
  const files = { ...sourceFiles };
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
  const isNext = /next\s+dev|next\s+start/.test(activeScripts[scriptName ?? ""] ?? "");
  const port = isNext ? 3000 : 5173;
  const name = sandboxName(projectId);
  const sandbox = await Sandbox.getOrCreate({
    name,
    runtime: "node24",
    ports: [port],
    resume: true,
  });

  const previous = await readText(sandbox, `${WORKDIR}/${META_FILE}`);
  let previousPaths: string[] = [];
  try {
    previousPaths = previous ? (JSON.parse(previous) as string[]) : [];
  } catch {
    previousPaths = [];
  }
  const nextPaths = Object.keys(files);
  const removed = previousPaths.filter((path) => !nextPaths.includes(path));
  if (removed.length) {
    await sandbox.runCommand({ cmd: "rm", args: ["-rf", "--", ...removed], cwd: WORKDIR });
  }
  await sandbox.writeFiles(
    nextPaths.map((path) => ({
      path,
      content: Buffer.from(files[path], "utf8"),
    })),
  );
  await sandbox.writeFiles([
    {
      path: META_FILE,
      content: Buffer.from(JSON.stringify(nextPaths), "utf8"),
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
  let alreadyRunning = false;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1500) });
    alreadyRunning = response.status < 500;
  } catch {
    alreadyRunning = false;
  }

  if (!alreadyRunning) {
    if (scriptName) {
      const args = ["run", scriptName, "--"];
      if (isNext) args.push("--hostname", "0.0.0.0", "--port", String(port));
      else args.push("--host", "0.0.0.0", "--port", String(port));
      await sandbox.runCommand({ cmd: "npm", args, cwd: WORKDIR, detached: true });
    } else {
      await sandbox.runCommand({
        cmd: "npx",
        args: ["vite", "--host", "0.0.0.0", "--port", String(port)],
        cwd: WORKDIR,
        detached: true,
      });
    }
  }
  await waitForPreview(url);
  return { url, port, sandboxName: name, installOutput };
}

export async function runCloudProjectCommand(projectId: string, command: string) {
  if (!command.trim() || command.length > 3000)
    throw new Error("Enter a command under 3,000 characters.");
  const sandbox = await Sandbox.get({ name: sandboxName(projectId) });
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    cwd: WORKDIR,
    timeout: 120_000,
  });
  return {
    exitCode: result.exitCode,
    stdout: (await result.stdout()).slice(-30_000),
    stderr: (await result.stderr()).slice(-30_000),
  };
}

export async function stopCloudProjectPreview(projectId: string) {
  const sandbox = await Sandbox.get({ name: sandboxName(projectId) });
  await sandbox.stop();
  return { stopped: true };
}
