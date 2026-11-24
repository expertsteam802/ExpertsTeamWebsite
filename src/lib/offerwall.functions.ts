import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createToroxWallSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const placementId = process.env["TOROX_PLACEMENT_ID"]?.trim();
    const appToken = process.env["TOROX_APP_TOKEN"]?.trim();
    if (!placementId || !appToken) {
      throw new Error("Torox is not configured yet. Add TOROX_PLACEMENT_ID and TOROX_APP_TOKEN to the server environment.");
    }
    const response = await fetch(
      "https://api.wall.torox.io/partner/session?placement_id=" +
        encodeURIComponent(placementId) +
        "&token=" +
        encodeURIComponent(appToken),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ player: { uid: context.userId } }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; wall_url?: string; message?: string } | null;
    if (!response.ok || !payload?.ok || !payload.wall_url) {
      throw new Error("Torox could not create a secure offerwall session. Check the placement credentials and account approval.");
    }
    let wallUrl: URL;
    try {
      wallUrl = new URL(payload.wall_url);
    } catch {
      throw new Error("Torox returned an invalid offerwall URL.");
    }
    if (wallUrl.protocol !== "https:" || !wallUrl.hostname.endsWith("torox.io")) {
      throw new Error("Torox returned an untrusted offerwall destination.");
    }
    return { wallUrl: wallUrl.toString() };
  });

export const getCpxWallConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const appId = process.env["CPX_APP_ID"]?.trim();
    const appSecret = process.env["CPX_APP_SECRET"]?.trim();
    if (!appId || !appSecret) {
      throw new Error("CPX Research is not configured yet. Add CPX_APP_ID and CPX_APP_SECRET to the server environment.");
    }
    const secureHash = createHash("md5").update(context.userId + "-" + appSecret, "utf8").digest("hex");
    return { appId, secureHash };
  });
