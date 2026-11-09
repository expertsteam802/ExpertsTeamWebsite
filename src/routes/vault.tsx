import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  Link2,
  File as FileIcon,
  FileText,
  FolderLock,
  Image,
  Loader2,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "Personal Vault — ExpertsTeam" },
      { name: "description", content: "A private place for your personal files on ExpertsTeam." },
    ],
  }),
  component: PersonalVaultPage,
});

type VaultFile = {
  id: string;
  user_id: string;
  storage_path: string;
  file_name: string;
  file_url: string | null;
  entry_type: "file" | "link";
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function fileIcon(mimeType: string | null) {
  if (mimeType?.startsWith("image/")) return Image;
  if (mimeType?.startsWith("text/") || mimeType?.includes("pdf")) return FileText;
  return FileIcon;
}

function PersonalVaultPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const {
    data: files = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["personal-vault", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_vault_files")
        .select("id,user_id,storage_path,file_name,file_url,entry_type,mime_type,size_bytes,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VaultFile[];
    },
  });

  const upload = useMutation({
    mutationFn: async (selected: FileList | null) => {
      if (!user) throw new Error("Sign in to use your Personal Vault.");
      const chosen = Array.from(selected ?? []);
      if (!chosen.length) return;
      for (const file of chosen) {
        if (file.size > 100 * 1024 * 1024) {
          throw new Error(file.name + " is larger than the 100 MB per-file limit.");
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "file";
        const path = user.id + "/" + crypto.randomUUID() + "-" + safeName;
        const { error: uploadError } = await supabase.storage
          .from("personal-vault")
          .upload(path, file, {
            cacheControl: "60",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabase.from("personal_vault_files").insert({
          user_id: user.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (rowError) {
          await supabase.storage.from("personal-vault").remove([path]);
          throw rowError;
        }
      }
    },
    onSuccess: async () => {
      toast.success("Your files are safely stored in your private vault.");
      await queryClient.invalidateQueries({ queryKey: ["personal-vault", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (file: VaultFile) => {
      if (!user) throw new Error("Sign in to manage your files.");
      const { error: rowError } = await supabase
        .from("personal_vault_files")
        .delete()
        .eq("id", file.id)
        .eq("user_id", user.id);
      if (rowError) throw rowError;
      if (file.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("personal-vault")
          .remove([file.storage_path]);
        if (storageError)
          throw new Error("The file entry was removed, but its stored copy could not be cleaned up.");
      }
    },
    onSuccess: async () => {
      toast.success("File deleted from your vault.");
      await queryClient.invalidateQueries({ queryKey: ["personal-vault", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addLink = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save links.");
      const normalized = linkUrl.trim();
      let parsed: URL;
      try { parsed = new URL(normalized); } catch { throw new Error("Enter a valid web link."); }
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS links are supported.");
      const { error } = await supabase.from("personal_vault_files").insert({
        user_id: user.id, storage_path: null, file_name: parsed.hostname + parsed.pathname,
        file_url: parsed.toString(), entry_type: "link", mime_type: "text/uri-list", size_bytes: 0,
      });
      if (error) throw error;
    },
    onSuccess: async () => { setLinkUrl(""); toast.success("Link saved to your private vault."); await queryClient.invalidateQueries({ queryKey: ["personal-vault", user?.id] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const visibleFiles = useMemo(
    () =>
      files.filter((file) => file.file_name.toLowerCase().includes(search.toLowerCase().trim())),
    [files, search],
  );
  const totalBytes = files.reduce((total, file) => total + file.size_bytes, 0);

  async function download(file: VaultFile) {
    const { data, error } = await supabase.storage
      .from("personal-vault")
      .download(file.storage_path);
    if (error || !data) {
      toast.error(error?.message || "Could not download this file.");
      return;
    }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.file_name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (!user) {
    return (
      <PageShell>
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <FolderLock className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-semibold">Your Personal Vault</h1>
          <p className="mt-3 text-muted-foreground">
            Sign in to keep your files private and accessible only to you.
          </p>
          <Button className="mt-6" onClick={() => (window.location.href = "/auth")}>
            Sign in
          </Button>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <FolderLock className="h-4 w-4" /> Private storage
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Personal Vault</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Your private space for documents, images and files. Other members cannot browse or
              download your files.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-2">
              <p className="text-xs text-muted-foreground">Your files</p>
              <p className="font-semibold tabular-nums">
                {files.length} · {formatBytes(totalBytes)}
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                upload.mutate(event.target.files);
                event.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-2 h-4 w-4" />
              )}
              Add files
            </Button>
          </div>
        </div>

        <Card className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="flex flex-1 items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Paste a website, document, or download link…" type="url" />
          </div>
          <Button onClick={() => addLink.mutate()} disabled={!linkUrl.trim() || addLink.isPending}>
            <Link2 className="mr-2 h-4 w-4" /> Save link
          </Button>
        </Card>

        <Card className="gap-3 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your private files…"
              className="pl-9"
            />
          </div>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your vault…
          </div>
        ) : isError ? (
          <Card className="p-8 text-center">
            <p className="font-medium">Your vault could not be loaded.</p>
            <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
              Try again
            </Button>
          </Card>
        ) : visibleFiles.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFiles.map((file) => {
              const Icon = fileIcon(file.mime_type);
              return (
                <Card key={file.id} className="flex flex-row items-center gap-3 p-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    {file.entry_type === "link" ? <Link2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={file.file_name}>
                      {file.file_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(file.size_bytes)} ·{" "}
                      {new Date(file.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {file.entry_type === "link" && file.file_url ? (
                    <Button variant="ghost" size="icon" asChild aria-label={"Open " + file.file_name}>
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label={"Download " + file.file_name} onClick={() => void download(file)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={"Delete " + file.file_name}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(file)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <FolderLock className="h-12 w-12 text-muted-foreground/60" />
            <h2 className="mt-4 text-lg font-semibold">
              {search ? "No matching files" : "Your vault is empty"}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {search
                ? "Try another file name."
                : "Upload your first file. It will be private to your account, not part of the public community library."}
            </p>
            {!search && (
              <Button className="mt-5" onClick={() => fileInput.current?.click()}>
                Upload your first file
              </Button>
            )}
          </Card>
        )}
      </section>
    </PageShell>
  );
}
