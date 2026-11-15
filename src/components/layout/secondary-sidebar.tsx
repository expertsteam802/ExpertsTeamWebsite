import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Archive, BriefcaseBusiness, ChevronLeft, ChevronRight, Code2, FileVideo,
  FolderKanban, Gamepad2, LayoutDashboard, MessageCircle, Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const PERSONAL_LINKS = [
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/dashboard", label: "My dashboard", icon: LayoutDashboard },
  { to: "/vault", label: "Personal Vault", icon: Archive },
] as const;

const MORE_LINKS = [
  { to: "/software", label: "Request software", icon: BriefcaseBusiness },
  { to: "/projects", label: "Developer Apply", icon: Code2 },
  { to: "/videos", label: "Video library", icon: FileVideo },
  { to: "/entertainment", label: "Games & downloads", icon: Gamepad2 },
  { to: "/showcase", label: "Project showcase", icon: FolderKanban },
] as const;

export function SecondarySidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAdmin, isDeveloper } = useAuth();
  const active = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const width = collapsed ? "w-[68px]" : "w-[224px]";
  const linkClass = (to: string) => cn(
    "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[12px] font-semibold transition-colors",
    active(to) ? "bg-[#4d8dff]/15 text-[#a8c9ff] ring-1 ring-inset ring-[#4d8dff]/25" : "text-white/60 hover:bg-white/[.06] hover:text-white",
  );
  return (
    <>
      <aside className={cn("relative z-20 hidden shrink-0 border-r border-white/[.08] bg-[#090d15]/75 transition-[width] duration-200 lg:flex lg:flex-col", width)}>
        <div className={cn("flex h-12 items-center border-b border-white/[.07]", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-[.18em] text-white/35">Your space</span>}
          <button type="button" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <div className={cn("flex-1 space-y-5 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          {user && <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/30">Personal</p>}
            {PERSONAL_LINKS.map((item) => <Link key={item.to} to={item.to} title={collapsed ? item.label : undefined} aria-current={active(item.to) ? "page" : undefined} className={linkClass(item.to)}>
              <item.icon className="h-4 w-4 shrink-0" />{!collapsed && <span>{item.label}</span>}
            </Link>)}
          </section>}
          <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/30">More</p>}
            {MORE_LINKS.map((item) => <Link key={item.to} to={item.to} title={collapsed ? item.label : undefined} aria-current={active(item.to) ? "page" : undefined} className={linkClass(item.to)}>
              <item.icon className="h-4 w-4 shrink-0" />{!collapsed && <span>{item.label}</span>}
            </Link>)}
          </section>
          {(isDeveloper || isAdmin) && <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/30">Developer</p>}
            <a href="/projects?tab=vault" title={collapsed ? "Developer Vault" : undefined} className={linkClass("/projects?tab=vault")}>
              <Archive className="h-4 w-4 shrink-0" />{!collapsed && <span>Developer Vault</span>}
            </a>
          </section>}
          {isAdmin && <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/30">Management</p>}
            <Link to="/admin" title={collapsed ? "Admin panel" : undefined} className={linkClass("/admin")}>
              <Shield className="h-4 w-4 shrink-0" />{!collapsed && <span>Admin panel</span>}
            </Link>
          </section>}
        </div>
        {!collapsed && <div className="border-t border-white/[.07] px-4 py-3 text-[9px] text-white/25">ExpertsTeam workspace</div>}
      </aside>
    </>
  );
}
