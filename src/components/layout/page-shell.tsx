import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function PageShell({ children }: { children: ReactNode }) {
  const settings = useSiteSettings();
  const background = settings.background_image_url || "/experts-team-background.svg";

  return (
    <div className="et-shell relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[#07090d] text-[#f2f0e9]">
      <div aria-hidden="true" className="et-cinema-backdrop absolute inset-0" style={{ backgroundImage: `linear-gradient(112deg,rgba(7,9,13,.92),rgba(7,9,13,.78) 48%,rgba(7,9,13,.9)),url("${background}")` }} />
      <div aria-hidden="true" className="et-grain pointer-events-none absolute inset-0" />
      <SiteHeader />
      {settings.banner_image_url && (
        <div className="relative z-10 shrink-0 overflow-hidden border-b border-white/10">
          <img src={settings.banner_image_url} alt={`${settings.site_name} banner`} className="max-h-24 w-full object-cover object-center" />
        </div>
      )}
      <main className="et-main relative z-10 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="et-page-content min-h-full">{children}</div>
      </main>
      <div className="et-bottom-rail relative z-10 flex h-7 shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#080a0e]/90 px-4 text-[9px] font-semibold tracking-[.18em] text-white/35">
        <span>EXPERTSTEAM · DIGITAL COMMONS</span>
        <span className="hidden sm:inline">BUILT BY CHRIS EXPERT</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-[#c9f36b] shadow-[0_0_9px_#c9f36b]" /> SYSTEM READY</span>
      </div>
      <style>{`
        .et-cinema-backdrop{background-size:cover;background-position:center;filter:saturate(.72)}
        .et-grain{opacity:.13;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");mix-blend-mode:soft-light}
        .et-main{scrollbar-width:thin;scrollbar-color:rgba(201,243,107,.25) transparent}
        .et-main::-webkit-scrollbar{width:7px}.et-main::-webkit-scrollbar-thumb{background:rgba(201,243,107,.22);border-radius:20px}
        .et-page-content{animation:et-enter .42s cubic-bezier(.2,.75,.2,1) both}
        @keyframes et-enter{from{opacity:.55;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.et-page-content{animation:none}}
      `}</style>
    </div>
  );
}
