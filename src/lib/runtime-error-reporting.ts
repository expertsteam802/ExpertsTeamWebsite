type RuntimeErrorPayload = {
  message: string;
  stack?: string;
  filename: string;
  context: Record<string, unknown>;
};

declare global {
  interface Window {
    __expertsTeamReportRuntimeError?: (payload: RuntimeErrorPayload) => void;
  }
}

export function reportRuntimeError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const payload: RuntimeErrorPayload = {
    message,
    ...(stack !== undefined && { stack }),
    filename: window.location.pathname,
    context,
  };

  console.error("[ExpertsTeam runtime error]", payload);
  window.dispatchEvent(new CustomEvent("expertsteam:runtime-error", { detail: payload }));
  window.__expertsTeamReportRuntimeError?.(payload);
}
