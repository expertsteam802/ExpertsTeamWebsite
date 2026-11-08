import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ExpertsTeam" },
      { name: "description", content: "A short explanation of how ExpertsTeam handles your information." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your information</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: November 9, 2026 · The short version.</p>
        <div className="mt-8 grid gap-4">
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">1. What we collect</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              We handle account details, profile information, messages, community content, uploaded files and projects. Basic technical data may also be processed to keep the service secure and working.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">2. Why we use it</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              We use information to sign you in, deliver platform features, save your work, respond to support requests, prevent abuse and improve reliability. Supabase provides database, storage and authentication services; Vercel provides hosting and project execution. Embedded media and advertising providers may process data under their own policies.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">3. Public and private content</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Community posts and published apps are public. Direct messages are limited to their conversation members. Personal Vault files are stored in private storage and access is restricted to the file owner. Do not send passwords or secrets in public areas.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">4. Your choices</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Keep your profile accurate and only upload content you want stored. You may request help with your data or account through the <Link to="/contact" className="font-medium text-primary underline">contact page</Link>. We keep information only as long as needed for the service, security, backups or legal requirements. We use safeguards, but no online service can promise perfect security.
            </p>
          </Card>
        </div>
      </main>
    </PageShell>
  );
}
