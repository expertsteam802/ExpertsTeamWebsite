import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  Download,
  File as FileIcon,
  Folder,
  FolderUp,
  Loader2,
  LockKeyhole,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { uploadStorageFileWithProgress } from "@/lib/storage-upload";

type DeveloperVaultItem = {
  id: string;
  group_id: string;
  group_name: string;
  group_kind: "file" | "project";
  uploader_id: string;
  file_name: string;
  relative_path: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
};

type UploadProgress = { completed: number; total: number; currentName: string; percent: number };

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function safePath(value: string) {
  const parts = value.replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..");
  const cleaned = parts.map((part) => part.replace(/[^a-zA-Z0-9._ -]/g, "-").slice(0, 140));
  return (cleaned.filter(Boolean).join("/") || "file").slice(0, 1000);
}

export function DeveloperVault() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    projectInput.current?.setAttribute("webkitdirectory", "");
    projectInput.current?.setAttribute("directory", "");
  }, []);

  const { data: roleRows = [], isLoading: checkingRole } = useQuery({
    queryKey: ["developer-vault-role", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const canAccess = roleRows.some((row) => row.role === "developer" || row.role === "admin");

  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["developer-vault-items"],
    enabled: Boolean(user) && canAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_vault_items")
        .select("id,group_id,group_name,group_kind,uploader_id,file_name,relative_path,storage_path,mime_type,size_bytes,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeveloperVaultItem[];
    },
  });

  const groups = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; kind: "file" | "project"; items: DeveloperVaultItem[]; createdAt: string }>();
    for (const item of items) {
      const existing = grouped.get(item.group_id);
      if (existing) existing.items.push(item);
      else grouped.set(item.group_id, {
        id: item.group_id,
        name: item.group_name,
        kind: item.group_kind,
        items: [item],
        createdAt: item.created_at,
      });
    }
    return Array.from(grouped.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items]);

  const upload = useMutation({
    mutationFn: async ({ files, kind }: { files: File[]; kind: "file" | "project" }) => {
      if (!user) throw new Error("Sign in to use the Developer Vault.");
      if (!canAccess) throw new Error("Only mapped developers and admins can upload to this vault.");
      if (!files.length) throw new Error("Choose files before uploading.");
      const projectId = kind === "project" ? crypto.randomUUID() : null;
      const firstRelative = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0].name;
      const firstParts = firstRelative.replace(/\\/g, "/").split("/").filter(Boolean);
      const projectRoot = kind === "project" ? firstParts[0] : "";
      const groupName = (kind === "project" ? (projectRoot || "Developer project") : (files.length === 1 ? files[0].name : "Shared files")).slice(0, 180);
      let completed = 0;
      let completedBytes = 0;
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      setProgress({ completed, total: files.length, currentName: files[0].name, percent: 0 });
      try {
        for (const file of files) {
          setProgress({
            completed,
            total: files.length,
            currentName: file.name,
            percent: totalBytes ? Math.round((completedBytes / totalBytes) * 100) : Math.round((completed / files.length) * 100),
          });
          if (file.size > 100 * 1024 * 1024) {
            throw new Error(file.name + " is larger than the 100 MB per-file limit.");
          }
          const groupId = projectId ?? crypto.randomUUID();
          const rawRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          const normalized = rawRelative.replace(/\\/g, "/");
          const relative = kind === "project" && projectRoot && normalized.startsWith(projectRoot + "/")
            ? normalized.slice(projectRoot.length + 1)
            : normalized;
          const relativePath = safePath(relative);
          const storagePath = user.id + "/" + groupId + "/" + relativePath;
          await uploadStorageFileWithProgress({
            bucket: "developer-vault",
            path: storagePath,
            file,
            onProgress: (loaded) => {
              const percent = totalBytes
                ? Math.min(99, Math.round(((completedBytes + loaded) / totalBytes) * 100))
                : Math.min(99, Math.round(((completed + loaded / Math.max(file.size, 1)) / files.length) * 100));
              setProgress({ completed, total: files.length, currentName: file.name, percent });
            },
          });
          const { data: signed, error: verifyError } = await supabase.storage.from("developer-vault").createSignedUrl(storagePath, 60);
          if (verifyError || !signed?.signedUrl) {
            await supabase.storage.from("developer-vault").remove([storagePath]);
            throw new Error("Could not verify " + file.name + " in private Developer Vault storage.");
          }
          const { data: saved, error: rowError } = await supabase.from("developer_vault_items").insert({
            group_id: groupId,
            group_name: groupName,
            group_kind: kind,
            uploader_id: user.id,
            file_name: file.name,
            relative_path: relativePath,
            storage_path: storagePath,
            mime_type: file.type || null,
            size_bytes: file.size,
          }).select("id").single();
          if (rowError || !saved?.id) {
            await supabase.storage.from("developer-vault").remove([storagePath]);
            throw rowError ?? new Error("The file was stored but its Developer Vault record could not be verified.");
          }
          completed += 1;
          completedBytes += file.size;
          setProgress({
            completed,
            total: files.length,
            currentName: file.name,
            percent: totalBytes ? Math.round((completedBytes / totalBytes) * 100) : Math.round((completed / files.length) * 100),
          });
        }
        return { uploaded: completed, groupName };
      } catch (error) {
        throw Object.assign(new Error(error instanceof Error ? error.message : "The upload failed."), {
          uploadedCount: completed,
        });
      }
    },
    onSuccess: async ({ uploaded, groupName }) => {
      setProgress(null);
      toast.success(uploaded + " item(s) saved to Developer Vault" + (groupName ? ": " + groupName : "") + ".");
      await queryClient.invalidateQueries({ queryKey: ["developer-vault-items"] });
    },
    onError: (error: Error & { uploadedCount?: number }) => {
      setProgress(null);
      const completed = error.uploadedCount ?? 0;
      toast.error(completed ? completed + " file(s) saved before upload stopped: " + error.message : error.message);
      void queryClient.invalidateQueries({ queryKey: ["developer-vault-items"] });
    },
  });

  async function downloadItem(item: DeveloperVaultItem) {
    const { data, error } = await supabase.storage.from("developer-vault").download(item.storage_path);
    if (error || !data) {
      toast.error(error?.message || "Could not download this file.");
      return;
    }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.file_name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const remove = useMutation({
    mutationFn: async (item: DeveloperVaultItem) => {
      const { error: storageError } = await supabase.storage.from("developer-vault").remove([item.storage_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("developer_vault_items").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Vault item deleted.");
      await queryClient.invalidateQueries({ queryKey: ["developer-vault-items"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) {
    return <Card className="p-8 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-semibold">Developer Vault</p><p className="mt-1 text-sm text-muted-foreground">Sign in with an approved developer or admin account to continue.</p><Link to="/auth"><Button className="mt-4">Sign in</Button></Link></Card>;
  }
  if (checkingRole) return <Card className="p-8 text-center text-sm text-muted-foreground">Checking developer access…</Card>;
  if (!canAccess) {
    return <Card className="p-8 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-semibold">Developer access required</p><p className="mt-1 text-sm text-muted-foreground">The shared Developer Vault is available only to accounts mapped as developer or admin.</p><Link to="/projects"><Button className="mt-4">Apply to become a developer</Button></Link></Card>;
  }

  const totalBytes = items.reduce((total, item) => total + item.size_bytes, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><Archive className="h-4 w-4" /> Approved team storage</div>
          <h2 className="mt-1 font-display text-2xl font-bold">Developer Vault</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A shared private library for approved developers and admins. Store project folders and files here, then import project folders into ExpertAI Studio.</p>
          <p className="mt-2 text-xs text-muted-foreground">{items.length} files · {formatBytes(totalBytes)} stored</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (selected.length) upload.mutate({ files: selected, kind: "file" });
          }} />
          <input ref={projectInput} type="file" multiple className="hidden" onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (selected.length) upload.mutate({ files: selected, kind: "project" });
          }} />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending}><UploadCloud className="mr-2 h-4 w-4" /> Upload files</Button>
          <Button onClick={() => projectInput.current?.click()} disabled={upload.isPending}><FolderUp className="mr-2 h-4 w-4" /> Upload project folder</Button>
        </div>
      </div>

      {progress && (
        <Card className="gap-2 p-4" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2 font-medium"><Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /><span className="truncate">Uploading {progress.currentName}</span></span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress.percent}% · {progress.completed} / {progress.total} saved</span></div>
          <div role="progressbar" aria-label="Developer Vault upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: progress.percent + "%" }} /></div>
        </Card>
      )}

      {isLoading ? <Card className="p-8 text-center text-sm text-muted-foreground">Loading shared files…</Card> : isError ? <Card className="p-8 text-center"><p className="font-medium">Developer Vault could not be loaded.</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button></Card> : groups.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.id} className="gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{group.kind === "project" ? <Folder className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{group.name}</p><p className="text-xs text-muted-foreground">{group.items.length} file(s) · {formatBytes(group.items.reduce((n, item) => n + item.size_bytes, 0))} · {new Date(group.createdAt).toLocaleDateString()}</p></div>
                {group.kind === "project" && <a href="/ai" className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">Open ExpertAI</a>}
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto border-t border-border/60 pt-2">
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-secondary/60">
                    <span className="min-w-0 flex-1 truncate" title={item.relative_path}>{item.relative_path}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(item.size_bytes)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={"Download " + item.file_name} onClick={() => void downloadItem(item)}><Download className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title={"Delete " + item.file_name} disabled={remove.isPending} onClick={() => remove.mutate(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center p-10 text-center"><Folder className="h-10 w-10 text-muted-foreground/60" /><p className="mt-3 font-semibold">The team vault is empty</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Upload a project folder or individual files. Items are private to mapped developers and admins.</p></Card>
      )}
    </div>
  );
}
