import { supabase } from "@/integrations/supabase/client";
import type { ProjectFiles } from "@/lib/sandbox";

export async function loadProjectFiles(projectId: string): Promise<ProjectFiles> {
  const { data: project, error: projectError } = await supabase
    .from("agent_projects")
    .select("file_storage_ready_at")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;

  // A null readiness marker means a migration or multi-batch save has not
  // finished. The JSON snapshot is deliberately retained until every file
  // row is written, so use it as the recovery source instead of showing an
  // empty project or a partially-written file tree.
  if (!project?.file_storage_ready_at) {
    const { data: legacy, error: legacyError } = await supabase
      .from("agent_projects")
      .select("files")
      .eq("id", projectId)
      .maybeSingle();
    if (legacyError) throw legacyError;
    const snapshot = legacy?.files;
    const recoveredSnapshot =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? Object.fromEntries(
            Object.entries(snapshot).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          )
        : {};
    if (Object.keys(recoveredSnapshot).length) return recoveredSnapshot;

    // If the legacy JSON snapshot has already been cleared but a previous
    // migration or interrupted deployment left file rows behind, recover
    // from those rows rather than treating the workspace as empty.
    const { data: recoveredRows, error: recoveredRowsError } = await supabase
      .from("agent_project_files")
      .select("file_path,content")
      .eq("project_id", projectId)
      .order("file_path", { ascending: true });
    if (recoveredRowsError) throw recoveredRowsError;
    return Object.fromEntries((recoveredRows ?? []).map((row) => [row.file_path, row.content]));
  }

  const { data, error } = await supabase
    .from("agent_project_files")
    .select("file_path,content")
    .eq("project_id", projectId)
    .order("file_path", { ascending: true });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.file_path, row.content]));
}

export async function saveProjectFile(projectId: string, userId: string, filePath: string, content: string) {
  const { error } = await supabase.from("agent_project_files").upsert({
    project_id: projectId,
    user_id: userId,
    file_path: filePath,
    content,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,file_path" });
  if (error) throw error;
}

export async function deleteProjectFile(projectId: string, filePath: string) {
  const { error } = await supabase
    .from("agent_project_files")
    .delete()
    .eq("project_id", projectId)
    .eq("file_path", filePath);
  if (error) throw error;
}

/** Atomically replace the complete project tree in one database transaction. */
export async function saveProjectFiles(projectId: string, _userId: string, files: ProjectFiles) {
  const { error } = await supabase.rpc("replace_agent_project_files", {
    p_project_id: projectId,
    p_files: files,
  });
  if (error) throw error;
}
