
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

function log(callbacks: RuntimeCallbacks, value: string) {
  callbacks.onOutput?.(value);
}

function normalizePath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");

  if (
    !normalized ||
    normalized.split("/").some((part) => part === ".." || part === ".")
  ) {
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
          callbacks.onError?.(message.message || "Preview application error");
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
export async function mountProjectFiles(
  files: RuntimeFileMap,
  callbacks: RuntimeCallbacks = {},
) {
  const instance = await bootWebContainer(callbacks);
  const projectFiles = ensurePackageJson(files);

  log(callbacks, "Preparing project files...\n");

  await instance.mount(createFileTree(projectFiles));

  log(callbacks, "Project files loaded successfully.\n");

  return instance;
}

/**
 * Installs dependencies listed in package.json.
 */
export async function installDependencies(
  callbacks: RuntimeCallbacks = {},
): Promise<number> {
  const instance = await bootWebContainer(callbacks);

  log(callbacks, "\nInstalling project dependencies...\n");

  const process = await instance.spawn("npm", ["install"]);

  void process.output.pipeTo(
    new WritableStream({
      write(data) {
        log(callbacks, data);
      },
    }),
  );

  const exitCode = await process.exit;

  if (exitCode !== 0) {
    callbacks.onError?.(
      `Dependency installation failed with exit code ${exitCode}.`,
    );
  } else {
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
  const scriptName = scripts.dev
    ? "dev"
    : scripts.start
      ? "start"
      : null;

  if (!scriptName) {
    throw new Error(
      'This project has no "dev" or "start" script in package.json.',
    );
  }

  log(callbacks, `\nStarting project with npm run ${scriptName}...\n`);

  let serverReadyHandler: (() => void) | undefined;

  const serverReady = new Promise<{ port: number; url: string }>(
    (resolve, reject) => {
      serverReadyHandler = instance.on("server-ready", (port, url) => {
        serverReadyHandler?.();
        callbacks.onServerReady?.(port, url);
        log(callbacks, `\nPreview ready at ${url}\n`);
        resolve({ port, url });
      });

      void (async () => {
        try {
          devProcess = await instance.spawn("npm", [
            "run",
            scriptName,
            "--",
            "--host",
            "0.0.0.0",
          ]);

          void devProcess.output.pipeTo(
            new WritableStream({
              write(data) {
                log(callbacks, data);
              },
            }),
          );

          const runningProcess = devProcess;

          void runningProcess.exit.then((exitCode) => {
            if (exitCode !== 0) {
              serverReadyHandler?.();
              reject(
                new Error(
                  `Development server stopped with exit code ${exitCode}. Check the terminal output.`,
                ),
              );
            }
          });
        } catch (error) {
          serverReadyHandler?.();
          reject(error);
        }
      })();
    },
  );

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

  await instance.fs.writeFile(safePath, contents);
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
 * Returns the existing runtime, if it has already started.
 */
export function getWebContainer() {
  return containerInstance;
}
