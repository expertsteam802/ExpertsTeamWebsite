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

function FooterLink({ to, children }: { to: string; children: string }) {
  return <Link to={to as never} className="block text-muted-foreground transition-colors hover:text-foreground">{children}</Link>;
}

export function SiteFooter() {
  const settings = useSiteSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border/70 bg-surface/70">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <img src={settings.logo_url || "/logo.png"} alt="ExpertsTeam logo" className="h-11 w-11 rounded-full border border-primary/30 object-cover" />
            <div><h2 className="font-display text-lg font-bold">ExpertsTeam</h2><p className="text-xs text-muted-foreground">Code. Create. Community.</p></div>
          </div>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">A developer community for learning to code, sharing practical projects, collaborating and building with ExpertAI.</p>
        </section>
        <nav aria-label="Platform pages" className="space-y-3 text-sm">
          <h3 className="font-semibold text-foreground">Platform</h3>
          <FooterLink to="/">Home</FooterLink>
          <FooterLink to="/explore">Explore</FooterLink>
          <FooterLink to="/community">Community</FooterLink>
          <FooterLink to="/messages">Messages</FooterLink>
          <FooterLink to="/projects">Workspace</FooterLink>
          <FooterLink to="/ai">ExpertAI Studio</FooterLink>
        </nav>
        <nav aria-label="Learning and resources" className="space-y-3 text-sm">
          <h3 className="font-semibold text-foreground">Learn & resources</h3>
          <FooterLink to="/learn">Learn to code</FooterLink>
          <FooterLink to="/videos">Video library</FooterLink>
          <FooterLink to="/entertainment">Games, apps & files</FooterLink>
          <FooterLink to="/auth">Create an account</FooterLink>
        </nav>
        <nav aria-label="About and legal" className="space-y-3 text-sm">
          <h3 className="font-semibold text-foreground">About & policies</h3>
          <FooterLink to="/about">About ExpertsTeam</FooterLink>
          <FooterLink to="/contact">Contact</FooterLink>
          <FooterLink to="/privacy-policy">Privacy policy</FooterLink>
          <FooterLink to="/terms">Terms of use</FooterLink>
          <FooterLink to="/copyright">Copyright & takedowns</FooterLink>
        </nav>
        <section className="space-y-3 text-sm">
          <h3 className="font-semibold text-foreground">Connect</h3>
          <a href={settings.youtube_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Youtube className="h-4 w-4" />{socialLabel(settings.youtube_url, "YouTube")}</a>
          <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Instagram className="h-4 w-4" />{socialLabel(settings.instagram_url, "Instagram")}</a>
          <a href={`mailto:${settings.owner_email}`} className="flex items-center gap-2 break-all text-muted-foreground hover:text-foreground"><Mail className="h-4 w-4" />{settings.owner_email}</a>
          <FooterLink to="/contact">Send a message</FooterLink>
        </section>
      </div>
      <div className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
        <p>© {year} ExpertsTeam. All rights reserved. Built by <span className="font-semibold text-foreground">Chris Expert</span>.</p>
        <p className="mt-1">ExpertsTeam is an independent developer community and is not affiliated with Google or other third-party brands.</p>
      </div>
    </footer>
  );
}
