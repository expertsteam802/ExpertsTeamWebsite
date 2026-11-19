import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — ExpertsTeam" },
      { name: "description", content: "Short, clear rules for using ExpertsTeam." },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/terms" }],
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
          Last updated: November 19, 2026 · Rules for using ExpertsTeam and sharing content.
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
            <h2 className="font-display text-lg font-semibold">3. Content, copyright and downloads</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              You may upload, publish or link only to material you created, own, or are authorised
              to distribute. Do not share pirated software, cracked applications, unauthorised
              copies of books, videos, music or games, torrent or warez links, stolen accounts,
              malware, spyware, credential stealers, or content that infringes another person's
              copyright, trademark, privacy or other rights. External download links must lead to
              the resource described and must not disguise, redirect or mislead visitors.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">4. Prohibited and harmful activity</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Do not use ExpertsTeam to facilitate unauthorised access, hacking, phreaking,
              credential theft, malware distribution, fraud, deceptive traffic, illegal gambling,
              illegal substances, threats, hate or gratuitous violence. Security education must
              remain lawful, defensive and performed only on systems you own or have explicit
              permission to test. Do not publish instructions, tools or links intended to harm
              people, compromise systems or bypass access controls.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">5. Community moderation and advertising</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Community posts, stories, comments, files, videos, project descriptions and external
              links must follow these rules. ExpertsTeam may review, restrict, remove or disable
              access to content or accounts that appear unlawful, deceptive, unsafe or rights-
              infringing. Do not generate artificial visits, impressions, clicks or conversions,
              ask people to click ads, use bots, automatically reload pages, or interfere with
              advertising measurement. Ads are provided by third parties and may open advertiser
              destinations when a visitor chooses to interact with them.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">6. Report a rights or safety concern</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              If you believe content on ExpertsTeam infringes your rights or creates a safety
              concern, send the relevant page or file URL, identify the material and explain your
              rights or concern through our{" "}
              <Link to="/contact" className="font-medium text-primary underline">contact page</Link>.
              We may request additional information before taking action.
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
            <h2 className="font-display text-lg font-semibold">8. Accounts and changes</h2>
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
