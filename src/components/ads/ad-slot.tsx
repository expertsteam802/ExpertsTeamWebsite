import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { siteSettingsQuery } from "@/hooks/use-site-settings";
import type { Json } from "@/integrations/supabase/types";

export const MYBID_VAST_DEFAULT_URL = "https://vast.vstserv.com/vast?spot_id=2030847";

type MyBidSettings = {
  myBidActiveFormat: "vast" | "overlay";
  myBidOverlayEnabled: boolean;
  myBidOverlayAdCodeId: string;
  myBidVastEnabled: boolean;
  myBidVastUrl: string;
  myBidAdCodeId: string;
  myBidFormatId: string;
  myBidAdCodeName: string;
};

const DEFAULT_SETTINGS: MyBidSettings = {
  myBidActiveFormat: "vast",
  myBidOverlayEnabled: true,
  myBidOverlayAdCodeId: "470837",
  myBidVastEnabled: true,
  myBidVastUrl: MYBID_VAST_DEFAULT_URL,
  myBidAdCodeId: "470834",
  myBidFormatId: "2030847",
  myBidAdCodeName: "ExpertsTeam",
};

function parseAdSettings(value: Json | null | undefined): MyBidSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_SETTINGS;
  const raw = value as Record<string, Json | undefined>;
  return {
    myBidActiveFormat: raw.myBidActiveFormat === "overlay" ? "overlay" : "vast",
    myBidOverlayEnabled:
      typeof raw.myBidOverlayEnabled === "boolean"
        ? raw.myBidOverlayEnabled
        : DEFAULT_SETTINGS.myBidOverlayEnabled,
    myBidOverlayAdCodeId:
      typeof raw.myBidOverlayAdCodeId === "string"
        ? raw.myBidOverlayAdCodeId
        : DEFAULT_SETTINGS.myBidOverlayAdCodeId,
    myBidVastEnabled:
      typeof raw.myBidVastEnabled === "boolean"
        ? raw.myBidVastEnabled
        : DEFAULT_SETTINGS.myBidVastEnabled,
    myBidVastUrl:
      typeof raw.myBidVastUrl === "string" && raw.myBidVastUrl.trim()
        ? raw.myBidVastUrl
        : DEFAULT_SETTINGS.myBidVastUrl,
    myBidAdCodeId:
      typeof raw.myBidAdCodeId === "string" ? raw.myBidAdCodeId : DEFAULT_SETTINGS.myBidAdCodeId,
    myBidFormatId:
      typeof raw.myBidFormatId === "string" ? raw.myBidFormatId : DEFAULT_SETTINGS.myBidFormatId,
    myBidAdCodeName:
      typeof raw.myBidAdCodeName === "string"
        ? raw.myBidAdCodeName
        : DEFAULT_SETTINGS.myBidAdCodeName,
  };
}

type ImaAdEvent = { getAd?: () => { isLinear?: () => boolean } };
type ImaAdsManager = {
  init: (width: number, height: number, viewMode: number) => void;
  start: () => void;
  destroy: () => void;
  addEventListener: (event: string, callback: (event: ImaAdEvent) => void) => void;
};
type ImaAdsLoader = {
  requestAds: (request: {
    adTagUrl: string;
    linearAdSlotWidth: number;
    linearAdSlotHeight: number;
  }) => void;
  addEventListener: (
    event: string,
    callback: (event: { getAdsManager: (video: HTMLVideoElement) => ImaAdsManager }) => void,
  ) => void;
  contentComplete: () => void;
};
type ImaNamespace = {
  AdDisplayContainer: new (
    container: HTMLElement,
    video: HTMLVideoElement,
  ) => { initialize: () => void };
  AdsLoader: new (container: unknown) => ImaAdsLoader;
  AdsRequest: new () => { adTagUrl: string; linearAdSlotWidth: number; linearAdSlotHeight: number };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdsManagerLoadedEventType: { LINEAR: number };
  ViewMode: { NORMAL: number };
  AdEvent: {
    Type: {
      ALL_ADS_COMPLETED: string;
      CONTENT_PAUSE_REQUESTED: string;
      CONTENT_RESUME_REQUESTED: string;
      STARTED: string;
      SKIPPED: string;
    };
  };
};
declare global {
  interface Window {
    google?: { ima?: ImaNamespace };
  }
}

let imaSdkPromise: Promise<ImaNamespace> | null = null;
function loadImaSdk(): Promise<ImaNamespace> {
  if (window.google?.ima) return Promise.resolve(window.google.ima);
  if (imaSdkPromise) return imaSdkPromise;
  imaSdkPromise = new Promise<ImaNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-expertsteam-ima="true"]',
    );
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.google?.ima) resolve(window.google.ima);
      else reject(new Error("The video advertising SDK did not initialize."));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Could not load the video advertising SDK.")),
      { once: true },
    );
    if (!existing) {
      script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
      script.async = true;
      script.dataset.expertsteamIma = "true";
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    imaSdkPromise = null;
    throw error;
  });
  return imaSdkPromise;
}

export function VideoVastAd({ onFinished }: { onFinished?: () => void }) {
  const { data, isFetched, isError } = useQuery(siteSettingsQuery);
  const settings = useMemo(() => parseAdSettings(data?.ad_settings), [data?.ad_settings]);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const managerRef = useRef<ImaAdsManager | null>(null);
  const requestTimeoutRef = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<
    "ready" | "loading" | "playing" | "complete" | "unavailable"
  >("ready");
  const [message, setMessage] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(
    () => () => {
      managerRef.current?.destroy();
      managerRef.current = null;
      if (requestTimeoutRef.current !== undefined) window.clearTimeout(requestTimeoutRef.current);
    },
    [],
  );

  const finishedRef = useRef(false);
  const finishLesson = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished?.();
  }, [onFinished]);

  useEffect(() => {
    finishedRef.current = false;
  }, [onFinished]);

  useEffect(() => {
    if (!isFetched || isError || !settings.myBidVastEnabled) return;
    let cancelled = false;
    void loadImaSdk()
      .then(() => {
        if (!cancelled) setSdkReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("unavailable");
        setMessage(
          error instanceof Error
            ? `${error.message} The lesson remains locked; please retry.`
            : "The video ad player could not load. The lesson remains locked; please retry.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isFetched, isError, settings.myBidActiveFormat, settings.myBidVastEnabled, onFinished]);

  useEffect(() => {
    if (isFetched && !isError && !settings.myBidVastEnabled) finishLesson();
  }, [isFetched, isError, settings.myBidVastEnabled, finishLesson]);

  function playAd(userInitiated = false) {
    if (
      !videoRef.current ||
      !adContainerRef.current ||
      status === "loading" ||
      status === "playing"
    )
      return;
    const ima = window.google?.ima;
    const video = videoRef.current;
    const container = adContainerRef.current;
    if (!ima || !video || !container) {
      setStatus("unavailable");
      setMessage(
        "The sponsored video could not be initialized. The lesson remains locked; please retry.",
      );
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const display = new ima.AdDisplayContainer(container, video);
      display.initialize();
      const loader = new ima.AdsLoader(display);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
        const manager = event.getAdsManager(video);
        managerRef.current = manager;
        let wasSkipped = false;
        manager.addEventListener(ima.AdEvent.Type.SKIPPED, () => {
          wasSkipped = true;
          setStatus("unavailable");
          setMessage(
            "The sponsored video was skipped. The lesson remains locked; play the ad to completion.",
          );
        });
        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          if (requestTimeoutRef.current !== undefined)
            window.clearTimeout(requestTimeoutRef.current);
          if (wasSkipped) return;
          setStatus("complete");
          onFinished?.();
          manager.destroy();
          managerRef.current = null;
        });
        manager.addEventListener(ima.AdEvent.Type.STARTED, () => {
          if (requestTimeoutRef.current !== undefined)
            window.clearTimeout(requestTimeoutRef.current);
          setStatus("playing");
        });
        manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
          if (requestTimeoutRef.current !== undefined)
            window.clearTimeout(requestTimeoutRef.current);
          setStatus("unavailable");
          setMessage(
            "MyBid did not return a playable ad. The lesson remains locked; retry the ad.",
          );
          manager.destroy();
          managerRef.current = null;
        });
        manager.init(
          container.clientWidth || 640,
          container.clientHeight || 360,
          ima.ViewMode.NORMAL,
        );
        // Muted autoplay is permitted by more browsers; sound can be enabled using player controls.
        video.muted = true;
        try {
          manager.start();
        } catch {
          setStatus("ready");
          setMessage(
            "Your browser requires a tap before video playback. Tap Start sponsored video to play the ad.",
          );
          manager.destroy();
          managerRef.current = null;
        }
      });
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
        managerRef.current?.destroy();
        managerRef.current = null;
        if (requestTimeoutRef.current !== undefined) window.clearTimeout(requestTimeoutRef.current);
        setStatus("unavailable");
        setMessage("MyBid returned no playable ad. The lesson remains locked; retry the ad.");
      });
      const request = new ima.AdsRequest();
      request.adTagUrl = settings.myBidVastUrl;
      request.linearAdSlotWidth = container.clientWidth || 640;
      request.linearAdSlotHeight = container.clientHeight || 360;
      loader.requestAds(request);
      requestTimeoutRef.current = window.setTimeout(() => {
        setMessage(
          "The ad request timed out. No ad was shown, so the lesson remains locked. Retry the ad.",
        );
        setStatus("unavailable");
        managerRef.current?.destroy();
        managerRef.current = null;
      }, 20000);
    } catch {
      setStatus(userInitiated ? "unavailable" : "ready");
      setMessage(
        userInitiated
          ? "The sponsored video could not start. The lesson remains locked; please retry."
          : "Your browser requires a tap before video playback. Tap Start sponsored video to play the ad.",
      );
    }
  }

  const autoStartAttemptedRef = useRef(false);
  useEffect(() => {
    if (!sdkReady || autoStartAttemptedRef.current || status !== "ready") return;
    autoStartAttemptedRef.current = true;
    playAd(false);
  }, [sdkReady]);

  if (!isFetched || isError || !settings.myBidVastEnabled) return null;

  return (
    <div className="w-full max-w-3xl space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="absolute inset-0 h-full w-full" playsInline />
        <div ref={adContainerRef} className="absolute inset-0 h-full w-full" />
        {status === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-5 text-center">
            <p className="text-sm font-medium">Sponsored video</p>
            {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
            {sdkReady && (
              <button
                type="button"
                onClick={() => playAd(true)}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Start sponsored video
              </button>
            )}
            {!sdkReady && (
              <p className="text-sm text-muted-foreground">Preparing sponsored video…</p>
            )}
          </div>
        )}
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-background/90 text-sm">
            Loading sponsored video…
          </div>
        )}
        {status === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-5 text-center">
            <p className="max-w-md text-sm">{message}</p>
            {sdkReady && (
              <button
                type="button"
                onClick={() => playAd(true)}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Retry sponsored video
              </button>
            )}
          </div>
        )}
        {status === "complete" && (
          <div className="absolute inset-0 grid place-items-center bg-background/90 text-sm font-medium">
            Advertisement finished
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Video advertisement provided by MyBid
      </p>
    </div>
  );
}

/**
 * Page display placements need a separate MyBid display/banner placement ID.
 * The configured 2030847 placement is a VAST video tag and must not be reused
 * as a banner. Keep this slot visually absent until a valid display tag exists.
 */
export function AdSlot(_props: { slot: string }) {
  return null;
}

/** Adsterra global scripts have been retired. */
export function GlobalAdScripts() {
  return null;
}
