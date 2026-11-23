import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UserSupabaseConnectionCredentials = {
  project_url: string;
  project_ref: string;
  publishable_key: string;
  secret_key: string;
};

/**
 * Server-only credential lookup for Builder/runtime adapters.
 * Never import this module from browser components or client routes.
 */
export async function getUserSupabaseConnectionCredentials(
  connectionId: string,
  userId: string,
): Promise<UserSupabaseConnectionCredentials> {
  const { data, error } = await supabaseAdmin.rpc("get_user_supabase_connection_secret", {
    p_connection_id: connectionId,
    p_user_id: userId,
  });
  if (error) throw new Error("Could not load the selected cloud connection: " + error.message);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The selected cloud connection is missing or no longer belongs to this user.");
  }
  const value = data as Record<string, unknown>;
  if (
    typeof value.project_url !== "string" ||
    typeof value.project_ref !== "string" ||
    typeof value.publishable_key !== "string" ||
    typeof value.secret_key !== "string"
  ) {
    throw new Error("The selected cloud connection is incomplete.");
  }
  return {
    project_url: value.project_url,
    project_ref: value.project_ref,
    publishable_key: value.publishable_key,
    secret_key: value.secret_key,
  };
}
