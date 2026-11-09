import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type SiteSettings = {
  id: number;
  site_name: string;
  tagline: string;
  logo_url: string | null;
  background_image_url: string | null;
  banner_image_url: string | null;
  owner_email: string;
  youtube_url: string;
  instagram_url: string;
  subscription_price: number;
  subscription_quota_bytes: number;
  ai_subscription_price: number;
  ai_subscription_credits: number;
  payout_account: string | null;
  site_branding_settings: Json;
  error_dialog_enabled: boolean;
  navigation_labels: Record<string, string>;
  site_copy: Record<string, string>;
};

export const siteSettingsQuery = {
  queryKey: ["site-settings"],
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return data as SiteSettings | null;
  },
};

export function useSiteSettings() {
  const { data } = useQuery(siteSettingsQuery);
  const branding =
    data?.site_branding_settings &&
    typeof data.site_branding_settings === "object" &&
    !Array.isArray(data.site_branding_settings)
      ? (data.site_branding_settings as Record<string, Json>).siteBranding
      : null;
  const brandingRecord =
    branding && typeof branding === "object" && !Array.isArray(branding)
      ? (branding as Record<string, Json>)
      : {};
  const navigationValue =
    data?.site_branding_settings &&
    typeof data.site_branding_settings === "object" &&
    !Array.isArray(data.site_branding_settings)
      ? (data.site_branding_settings as Record<string, Json>).siteNavigation
      : null;
  const copyValue =
    data?.site_branding_settings &&
    typeof data.site_branding_settings === "object" &&
    !Array.isArray(data.site_branding_settings)
      ? (data.site_branding_settings as Record<string, Json>).siteCopy
      : null;
  const navigationLabels =
    navigationValue && typeof navigationValue === "object" && !Array.isArray(navigationValue)
      ? Object.fromEntries(
          Object.entries(navigationValue).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  const siteCopy =
    copyValue && typeof copyValue === "object" && !Array.isArray(copyValue)
      ? Object.fromEntries(
          Object.entries(copyValue).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  return data
    ? {
        ...data,
        background_image_url:
          typeof brandingRecord.background_image_url === "string"
            ? brandingRecord.background_image_url
            : null,
        banner_image_url:
          typeof brandingRecord.banner_image_url === "string"
            ? brandingRecord.banner_image_url
            : null,
        navigation_labels: navigationLabels,
        site_copy: siteCopy,
      }
    : {
        id: 1,
        site_name: "ExpertsTeam",
        tagline: "Code. Create. Community.",
        logo_url: null,
        background_image_url: null,
        banner_image_url: null,
        owner_email: "mucyochristhecla@gmail.com",
        youtube_url: "https://www.youtube.com/@expertchris",
        instagram_url: "https://instagram.com/m.chris_t2011",
        subscription_price: 0.2,
        subscription_quota_bytes: 2147483648,
        ai_subscription_price: 1,
        ai_subscription_credits: 500,
        payout_account: null,
        site_branding_settings: {},
        error_dialog_enabled: true,
        navigation_labels: {},
        site_copy: {},
      };
}
