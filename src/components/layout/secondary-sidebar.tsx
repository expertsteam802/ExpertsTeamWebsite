import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Archive, BriefcaseBusiness, ChevronLeft, ChevronRight, Code2, FileVideo,
  FolderKanban, Gamepad2, LayoutDashboard, MessageCircle, Shield, Gift, Cloud,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const PERSONAL_LINKS = [
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/dashboard", label: "My dashboard", icon: LayoutDashboard },
  { to: "/vault", label: "Personal Vault", icon: Archive },
  { to: "/earn", label: "Earn AI credits", icon: Gift },
  { to: "/connections", label: "Connections", icon: Cloud },
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
  const sidebarRef = useRef<HTMLElement | null>(null);
  const previousPathRef = useRef(pathname);
  const { user, isAdmin, isCreator, isDeveloper } = useAuth();
  const active = (to: string) => pathname === to || pathname.startsWith(to + "/");

  useEffect(() => {
    if (collapsed) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) {
        setCollapsed(true);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCollapsed(true);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [collapsed]);

  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      previousPathRef.current = pathname;
      setCollapsed(true);
    }
  }, [pathname]);
  const width = collapsed ? "w-[68px]" : "w-[224px]";
  const linkClass = (to: string) => cn(
    "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[12px] font-semibold transition-[background-color,color,transform] duration-200 ease-out hover:translate-x-0.5",
    active(to) ? "bg-muted text-foreground ring-1 ring-inset ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
  return (
    <>
      <aside ref={sidebarRef} className={cn("et-secondary-sidebar relative z-20 hidden shrink-0 border-r border-border bg-background/75 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] lg:flex lg:flex-col", width)}>
        <div className={cn("flex h-12 items-center border-b border-border", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground transition-opacity duration-200">Your space</span>}
          <button type="button" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <div className={cn("flex-1 space-y-5 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          {user && <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground">Personal</p>}
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
          {isCreator && <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-amber-300/70">Owner</p>}
            <Link to="/creator" title={collapsed ? "Creator dashboard" : undefined} className={linkClass("/creator")}>
              <Shield className="h-4 w-4 shrink-0 text-amber-300" />{!collapsed && <span>Creator dashboard</span>}
            </Link>
          </section>}
          {isAdmin && <section className="space-y-1">
            {!collapsed && <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/30">Management</p>}
            <Link to="/admin" title={collapsed ? "Admin panel" : undefined} className={linkClass("/admin")}>
              <Shield className="h-4 w-4 shrink-0" />{!collapsed && <span>Admin panel</span>}
            </Link>
          </section>}
        </div>
        {!collapsed && <div className="border-t border-white/[.07] px-4 py-3 text-[9px] text-muted-foreground">ExpertsTeam workspace</div>}
      </aside>
    </>
  );
}
