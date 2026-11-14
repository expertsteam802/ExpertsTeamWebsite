import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ iceServers: fallbackIceServers, turnEnabled: false, warning: "TURN service is not configured." });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Your session could not be verified." }, 401);

  const turnKeyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
  const turnApiToken = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");
  if (!turnKeyId || !turnApiToken) {
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
          Authorization: "Bearer " + turnApiToken,
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
    return json({ iceServers: result.iceServers, turnEnabled: true });
  } catch {
    return json({
      iceServers: fallbackIceServers,
      turnEnabled: false,
      warning: "The TURN service is temporarily unreachable. Using direct STUN connectivity.",
    });
  }
});
