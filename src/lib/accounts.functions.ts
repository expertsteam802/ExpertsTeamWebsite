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

    const removeStoragePrefix = async (bucket: string, prefix: string) => {
      const storage = supabaseAdmin.storage.from(bucket);
      const pendingFolders = [prefix];
      const objectPaths: string[] = [];

      while (pendingFolders.length) {
        const folder = pendingFolders.pop()!;
        let offset = 0;
        while (true) {
          const { data: entries, error: listError } = await storage.list(folder, {
            limit: 1000,
            offset,
          });
          if (listError) {
            throw new Error("Could not inspect " + bucket + " storage: " + listError.message);
          }
          for (const entry of entries ?? []) {
            const objectPath = folder + "/" + entry.name;
            if (entry.id === null) pendingFolders.push(objectPath);
            else objectPaths.push(objectPath);
          }
          if (!entries || entries.length < 1000) break;
          offset += entries.length;
        }
      }

      for (let offset = 0; offset < objectPaths.length; offset += 100) {
        const { error: removeError } = await storage.remove(objectPaths.slice(offset, offset + 100));
        if (removeError) {
          throw new Error("Could not remove files from " + bucket + ": " + removeError.message);
        }
      }
    };

    // Remove all owner-scoped uploads, including profile images and project thumbnails,
    // not only objects that still have a row in public.files.
    for (const bucket of ["uploads", "personal-vault", "developer-vault", "workspace-media"]) {
      await removeStoragePrefix(bucket, data.userId);
    }

    // Private message media is stored under conversation-id/user-id. Remove only
    // this member's objects so the other participant's attachments are preserved.
    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from("direct_conversation_members")
      .select("conversation_id")
      .eq("user_id", data.userId);
    if (membershipsError) {
      throw new Error("Could not inspect the user's private message media: " + membershipsError.message);
    }
    for (const membership of memberships ?? []) {
      await removeStoragePrefix("direct-messages", membership.conversation_id + "/" + data.userId);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) throw deleteError;

    return { ok: true };
  });
