import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const fallbackIceServers = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
  { urls: ["stun:stun.l.google.com:19302"] },
  { urls: ["stun:stun1.l.google.com:19302"] },
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in before requesting call connectivity." }, 401);

  // Supabase Edge Function JWT verification is enabled for this function.
  const turnKeyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
  const turnKeySecret = Deno.env.get("CLOUDFLARE_TURN_KEY_SECRET");
  if (!turnKeyId || !turnKeySecret) {
    return json({
      iceServers: fallbackIceServers,
      turnEnabled: false,
      warning: "TURN relay credentials have not been configured yet. Using direct STUN connectivity.",
    });
  }

  try {
    const response = await fetch(
      "https://rtc.live.cloudflare.com/v1/turn/keys/" +
        encodeURIComponent(turnKeyId) +
        "/credentials/generate-ice-servers",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + turnKeySecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
      },
    );
    if (!response.ok) {
      return json({
        iceServers: fallbackIceServers,
        turnEnabled: false,
        warning: "The TURN relay could not issue credentials. Using direct STUN connectivity.",
      });
    }
    const result = await response.json();
    if (!Array.isArray(result?.iceServers) || result.iceServers.length === 0) {
      return json({
        iceServers: fallbackIceServers,
        turnEnabled: false,
        warning: "The TURN service returned no ICE servers. Using direct STUN connectivity.",
      });
    }
    // Chrome and Firefox can silently fail on TURN URLs using port 53.
    const usableIceServers = result.iceServers.flatMap((server: { urls?: string | string[] }) => {
      const urls = Array.isArray(server.urls) ? server.urls : server.urls ? [server.urls] : [];
      const filteredUrls = urls.filter((url) => !url.includes(":53"));
      return filteredUrls.length ? [{ ...server, urls: filteredUrls }] : [];
    });
    if (!usableIceServers.length) {
      return json({
        iceServers: fallbackIceServers,
        turnEnabled: false,
        warning: "The TURN service returned no browser-compatible relay URLs. Using direct STUN connectivity.",
      });
    }
    return json({ iceServers: usableIceServers, turnEnabled: true });
  } catch {
    return json({
      iceServers: fallbackIceServers,
      turnEnabled: false,
      warning: "The TURN service is temporarily unreachable. Using direct STUN connectivity.",
    });
  }
});
