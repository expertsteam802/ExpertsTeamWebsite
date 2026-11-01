import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Deletes an account for good. Members can delete themselves; admins can delete anyone. */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isSelf = data.userId === context.userId;

    if (!isSelf) {
      const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (error) throw error;
      if (!isAdmin) throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: files } = await supabaseAdmin
      .from("files")
      .select("storage_path")
      .eq("user_id", data.userId);
    if (files?.length) {
      await supabaseAdmin.storage.from("uploads").remove(files.map((file) => file.storage_path));
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) throw deleteError;

    return { ok: true };
  });
