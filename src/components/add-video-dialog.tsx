import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Youtube } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { parseYouTubeId } from "@/lib/youtube";

type Props = {
  category: string;
  triggerLabel?: string;
};

export function AddVideoDialog({ category, triggerLabel = "Add a YouTube video" }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to add a video.");
      if (title.trim().length < 2) throw new Error("Give the video a title.");
      const youtubeId = parseYouTubeId(link);
      if (!youtubeId) throw new Error("Paste the full YouTube share link (not just an id).");
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

      const { error } = await supabase.from("videos").insert({
        user_id: user.id,
        title: title.trim().slice(0, 140),
        description: description.trim().slice(0, 1000) || null,
        youtube_url: link.trim(),
        youtube_id: youtubeId,
        thumbnail_url: thumbnailUrl.trim() || null,
        category,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Video added");
      setTitle("");
      setDescription("");
      setLink("");
      setThumbnailUrl("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Youtube className="mr-2 h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a video</DialogTitle>
          <DialogDescription>
            Paste the YouTube share link — we read the id from it so there are no typos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="video-link">YouTube link</Label>
            <Input
              id="video-link"
              placeholder="https://www.youtube.com/watch?v=..."
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-thumbnail">Custom thumbnail URL (optional)</Label>
            <Input
              id="video-thumbnail"
              type="url"
              placeholder="https://example.com/video-cover.jpg"
              value={thumbnailUrl}
              onChange={(event) => setThumbnailUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-title">Title</Label>
            <Input
              id="video-title"
              maxLength={140}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-description">Description</Label>
            <Textarea
              id="video-description"
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Publish video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
