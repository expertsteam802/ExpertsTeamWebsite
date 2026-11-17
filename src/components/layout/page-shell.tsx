import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { SiteFooter } from "@/components/layout/site-footer";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function PageShell({ children, hideFooter = false }: { children: ReactNode; hideFooter?: boolean }) {
  const settings = useSiteSettings();
  const background = settings.background_image_url || "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2400&q=88";
  return (
    <div className="et-shell relative flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="et-cinema-backdrop absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.34), rgba(0,0,0,.18) 42%, rgba(0,0,0,.48)), url("${background}")`,
        }}
      />
      <div aria-hidden="true" className="et-ambient pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="et-cinema-atmosphere pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="et-grain pointer-events-none absolute inset-0" />
      <SiteHeader />
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <SecondarySidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {settings.banner_image_url && (
        <div className="relative z-10 shrink-0 overflow-hidden border-b border-border">
          <img
            src={settings.banner_image_url}
            alt={`${settings.site_name} banner`}
            className="max-h-24 w-full object-cover object-center"
          />
        </div>
      )}
      <main className={`et-main relative z-10 min-h-0 flex-1 overflow-x-hidden ${hideFooter ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}>
        <div className={`et-page-content min-h-full ${hideFooter ? "flex h-full min-h-0 flex-col" : ""}`}>
          {children}
          {!hideFooter && <SiteFooter />}
        </div>
      </main>
        </div>
      </div>
      <style>{`
        .et-cinema-backdrop{background-size:cover;background-position:50% 52%;filter:saturate(.9) contrast(1.08);opacity:.78;transform:scale(1.04);animation:et-cinema-pan 52s ease-in-out infinite alternate;will-change:transform,background-position}
        .et-cinema-atmosphere{position:absolute;inset:-8%;z-index:2;pointer-events:none;overflow:hidden;background:radial-gradient(ellipse at 50% 72%,rgba(255,190,120,.12),transparent 38%),linear-gradient(180deg,rgba(0,0,0,.18),transparent 24%,rgba(0,0,0,.25));animation:et-atmosphere-breathe 18s ease-in-out infinite alternate}
        .et-cinema-atmosphere::before,.et-cinema-atmosphere::after{content:"";position:absolute;inset:-20%;pointer-events:none;filter:blur(34px);opacity:.34}
        .et-cinema-atmosphere::before{background:radial-gradient(ellipse at 18% 72%,rgba(205,218,255,.26),transparent 36%),radial-gradient(ellipse at 82% 62%,rgba(255,190,130,.22),transparent 34%);animation:et-fog-drift 34s ease-in-out infinite alternate}
        .et-cinema-atmosphere::after{background:linear-gradient(112deg,transparent 28%,rgba(255,255,255,.10) 48%,transparent 66%);transform:translateX(-35%);animation:et-light-sweep 24s ease-in-out infinite}
        @keyframes et-cinema-pan{0%{transform:scale(1.04) translate3d(-.5%,0,0);background-position:48% 50%}100%{transform:scale(1.13) translate3d(.6%,-.5%,0);background-position:54% 56%}}
        @keyframes et-fog-drift{0%{transform:translate3d(-3%,1%,0) scale(1)}100%{transform:translate3d(3%,-2%,0) scale(1.08)}}
        @keyframes et-atmosphere-breathe{0%{opacity:.68}100%{opacity:1}}
        @keyframes et-light-sweep{0%,20%{transform:translateX(-45%);opacity:0}45%{opacity:.65}80%,100%{transform:translateX(45%);opacity:0}}
        .et-shell{isolation:isolate;background:var(--background)}
        .et-shell::before{display:none}
        .et-shell::after{display:none}
        .et-ambient{position:absolute;inset:0;z-index:2;opacity:.18;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.18),transparent 58%);pointer-events:none}
        @keyframes et-aurora-drift{0%{transform:translate3d(-2%,0,0) rotate(-4deg) scale(.98)}50%{transform:translate3d(2%,1%,0) rotate(2deg) scale(1.04)}100%{transform:translate3d(-1%,2%,0) rotate(5deg) scale(1.01)}}
        @keyframes et-grid-drift{from{background-position:0 0}to{background-position:54px 54px}}
        .et-main .hero-surface{background:linear-gradient(115deg,color-mix(in oklab,var(--background) 90%,transparent),color-mix(in oklab,var(--surface) 68%,transparent) 58%,color-mix(in oklab,var(--background) 82%,transparent))!important}
        .et-main [class*="rounded-2xl"][class*="border"]{backdrop-filter:blur(12px)}
        .et-main .bg-card{background:color-mix(in oklab,var(--card) 90%,transparent)!important}
        .et-main .bg-background{background:color-mix(in oklab,var(--background) 92%,transparent)!important}
        .et-main button:focus-visible,.et-main a:focus-visible{outline:2px solid var(--ring);outline-offset:3px}
        .et-main img{max-width:100%}
        .et-grain{opacity:.13;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");mix-blend-mode:soft-light}
        .et-main{scrollbar-width:thin;scrollbar-color:rgba(77,141,255,.25) transparent}
        .et-main::-webkit-scrollbar{width:7px}.et-main::-webkit-scrollbar-thumb{background:rgba(77,141,255,.22);border-radius:20px}
        .et-page-content{animation:et-enter .42s cubic-bezier(.2,.75,.2,1) both;width:100%;max-width:100%}
        .et-main>.et-page-content{width:100%;max-width:100%}
        .et-main .mx-auto[class*="max-w-"]{max-width:min(100% - 2rem, 1840px)}
        .et-main .container{width:100%;max-width:1840px}
        .et-main{background:color-mix(in oklab,var(--background) 58%,transparent);backdrop-filter:blur(1px)}
        .et-topbar{background:color-mix(in oklab,var(--background) 84%,transparent)!important;color:var(--foreground)}
        .et-main .bg-card{background:color-mix(in oklab,var(--card) 90%,transparent)!important}
        .et-main .bg-background{background:color-mix(in oklab,var(--background) 92%,transparent)!important}
        .et-main [class*="rounded-2xl"][class*="border"]{backdrop-filter:blur(10px)}
        @keyframes et-enter{from{opacity:.55;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.et-page-content,.et-cinema-backdrop,.et-cinema-atmosphere,.et-cinema-atmosphere::before,.et-cinema-atmosphere::after{animation:none!important;transform:none!important}}
      `}</style>
    </div>
  );
}
