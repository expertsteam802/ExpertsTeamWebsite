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

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/explore", label: "Explore" },
  { to: "/community", label: "Community" },
  { to: "/learn", label: "Learn" },
] as const;

const ALIGN: Record<NavAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

export function SiteHeader() {
  const settings = useSiteSettings();
  const { user, profile, isAdmin, signOut } = useAuth();
  const { theme, setTheme, navAlign, setNavAlign } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img
            src={settings.logo_url || "/experts-team-mark.svg"}
            alt={`${settings.site_name} logo`}
            className="h-10 w-10 rounded-xl object-contain ring-1 ring-primary/50"
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            {settings.site_name}
          </span>
        </Link>

        <nav
          className={cn(
            "hidden min-w-0 flex-1 grid-cols-5 items-stretch gap-1 lg:grid",
            ALIGN[navAlign],
          )}
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="font-display flex min-w-0 items-center justify-center rounded-lg px-1.5 py-2 text-center text-sm font-semibold tracking-tight leading-tight text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-full gap-1.5 px-3 text-sm font-semibold">
                <MoreHorizontal className="h-4 w-4" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Discover</DropdownMenuLabel>
              <DropdownMenuItem asChild><Link to="/entertainment">Games, apps & free files</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/ai">ExpertAI Studio</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/messages">Messages</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/projects">Apply to ExpertsTeam</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/pricing">Pricing</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/contact">Contact</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/privacy">Privacy</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/terms">Terms of Use</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex items-center gap-2">
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
                <Button variant="secondary" className="max-w-48 gap-2 truncate">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(profile?.display_name || profile?.username || "A")
                        .slice(0, 1)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">
                    {profile?.display_name || profile?.username || "Account"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">My dashboard</Link>
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
              <Button>Sign in</Button>
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (
        <nav className="animate-rise border-t border-border/70 px-4 pb-4 md:hidden">
          <div className="grid grid-cols-2 gap-1 py-3">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: item.to === "/" }}
                className="rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 border-t border-border/70 pt-3">
            {[
              { to: "/entertainment", label: "Games, apps & files" },
              { to: "/ai", label: "ExpertAI Studio" },
              { to: "/messages", label: "Messages" },
              { to: "/projects", label: "Apply to ExpertsTeam" },
              { to: "/pricing", label: "Pricing" },
              { to: "/contact", label: "Contact" },
              { to: "/privacy", label: "Privacy" },
              { to: "/terms", label: "Terms of Use" },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
