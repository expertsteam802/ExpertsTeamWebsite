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

async function rewritePublishedHost(request: Request): Promise<Request> {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const configuredDomain = process.env["PUBLIC_APP_DOMAIN"]?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (configuredDomain) {
    try {
      const domain = new URL("https://" + configuredDomain);
      if (domain.pathname === "/" && !domain.search && !domain.hash) {
        const suffix = "." + domain.hostname;
        if (hostname.endsWith(suffix)) {
          const slug = hostname.slice(0, -suffix.length);
          const reserved = new Set(["www", "api", "admin", "auth", "mail", "status", "cdn", "assets"]);
          if (!slug.includes(".") && !reserved.has(slug) && /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
            url.pathname = "/apps/" + slug;
            return new Request(url, request);
          }
        }
        if (hostname === domain.hostname) return request;
      }
    } catch {
      // An invalid PUBLIC_APP_DOMAIN disables first-party subdomain rewriting.
    }
  }

  if (!process.env["NETLIFY_SITE_ID"]) return request;
  const appUrl = process.env["APP_URL"] || "https://expertsteam.giize.com";
  try {
    if (hostname === new URL(appUrl).hostname.toLowerCase()) return request;
  } catch {
    // Continue with verified custom-domain lookup.
  }
  const { data: customDomain, error } = await supabaseAdmin
    .from("agent_project_domains")
    .select("slug")
    .eq("domain", hostname)
    .eq("status", "active")
    .maybeSingle();
  if (error || !customDomain || !/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(customDomain.slug)) return request;
  url.pathname = "/apps/" + customDomain.slug;
  return new Request(url, request);
}

function withWebContainerIsolationHeaders(response: Response): Response {
  // Apply isolation to every HTML document, including the /ai launcher and the
  // first document load before client-side navigation into /agent/:projectId.
  // Do not add COEP/COOP to assets or API responses.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const routedRequest = await rewritePublishedHost(request);
      const response = await handler.fetch(routedRequest, env, ctx);
      const normalizedResponse = await normalizeCatastrophicSsrResponse(response);
      return withWebContainerIsolationHeaders(normalizedResponse);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
