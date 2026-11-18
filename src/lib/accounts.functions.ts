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

      const { data: targetRoles, error: targetRoleError } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId);
      if (targetRoleError) throw targetRoleError;
      if ((targetRoles ?? []).some((item) => item.role === "creator")) {
        const { data: isCreator, error: creatorError } = await context.supabase.rpc("has_role", {
          _user_id: context.userId,
          _role: "creator",
        });
        if (creatorError) throw creatorError;
        if (!isCreator) throw new Error("Only the ExpertsTeam creator can delete the creator account.");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: files, error: filesError } = await supabaseAdmin
      .from("files")
      .select("storage_path")
      .eq("user_id", data.userId);
    if (filesError)
      throw new Error("Could not load the user's uploaded files: " + filesError.message);

    if (files?.length) {
      const paths = files.map((file) => file.storage_path).filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await supabaseAdmin.storage.from("uploads").remove(paths);
        if (storageError)
          throw new Error("Could not remove the user's uploaded files: " + storageError.message);
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) throw deleteError;

    return { ok: true };
  });
