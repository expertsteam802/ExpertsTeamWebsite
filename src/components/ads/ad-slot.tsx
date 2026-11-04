import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { siteSettingsQuery } from "@/hooks/use-site-settings";
import type { Json } from "@/integrations/supabase/types";

type AdUnit = "nativeBanner" | "banner728";
type AdSettings = {
  nativeBannerEnabled: boolean;
  popunderEnabled: boolean;
  banner728Enabled: boolean;
  placements: Record<string, AdUnit>;
};

const DEFAULT_SETTINGS: AdSettings = {
  nativeBannerEnabled: true,
  popunderEnabled: true,
  banner728Enabled: true,
  placements: { "video-before": "nativeBanner" },
};

function parseAdSettings(value: Json | null | undefined): AdSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_SETTINGS;
  const raw = value as Record<string, Json | undefined>;
  const rawPlacements = raw.placements;
  const placements =
    rawPlacements && typeof rawPlacements === "object" && !Array.isArray(rawPlacements)
      ? (Object.fromEntries(
          Object.entries(rawPlacements).filter(
            ([slot, unit]) =>
              (unit === "nativeBanner" || unit === "banner728") &&
              !(unit === "nativeBanner" && slot !== "video-before"),
          ),
        ) as Record<string, AdUnit>)
      : {};
  placements["video-before"] = "nativeBanner";
  return {
    nativeBannerEnabled:
      typeof raw.nativeBannerEnabled === "boolean"
        ? raw.nativeBannerEnabled
        : DEFAULT_SETTINGS.nativeBannerEnabled,
    popunderEnabled:
      typeof raw.popunderEnabled === "boolean"
        ? raw.popunderEnabled
        : DEFAULT_SETTINGS.popunderEnabled,
    banner728Enabled:
      typeof raw.banner728Enabled === "boolean"
        ? raw.banner728Enabled
        : DEFAULT_SETTINGS.banner728Enabled,
    placements,
  };
}

function NativeBanner() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();

    const container = document.createElement("div");
    container.id = "container-e6d8442231a964256120f8359c3b588e";
    container.className = "flex min-h-[90px] w-full items-center justify-center overflow-hidden";
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = "https://bauval.org/21/e6d8442231a964256120f8359c3b588e";
    script.dataset.expertsteamAd = "native-banner";
    host.append(script, container);

    return () => {
      script.remove();
      container.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="my-4 flex min-h-[100px] w-full items-center justify-center overflow-hidden rounded-lg"
      aria-label="Advertisement"
    />
  );
}

function Banner728() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();

    (
      window as Window & {
        atOptions?: {
          key: string;
          format: string;
          height: number;
          width: number;
          params: Record<string, never>;
        };
      }
    ).atOptions = {
      key: "502debf88d7d96769c683f2ec09cb70b",
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const script = document.createElement("script");
    script.src = "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";
    script.dataset.expertsteamAd = "banner-728";
    host.appendChild(script);

    return () => {
      script.remove();
      host.replaceChildren();
      delete (window as Window & { atOptions?: unknown }).atOptions;
    };
  }, []);

  return (
    <div className="my-4 flex w-full justify-center overflow-hidden" aria-label="Advertisement">
      <div ref={hostRef} className="min-h-[90px] w-full max-w-[728px] overflow-hidden" />
    </div>
  );
}

export function AdSlot({ slot }: { slot: string }) {
  const { data, isFetched, isError } = useQuery(siteSettingsQuery);
  const settings = useMemo(() => parseAdSettings(data?.ad_settings), [data?.ad_settings]);
  const unit = settings.placements[slot];

  if (!isFetched || isError) return null;
  if (unit === "nativeBanner" && settings.nativeBannerEnabled) return <NativeBanner />;
  if (unit === "banner728" && settings.banner728Enabled) return <Banner728 />;
  return null;
}

export function GlobalAdScripts() {
  const { data, isFetched, isError } = useQuery(siteSettingsQuery);
  const settings = useMemo(() => parseAdSettings(data?.ad_settings), [data?.ad_settings]);

  useEffect(() => {
    if (!isFetched || isError) return;
    const source = "https://abscloud.org/1/8a9d4492df70b9208cb7428f8f5544f6";
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-expertsteam-ad="popunder"]',
    );

    if (!settings.popunderEnabled) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const script = document.createElement("script");
    script.setAttribute("data-cfasync", "false");
    script.src = source;
    script.dataset.expertsteamAd = "popunder";
    document.head.appendChild(script);

    return () => {
      // Keep the single page-level popunder script mounted for this app session.
    };
  }, [settings.popunderEnabled, isFetched, isError]);

  return null;
}
