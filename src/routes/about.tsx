import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { useSiteSettings } from "@/hooks/use-site-settings";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [
    { title: "About ExpertsTeam" },
    { name: "description", content: "Learn what ExpertsTeam offers: coding education, developer collaboration, practical projects and ExpertAI Studio." },
  ] }),
  component: AboutPage,
});

function AboutPage() {
  const settings = useSiteSettings();
  return <PageShell>
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Who we are</p>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">About ExpertsTeam</h1>
        <p className="max-w-3xl text-lg leading-8 text-muted-foreground">ExpertsTeam is an independent developer community built around learning, making and sharing useful technology. It brings coding resources, practical projects, creator videos, community conversations and AI-assisted building into one place.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2 p-6"><h2 className="text-xl font-semibold">Learn by building</h2><p className="text-sm leading-7 text-muted-foreground">Explore coding lessons, video tutorials and learning resources. The goal is to help members move from concepts to working projects through practice.</p></Card>
        <Card className="space-y-2 p-6"><h2 className="text-xl font-semibold">Build and collaborate</h2><p className="text-sm leading-7 text-muted-foreground">Share projects, ask technical questions, exchange feedback and connect with other developers through the community and private messaging tools.</p></Card>
        <Card className="space-y-2 p-6"><h2 className="text-xl font-semibold">ExpertAI Studio</h2><p className="text-sm leading-7 text-muted-foreground">Use the AI chat and coding workspace to explore ideas, generate code, edit files and preview application projects. AI output should always be reviewed and tested before production use.</p></Card>
        <Card className="space-y-2 p-6"><h2 className="text-xl font-semibold">Our approach</h2><p className="text-sm leading-7 text-muted-foreground">We aim for a respectful, practical and accessible environment. Members are responsible for sharing content they own or are permitted to use.</p></Card>
      </div>
      <Card className="space-y-3 p-6"><h2 className="text-xl font-semibold">The creator</h2><p className="leading-7 text-muted-foreground">ExpertsTeam is built by Chris Expert, a software developer and technology creator. The platform is independently operated and is not affiliated with Google, YouTube or other third-party services.</p><p className="text-sm text-muted-foreground">For questions, partnerships, feedback or content concerns, contact <a className="text-primary underline" href={`mailto:${settings.owner_email}`}>{settings.owner_email}</a> or use our <Link to="/contact" className="text-primary underline">contact page</Link>.</p></Card>
    </main>
  </PageShell>;
}
