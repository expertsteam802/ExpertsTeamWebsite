import { Link, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  Compass,
  CreditCard,
  FileVideo,
  Gamepad2,
  GraduationCap,
  LogOut,
  Menu,
  MessageCircle,
  Shield,
  Sparkles,
  Users,
  BriefcaseBusiness,
  FolderKanban,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { cn } from "@/lib/utils";

const PRIMARY_LINKS = [
  { to: "/", key: "home", label: "Home", icon: Compass, exact: true },
  { to: "/explore", key: "explore", label: "Explore", icon: Compass },
  { to: "/learn", key: "learn", label: "Learning", icon: GraduationCap },
  { to: "/community", key: "community", label: "Community", icon: Users },
  { to: "/ai", key: "expertai", label: "ExpertAI", icon: Sparkles },
  { to: "/pricing", key: "plans", label: "Pricing", icon: CreditCard },
] as const;

const SECONDARY_LINKS = [
  { to: "/software", label: "Request software", icon: BriefcaseBusiness },
  { to: "/videos", label: "Video library", icon: FileVideo },
  { to: "/entertainment", label: "Games & downloads", icon: Gamepad2 },
  { to: "/showcase", label: "Project showcase", icon: FolderKanban },
] as const;

export function SiteHeader() {
  const settings = useSiteSettings();
  const { user, profile, isAdmin, isCreator, isDeveloper, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeClass = "et-nav-tab et-nav-active";
  const idleClass = "et-nav-tab";
  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="et-topbar relative z-50 shrink-0 border-b border-border bg-background backdrop-blur-2xl">
      <div className="mx-auto flex min-h-[68px] max-w-[1680px] items-center gap-3 px-3 sm:px-5 lg:px-7">
        <Link to="/" aria-label="ExpertsTeam home" className="group flex shrink-0 items-center">
          <img
            src={settings.logo_url || "/logo.svg"}
            alt="ExpertsTeam logo"
            className="et-site-logo h-12 w-12 rounded-full border-0 bg-transparent object-contain p-0 shadow-[0_0_22px_rgba(30,110,255,0.38)] transition duration-200 group-hover:scale-[1.04] sm:h-14 sm:w-14"
            style={{
              "--logo-size-mobile": `${48 * settings.logo_scale / 100}px`,
              "--logo-size-desktop": `${56 * settings.logo_scale / 100}px`,
            } as CSSProperties}
          />
          <span className="ml-2 hidden font-display text-base font-extrabold tracking-tight text-foreground sm:inline">Experts<span className="text-primary">Team</span></span>
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 px-1 lg:flex"
        >
          {PRIMARY_LINKS.map((item) => {
            const active = isActive(item.to, "exact" in item && item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  active ? activeClass : idleClass,
                  item.key === "plans" && !active && "border-primary/20 bg-primary/10 text-primary",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>
                  {item.key === "plans"
                    ? "Pricing"
                    : item.key === "learn"
                      ? "Learning"
                      : settings.navigation_labels[item.key] || item.label}
                </span>
              </Link>
            );
          })}

        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="max-w-40 gap-2 rounded-xl border border-border bg-card px-2 text-foreground hover:bg-muted sm:px-3"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(profile?.display_name || profile?.username || "A")
                        .slice(0, 1)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden truncate text-xs sm:inline">
                    {profile?.display_name || profile?.username || "Account"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">My dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/vault">Personal Vault</Link>
                </DropdownMenuItem>
                {(isDeveloper || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <a href="/projects?tab=vault" className="flex items-center">
                      <Archive className="mr-2 h-4 w-4" />
                      Developer Vault
                    </a>
                  </DropdownMenuItem>
                )}
                {isCreator && (
                  <DropdownMenuItem asChild>
                    <Link to="/creator"><Shield className="mr-2 h-4 w-4 text-amber-300" />Creator dashboard</Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      Admin panel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button
                size="sm"
                className="rounded-xl bg-[#4d8dff] font-bold text-white hover:bg-[#6b9fff]"
              >
                Sign in
              </Button>
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-foreground"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Mobile navigation"
          className="grid grid-cols-2 gap-2 border-t border-border bg-background p-3 sm:grid-cols-3 lg:hidden"
        >
          {PRIMARY_LINKS.map((item) => {
            const active = isActive(item.to, "exact" in item && item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold",
                  active
                    ? "border-border bg-muted text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.key === "plans"
                  ? "Pricing"
                  : item.key === "learn"
                    ? "Learning"
                    : settings.navigation_labels[item.key] || item.label}
              </Link>
            );
          })}
          <Link
            to="/messages"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold",
              isActive("/messages")
                ? "border-[#4d8dff]/35 bg-[#4d8dff]/10 text-[#a8c9ff]"
                : "border-white/10 text-white/65",
            )}
          >
            <MessageCircle className="h-4 w-4" /> Messages
          </Link>
          {SECONDARY_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-semibold text-muted-foreground"
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </Link>
          ))}
          {(isDeveloper || isAdmin) && (
            <a
              href="/projects?tab=vault"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-xs font-semibold text-primary"
            >
              <Archive className="h-4 w-4" /> Developer Vault
            </a>
          )}
          {user && (
            <>
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-3 py-3 text-xs font-semibold text-muted-foreground"
              >
                My dashboard
              </Link>
              <Link
                to="/vault"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white/65"
              >
                Personal Vault
              </Link>
            </>
          )}
          {isCreator && (
            <Link to="/creator" onClick={() => setOpen(false)} className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-3 text-xs font-semibold text-amber-100">Creator dashboard</Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white/65"
            >
              Admin panel
            </Link>
          )}
        </nav>
      )}

      <style>{`
        .et-site-logo{width:var(--logo-size-mobile);height:var(--logo-size-mobile)}
        @media(min-width:640px){.et-site-logo{width:var(--logo-size-desktop);height:var(--logo-size-desktop)}}
        .et-nav-tab{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid transparent;border-radius:11px;padding:9px 11px;color:var(--muted-foreground);font-size:12px;font-weight:650;letter-spacing:.01em;transition:all .18s ease}
        .et-nav-tab:hover{color:var(--foreground);background:var(--muted);border-color:var(--border)}
        .et-nav-active{color:var(--foreground);background:var(--muted);border-color:var(--border);box-shadow:none}
        .et-topbar{box-shadow:0 2px 12px rgba(0,0,0,.08)}
      `}</style>
    </header>
  );
}
