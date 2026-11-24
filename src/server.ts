import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function rewritePublishedSubdomain(request: Request): Request {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const configuredDomain = process.env["PUBLIC_APP_DOMAIN"]?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!configuredDomain) return request;
  let domain: URL;
  try {
    domain = new URL("https://" + configuredDomain);
  } catch {
    return request;
  }
  if (domain.pathname !== "/" || domain.search || domain.hash) return request;
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const suffix = "." + domain.hostname;
  if (!hostname.endsWith(suffix)) return request;
  const slug = hostname.slice(0, -suffix.length);
  const reserved = new Set(["www", "api", "admin", "auth", "mail", "status", "cdn", "assets"]);
  if (slug.includes(".") || reserved.has(slug) || !/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) return request;
  url.pathname = "/apps/" + slug;
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const routedRequest = rewritePublishedSubdomain(request);
      const response = await handler.fetch(routedRequest, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
