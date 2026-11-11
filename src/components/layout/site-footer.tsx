import { Link } from "@tanstack/react-router";
import { Instagram, Mail, Youtube } from "lucide-react";

import { useSiteSettings } from "@/hooks/use-site-settings";
import { useAuth } from "@/hooks/use-auth";

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
  const { user, isAdmin } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-blue-400/20 bg-[#080d18]/95 text-[#f2f0e9]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:grid-cols-2 lg:grid-cols-5 lg:px-8">
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={settings.logo_url || "/experts-team-mark.svg"}
              alt="ExpertsTeam logo"
              className="h-11 w-11 rounded-full border border-blue-400/30 bg-white/5 object-cover"
            />
            <div>
              <h2 className="font-display text-lg font-bold">{settings.site_name}</h2>
              <p className="text-xs text-white/50">{settings.tagline}</p>
            </div>
          </div>
          <p className="max-w-xs text-sm leading-6 text-white/55">
            A place to learn coding, share projects, connect with developers and build with ExpertAI.
          </p>
        </section>

        <nav aria-label="Platform pages" className="space-y-3 text-sm">
          <h3 className="font-semibold text-white">Platform</h3>
          <Link to="/" className="block text-white/55 transition hover:text-blue-200">Home</Link>
          <Link to="/explore" className="block text-white/55 transition hover:text-blue-200">Explore</Link>
          <Link to="/community" className="block text-white/55 transition hover:text-blue-200">Community</Link>
          <Link to="/messages" className="block text-white/55 transition hover:text-blue-200">Messages</Link>
          <Link to="/ai" className="block text-white/55 transition hover:text-blue-200">ExpertAI Studio</Link>
          <Link to="/projects" className="block text-white/55 transition hover:text-blue-200">Workspace & projects</Link>
          <Link to="/software" className="block text-white/55 transition hover:text-blue-200">Request custom software</Link>
          {user && <Link to="/dashboard" className="block text-white/55 transition hover:text-blue-200">My dashboard</Link>}
          {user && <Link to="/vault" className="block text-white/55 transition hover:text-blue-200">Personal Vault</Link>}
          {isAdmin && <Link to="/admin" className="block text-white/55 transition hover:text-blue-200">Admin panel</Link>}
          <Link to="/entertainment" className="block text-white/55 transition hover:text-blue-200">Discover</Link>
        </nav>

        <nav aria-label="Learning and resources" className="space-y-3 text-sm">
          <h3 className="font-semibold text-white">Learn & resources</h3>
          <Link to="/learn" className="block text-white/55 transition hover:text-blue-200">Learn to code</Link>
          <Link to="/videos" className="block text-white/55 transition hover:text-blue-200">Video library</Link>
          <Link to="/showcase" className="block text-white/55 transition hover:text-blue-200">Project showcase</Link>
          <Link to="/auth" className="block text-white/55 transition hover:text-blue-200">Join ExpertsTeam</Link>
        </nav>

        <nav aria-label="About and policies" className="space-y-3 text-sm">
          <h3 className="font-semibold text-white">About & policies</h3>
          <Link to="/about" className="block text-white/55 transition hover:text-blue-200">About ExpertsTeam</Link>
          <Link to="/contact" className="block text-white/55 transition hover:text-blue-200">Contact</Link>
          <Link to="/privacy" className="block text-white/55 transition hover:text-blue-200">Privacy policy</Link>
          <Link to="/terms" className="block text-white/55 transition hover:text-blue-200">Terms of use</Link>
          <Link to="/cookies" className="block text-white/55 transition hover:text-blue-200">Cookie notice</Link>
          <Link to="/pricing" className="block text-white/55 transition hover:text-blue-200">Plans & limits</Link>
        </nav>

        <section className="space-y-3 text-sm">
          <h3 className="font-semibold text-white">Connect</h3>
          <a href={settings.youtube_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/55 transition hover:text-blue-200">
            <Youtube className="h-4 w-4" /> {socialLabel(settings.youtube_url, "YouTube")}
          </a>
          <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/55 transition hover:text-blue-200">
            <Instagram className="h-4 w-4" /> {socialLabel(settings.instagram_url, "Instagram")}
          </a>
          <a href={`mailto:${settings.owner_email}`} className="flex items-center gap-2 break-all text-white/55 transition hover:text-blue-200">
            <Mail className="h-4 w-4" /> {settings.owner_email}
          </a>
        </section>
      </div>

      <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/40">
        <p>© {year} {settings.site_name}. All rights reserved. Built by <span className="font-semibold text-white/75">Chris Expert</span>.</p>
      </div>
    </footer>
  );
}
