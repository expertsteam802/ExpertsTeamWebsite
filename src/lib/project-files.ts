import { supabase } from "@/integrations/supabase/client";
import type { ProjectFiles } from "@/lib/sandbox";

const FILE_READ_PAGE_SIZE = 500;

async function readProjectFileRows(projectId: string) {
  const rows: { file_path: string; content: string }[] = [];
  for (let offset = 0; ; offset += FILE_READ_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("agent_project_files")
      .select("file_path,content")
      .eq("project_id", projectId)
      .order("file_path", { ascending: true })
      .range(offset, offset + FILE_READ_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < FILE_READ_PAGE_SIZE) break;
  }
  return rows;
}

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
    const recoveredRows = await readProjectFileRows(projectId);
    return Object.fromEntries(recoveredRows.map((row) => [row.file_path, row.content]));
  }

  const rows = await readProjectFileRows(projectId);
  return Object.fromEntries(rows.map((row) => [row.file_path, row.content]));
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

/**
 * Upload the next file tree in bounded batches, then atomically swap it into
 * the live table. A failed upload leaves the previous saved project untouched.
 */
export async function saveProjectFiles(projectId: string, userId: string, files: ProjectFiles) {
  const entries = Object.entries(files);

  const importId = crypto.randomUUID();
  let batch: {
    import_id: string;
    project_id: string;
    user_id: string;
    file_path: string;
    content: string;
  }[] = [];
  let batchBytes = 0;

  const flush = async () => {
    if (!batch.length) return;
    const { error } = await supabase.from("agent_project_file_staging").insert(batch);
    if (error) throw error;
    batch = [];
    batchBytes = 0;
  };

  try {
    for (const [filePath, content] of entries) {
      const bytes = new TextEncoder().encode(content).byteLength;
      if (batch.length && (batch.length >= 100 || batchBytes + bytes > 4_000_000)) {
        await flush();
      }
      batch.push({
        import_id: importId,
        project_id: projectId,
        user_id: userId,
        file_path: filePath,
        content,
      });
      batchBytes += bytes;
    }
    await flush();

    const { error } = await supabase.rpc("finalize_agent_project_file_staging", {
      p_project_id: projectId,
      p_import_id: importId,
    });
    if (error) throw error;
  } catch (error) {
    await supabase
      .from("agent_project_file_staging")
      .delete()
      .eq("import_id", importId)
      .eq("project_id", projectId)
      .eq("user_id", userId);
    throw error;
  }
}

/**
 * Restore binary project assets from Supabase Storage for local browser execution.
 * Text source files remain in agent_project_files; binary bytes are never routed
 * through the AI prompt or the JSON project snapshot.
 */
export async function loadProjectBinaryAssets(projectId: string, userId: string): Promise<Record<string, Uint8Array>> {
  const { data: assets, error } = await supabase
    .from("agent_project_assets")
    .select("file_path,storage_path")
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw error;

  const restored: Record<string, Uint8Array> = {};
  const downloads = await Promise.all((assets ?? []).map(async (asset) => {
    const { data: blob, error: downloadError } = await supabase.storage
      .from("builder-project-assets")
      .download(asset.storage_path);
    if (downloadError || !blob) {
      throw new Error("Could not restore project asset " + asset.file_path + ": " + (downloadError?.message ?? "asset is missing"));
    }
    return [asset.file_path, new Uint8Array(await blob.arrayBuffer())] as const;
  }));
  for (const [path, bytes] of downloads) restored[path] = bytes;
  return restored;
}
