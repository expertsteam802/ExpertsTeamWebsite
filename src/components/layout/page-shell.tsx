import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { SiteFooter } from "@/components/layout/site-footer";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function PageShell({ children, hideFooter = false }: { children: ReactNode; hideFooter?: boolean }) {
  const settings = useSiteSettings();
  const background = settings.background_image_url || "/experts-team-background.svg";
  return (
    <div className="et-shell relative flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="et-cinema-backdrop absolute inset-0"
        style={{
          backgroundImage: `url("${background}")`,
        }}
      />
      <div aria-hidden="true" className="et-ambient pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="et-grain pointer-events-none absolute inset-0" />
      <SiteHeader />
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <SecondarySidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {settings.banner_image_url && (
        <div className="relative z-10 shrink-0 overflow-hidden border-b border-white/10">
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
        .theme-neon{--primary:oklch(.68 .18 255);--primary-foreground:oklch(.99 .005 250);--accent:oklch(.74 .13 235);--accent-foreground:oklch(.16 .025 255);--ring:oklch(.72 .16 255);--background:oklch(.12 .02 258);--foreground:oklch(.96 .012 250);--card:oklch(.17 .02 258);--card-foreground:oklch(.96 .012 250);--surface:oklch(.18 .02 258);--surface-foreground:oklch(.96 .012 250);--muted:oklch(.23 .02 258);--muted-foreground:oklch(.72 .02 250);--border:oklch(.29 .02 258);--input:oklch(.25 .02 258);--secondary:oklch(.23 .02 258);--secondary-foreground:oklch(.94 .01 250);--sidebar:oklch(.15 .02 258);--sidebar-primary:oklch(.68 .18 255);--sidebar-accent:oklch(.23 .02 258);--sidebar-border:oklch(.29 .02 258)}
        .et-cinema-backdrop{background-size:cover;background-position:center;filter:saturate(.72);opacity:.12;transition:opacity .5s ease}
        .et-shell{isolation:isolate;background:var(--background)}
        .et-shell::before{content:"";position:absolute;inset:-22%;z-index:1;pointer-events:none;background:radial-gradient(42rem 32rem at 12% 18%,color-mix(in oklab,var(--primary) 18%,transparent),transparent 72%),radial-gradient(38rem 30rem at 86% 24%,color-mix(in oklab,var(--accent) 13%,transparent),transparent 72%),radial-gradient(34rem 26rem at 54% 92%,color-mix(in oklab,var(--primary) 10%,transparent),transparent 72%);filter:blur(12px);animation:et-aurora-drift 28s ease-in-out infinite alternate}
        .et-shell::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.17;background-image:linear-gradient(color-mix(in oklab,var(--foreground) 12%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in oklab,var(--foreground) 12%,transparent) 1px,transparent 1px);background-size:54px 54px;mask-image:radial-gradient(ellipse at 50% 35%,#000 0%,transparent 76%);animation:et-grid-drift 42s linear infinite}
        .et-ambient{position:absolute;inset:0;z-index:2;opacity:.24;background:radial-gradient(ellipse at 50% 0%,color-mix(in oklab,var(--primary) 9%,transparent),transparent 62%);pointer-events:none}
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
        .et-main{background:color-mix(in oklab,var(--background) 74%,transparent)}
        .et-topbar{background:color-mix(in oklab,var(--background) 84%,transparent)!important;color:var(--foreground)}
        .et-main .bg-card{background:color-mix(in oklab,var(--card) 90%,transparent)!important}
        .et-main .bg-background{background:color-mix(in oklab,var(--background) 92%,transparent)!important}
        .et-main [class*="rounded-2xl"][class*="border"]{backdrop-filter:blur(10px)}
        @keyframes et-enter{from{opacity:.55;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.et-page-content{animation:none}}
      `}</style>
    </div>
  );
}
