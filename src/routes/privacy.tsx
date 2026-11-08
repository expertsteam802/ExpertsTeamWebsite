import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ExpertsTeam" },
      { name: "description", content: "Read how ExpertsTeam handles account information, messages, uploaded content, cookies and third-party services." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Trust & safety</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: November 8, 2026</p>
        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-7 text-muted-foreground">
          <section><h2 className="text-xl font-semibold text-foreground">Information we handle</h2><p>When you use ExpertsTeam, we may process account details such as your email address, username and profile information; content you submit such as posts, messages, comments, files and projects; messages sent through contact forms; and technical information needed to operate, secure and troubleshoot the service.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">How information is used</h2><p>We use information to create and secure accounts, provide community and messaging features, store and display your projects and uploads, respond to support requests, operate the coding workspace, prevent abuse and maintain the platform.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Service providers and embedded content</h2><p>ExpertsTeam uses infrastructure and service providers, including Supabase for application data and authentication and Vercel for hosting and isolated code execution. Pages may also include third-party video, advertising, sign-in or other embedded services. Those providers may process information under their own privacy notices and cookie settings.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Public content and messages</h2><p>Content you publish in public areas may be visible to other visitors. Private messages are intended for their conversation participants, subject to service operation, security and legal requirements. Do not post passwords, secrets or personal information you do not want to share.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Retention and your choices</h2><p>We retain account and content information while needed to provide the service, meet legitimate operational needs or comply with applicable requirements. You can update profile information and may request account or content deletion through available account controls or by contacting us. Backups and records required for security or legal reasons may persist for a limited period.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Security and children</h2><p>We use access controls and platform safeguards, but no internet service can guarantee absolute security. ExpertsTeam is not designed for children under 13. If you believe a child has provided personal information, contact us so we can review it.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Policy changes and contact</h2><p>We may update this policy as the platform changes. Material updates will be reflected on this page. For privacy questions or requests, use the <Link to="/contact" className="text-primary underline">contact page</Link>.</p></section>
        </div>
      </main>
    </PageShell>
  );
}
