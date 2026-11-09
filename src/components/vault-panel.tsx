import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileLock2, FilePlus2, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes, formatDate } from "@/lib/format";

type VaultFile = {
  id: string; user_id: string; file_name: string;
  mime_type: string | null; size_bytes: number; storage_path: string; created_at: string;
};

const vaultTable = () => supabase.from("personal_vault_files");

export function VaultPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  const filesQuery = useQuery({
    queryKey: ["personal-vault", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await vaultTable()
        .select("id,user_id,file_name,mime_type,size_bytes,storage_path,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VaultFile[];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!user || !selected) throw new Error("Choose a file first.");
      if (selected.size > 200 * 1024 * 1024) throw new Error("Vault files are limited to 200 MB.");
      const safeName = selected.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
      const path = user.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: storageError } = await supabase.storage.from("personal-vault").upload(path, selected, {
        cacheControl: "3600", upsert: false, contentType: selected.type || "application/octet-stream",
      });
      if (storageError) throw storageError;
      const { error } = await vaultTable().insert({
        user_id: user.id,
        file_name: (title.trim() || selected.name).slice(0, 255), mime_type: selected.type || null,
        size_bytes: selected.size, storage_path: path,
      });
      if (error) {
        await supabase.storage.from("personal-vault").remove([path]);
        throw error;
      }
    },
    onSuccess: async () => {
      setSelected(null); setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["personal-vault", user?.id] });
      toast.success("Saved privately in your Vault.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (file: VaultFile) => {
      if (!user || file.user_id !== user.id) throw new Error("You can only remove your own Vault files.");
      const { error: storageError } = await supabase.storage.from("personal-vault").remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error } = await vaultTable().delete().eq("id", file.id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["personal-vault", user?.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  async function download(file: VaultFile) {
    try {
      if (!user || file.user_id !== user.id) throw new Error("This file is not yours.");
      const { data, error } = await supabase.storage.from("personal-vault").createSignedUrl(file.storage_path, 90);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open file."); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Private Vault</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your personal files. Only your signed-in account can list or download them.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-600"><FileLock2 className="h-3.5 w-3.5"/> Private storage</span>
      </div>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <label className="text-sm font-medium" htmlFor="vault-upload">Add a file (up to 200 MB)</label>
          <Input id="vault-upload" type="file" onChange={e => setSelected(e.target.files?.[0] ?? null)} />
          {selected && <p className="text-xs text-muted-foreground">{selected.name} · {formatBytes(selected.size)}</p>}
        </div>
        <div className="min-w-[180px] flex-1 space-y-2">
          <label className="text-sm font-medium" htmlFor="vault-title">Display name (optional)</label>
          <Input id="vault-title" value={title} maxLength={140} onChange={e => setTitle(e.target.value)} placeholder="Name this file"/>
        </div>
        <Button disabled={!selected || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <FilePlus2 className="mr-2 h-4 w-4"/>}
          {upload.isPending ? "Saving…" : "Save to Vault"}
        </Button>
      </Card>
      {filesQuery.isLoading ? <Card className="p-8 text-center text-sm text-muted-foreground">Loading your private files…</Card>
        : filesQuery.isError ? <Card className="border-destructive/40 p-6 text-sm text-destructive">Vault could not load: {(filesQuery.error as Error).message}. Your files have not been deleted.</Card>
        : !filesQuery.data?.length ? <Card className="border-dashed p-10 text-center"><FileLock2 className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 font-semibold">Your Vault is ready</p><p className="mt-1 text-sm text-muted-foreground">Files you add here stay private to your account.</p></Card>
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filesQuery.data.map(file => <Card key={file.id} className="flex min-w-0 items-center gap-3 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileLock2 className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.file_name}</p><p className="truncate text-xs text-muted-foreground">Private upload</p><p className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)} · {formatDate(file.created_at)}</p></div>
            <Button size="icon" variant="ghost" aria-label="Download private file" onClick={() => void download(file)}><Download className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" aria-label="Delete private file" disabled={remove.isPending} onClick={() => remove.mutate(file)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
          </Card>)}</div>}
    </div>
  );
}
