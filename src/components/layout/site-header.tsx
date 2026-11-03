import { Link } from "@tanstack/react-router";
import { Instagram, LogOut, Menu, Palette, Shield, Youtube } from "lucide-react";
import { useState } from "react";

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

const TABS = [
  { to: "/", label: "Home" },
  { to: "/videos", label: "Videos" },
  { to: "/entertainment", label: "Entertainment" },
  { to: "/learn", label: "Learn to code" },
  { to: "/community", label: "Community" },
  { to: "/projects", label: "Workspace" },
  { to: "/ai", label: "Expert AI" },
  { to: "/contact", label: "Contact" },
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
            src={settings.logo_url || "/logo.png"}
            alt={`${settings.site_name} logo`}
            className="h-10 w-10 rounded-full object-cover ring-1 ring-primary/50"
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            {settings.site_name}
          </span>
        </Link>

        <nav className={cn("hidden flex-1 items-center gap-2 md:flex", ALIGN[navAlign])}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 text-sm">
                Explore <span className="text-xs text-muted-foreground">⌄</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Discover</DropdownMenuLabel>
              {TABS.filter((tab) =>
                ["/", "/videos", "/entertainment", "/community"].includes(tab.to),
              ).map((tab) => (
                <DropdownMenuItem key={tab.to} asChild>
                  <Link to={tab.to} activeOptions={{ exact: tab.to === "/" }}>
                    {tab.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 text-sm">
                Create & learn <span className="text-xs text-muted-foreground">⌄</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Creator tools</DropdownMenuLabel>
              {TABS.filter((tab) => ["/learn", "/projects", "/ai"].includes(tab.to)).map((tab) => (
                <DropdownMenuItem key={tab.to} asChild>
                  <Link to={tab.to}>{tab.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link
            to="/contact"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
          >
            Contact
          </Link>
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

          <a
            href={settings.youtube_url}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:block"
          >
            <Button variant="ghost" size="icon" aria-label="YouTube channel">
              <Youtube className="h-4 w-4" />
            </Button>
          </a>
          <a
            href={settings.instagram_url}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:block"
          >
            <Button variant="ghost" size="icon" aria-label="Instagram">
              <Instagram className="h-4 w-4" />
            </Button>
          </a>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="max-w-40 truncate">
                  {profile?.display_name || profile?.username || "Account"}
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
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setOpen((value) => !value)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (
        <nav className="animate-rise border-t border-border/70 px-4 pb-4 md:hidden">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
