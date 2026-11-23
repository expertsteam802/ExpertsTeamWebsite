import { supabase } from "@/integrations/supabase/client";
import type { ProjectFiles } from "@/lib/sandbox";

const FILE_BATCH_SIZE = 100;

export async function loadProjectFiles(projectId: string): Promise<ProjectFiles> {
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
}
