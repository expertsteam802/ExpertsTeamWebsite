import { useEffect, useRef } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { mountAdsterraBanner } from "@/components/ads/banner-unlock-ad";

const DEFAULT_ADSTERRA_SCRIPT =
  "https://bauval.org/22/502debf88d7d96769c683f2ec09cb70b";

export function AdSlot({ slot }: { slot: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const siteSettings = useSiteSettings();
  const adSettings =
    siteSettings.ad_settings && typeof siteSettings.ad_settings === "object" && !Array.isArray(siteSettings.ad_settings)
      ? (siteSettings.ad_settings as Record<string, unknown>)
      : {};
  const adEnabled = adSettings.adsterraEnabled !== false;
  const scriptUrl =
    typeof adSettings.adsterraBannerScript === "string" && adSettings.adsterraBannerScript.startsWith("https://")
      ? adSettings.adsterraBannerScript
      : DEFAULT_ADSTERRA_SCRIPT;

  useEffect(() => {
    if (!bannerRef.current || !adEnabled) {
      bannerRef.current?.replaceChildren();
      return;
    }
    return mountAdsterraBanner(bannerRef.current, scriptUrl);
  }, [adEnabled, scriptUrl]);

  return (
    <aside className="mx-auto my-5 w-full max-w-[728px]" aria-label="Sponsored banner">
      <div ref={bannerRef} data-ad-slot={slot} className="min-h-[90px] w-full overflow-hidden" />
      <p className="mt-1 text-center text-[10px] text-muted-foreground">Sponsored</p>
    </aside>
  );
}

/** No global ad scripts are needed; banner tags load only where rendered. */
export function GlobalAdScripts() {
  return null;
}
