import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { AdsterraGateDialog } from "@/components/ads/adsterra-gate-dialog";

type YouTubePlayer = { destroy: () => void; getIframe: () => HTMLIFrameElement };
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { PLAYING: number };
};
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubeApiPromise: Promise<YouTubeApi> | null = null;
const PLAYER_TIMEOUT_MS = 3000;

/**
 * Load the YouTube IFrame API safely, including when another component has
 * already inserted the script or its ready callback fired before this player
 * mounted. Always time out instead of leaving the video dialog stuck loading.
 */
function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const scriptUrl = "https://www.youtube.com/iframe_api";
    let settled = false;
    const previousCallback = window.onYouTubeIframeAPIReady;

    const cleanup = () => {
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      const api = window.YT;
      if (!error && api?.Player) {
        settled = true;
        cleanup();
        resolve(api);
      } else if (error) {
        settled = true;
        cleanup();
        if (window.onYouTubeIframeAPIReady === handleApiReady) {
          window.onYouTubeIframeAPIReady = previousCallback;
        }
        reject(error);
      }
    };

    const checkReady = () => {
      if (window.YT?.Player) finish();
    };

    const handleApiReady = () => {
      try {
        previousCallback?.();
      } finally {
        checkReady();
      }
    };

    // Register before appending the script to avoid missing a fast callback.
    window.onYouTubeIframeAPIReady = handleApiReady;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);

    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onerror = () =>
        finish(
          new Error(
            "Could not load the YouTube player. Check your connection or content blockers.",
          ),
        );
      document.head.appendChild(script);
    } else {
      script.addEventListener(
        "error",
        () => {
          finish(
            new Error(
              "Could not load the YouTube player. Check your connection or content blockers.",
            ),
          );
        },
        { once: true },
      );
    }

    // Covers an existing script whose ready callback was fired before we mounted.
    const pollId = window.setInterval(checkReady, 100);
    const timeoutId = window.setTimeout(() => {
      finish(new Error("YouTube's player took too long to load. Refresh the page and try again."));
    }, PLAYER_TIMEOUT_MS);
    checkReady();
  }).catch((error: unknown) => {
    youtubeApiPromise = null;
    throw error;
  });

  return youtubeApiPromise;
}
function playerErrorMessage(code: number) {
  if (code === 2) return "This video has an invalid ID or URL.";
  if (code === 5) return "YouTube could not play this video in the embedded player.";
  if (code === 100) return "This video was removed, deleted or made private.";
  if (code === 101 || code === 150)
    return "The video owner does not allow playback on other websites.";
  if (code === 153)
    return "YouTube did not receive the required referrer information. Check the site's domain and referrer policy.";
  return `YouTube player error (${code}). Try opening the video on YouTube.`;
}
type Props = {
  videoId: string | null;
  title: string;
  alignment?: "left" | "center" | "right";
  onClose: () => void;
};
export function VideoPlayerDialog({ videoId, title, alignment = "center", onClose }: Props) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const countedRef = useRef(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useNativeEmbed, setUseNativeEmbed] = useState(false);
  const [gateVideoId, setGateVideoId] = useState<string | null>(null);
  const shouldLoadLesson = !!videoId && gateVideoId === videoId;

  useEffect(() => {
    setPlaybackError(null);
    setLoading(false);
    setUseNativeEmbed(false);
    setGateVideoId(null);
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !shouldLoadLesson || !playerContainerRef.current) return;
    let cancelled = false;
    let readyTimedOut = false;
    let readyTimeout: number | undefined;
    countedRef.current = false;
    setPlaybackError(null);
    setLoading(true);
    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerContainerRef.current) return;
        // The IFrame API expects a placeholder element and creates its own iframe.
        const placeholder = document.createElement("div");
        placeholder.className = "h-full w-full";
        playerContainerRef.current.replaceChildren(placeholder);
        playerRef.current = new YT.Player(placeholder, {
          videoId,
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (readyTimedOut || cancelled) return;
              if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
              setLoading(false);
              const iframe = event.target.getIframe();
              iframe.title = title;
              iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
              iframe.allowFullscreen = true;
              iframe.className = "h-full w-full";
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                setLoading(false);
                if (!countedRef.current) {
                  countedRef.current = true;
                  void supabase
                    .rpc("record_video_view", { p_video_id: videoId })
                    .then(({ error }) => {
                      if (error)
                        console.error("[Video analytics] Could not record view:", error.message);
                    });
                }
              }
            },
            onError: (event) => {
              if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
              setLoading(false);
              if (event.data === 153) {
                setUseNativeEmbed(true);
              } else {
                setPlaybackError(playerErrorMessage(event.data));
              }
            },
          },
        });
        // Do not leave the loading overlay covering a player that never becomes ready.
        readyTimeout = window.setTimeout(() => {
          readyTimedOut = true;
          if (cancelled) return;
          playerRef.current?.destroy();
          playerRef.current = null;
          setLoading(false);
          setUseNativeEmbed(true);
        }, PLAYER_TIMEOUT_MS);
      })
      .catch((error: unknown) => {
        if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
        if (!cancelled) {
          setLoading(false);
          console.warn("[Video player] IFrame API unavailable; using standard embed:", error);
          setUseNativeEmbed(true);
        }
      });
    return () => {
      cancelled = true;
      if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
      playerRef.current?.destroy();
      playerRef.current = null;
      playerContainerRef.current?.replaceChildren();
    };
  }, [videoId, shouldLoadLesson, title]);

  return (
    <>
      <AdsterraGateDialog
        open={!!videoId && gateVideoId !== videoId}
        title="Before your lesson starts"
        description="Please view the sponsor placement while the short countdown runs. Your lesson will start when you continue."
        onContinue={() => {
          if (videoId) setGateVideoId(videoId);
        }}
      />
      <Dialog
        open={!!videoId && gateVideoId === videoId}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent className="max-h-[94vh] w-[min(96vw,1280px)] max-w-[1280px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left">{title}</DialogTitle>
          </DialogHeader>
          <div
            className={`expertsteam-video-player relative aspect-video max-h-[72vh] w-[92%] max-w-[1200px] overflow-hidden rounded-xl bg-secondary ${alignment === "left" ? "mr-auto" : alignment === "right" ? "ml-auto" : "mx-auto"}`}
          >
            {videoId &&
              (useNativeEmbed ? (
                <iframe
                  key={videoId}
                  title={title}
                  src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0`}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <div ref={playerContainerRef} className="h-full w-full" />
              ))}
            {videoId && loading && !playbackError && (
              <div className="absolute inset-0 grid place-items-center bg-background/70 text-sm text-muted-foreground">
                Loading video…
              </div>
            )}
            {videoId && playbackError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
                <p className="max-w-xl text-sm text-destructive">{playbackError}</p>
                {videoId && (
                  <Button asChild>
                    <a
                      href={`https://www.youtube.com/watch?v=${videoId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open on YouTube
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A view is counted only after YouTube confirms that playback has started.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
