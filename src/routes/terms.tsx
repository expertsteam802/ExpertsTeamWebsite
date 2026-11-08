import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — ExpertsTeam" },
      { name: "description", content: "Short, clear rules for using ExpertsTeam." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          The essentials
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">Terms of Use</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: November 9, 2026 · A quick read before you use the platform.
        </p>
        <div className="mt-8 grid gap-4">
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">1. Use ExpertsTeam respectfully</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Follow the law and respect other members. Do not harass people, impersonate others,
              upload harmful or illegal material, distribute malware, or access accounts and systems
              without permission.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">2. Your content stays yours</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              You keep ownership of the content and projects you create. You allow us to store and
              display them only as needed to provide the features you use. Public posts and
              published apps can be seen through their public pages or links. Your Personal Vault is
              private to your account.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">
              3. Check AI output before using it
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              AI-generated code and answers may be incomplete or incorrect. Review and test them
              before relying on them. Do not publish passwords, API keys, private data or material
              you do not have permission to share.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">4. Accounts and changes</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              We may remove harmful content or restrict accounts that break these rules. Features
              may change as the platform develops. You can stop using ExpertsTeam at any time; for
              help or account requests, visit the{" "}
              <Link to="/contact" className="font-medium text-primary underline">
                contact page
              </Link>
              .
            </p>
          </Card>
        </div>
      </main>
    </PageShell>
  );
}
