import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  videoId: string | null;
  title: string;
  alignment?: "left" | "center" | "right";
  onClose: () => void;
};
export function VideoPlayerDialog({ videoId, title, alignment = "center", onClose }: Props) {
  const [embedFailed, setEmbedFailed] = useState(false);
  useEffect(() => setEmbedFailed(false), [videoId]);
  if (!videoId) return null;

  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "https://expertsteam.giize.com")}`;

  return (
    <section id="video-watch-panel" className="mb-8 w-full scroll-mt-24 rounded-2xl border border-border/70 bg-card p-3 shadow-xl sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Now watching</p>
          <h2 className="mt-1 line-clamp-2 text-lg font-semibold sm:text-xl">{title}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">Close player</Button>
      </div>
      <div className={`expertsteam-video-player relative mx-auto aspect-video max-h-[75vh] w-full max-w-[1200px] overflow-hidden rounded-xl bg-black ${alignment === "left" ? "mr-auto" : alignment === "right" ? "ml-auto" : "mx-auto"}`}>
        {!embedFailed ? (
          <iframe
            key={videoId}
            title={title}
            src={embedUrl}
            className="absolute inset-0 h-full w-full border-0"
            loading="eager"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setEmbedFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
            <p className="max-w-xl text-sm text-muted-foreground">The embedded player could not load. This video may restrict playback on other websites.</p>
            <Button asChild><a href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noreferrer">Open on YouTube</a></Button>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">If playback is restricted by the video owner, use Open on YouTube to watch the original.</p>
    </section>
  );
}
