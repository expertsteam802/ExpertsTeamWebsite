import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { siteSettingsQuery } from "@/hooks/use-site-settings";
import type { Json } from "@/integrations/supabase/types";

export const MYBID_VAST_DEFAULT_URL = "https://vast.vstserv.com/vast?spot_id=2030847";

type MyBidSettings = {
  myBidVastEnabled: boolean;
  myBidVastUrl: string;
  myBidAdCodeId: string;
  myBidFormatId: string;
  myBidAdCodeName: string;
};

const DEFAULT_SETTINGS: MyBidSettings = {
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
  const [status, setStatus] = useState<
    "ready" | "loading" | "playing" | "complete" | "unavailable"
  >("ready");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    },
    [],
  );

  async function playAd() {
    if (
      !videoRef.current ||
      !adContainerRef.current ||
      status === "loading" ||
      status === "playing"
    )
      return;
    setStatus("loading");
    setMessage(null);
    try {
      const ima = await loadImaSdk();
      const video = videoRef.current;
      const container = adContainerRef.current;
      if (!video || !container) return;
      const display = new ima.AdDisplayContainer(container, video);
      display.initialize();
      const loader = new ima.AdsLoader(display);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
        const manager = event.getAdsManager(video);
        managerRef.current = manager;
        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          setStatus("complete");
          onFinished?.();
          manager.destroy();
          managerRef.current = null;
        });
        manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () =>
          setStatus("complete"),
        );
        manager.addEventListener(ima.AdEvent.Type.STARTED, () => setStatus("playing"));
        manager.init(
          container.clientWidth || 640,
          container.clientHeight || 360,
          ima.ViewMode.NORMAL,
        );
        manager.start();
      });
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
        managerRef.current?.destroy();
        managerRef.current = null;
        setStatus("unavailable");
        setMessage("MyBid did not return a playable video ad. You can continue to the video.");
        onFinished?.();
      });
      const request = new ima.AdsRequest();
      request.adTagUrl = settings.myBidVastUrl;
      request.linearAdSlotWidth = container.clientWidth || 640;
      request.linearAdSlotHeight = container.clientHeight || 360;
      loader.requestAds(request);
    } catch (error) {
      setStatus("unavailable");
      setMessage(error instanceof Error ? error.message : "The video ad could not be loaded.");
      onFinished?.();
    }
  }

  if (!isFetched || isError || !settings.myBidVastEnabled) return null;

  return (
    <div className="w-full max-w-3xl space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="absolute inset-0 h-full w-full" playsInline />
        <div ref={adContainerRef} className="absolute inset-0 h-full w-full" />
        {status === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-5 text-center">
            <p className="text-sm font-medium">Sponsored video</p>
            <button
              type="button"
              onClick={() => void playAd()}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Play ad
            </button>
          </div>
        )}
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-background/90 text-sm">
            Loading sponsored video…
          </div>
        )}
        {status === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/95 p-5 text-center">
            <p className="text-sm">{message}</p>
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

/** Legacy display slots are intentionally empty: ExpertsTeam now uses MyBid VAST pre-roll only. */
export function AdSlot(_props: { slot: string }) {
  return null;
}

/** Adsterra global scripts have been retired. */
export function GlobalAdScripts() {
  return null;
}
