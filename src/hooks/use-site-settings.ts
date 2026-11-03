import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
  id: number;
  site_name: string;
  tagline: string;
  logo_url: string | null;
  owner_email: string;
  youtube_url: string;
  instagram_url: string;
  subscription_price: number;
  subscription_quota_bytes: number;
  ai_subscription_price: number;
  ai_subscription_credits: number;
  payout_account: string | null;
};

export const siteSettingsQuery = {
  queryKey: ["site-settings"],
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
  return (
    data ?? {
      id: 1,
      site_name: "ExpertsTeam",
      tagline: "Code. Create. Community.",
      logo_url: null,
      owner_email: "mucyochristhecla@gmail.com",
      youtube_url: "https://www.youtube.com/@expertchris",
      instagram_url: "https://instagram.com/m.chris_t2011",
      subscription_price: 0.2,
      subscription_quota_bytes: 2147483648,
      ai_subscription_price: 1,
      ai_subscription_credits: 500,
      payout_account: null,
    }
  );
}
