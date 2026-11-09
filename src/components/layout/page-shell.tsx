import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Compass, GraduationCap, Users, Sparkles, MessageCircle, Gamepad2,
  FolderKanban, Video, Images, Info, Mail, CreditCard, LockKeyhole, Shield,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function PageShell({ children }: { children: ReactNode }) {
  const settings = useSiteSettings();
  const { user, isAdmin } = useAuth();
  const labels = settings.navigation_labels;
  const background = settings.background_image_url || "/experts-team-background.svg";
  const primaryLinks = [
    { to: "/", label: labels.home || "Home", icon: Compass },
    { to: "/learn", label: labels.learn || "Learn", icon: GraduationCap },
    { to: "/community", label: labels.community || "Community", icon: Users },
    { to: "/ai", label: labels.expertai || "ExpertAI", icon: Sparkles },
    { to: "/messages", label: labels.messages || "Messages", icon: MessageCircle },
    { to: "/entertainment", label: labels.discover || "Discover", icon: Gamepad2 },
  ];
  const secondaryLinks = [
    { to: "/explore", label: labels.explore || "Explore all spaces", icon: Compass },
    { to: "/projects", label: labels.workspace || "Workspace & projects", icon: FolderKanban },
    { to: "/videos", label: labels.videos || "Creator videos", icon: Video },
    { to: "/showcase", label: labels.showcase || "Project showcase", icon: Images },
    { to: "/about", label: labels.about || "About", icon: Info },
    { to: "/contact", label: labels.contact || "Contact", icon: Mail },
    { to: "/pricing", label: labels.plans || "Plans", icon: CreditCard },
    ...(user ? [{ to: "/vault", label: labels.vault || "Personal Vault", icon: LockKeyhole }] : []),
    ...(isAdmin ? [{ to: "/admin", label: labels.admin || "Admin", icon: Shield }] : []),
  ];

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
      <footer className="relative z-20 shrink-0 border-t border-blue-400/20 bg-[#080d18]/95 shadow-[0_-12px_40px_rgba(0,0,0,.28)] backdrop-blur-2xl">
        <nav aria-label="Primary bottom navigation" className="mx-auto flex max-w-[1680px] items-center justify-start gap-1 overflow-x-auto border-b border-white/[0.07] px-3 py-2 sm:justify-center sm:px-5">
          {primaryLinks.map((item) => (
            <Link key={item.to} to={item.to} className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold text-white/65 transition hover:bg-blue-400/10 hover:text-blue-200">
              <item.icon className="h-3.5 w-3.5" />{item.label}
            </Link>
          ))}
        </nav>
        <div className="mx-auto flex max-w-[1680px] flex-col gap-2 px-3 py-2.5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="More navigation" className="flex items-center justify-start gap-1 overflow-x-auto lg:flex-1">
            {secondaryLinks.map((item) => (
              <Link key={item.to} to={item.to} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-white/45 transition hover:bg-white/[0.06] hover:text-blue-200">
                <item.icon className="h-3 w-3" />{item.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2 text-[9px] font-semibold tracking-[.14em] text-white/35 lg:border-0 lg:pt-0">
            <span>EXPERTSTEAM · DIGITAL COMMONS</span>
            <span>BUILT BY CHRIS EXPERT</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_9px_#4d8dff]" /> SYSTEM READY</span>
          </div>
        </div>
      </footer>
      <style>{`
        .theme-neon{--primary:oklch(.68 .18 255);--primary-foreground:oklch(.99 .005 250);--accent:oklch(.74 .13 235);--accent-foreground:oklch(.16 .025 255);--ring:oklch(.72 .16 255);--background:oklch(.12 .02 258);--foreground:oklch(.96 .012 250);--card:oklch(.17 .02 258);--card-foreground:oklch(.96 .012 105);--surface:oklch(.18 .02 258);--surface-foreground:oklch(.96 .012 105);--muted:oklch(.23 .02 258);--muted-foreground:oklch(.72 .02 250);--border:oklch(.29 .02 258);--input:oklch(.25 .02 258);--secondary:oklch(.23 .014 145);--secondary-foreground:oklch(.94 .01 250);--sidebar:oklch(.15 .02 258);--sidebar-primary:oklch(.68 .18 255);--sidebar-accent:oklch(.23 .014 145);--sidebar-border:oklch(.29 .018 140)}
        .et-cinema-backdrop{background-size:cover;background-position:center;filter:saturate(.72)}
        .et-main .hero-surface{background:linear-gradient(115deg,rgba(10,18,34,.86),rgba(10,15,28,.48) 58%,rgba(8,12,22,.76))!important}
        .et-main [class*="rounded-2xl"][class*="border"]{backdrop-filter:blur(12px)}
        .et-main .bg-card{background:rgba(13,22,39,.86)!important}
        .et-main .bg-background{background:rgba(8,14,26,.88)!important}
        .et-main button:focus-visible,.et-main a:focus-visible{outline:2px solid var(--ring);outline-offset:3px}
        .et-main img{max-width:100%}
        .et-main .text-primary{color:#78aaff!important}
        .et-main .bg-primary{background:#4d8dff!important;color:#ffffff!important}
        .et-main .border-primary\/25{border-color:rgba(77,141,255,.25)!important}
        .et-grain{opacity:.13;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");mix-blend-mode:soft-light}
        .et-main{scrollbar-width:thin;scrollbar-color:rgba(77,141,255,.25) transparent}
        .et-main::-webkit-scrollbar{width:7px}.et-main::-webkit-scrollbar-thumb{background:rgba(77,141,255,.22);border-radius:20px}
        .et-page-content{animation:et-enter .42s cubic-bezier(.2,.75,.2,1) both}
        @keyframes et-enter{from{opacity:.55;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.et-page-content{animation:none}}
      `}</style>
    </div>
  );
}
