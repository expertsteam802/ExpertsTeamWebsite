import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About ExpertsTeam — Learn, build and share" },
      {
        name: "description",
        content:
          "Learn about ExpertsTeam, a developer community for practical coding education, creative projects and collaboration.",
      },
      { property: "og:title", content: "About ExpertsTeam" },
      {
        property: "og:description",
        content: "A place to learn, build and share technology projects.",
      },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Who we are</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Technology is better when we build together.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          ExpertsTeam is a community-led technology platform focused on learning to code, sharing
          useful resources, exploring projects and helping developers solve practical problems.
        </p>
        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold">Learn by doing</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Explore lessons, videos and practical resources designed to help you build real
              skills.
            </p>
          </Card>
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold">Share what you make</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Discover community projects, exchange ideas and publish apps you create.
            </p>
          </Card>
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold">Build with code</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use the browser workspace, editable project files, live previews and isolated sandbox
              tools. ExpertAI helps members plan, generate, edit and improve projects.
            </p>
          </Card>
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold">Get help</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask questions, share solutions and connect with other learners and creators.
            </p>
          </Card>
        </div>
        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link to="/explore" className="font-semibold text-primary hover:underline">
            Explore the platform
          </Link>
          <Link to="/contact" className="font-semibold text-primary hover:underline">
            Contact the team
          </Link>
        </div>
      </main>
    </PageShell>
  );
}
