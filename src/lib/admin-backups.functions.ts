import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminSupabaseBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Only administrators can view database backups.");
    const token = process.env["SUPABASE_ACCESS_TOKEN"]?.trim();
    const projectRef = process.env["SUPABASE_PROJECT_REF"]?.trim();
    if (!token || !projectRef) {
      throw new Error("Backup monitoring requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF with the database:read / backups_read scope.");
    }
    const response = await fetch("https://api.supabase.com/v1/projects/" + encodeURIComponent(projectRef) + "/database/backups", {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as {
      region?: string;
      pitr_enabled?: boolean;
      backups?: Array<{ id: number; is_physical_backup: boolean; status: string; inserted_at: string }>;
      message?: string;
    } | null;
    if (!response.ok || !payload) throw new Error(payload?.message || "Could not retrieve the Supabase backup inventory.");
    return {
      region: payload.region ?? "Unknown",
      pitrEnabled: Boolean(payload.pitr_enabled),
      backups: (payload.backups ?? []).slice(0, 30).map((backup) => ({
        id: backup.id,
        physical: backup.is_physical_backup,
        status: backup.status,
        createdAt: backup.inserted_at,
      })),
      dashboardUrl: "https://supabase.com/dashboard/project/" + projectRef + "/database/backups/scheduled",
    };
  });
