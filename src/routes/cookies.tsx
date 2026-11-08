import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Notice — ExpertsTeam" },
      {
        name: "description",
        content:
          "Understand essential cookies, saved preferences and third-party cookies used by embedded content and advertising.",
      },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Your browser choices
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">Cookie Notice</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: November 8, 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">Essential storage</h2>
            <p>
              ExpertsTeam uses browser storage and cookies where needed to keep sign-in sessions
              secure, remember settings and make core features work. Blocking essential storage may
              prevent sign-in or other features from working correctly.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Preferences</h2>
            <p>
              Some settings, such as display preferences and interface choices, may be saved in your
              browser so you do not need to set them each time.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Third-party services</h2>
            <p>
              Embedded videos, advertising, analytics if enabled, and external sign-in providers may
              set or read their own cookies or similar technologies. Their use is governed by the
              relevant provider's policies and controls. We do not control third-party cookie
              practices.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Managing cookies</h2>
            <p>
              You can manage or delete cookies using your browser settings. You may also use browser
              privacy controls or extensions to limit third-party cookies. Some features may not
              work if storage is disabled.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">More information</h2>
            <p>
              For information about personal information and service providers, read our{" "}
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              . For questions, use the{" "}
              <Link to="/contact" className="text-primary underline">
                contact page
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </PageShell>
  );
}
