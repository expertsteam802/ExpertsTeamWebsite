import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileDown, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fileIconFor } from "@/lib/file-icons";
import { formatBytes, formatDate } from "@/lib/format";
import { signedUrlFor } from "@/lib/upload";
import { AdsterraGateDialog } from "@/components/ads/adsterra-gate-dialog";

export type CommunityFile = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  storage_path: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  file_name: string;
  size_bytes: number;
  category: string;
  price: number;
  payout_account: string | null;
  created_at: string;
  profiles?: { username: string; display_name: string | null } | null;
};

export function FileGrid({ files }: { files: CommunityFile[] }) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CommunityFile | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [pendingDownloadUrl, setPendingDownloadUrl] = useState<string | null>(null);

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const cleanSource = editSourceUrl.trim();
      const cleanThumbnail = editThumbnailUrl.trim();
      if (!cleanSource && !editing.storage_path) {
        throw new Error("Keep a download/source link for this external resource.");
      }
      for (const [label, value] of [
        ["Source link", cleanSource],
        ["Thumbnail URL", cleanThumbnail],
      ] as const) {
        if (!value) continue;
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          throw new Error(`${label} must be a valid URL.`);
        }
        if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
      }
      const { error } = await supabase
        .from("files")
        .update({
          title: title.trim().slice(0, 140) || editing.title,
          description: description.trim().slice(0, 1000) || null,
          price: Math.max(0, Number(price) || 0),
          source_url: cleanSource || null,
          thumbnail_url: cleanThumbnail || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (file: CommunityFile) => {
      if (file.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("uploads")
          .remove([file.storage_path]);
        if (storageError) throw storageError;
      }
      const { error } = await supabase.from("files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function requestDownload(file: CommunityFile) {
    try {
      const url =
        file.source_url || (file.storage_path ? await signedUrlFor(file.storage_path) : null);
      if (!url) throw new Error("This resource has no download source.");
      // Resolve signed URLs before the gate. The final click then opens the
      // prepared URL directly from a user gesture, avoiding popup blockers.
      setPendingDownloadUrl(url);
      setGateOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare that download");
    }
  }

  if (!files.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        Nothing here yet — be the first to share something.
      </Card>
    );
  }

  return (
    <>
      <AdsterraGateDialog
        open={gateOpen}
        title="Before you open this resource"
        description="Please view the sponsor placement while the short countdown runs. Your shared file will open when you continue."
        onContinue={() => {
          const url = pendingDownloadUrl;
          setGateOpen(false);
          setPendingDownloadUrl(null);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => {
          const { Icon, tone, ext } = fileIconFor(file.file_name);
          const canManage = user?.id === file.user_id || isAdmin;
          return (
            <Card
              key={file.id}
              className="animate-rise group flex flex-col gap-3 p-5 transition-transform duration-300 hover:-translate-y-1 hover:glow-panel"
            >
              {file.thumbnail_url && (
                <img
                  src={file.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="max-h-36 w-full rounded-xl border border-border/60 object-cover"
                />
              )}
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary">
                  <Icon className={`h-6 w-6 ${tone}`} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-display font-semibold">{file.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {ext.toUpperCase() || "FILE"} ·{" "}
                    {file.source_url ? "External link" : formatBytes(file.size_bytes)}
                  </p>
                </div>
                <Badge
                  variant={file.price > 0 ? "default" : "secondary"}
                  className="ml-auto shrink-0"
                >
                  {file.price > 0 ? `$${Number(file.price).toFixed(2)}` : "Free"}
                </Badge>
              </div>

              {file.description && (
                <p className="line-clamp-3 text-sm text-muted-foreground">{file.description}</p>
              )}

              <p className="mt-auto text-xs text-muted-foreground">
                {file.profiles?.display_name || file.profiles?.username || "member"} ·{" "}
                {formatDate(file.created_at)}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void requestDownload(file)}>
                  <Download className="mr-2 h-4 w-4" />{" "}
                  {file.source_url ? "Open source" : "Download"}
                </Button>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(file);
                        setTitle(file.title);
                        setDescription(file.description ?? "");
                        setPrice(String(file.price));
                        setEditSourceUrl(file.source_url ?? "");
                        setEditThumbnailUrl(file.thumbnail_url ?? "");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(file)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit upload</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-source-url">Source / download link</Label>
              <Input
                id="edit-source-url"
                type="url"
                placeholder="https://example.com/file.zip"
                value={editSourceUrl}
                onChange={(event) => setEditSourceUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-thumbnail-url">Thumbnail image URL</Label>
              <Input
                id="edit-thumbnail-url"
                type="url"
                placeholder="https://example.com/preview.jpg"
                value={editThumbnailUrl}
                onChange={(event) => setEditThumbnailUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Price (USD)</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
