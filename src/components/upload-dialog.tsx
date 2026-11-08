import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/format";
import { MAX_UPLOAD_BYTES, uploadWithProgress } from "@/lib/upload";

const CATEGORIES = [
  { value: "game", label: "Game" },
  { value: "app", label: "App" },
  { value: "book", label: "Book" },
  { value: "video", label: "Video" },
  { value: "lesson", label: "Lesson" },
  { value: "resource", label: "Resource" },
];

export function UploadDialog({ defaultCategory = "resource" }: { defaultCategory?: string }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [price, setPrice] = useState("0");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [percent, setPercent] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to upload.");
      const cleanSourceUrl = sourceUrl.trim();
      if (!file && !cleanSourceUrl)
        throw new Error("Choose a file or paste a download/source link.");
      if (file && cleanSourceUrl)
        throw new Error("Choose either an uploaded file or an external link, not both.");
      if (cleanSourceUrl) {
        let parsed: URL;
        try {
          parsed = new URL(cleanSourceUrl);
        } catch {
          throw new Error("Enter a valid source URL.");
        }
        if (parsed.protocol !== "https:") throw new Error("External source links must use HTTPS.");
      }
      if (thumbnailUrl.trim()) {
        let parsedThumbnail: URL;
        try {
          parsedThumbnail = new URL(thumbnailUrl.trim());
        } catch {
          throw new Error("Enter a valid thumbnail URL.");
        }
        if (parsedThumbnail.protocol !== "https:")
          throw new Error("Thumbnail URLs must use HTTPS.");
      }
      if (file && file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 200MB or smaller.");
      if (file && profile && file.size > profile.storage_quota_bytes) {
        throw new Error("This file is bigger than your remaining space — upgrade for more room.");
      }
      setPercent(0);
      const path = file
        ? await uploadWithProgress({ file, userId: user.id, onProgress: setPercent })
        : null;
      const linkedName = cleanSourceUrl
        ? new URL(cleanSourceUrl).pathname.split("/").filter(Boolean).pop() || "external-resource"
        : null;

      const { error } = await supabase.from("files").insert({
        user_id: user.id,
        title: (title.trim() || file?.name || linkedName || "External resource").slice(0, 140),
        description: description.trim().slice(0, 1000) || null,
        storage_path: path,
        source_url: cleanSourceUrl || null,
        thumbnail_url: thumbnailUrl.trim() || null,
        file_name: file?.name || linkedName || "external-resource",
        mime_type: file?.type || null,
        size_bytes: file?.size ?? 0,
        category,
        price: Math.max(0, Number(price) || 0),
        payout_account: payoutAccount.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Upload complete");
      setFile(null);
      setTitle("");
      setDescription("");
      setPrice("0");
      setPayoutAccount("");
      setSourceUrl("");
      setThumbnailUrl("");
      setPercent(0);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error: Error) => {
      setPercent(0);
      toast.error(error.message);
    },
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button>
          <UploadCloud className="mr-2 h-4 w-4" /> Upload a file
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share something with the community</DialogTitle>
          <DialogDescription>
            Upload a file or share an HTTPS source link. A copy is not required when you already
            have a download link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-file">File</Label>
            <Input
              id="upload-file"
              type="file"
              disabled={Boolean(sourceUrl.trim())}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) setSourceUrl("");
                if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
              }}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-source-url">Or share an HTTPS download/source link</Label>
            <Input
              id="upload-source-url"
              type="url"
              placeholder="https://example.com/my-file.zip"
              value={sourceUrl}
              disabled={Boolean(file)}
              onChange={(event) => {
                setSourceUrl(event.target.value);
                if (event.target.value) setFile(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              No upload is required when you already have a public link.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-thumbnail-url">Thumbnail image URL (optional)</Label>
            <Input
              id="upload-thumbnail-url"
              type="url"
              placeholder="https://example.com/preview.jpg"
              value={thumbnailUrl}
              onChange={(event) => setThumbnailUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-title">Title</Label>
            <Input
              id="upload-title"
              maxLength={140}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-description">Description</Label>
            <Textarea
              id="upload-description"
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-price">Price (USD, 0 = free)</Label>
              <Input
                id="upload-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-payout">Your payout account (optional)</Label>
            <Input
              id="upload-payout"
              placeholder="PayPal email, card holder name or mobile money number"
              value={payoutAccount}
              onChange={(event) => setPayoutAccount(event.target.value)}
            />
          </div>

          {(mutation.isPending || percent > 0) && (
            <div className="space-y-2">
              <Progress value={percent} />
              <p className="text-xs text-muted-foreground">{percent}% uploaded</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (!file && !sourceUrl.trim())}
          >
            {mutation.isPending
              ? file
                ? `Uploading ${percent}%`
                : "Saving link…"
              : file
                ? "Upload file"
                : "Share link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
