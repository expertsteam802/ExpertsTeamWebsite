import { Link } from "@tanstack/react-router";
import { LogOut, Menu, MoreHorizontal, Palette, Shield } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { THEMES, useTheme, type NavAlign } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const ALIGN: Record<NavAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

const MOBILE_LINKS = [
  { to: "/entertainment", label: "Games, apps & files" },
  { to: "/projects", label: "Apply to ExpertsTeam" },
  { to: "/contact", label: "Contact" },
  { to: "/pricing", label: "Pricing" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms of Use" },
] as const;

export function SiteHeader() {
  const settings = useSiteSettings();
  const { user, profile, isAdmin, signOut } = useAuth();
  const { theme, setTheme, navAlign, setNavAlign } = useTheme();
  const [open, setOpen] = useState(false);

  const tabClass =
    "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary";

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-3 sm:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img
            src={settings.logo_url || "/experts-team-mark.svg"}
            alt="ExpertsTeam"
            className="h-9 w-9 rounded-full object-cover"
          />
          <span className="font-display text-base font-bold tracking-tight sm:text-lg">
            ExpertsTeam
          </span>
        </Link>

        <nav
          aria-label="Main navigation"
          className={cn(
            "hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex",
            ALIGN[navAlign],
          )}
        >
          <Link to="/" activeOptions={{ exact: true }} className={tabClass}>
            Home
          </Link>
          <Link to="/explore" className={tabClass}>
            Explore
          </Link>
          <Link to="/learn" className={tabClass}>
            Learn
          </Link>
          <Link to="/community" className={tabClass}>
            Community
          </Link>
          <Link to="/ai" className={tabClass}>
            ExpertAI
          </Link>
          <Link to="/messages" className={tabClass}>
            Messages
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 rounded-xl px-3 font-semibold"
              >
                More <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>More from ExpertsTeam</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/entertainment">Games, apps & free files</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/projects">Apply to ExpertsTeam</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/contact">Contact</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/pricing">Pricing</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/privacy">Privacy</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/terms">Terms of Use</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Appearance settings">
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              {THEMES.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() => setTheme(option.id)}
                  className={cn(theme === option.id && "text-primary")}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tab alignment</DropdownMenuLabel>
              {(["left", "center", "right"] as NavAlign[]).map((align) => (
                <DropdownMenuItem
                  key={align}
                  onClick={() => setNavAlign(align)}
                  className={cn("capitalize", navAlign === align && "text-primary")}
                >
                  {align}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="max-w-40 gap-2 truncate px-2 sm:px-3">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(profile?.display_name || profile?.username || "A")
                        .slice(0, 1)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden truncate sm:inline">
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
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <Shield className="mr-2 h-4 w-4" /> Admin panel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button size="sm">Sign in</Button>
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
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
          className="border-t border-border/70 px-3 pb-4 md:hidden"
        >
          <div className="grid grid-cols-2 gap-2 py-3">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
            >
              Home
            </Link>
            <Link
              to="/explore"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
            >
              Explore
            </Link>
            <Link
              to="/learn"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
            >
              Learn
            </Link>
            <Link
              to="/community"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
            >
              Community
            </Link>
            <Link
              to="/ai"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
            >
              ExpertAI Studio
            </Link>
            <Link
              to="/messages"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
            >
              Messages
            </Link>
            {user && (
              <Link
                to="/vault"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-3 py-3 text-sm font-semibold"
              >
                Personal Vault
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 border-t border-border/70 pt-3">
            {MOBILE_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                Admin panel
              </Link>
            )}
            {user && (
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                My dashboard
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
