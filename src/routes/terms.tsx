import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { useSiteSettings } from "@/hooks/use-site-settings";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "Terms of Use | ExpertsTeam" },
    { name: "description", content: "Terms for using ExpertsTeam accounts, community features, project tools, uploads and ExpertAI Studio." },
  ] }),
  component: TermsPage,
});

function TermsPage() {
  const settings = useSiteSettings();
  return <PageShell><main className="mx-auto max-w-4xl space-y-6 px-4 py-12">
    <header className="space-y-3"><p className="text-sm font-semibold uppercase tracking-widest text-primary">Using the platform</p><h1 className="font-display text-4xl font-bold">Terms of Use</h1><p className="text-sm text-muted-foreground">Last updated: 11 November 2026</p><p className="leading-7 text-muted-foreground">By accessing ExpertsTeam, you agree to use the platform lawfully and respectfully. If you do not agree, do not use the services.</p></header>
    {[
      ["1. Accounts and security","Provide accurate account information, protect your login credentials and tell us if you suspect unauthorized access. You are responsible for activity performed through your account, subject to applicable law."],
      ["2. Acceptable use","Do not use the platform to harass, threaten, defraud, impersonate, distribute malware, bypass security, violate privacy, spam others, manipulate advertising or interfere with the service. Do not upload unlawful, infringing or harmful material."],
      ["3. Community content","You retain rights in content you own. By posting or uploading it, you give ExpertsTeam permission to host, store, display and transmit it only as needed to operate the features you choose. You are responsible for ensuring you have permission to share other people's work. Public posts may be visible to visitors."],
      ["4. Messages, calls and recordings","Private messages and calls are communication features, not a promise of uninterrupted availability. Calls require compatible devices, permissions and network connectivity. Recording is initiated by the user through an explicit recording control; obtain the consent required by the laws that apply to everyone involved before recording or sharing another person's voice or image."],
      ["5. ExpertAI and generated output","AI-generated text or code may be incomplete, inaccurate, insecure or subject to third-party terms. Review, test and secure generated output before relying on it or deploying it. Do not submit material you are not authorized to share. No AI output is a substitute for professional advice."],
      ["6. Intellectual property and reports","Respect copyrights, trademarks, privacy and other rights. We may restrict or remove content after reviewing a credible policy or rights complaint. See the Copyright & Takedown page for how to submit a notice."],
      ["7. Third-party services and availability","Some features rely on third-party hosting, AI, video, storage or communication services. Their availability and terms may differ. We may update, suspend or discontinue features for maintenance, safety or operational reasons."],
      ["8. Disclaimer and liability","The platform is provided on an as-available basis to the extent permitted by law. Nothing in these terms excludes liability that cannot legally be excluded. You use shared content, project files and AI output at your own discretion and should keep independent backups of important work."],
      ["9. Changes and contact","We may update these terms when the platform changes. Continued use after an updated version is published means you accept the revised terms to the extent permitted by law. Questions can be sent to " + settings.owner_email + "."]
    ].map(([title, body]) => <Card key={title} className="space-y-2 p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm leading-7 text-muted-foreground">{body}</p></Card>)}
  </main></PageShell>;
}
