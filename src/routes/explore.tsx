import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Gamepad2, GraduationCap, MessageCircle, Sparkles, Users, Video, Wrench } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore ExpertsTeam — Community, videos and tools" },
      { name: "description", content: "Explore ExpertsTeam community conversations, creator videos, games, apps, learning resources and creative tools." },
    ],
  }),
  component: ExplorePage,
});

const DESTINATIONS = [
  { to: "/community", title: "Community", eyebrow: "Connect with people", description: "Discover live posts, ideas, questions, stories and conversations from members.", icon: Users },
  { to: "/videos", title: "Creator videos", eyebrow: "Watch and discover", description: "Browse the video archive and creator tutorials.", icon: Video },
  { to: "/entertainment", title: "Games, Apps & Files", eyebrow: "Explore downloads", description: "Find community games, apps and useful files in their own library.", icon: Gamepad2 },
  { to: "/learn", title: "Learn", eyebrow: "Build your skills", description: "Open books, learning files, tutorial videos and coding lessons.", icon: GraduationCap },
  { to: "/messages", title: "Messages", eyebrow: "Talk privately", description: "Open your inbox and chat directly with other ExpertsTeam members.", icon: MessageCircle },
  { to: "/projects", title: "Workspace", eyebrow: "Make something real", description: "Return to your saved projects and continue building.", icon: Wrench },
  { to: "/ai", title: "ExpertAI Studio", eyebrow: "Create with AI", description: "Describe an idea, build an app and preview your work.", icon: Sparkles },
] as const;

function ExplorePage() {
  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary"><Compass className="h-4 w-4" /> Discover ExpertsTeam</div>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-5xl">Explore <span className="brand-text">what's possible</span></h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Every destination has its own space. Choose where you want to go instead of digging through nested menus.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DESTINATIONS.map((item) => (
            <Link key={item.to} to={item.to} className="group block">
              <Card className="h-full gap-4 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:glow-panel">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><item.icon className="h-6 w-6" /></span>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{item.eyebrow}</p><h2 className="mt-2 font-display text-xl font-semibold">{item.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p></div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
