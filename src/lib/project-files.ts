import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ProjectFiles } from "@/lib/sandbox";

const FILE_BATCH_SIZE = 100;

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
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
    return Object.fromEntries(
      Object.entries(snapshot).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
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

/** Save changed file rows independently and remove paths no longer in the workspace. */
export async function saveProjectFiles(projectId: string, userId: string, files: ProjectFiles) {
  // Mark the snapshot incomplete while a multi-request replacement is in progress.
  // Readers then fall back to the legacy snapshot instead of seeing a partial tree.
  const { error: markError } = await supabase
    .from("agent_projects")
    .update({ files: files as unknown as Json, file_storage_ready_at: null })
    .eq("id", projectId)
    .eq("user_id", userId);
  if (markError) throw markError;

  const entries = Object.entries(files);
  for (let offset = 0; offset < entries.length; offset += FILE_BATCH_SIZE) {
    const rows = entries.slice(offset, offset + FILE_BATCH_SIZE).map(([file_path, content]) => ({
      project_id: projectId,
      user_id: userId,
      file_path,
      content: String(content),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("agent_project_files")
      .upsert(rows, { onConflict: "project_id,file_path" });
    if (error) throw error;
  }

  const { data: existing, error: listError } = await supabase
    .from("agent_project_files")
    .select("file_path")
    .eq("project_id", projectId);
  if (listError) throw listError;
  const retained = new Set(entries.map(([path]) => path));
  const stale = (existing ?? []).map((row) => row.file_path).filter((path) => !retained.has(path));
  for (let offset = 0; offset < stale.length; offset += FILE_BATCH_SIZE) {
    const { error } = await supabase
      .from("agent_project_files")
      .delete()
      .eq("project_id", projectId)
      .in("file_path", stale.slice(offset, offset + FILE_BATCH_SIZE));
    if (error) throw error;
  }

  const { error: readyError } = await supabase
    .from("agent_projects")
    .update({ file_storage_ready_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
  if (readyError) throw readyError;
}
