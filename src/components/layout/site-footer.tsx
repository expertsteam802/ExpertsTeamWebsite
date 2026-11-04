import { Link } from "@tanstack/react-router";
import { Instagram, Mail, Youtube } from "lucide-react";

import { useSiteSettings } from "@/hooks/use-site-settings";

function socialLabel(value: string, fallback: string) {
  try {
    const path = new URL(value).pathname.split("/").filter(Boolean).join("/");
    if (!path) return fallback;
    return path.startsWith("@") ? path : `@${path}`;
  } catch {
    return fallback;
  }
}

export function SiteFooter() {
  const settings = useSiteSettings();

  return (
    <footer className="mt-24 border-t border-border/70 bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="font-display text-lg font-semibold">{settings.site_name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{settings.tagline}</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Explore</p>
          <Link to="/videos" className="block text-muted-foreground hover:text-foreground">
            Video archive
          </Link>
          <Link to="/entertainment" className="block text-muted-foreground hover:text-foreground">
            Games, Apps & Files
          </Link>
          <Link to="/learn" className="block text-muted-foreground hover:text-foreground">
            Learn to code
          </Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Community</p>
          <Link to="/contact" className="block text-muted-foreground hover:text-foreground">
            Contact us
          </Link>
          <Link to="/auth" className="block text-muted-foreground hover:text-foreground">
            Join the community
          </Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Follow</p>
          <a
            href={settings.youtube_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Youtube className="h-4 w-4" /> {socialLabel(settings.youtube_url, "YouTube channel")}
          </a>
          <a
            href={settings.instagram_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Instagram className="h-4 w-4" /> {socialLabel(settings.instagram_url, "Instagram")}
          </a>
          <a
            href={`mailto:${settings.owner_email}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Mail className="h-4 w-4" /> {settings.owner_email}
          </a>
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {settings.site_name}. Built by Chris.
      </div>
    </footer>
  );
}
