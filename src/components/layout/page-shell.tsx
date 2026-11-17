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
        .theme-neon{--primary:oklch(.68 .18 255);--primary-foreground:oklch(.99 .005 250);--accent:oklch(.74 .13 235);--accent-foreground:oklch(.16 .025 255);--ring:oklch(.72 .16 255);--background:oklch(.12 .02 258);--foreground:oklch(.96 .012 250);--card:oklch(.17 .02 258);--card-foreground:oklch(.96 .012 250);--surface:oklch(.18 .02 258);--surface-foreground:oklch(.96 .012 250);--muted:oklch(.23 .02 258);--muted-foreground:oklch(.72 .02 250);--border:oklch(.29 .02 258);--input:oklch(.25 .02 258);--secondary:oklch(.23 .02 258);--secondary-foreground:oklch(.94 .01 250);--sidebar:oklch(.15 .02 258);--sidebar-primary:oklch(.68 .18 255);--sidebar-accent:oklch(.23 .02 258);--sidebar-border:oklch(.29 .02 258)}
        .et-cinema-backdrop{background-size:cover;background-position:50% 52%;filter:saturate(1.02) contrast(1.02);opacity:.72;transform:translateZ(0);will-change:auto}
        .et-cinema-atmosphere{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;background:radial-gradient(ellipse at 50% 72%,rgba(255,190,120,.08),transparent 38%),linear-gradient(180deg,rgba(0,0,0,.12),transparent 24%,rgba(0,0,0,.2));animation:et-atmosphere-breathe 24s ease-in-out infinite alternate}
        .et-cinema-atmosphere::before,.et-cinema-atmosphere::after{content:"";position:absolute;inset:-10%;pointer-events:none;filter:blur(22px);opacity:.2}
        .et-cinema-atmosphere::before{background:radial-gradient(ellipse at 18% 72%,rgba(205,218,255,.2),transparent 36%),radial-gradient(ellipse at 82% 62%,rgba(255,190,130,.16),transparent 34%);animation:et-atmosphere-breathe 28s ease-in-out infinite alternate}
        .et-cinema-atmosphere::after{background:linear-gradient(112deg,transparent 28%,rgba(255,255,255,.06) 48%,transparent 66%);opacity:.12}
        @keyframes et-atmosphere-breathe{0%{opacity:.68}100%{opacity:1}}
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
        .et-grain{display:none}
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
