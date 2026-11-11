import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { useSiteSettings } from "@/hooks/use-site-settings";

export const Route = createFileRoute("/copyright")({
  head: () => ({ meta: [
    { title: "Copyright & Takedown Requests | ExpertsTeam" },
    { name: "description", content: "Copyright ownership, permitted uploads and how to report material that may infringe your rights on ExpertsTeam." },
  ] }),
  component: CopyrightPage,
});

function CopyrightPage() {
  const settings = useSiteSettings();
  return <PageShell><main className="mx-auto max-w-4xl space-y-6 px-4 py-12">
    <header className="space-y-3"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Rights and responsibilities</p><h1 className="font-display text-4xl font-bold">Copyright & Takedown Requests</h1><p className="text-sm text-muted-foreground">Last updated: 11 November 2026</p><p className="leading-7 text-muted-foreground">ExpertsTeam respects intellectual property rights and expects members to share only material they created, licensed or are otherwise legally permitted to distribute.</p></header>
    <Card className="space-y-3 p-6"><h2 className="text-xl font-semibold">What members may upload</h2><p className="text-sm leading-7 text-muted-foreground">You may upload your own tutorials, code, artwork, documents and media, or material whose licence clearly permits the intended use. Giving credit or linking to the original source does not by itself grant permission to copy or redistribute copyrighted material.</p></Card>
    <Card className="space-y-3 p-6"><h2 className="text-xl font-semibold">Report potentially infringing content</h2><p className="text-sm leading-7 text-muted-foreground">If you own a work or are authorized to act for its owner, send a notice identifying the copyrighted work, the exact ExpertsTeam URL(s) at issue, your contact details, a good-faith statement explaining why the use is unauthorized, and a statement that the information is accurate and that you are authorized to submit the notice. Do not include unnecessary sensitive personal information.</p><p className="text-sm leading-7 text-muted-foreground">Send the notice to <a className="text-primary underline" href={`mailto:${settings.owner_email}?subject=Copyright%20takedown%20request`}>{settings.owner_email}</a> or use the <a className="text-primary underline" href="/contact?topic=copyright">contact form</a> with the subject “Copyright takedown request”.</p></Card>
    <Card className="space-y-3 p-6"><h2 className="text-xl font-semibold">Review and counter-notices</h2><p className="text-sm leading-7 text-muted-foreground">We review complete notices and may restrict access to reported material while investigating. We may request additional information and may notify the uploader. If you believe content was removed in error, reply with the relevant URL, an explanation and evidence of your right to use it. Repeated infringement may result in account restrictions.</p></Card>
    <Card className="space-y-3 p-6"><h2 className="text-xl font-semibold">Platform identity</h2><p className="text-sm leading-7 text-muted-foreground">ExpertsTeam is an independent platform. Product names, game titles, logos and trademarks mentioned by members remain the property of their respective owners. Their appearance does not imply endorsement or affiliation.</p></Card>
  </main></PageShell>;
}
