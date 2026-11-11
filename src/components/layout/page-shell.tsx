import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function PageShell({ children }: { children: ReactNode }) {
  const settings = useSiteSettings();
  return (
    <div
      className="flex min-h-screen flex-col bg-background bg-cover bg-center bg-fixed"
      style={settings.background_image_url ? {
        backgroundImage: `linear-gradient(rgba(5, 10, 20, 0.78), rgba(5, 10, 20, 0.78)), url("${settings.background_image_url}")`,
      } : undefined}
    >
      <SiteHeader />
      {settings.banner_image_url && (
        <div className="w-full overflow-hidden border-b border-border/60">
          <img
            src={settings.banner_image_url}
            alt={`${settings.site_name} website banner`}
            className="max-h-44 w-full object-cover object-center"
          />
        </div>
      )}
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
