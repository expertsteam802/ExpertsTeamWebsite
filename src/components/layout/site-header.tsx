import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, Palette, Shield, Compass, GraduationCap, Users, Sparkles, MessageCircle, Gamepad2, FolderKanban } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { THEMES, useTheme, type NavAlign } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", key: "home", label: "Home", icon: Compass, exact: true },
  { to: "/learn", key: "learn", label: "Learn", icon: GraduationCap },
  { to: "/community", key: "community", label: "Community", icon: Users },
  { to: "/ai", key: "expertai", label: "ExpertAI", icon: Sparkles },
  { to: "/messages", key: "messages", label: "Messages", icon: MessageCircle },
  { to: "/entertainment", key: "discover", label: "Discover", icon: Gamepad2 },
] as const;

export function SiteHeader() {
  const settings = useSiteSettings();
  const { user, profile, isAdmin, signOut } = useAuth();
  const { theme, setTheme, navAlign, setNavAlign } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeClass = "et-nav-tab et-nav-active";
  const idleClass = "et-nav-tab";

  return (
    <header className="et-topbar relative z-50 shrink-0 border-b border-white/10 bg-[#090b10]/90 backdrop-blur-2xl">
      <div className="mx-auto flex min-h-[70px] max-w-[1680px] items-center gap-3 px-3 sm:px-5 lg:px-7">
        <Link to="/" className="group flex shrink-0 items-center gap-2.5">
          <img src={settings.logo_url || "/experts-team-mark.svg"} alt="ExpertsTeam" className="h-10 w-10 rounded-xl object-cover shadow-[0_0_26px_rgba(77,141,255,.12)] ring-1 ring-white/15 transition group-hover:scale-[1.04]" />
          <span className="leading-none">
            <span className="block font-display text-[15px] font-bold tracking-[-.055em] text-[#f5f2e9] sm:text-[17px]">EXPERTS<span className="text-[#4d8dff]">TEAM</span></span>
            <span className="mt-1 block text-[8px] font-semibold tracking-[.28em] text-white/35">MAKE THE UNCOMMON</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-3 md:flex [scrollbar-width:none]">
          {LINKS.map((item) => {
            const active = item.exact ? pathname === "/" : pathname === item.to || pathname.startsWith(item.to + "/");
            return <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} className={active ? activeClass : idleClass}>
              <item.icon className="h-3.5 w-3.5" /><span>{settings.navigation_labels[item.key] || item.label}</span>
            </Link>;
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Appearance settings" className="text-white/55 hover:bg-white/10 hover:text-white"><Palette className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              {THEMES.map((option) => <DropdownMenuItem key={option.id} onClick={() => setTheme(option.id)} className={cn(theme === option.id && "text-primary")}>{option.label}</DropdownMenuItem>)}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tab alignment</DropdownMenuLabel>
              {(["left", "center", "right"] as NavAlign[]).map((align) => <DropdownMenuItem key={align} onClick={() => setNavAlign(align)} className={cn("capitalize", navAlign === align && "text-primary")}>{align}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>

          {user ? <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="max-w-40 gap-2 rounded-xl border border-white/10 bg-white/[.045] px-2 text-white hover:bg-white/10 sm:px-3">
              <Avatar className="h-7 w-7"><AvatarImage src={profile?.avatar_url ?? undefined} /><AvatarFallback>{(profile?.display_name || profile?.username || "A").slice(0,1).toUpperCase()}</AvatarFallback></Avatar>
              <span className="hidden truncate text-xs sm:inline">{profile?.display_name || profile?.username || "Account"}</span>
            </Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild><Link to="/dashboard">My dashboard</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/vault">Personal Vault</Link></DropdownMenuItem>
              {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><Shield className="mr-2 h-4 w-4" />Admin panel</Link></DropdownMenuItem>}
              <DropdownMenuSeparator /><DropdownMenuItem onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : <Link to="/auth"><Button size="sm" className="rounded-xl bg-[#c9f36b] font-bold text-[#11150b] hover:bg-[#a8c9ff]">Sign in</Button></Link>}
          <Button variant="ghost" size="icon" className="md:hidden text-white" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(v => !v)}><Menu className="h-4 w-4" /></Button>
        </div>
      </div>

      {open && <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-2 border-t border-white/10 bg-[#090b10] p-3 md:hidden">
        {LINKS.map(item => <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold", pathname === item.to ? "border-[#c9f36b]/35 bg-[#c9f36b]/10 text-[#d8ff83]" : "border-white/10 text-white/65")}>
          <item.icon className="h-4 w-4" />{item.label}
        </Link>)}
        <Link to="/explore" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white/65">Explore all spaces</Link>
        {user && <Link to="/vault" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white/65">Personal Vault</Link>}
        {isAdmin && <Link to="/admin" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white/65">Admin panel</Link>}
      </nav>}

      <style>{`
        .et-nav-tab{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid transparent;border-radius:11px;padding:10px 12px;color:rgba(244,242,233,.55);font-size:12px;font-weight:650;letter-spacing:.01em;transition:all .18s ease}
        .et-nav-tab:hover{color:#f5f2e9;background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.07)}
        .et-nav-active{color:#d8ff83;background:rgba(77,141,255,.12);border-color:rgba(77,141,255,.28);box-shadow:inset 0 0 18px rgba(201,243,107,.035)}
        .et-topbar{box-shadow:0 12px 40px rgba(0,0,0,.24)}
      `}</style>
    </header>
  );
}
