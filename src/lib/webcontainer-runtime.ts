import type {
  FileSystemTree,
  WebContainer as WebContainerInstance,
  WebContainerProcess,
} from "@webcontainer/api";

export type RuntimeFileMap = Record<string, string>;

export type RuntimeCallbacks = {
  onOutput?: (text: string) => void;
  onServerReady?: (port: number, url: string) => void;
  onError?: (message: string) => void;
};

let containerPromise: Promise<WebContainerInstance> | null = null;
let containerInstance: WebContainerInstance | null = null;
let devProcess: WebContainerProcess | null = null;
let terminalProcess: WebContainerProcess | null = null;
let terminalInputWriter: WritableStreamDefaultWriter<string> | null = null;

function cleanTerminalText(value: string) {
  return value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .replace(/\x1B./g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r(?!\n)/g, "\n");
}

function log(callbacks: RuntimeCallbacks, value: string) {
  callbacks.onOutput?.(cleanTerminalText(value));
}

function normalizePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!normalized || normalized.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Invalid project file path: ${path}`);
  }

  return normalized;
}

function createFileTree(files: RuntimeFileMap): FileSystemTree {
  const root: Record<string, unknown> = {};

  for (const [originalPath, contents] of Object.entries(files)) {
    const path = normalizePath(originalPath);
    const parts = path.split("/");
    let current = root;

    for (let index = 0; index < parts.length - 1; index++) {
      const part = parts[index];

      if (!current[part]) {
        current[part] = { directory: {} };
      }

      const entry = current[part] as {
        directory?: Record<string, unknown>;
      };

      if (!entry.directory) {
        throw new Error(`File and directory conflict: ${path}`);
      }

      current = entry.directory;
    }

    const filename = parts[parts.length - 1];

    if (current[filename]) {
      throw new Error(`Duplicate project file: ${path}`);
    }

    current[filename] = {
      file: {
        contents,
      },
    };
  }

  return root as FileSystemTree;
}

function ensurePackageJson(files: RuntimeFileMap): RuntimeFileMap {
  if (files["package.json"]) {
    return files;
  }

  return {
    ...files,
    "package.json": JSON.stringify(
      {
        name: "experts-team-project",
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "vite build",
        },
        dependencies: {
          vite: "latest",
        },
      },
      null,
      2,
    ),
  };
}

/**
 * Starts the browser-based Node.js environment.
 * WebContainer can only be booted once per browser page.
 */
export async function bootWebContainer(
  callbacks: RuntimeCallbacks = {},
): Promise<WebContainerInstance> {
  if (typeof window === "undefined") {
    throw new Error("The project runtime can only start in a browser.");
  }

  if (!window.crossOriginIsolated || !("SharedArrayBuffer" in window)) {
    throw new Error(
      "The browser runtime is not available. Check the website's COOP and COEP security headers and reload the page.",
    );
  }

  if (containerInstance) {
    return containerInstance;
  }

  if (!containerPromise) {
    containerPromise = (async () => {
      const { WebContainer } = await import("@webcontainer/api");

      const instance = await WebContainer.boot({
        coep: "credentialless",
        forwardPreviewErrors: true,
      });

      instance.on("error", (error) => {
        callbacks.onError?.(error.message || "Runtime error");
      });

      instance.on("preview-message", (message) => {
        if (
          message.type === "ConsoleError" ||
          message.type === "UncaughtException" ||
          message.type === "UnhandledRejection"
        ) {
          const detail =
            "message" in message
              ? message.message
              : "args" in message
                ? message.args.map((value) => String(value)).join(" ")
                : "Preview application error";
          callbacks.onError?.(detail || "Preview application error");
        }
      });

      containerInstance = instance;
      return instance;
    })().catch((error) => {
      containerPromise = null;
      throw error;
    });
  }

  return containerPromise;
}

/**
 * Copies the project's files into the runtime.
 */
export async function mountProjectFiles(files: RuntimeFileMap, callbacks: RuntimeCallbacks = {}) {
  const instance = await bootWebContainer(callbacks);
  const projectFiles = ensurePackageJson(files);

  log(callbacks, "Preparing project files...\n");

  // Remove files from the previously opened project while retaining installed
  // dependencies so switching projects does not require a full cold install.
  // WebContainer filesystem methods resolve paths from the current workdir.
  // Passing instance.workdir here would prepend it a second time and cause
  // ENOENT errors such as /home/.../home/....
  const existingEntries = await instance.fs.readdir(".", {
    encoding: "utf-8",
  });
  await Promise.all(
    existingEntries
      .filter((entry) => entry !== "node_modules" && entry !== ".experts-install-signature")
      .map((entry) =>
        instance.fs.rm(entry, {
          recursive: true,
          force: true,
        }),
      ),
  );

  await instance.mount(createFileTree(projectFiles));

  log(callbacks, "Project files loaded successfully.\n");

  return instance;
}

/**
 * Installs dependencies listed in package.json.
 */
export async function installDependencies(
  callbacks: RuntimeCallbacks = {},
  signature = "",
): Promise<number> {
  const instance = await bootWebContainer(callbacks);
  const hasNodeModules = await instance.fs
    .readdir("node_modules", { encoding: "utf-8" })
    .then((entries) => entries.length > 0)
    .catch(() => false);
  const installedSignature = await instance.fs
    .readFile(".experts-install-signature", "utf-8")
    .catch(() => "");

  if (hasNodeModules && signature && installedSignature === signature) {
    log(callbacks, "Dependencies are already installed. Reusing cached packages.\n");
    return 0;
  }

  log(callbacks, "\nInstalling project dependencies...\n");

  const process = await instance.spawn("npm", [
    "install",
    "--prefer-offline",
    "--no-audit",
    "--no-fund",
  ]);

  void process.output.pipeTo(
    new WritableStream({
      write(data) {
        log(callbacks, data);
      },
    }),
  );

  const exitCode = await process.exit;

  if (exitCode !== 0) {
    callbacks.onError?.(`Dependency installation failed with exit code ${exitCode}.`);
  } else {
    if (signature) await instance.fs.writeFile(".experts-install-signature", signature);
    log(callbacks, "\nDependencies installed successfully.\n");
  }

  return exitCode;
}

/**
 * Starts the actual development server and returns its preview URL.
 */
export async function startDevServer(
  callbacks: RuntimeCallbacks = {},
): Promise<{ port: number; url: string }> {
  const instance = await bootWebContainer(callbacks);

  if (devProcess) {
    devProcess.kill();
    devProcess = null;
  }

  const packageContents = await instance.fs.readFile("package.json", "utf-8");
  const packageJson = JSON.parse(packageContents) as {
    scripts?: Record<string, string>;
  };

  const scripts = packageJson.scripts ?? {};
  const scriptName = scripts.dev ? "dev" : scripts.start ? "start" : null;

  if (!scriptName) {
    throw new Error('This project has no "dev" or "start" script in package.json.');
  }

  log(callbacks, `\nStarting project with npm run ${scriptName}...\n`);

  let serverReadyHandler: (() => void) | undefined;
  let timeoutId: ReturnType<typeof setTimeout>;

  const serverReady = new Promise<{ port: number; url: string }>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      serverReadyHandler?.();
      serverReadyHandler = undefined;
      reject(
        new Error(
          "The development server did not become ready within 90 seconds. Check the Console for errors.",
        ),
      );
    }, 90000);

    serverReadyHandler = instance.on("server-ready", (port, url) => {
      serverReadyHandler?.();
      serverReadyHandler = undefined;
      clearTimeout(timeoutId);
      callbacks.onServerReady?.(port, url);
      log(callbacks, `\nPreview ready at ${url}\n`);
      resolve({ port, url });
    });

    void (async () => {
      try {
        // Respect the project's own dev/start script so Vite, Next,
        // React tooling, and other Node-based frameworks can choose their
        // supported host flags.
        devProcess = await instance.spawn("npm", ["run", scriptName]);

        void devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              log(callbacks, data);
            },
          }),
        );

        const runningProcess = devProcess;

        void runningProcess.exit.then((exitCode) => {
          if (serverReadyHandler) {
            serverReadyHandler();
            serverReadyHandler = undefined;
            clearTimeout(timeoutId);
            reject(
              new Error(
                `Development server exited with code ${exitCode} before opening a preview. Check the terminal output.`,
              ),
            );
          }
        });
      } catch (error) {
        serverReadyHandler?.();
        serverReadyHandler = undefined;
        clearTimeout(timeoutId);
        reject(error);
      }
    })();
  });

  return serverReady;
}

/**
 * Updates a file without remounting the whole project.
 */
export async function writeProjectFile(
  path: string,
  contents: string,
  callbacks: RuntimeCallbacks = {},
) {
  const instance = await bootWebContainer(callbacks);
  const safePath = normalizePath(path);
  const parts = safePath.split("/");
  let directory = ".";

  for (const part of parts.slice(0, -1)) {
    directory = directory === "." ? part : `${directory}/${part}`;
    await instance.fs.mkdir(directory, { recursive: true });
  }

  await instance.fs.writeFile(safePath, contents);
}

export async function removeProjectFile(path: string) {
  const instance = await bootWebContainer();
  const safePath = normalizePath(path);
  await instance.fs.rm(safePath, {
    recursive: true,
    force: true,
  });
}

/**
 * Stops the running development server.
 */
export function stopDevServer() {
  if (devProcess) {
    devProcess.kill();
    devProcess = null;
  }
}

/**
 * Starts a persistent browser shell for project commands.
 * This is a WebContainer shell, not a privileged host Linux machine.
 */
export async function startTerminalSession(
  onOutput: (text: string) => void,
  onExit?: (exitCode: number) => void,
) {
  const instance = await bootWebContainer();
  if (terminalProcess) return;

  terminalProcess = await instance.spawn("jsh", {
    terminal: { cols: 100, rows: 28 },
  });
  terminalInputWriter = terminalProcess.input.getWriter();

  const activeProcess = terminalProcess;
  void activeProcess.output
    .pipeTo(
      new WritableStream({
        write(data) {
          onOutput(cleanTerminalText(data));
        },
      }),
    )
    .catch((error) => {
      onOutput(
        `\r\n[terminal output error] ${error instanceof Error ? error.message : String(error)}\r\n`,
      );
    });

  void activeProcess.exit.then((exitCode) => {
    if (terminalProcess === activeProcess) {
      terminalProcess = null;
      try {
        terminalInputWriter?.releaseLock();
      } catch {
        // The process may already have closed its input stream.
      }
      terminalInputWriter = null;
    }
    onExit?.(exitCode);
  });
}

export async function writeTerminalInput(input: string) {
  if (!terminalProcess || !terminalInputWriter)
    throw new Error("The terminal is not running. Start it again.");
  await terminalInputWriter.write(input);
}

export function stopTerminalSession() {
  terminalProcess?.kill();
  terminalProcess = null;
  try {
    terminalInputWriter?.releaseLock();
  } catch {
    // The writer may already have been released when the shell exited.
  }
  terminalInputWriter = null;
}

/**
 * Returns the existing runtime, if it has already started.
 */
export function getWebContainer() {
  return containerInstance;
}
