import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Notice — ExpertsTeam" },
      {
        name: "description",
        content: "Details about essential storage, Google AdSense advertising cookies, embedded media and browser controls on ExpertsTeam.",
      },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your browser choices</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Cookie Notice</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: November 10, 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">Essential storage</h2>
            <p>ExpertsTeam uses cookies, local storage or similar browser technologies where needed for sign-in sessions, security, saved preferences and core platform functions. Disabling essential storage may prevent some features from working.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Google AdSense advertising</h2>
            <p>ExpertsTeam uses Google AdSense. Google and its advertising partners may use cookies, web beacons, IP addresses or similar identifiers to serve, measure, limit and personalise ads. The technologies used and the purposes of processing can depend on your location, ad settings and consent choices. Read <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer" className="text-primary underline">Google's advertising technologies information</a> and manage personalisation through <a href="https://myadcenter.google.com/" target="_blank" rel="noreferrer" className="text-primary underline">My Ad Center</a>.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Embedded media and other providers</h2>
            <p>YouTube videos, external sign-in providers and other third-party services may set or read their own cookies or similar technologies when their features are used. Their practices are governed by their respective privacy notices and controls.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Consent and regional requirements</h2>
            <p>Where required, advertising consent is requested using the consent-management tools configured for the relevant region. Google requires publishers serving personalised ads to users in the European Economic Area, the United Kingdom and Switzerland to use a Google-certified consent management platform integrated with the IAB Transparency and Consent Framework. Users may also see non-personalised advertising depending on the available settings and applicable rules.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">Managing cookies</h2>
            <p>You can manage or delete cookies using your browser settings. Blocking third-party cookies may affect embedded media or advertising. Browser controls do not necessarily withdraw consent already given through a separate consent-management platform.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground">More information</h2>
            <p>For details about personal information and service providers, read our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>. For questions, use the <Link to="/contact" className="text-primary underline">Contact page</Link>.</p>
          </section>
        </div>
      </main>
    </PageShell>
  );
}
