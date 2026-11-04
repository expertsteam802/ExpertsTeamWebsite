import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { VideoPlayerDialog } from "@/components/video-player-dialog";
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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { parseYouTubeId, youTubeThumb } from "@/lib/youtube";

export type VideoItem = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  youtube_id: string;
  category: string;
  created_at: string;
  profiles?: { username: string; display_name: string | null } | null;
};

export function VideoGrid({ videos }: { videos: VideoItem[] }) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [playing, setPlaying] = useState<VideoItem | null>(null);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");\n  const [thumbnailUrl, setThumbnailUrl] = useState("");\n  const [alignment, setAlignment] = useState<"left" | "center" | "right">("center");

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const youtubeId = parseYouTubeId(link);
      if (!youtubeId) throw new Error("Paste a valid YouTube link.");
      const { error } = await supabase
        .from("videos")
        .update({
          title: title.trim().slice(0, 140) || editing.title,
          youtube_url: link.trim(),
          youtube_id: youtubeId,\n          thumbnail_url: thumbnailUrl.trim() || null,\n          player_alignment: alignment,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Video updated");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (video: VideoItem) => {
      const { error } = await supabase.from("videos").delete().eq("id", video.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Video removed");
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!videos.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No videos yet. Paste a YouTube share link to add the first one.
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => {
          const canManage = user?.id === video.user_id || isAdmin;
          return (
            <Card
              key={video.id}
              className="animate-rise overflow-hidden p-0 transition-transform duration-300 hover:-translate-y-1 hover:glow-panel"
            >
              <button
                type="button"
                onClick={() => setPlaying(video)}
                className="group relative block w-full overflow-hidden"
              >
                <img
                  src={video.thumbnail_url || youTubeThumb(video.youtube_id)}
                  alt={video.title}
                  loading="lazy"
                  className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 grid place-items-center bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground animate-pulse-glow">
                    <Play className="h-6 w-6" />
                  </span>
                </span>
              </button>
              <div className="space-y-2 p-4">
                <h3 className="line-clamp-2 font-display font-semibold">{video.title}</h3>
                {video.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{video.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {video.profiles?.display_name || video.profiles?.username || "member"} ·{" "}
                  {formatDate(video.created_at)}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setPlaying(video)}>
                    Watch here
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(video);
                          setTitle(video.title);
                          setLink(video.youtube_url);\n                          setThumbnailUrl(video.thumbnail_url ?? "");\n                          setAlignment(video.player_alignment ?? "center");
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(video)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <VideoPlayerDialog
        videoId={playing?.youtube_id ?? null}
        title={playing?.title ?? ""}
        onClose={() => setPlaying(null)}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit video</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="video-edit-title">Title</Label>
              <Input
                id="video-edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-edit-thumbnail">Custom thumbnail URL</Label>
              <Input
                id="video-edit-thumbnail"
                type="url"
                placeholder="https://example.com/thumbnail.jpg"
                value={thumbnailUrl}
                onChange={(event) => setThumbnailUrl(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the YouTube thumbnail.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-edit-alignment">Player alignment</Label>
              <select
                id="video-edit-alignment"
                value={alignment}
                onChange={(event) => setAlignment(event.target.value as "left" | "center" | "right")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-edit-link">YouTube link</Label>
              <Input
                id="video-edit-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
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
