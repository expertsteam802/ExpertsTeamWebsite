import { useCallback, useEffect, useRef, useState } from "react";

import { BannerUnlockAd } from "@/components/ads/banner-unlock-ad";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type YouTubePlayer = {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
};
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
  PlayerState: { PLAYING: number; BUFFERING: number; PAUSED: number; ENDED: number };
};
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;
const PLAYER_TIMEOUT_MS = 12000;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const scriptUrl = "https://www.youtube.com/iframe_api";
    let settled = false;
    const previousCallback = window.onYouTubeIframeAPIReady;
    const cleanup = () => {
      if (pollId !== undefined) window.clearInterval(pollId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
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

    const pollId = window.setInterval(checkReady, 100);
    const timeoutId = window.setTimeout(
      () => finish(new Error("YouTube's player API took too long to load.")),
      PLAYER_TIMEOUT_MS,
    );

    window.onYouTubeIframeAPIReady = handleApiReady;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onerror = () => finish(new Error("Could not load YouTube's player API."));
      document.head.appendChild(script);
    } else {
      script.addEventListener("error", () => finish(new Error("Could not load YouTube's player API.")), { once: true });
    }

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
  if (code === 101 || code === 150) return "The video owner does not allow playback on other websites.";
  if (code === 153) return "YouTube did not receive the required referrer information. Try the direct YouTube player.";
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
  const nativeTimeoutRef = useRef<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useNativeEmbed, setUseNativeEmbed] = useState(false);

  const clearNativeTimeout = useCallback(() => {
    if (nativeTimeoutRef.current !== null) {
      window.clearTimeout(nativeTimeoutRef.current);
      nativeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setPlaybackError(null);
    setLoading(Boolean(videoId));
    setUseNativeEmbed(false);
    countedRef.current = false;
  }, [videoId]);

  useEffect(() => {
    if (!videoId || useNativeEmbed || !playerContainerRef.current) return;
    let cancelled = false;
    let readyTimeout: number | undefined;
    let readyTimedOut = false;

    setLoading(true);
    setPlaybackError(null);
    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerContainerRef.current) return;
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
              iframe.referrerPolicy = "strict-origin-when-cross-origin";
              iframe.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen";
              iframe.allowFullscreen = true;
              iframe.className = "h-full w-full border-0";
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.BUFFERING) setLoading(true);
              if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) setLoading(false);
              if (event.data === YT.PlayerState.PLAYING) {
                setLoading(false);
                if (!countedRef.current) {
                  countedRef.current = true;
                  void supabase.rpc("record_video_view", { p_video_id: videoId }).then(({ error }) => {
                    if (error) console.error("[Video analytics] Could not record view:", error.message);
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
        readyTimeout = window.setTimeout(() => {
          readyTimedOut = true;
          if (cancelled) return;
          playerRef.current?.destroy();
          playerRef.current = null;
          setUseNativeEmbed(true);
          setLoading(true);
        }, PLAYER_TIMEOUT_MS);
      })
      .catch((error: unknown) => {
        if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
        if (!cancelled) {
          console.warn("[Video player] IFrame API unavailable; using standard embed:", error);
          setUseNativeEmbed(true);
          setLoading(true);
        }
      });

    return () => {
      cancelled = true;
      if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
      playerRef.current?.destroy();
      playerRef.current = null;
      playerContainerRef.current?.replaceChildren();
    };
  }, [videoId, title, useNativeEmbed]);

  useEffect(() => {
    if (!useNativeEmbed || !videoId) return;
    setLoading(true);
    setPlaybackError(null);
    nativeTimeoutRef.current = window.setTimeout(() => {
      nativeTimeoutRef.current = null;
      setLoading(false);
      setPlaybackError("YouTube did not respond. The video may be unavailable or may block playback on other websites.");
    }, PLAYER_TIMEOUT_MS);
    return clearNativeTimeout;
  }, [useNativeEmbed, videoId, clearNativeTimeout]);

  if (!videoId) return null;

  const alignmentClass = alignment === "left" ? "mr-auto" : alignment === "right" ? "ml-auto" : "mx-auto";
  const nativeEmbedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0&origin=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "https://expertsteam.giize.com")}`;

  return (
    <section id="video-watch-panel" className="mb-8 w-full scroll-mt-24 rounded-2xl border border-border/70 bg-card p-3 shadow-xl sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Now watching</p>
          <h2 className="mt-1 line-clamp-2 text-lg font-semibold sm:text-xl">{title}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">Close player</Button>
      </div>
      <div className={`expertsteam-video-player relative ${alignmentClass} aspect-video max-h-[75vh] w-full max-w-[1200px] overflow-hidden rounded-xl bg-black`}>
        {useNativeEmbed ? (
          <iframe
            key={videoId}
            title={title}
            src={nativeEmbedUrl}
            className="absolute inset-0 h-full w-full border-0"
            loading="eager"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => { clearNativeTimeout(); setLoading(false); }}
            onError={() => { clearNativeTimeout(); setLoading(false); setPlaybackError("The video could not be loaded. Check the video link or open it on YouTube."); }}
          />
        ) : (
          <div ref={playerContainerRef} className="absolute inset-0 h-full w-full" />
        )}
        {loading && !playbackError && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background/80 text-sm text-muted-foreground">
            Loading video…
          </div>
        )}
        {playbackError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
            <p className="max-w-xl text-sm text-destructive">{playbackError}</p>
            <Button asChild>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noreferrer">Open on YouTube</a>
            </Button>
          </div>
        )}
      </div>
      <BannerUnlockAd compact />
      <p className="mt-3 text-xs text-muted-foreground">A view is counted only after YouTube confirms that playback has started.</p>
    </section>
  );
}
