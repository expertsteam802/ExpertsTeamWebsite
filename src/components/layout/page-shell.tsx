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
        :root,.theme-neon,.theme-crimson,.theme-daylight{--primary:oklch(.88 .17 125);--primary-foreground:oklch(.19 .025 130);--accent:oklch(.76 .12 68);--accent-foreground:oklch(.16 .02 70);--ring:oklch(.88 .17 125);--background:oklch(.12 .012 145);--foreground:oklch(.96 .012 105);--card:oklch(.17 .014 145);--card-foreground:oklch(.96 .012 105);--surface:oklch(.18 .014 145);--surface-foreground:oklch(.96 .012 105);--muted:oklch(.23 .014 145);--muted-foreground:oklch(.72 .018 120);--border:oklch(.29 .018 140);--input:oklch(.25 .016 140);--secondary:oklch(.23 .014 145);--secondary-foreground:oklch(.94 .01 110);--sidebar:oklch(.15 .012 145);--sidebar-primary:oklch(.88 .17 125);--sidebar-accent:oklch(.23 .014 145);--sidebar-border:oklch(.29 .018 140)}
        .et-cinema-backdrop{background-size:cover;background-position:center;filter:saturate(.72)}
        .et-main .hero-surface{background:linear-gradient(115deg,rgba(10,16,12,.82),rgba(10,13,14,.42) 58%,rgba(8,10,12,.7))!important}
        .et-main [class*="rounded-2xl"][class*="border"]{backdrop-filter:blur(12px)}
        .et-main .bg-card{background:rgba(15,21,18,.82)!important}
        .et-main .bg-background{background:rgba(8,12,10,.84)!important}
        .et-main button:focus-visible,.et-main a:focus-visible{outline:2px solid #c9f36b;outline-offset:3px}
        .et-main img{max-width:100%}
        .et-main .text-primary{color:#c9f36b!important}
        .et-main .bg-primary{background:#c9f36b!important;color:#11150b!important}
        .et-main .border-primary\/25{border-color:rgba(201,243,107,.25)!important}
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
