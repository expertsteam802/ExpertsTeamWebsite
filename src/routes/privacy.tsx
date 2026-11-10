import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ExpertsTeam" },
      {
        name: "description",
        content:
          "How ExpertsTeam handles account information, community content, AI requests, cookies and advertising data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Your information
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: November 10, 2026</p>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          This policy explains how ExpertsTeam handles information when you visit or use
          expertsteam.giize.com. It should be read together with our{" "}
          <Link to="/cookies" className="text-primary underline">
            Cookie Notice
          </Link>{" "}
          and{" "}
          <Link to="/terms" className="text-primary underline">
            Terms of Use
          </Link>
          .
        </p>
        <div className="mt-8 grid gap-4">
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">1. Information we handle</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Depending on the features you use, we may process account details such as your email,
              username, profile and avatar; content you publish; messages and call-signalling data;
              files and projects you upload or save; contact-form submissions; AI prompts and
              attachments you choose to send; and technical information such as device, browser, IP
              address, logs and security events.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">2. How information is used</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              We use information to operate accounts, provide learning and workspace features,
              deliver messages and calls, store files, answer support requests, prevent abuse,
              protect the service, troubleshoot errors and improve reliability. If you use ExpertAI,
              the prompt and any attachments you submit are processed by the AI service provider
              configured for that feature so it can generate a response.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">
              3. Service providers and advertising
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              ExpertsTeam uses third-party providers to operate the service, including Supabase for
              authentication, database and storage, and Vercel for hosting and deployment. Embedded
              YouTube content is provided by Google/YouTube. We use Google AdSense advertising
              technology. When Google ads are served, Google and its partners may use cookies, web
              beacons, IP addresses or similar identifiers to deliver, measure, limit and
              personalise advertising, subject to the settings and consent choices that apply to
              your location. Learn how Google uses data at{" "}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Google's partner-sites privacy information
              </a>
              . You can manage Google ad personalisation at{" "}
              <a
                href="https://myadcenter.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                My Ad Center
              </a>
              . Providers process information under their own terms and privacy notices.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">
              4. Public and private information
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Community posts, comments, public profiles and published apps may be visible to
              visitors. Direct messages are intended for the members of the relevant conversation.
              Personal Vault files are stored in private storage and are intended to be accessible
              only to the account owner. Do not put passwords, payment details or confidential
              information in public posts or AI prompts.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">5. Cookies and choices</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Essential browser storage supports sign-in, security and preferences. Google
              advertising and embedded media may use their own cookies or similar technologies. You
              can control cookies through your browser and use the privacy controls offered by
              Google and other providers. Where applicable, advertising consent choices are
              presented through the consent tools configured for the relevant region. See our{" "}
              <Link to="/cookies" className="text-primary underline">
                Cookie Notice
              </Link>
              .
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">
              6. Retention, security and your requests
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              We retain information for as long as needed to provide the service, meet legal
              obligations, resolve disputes, maintain security and preserve necessary backups.
              Access controls and other safeguards are used, but no online service can guarantee
              absolute security. You may request access, correction or deletion of information
              associated with your account, subject to applicable law and legitimate retention
              requirements.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">7. Contact</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              For privacy questions or account-data requests, contact the ExpertsTeam operator
              through the{" "}
              <Link to="/contact" className="text-primary underline">
                Contact page
              </Link>
              . Please do not include passwords or secret credentials in your request.
            </p>
          </Card>
        </div>
      </main>
    </PageShell>
  );
}
