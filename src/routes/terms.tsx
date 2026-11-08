import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — ExpertsTeam" },
      { name: "description", content: "Read the rules for using ExpertsTeam accounts, community features, downloads, coding workspaces and published apps." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Using the platform</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: November 8, 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
          <section><h2 className="text-xl font-semibold text-foreground">Acceptable use</h2><p>Use ExpertsTeam lawfully and respectfully. Do not harass, threaten, impersonate, distribute malware, infringe others' rights, attempt unauthorized access, disrupt the service or upload content that is illegal or harmful.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Your content and projects</h2><p>You retain ownership of the code, files, posts and other material you create or upload, subject to rights in third-party components and assets you use. You give ExpertsTeam permission to host, store, process, display and distribute your content as needed to provide the features you choose, including public posts and app publishing. You are responsible for ensuring you have permission to use and share third-party material.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Published apps and downloads</h2><p>When you publish an app or share a download, you understand that people with access to its public link may view or use it. Do not publish secrets, API keys, private data or content you do not have rights to distribute. You are responsible for testing your app and for the services or data it connects to.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Code execution and security</h2><p>Workspace code runs in an isolated sandbox, but sandboxing does not make every program or network action safe. Use it only for lawful development, learning and security testing on systems you own or are expressly authorized to test. Do not use the platform for attacks, credential theft, malware or unauthorized access.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">AI and availability</h2><p>ExpertAI prompt-based coding is under development and may be unavailable or incomplete. Generated code can contain errors or security issues. Review and test code before using it. We may change, suspend or remove features to maintain or protect the service.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Moderation and account action</h2><p>We may review reports and restrict content or accounts that violate these terms, infringe rights or threaten platform safety. You may stop using the service and request account deletion through available controls or the contact page.</p></section>
          <section><h2 className="text-xl font-semibold text-foreground">Changes and contact</h2><p>These terms may change as features evolve. Continued use after an updated version is posted means you accept the revised terms. Questions can be sent through the <Link to="/contact" className="text-primary underline">contact page</Link>.</p></section>
        </div>
      </main>
    </PageShell>
  );
}
