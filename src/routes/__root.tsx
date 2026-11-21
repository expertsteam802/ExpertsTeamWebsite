import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";

import { ChrisAiChat } from "@/components/chris-ai";
import { SiteTextEditor } from "@/components/site-text-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSiteSettings } from "@/hooks/use-site-settings";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const dialogEnabled =
    typeof window === "undefined" ||
    window.localStorage.getItem("expertsteam.error-dialog-enabled") !== "false";

  return dialogEnabled ? (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. The error has been recorded for the site owner. You can retry or
          return home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-sm text-muted-foreground">
          This section couldn't load. Please refresh the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Refresh page
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // YouTube requires a Referer header for embedded playback (error 153).
      { name: "referrer", content: "strict-origin-when-cross-origin" },
      { title: "ExpertsTeam - Learn, Code, Games & Apps for Free" },
      {
        name: "description",
        content:
          "Learn to code, explore games and apps, download useful resources, build software with ExpertAI and connect with the ExpertsTeam community.",
      },

      {
        name: "google-site-verification",
        content: "YdY2ygzprZLok7-Cvwg_j29cI4ycK480HDQmh0d-JIg",
      },
      { name: "google-adsense-account", content: "ca-pub-4535524305819415" },
      { property: "og:site_name", content: "ExpertsTeam" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "ExpertsTeam - Learn, Code, Games & Apps for Free" },
      { name: "twitter:title", content: "ExpertsTeam - Learn, Code, Games & Apps for Free" },
      {
        property: "og:description",
        content:
          "ExpertsTeam helps you learn coding, discover games and apps, download resources and build software with ExpertAI.",
      },
      {
        name: "twitter:description",
        content:
          "Learn, code, explore games and apps for free with ExpertsTeam. Build projects with ExpertAI and connect with developers.",
      },
      { property: "og:image", content: "https://expertsteam.giize.com/favicon.svg?v=20261121-1" },
      { property: "og:image:width", content: "1248" },
      { property: "og:image:height", content: "1248" },
      { property: "og:image:alt", content: "ExpertsTeam logo" },
      { name: "twitter:image", content: "https://expertsteam.giize.com/favicon.svg?v=20261121-1" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", sizes: "any", href: "/favicon.svg?v=20261121-1" },
      { rel: "shortcut icon", href: "/favicon.svg?v=20261121-1" },
      { rel: "apple-touch-icon", href: "/favicon.svg?v=20261121-1" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const MONETAG_VIGNETTE_PATHS = new Set(["/", "/learn", "/about"]);
const MONETAG_IN_PAGE_PUSH_PATHS = new Set(["/learn", "/about"]);

const ADSENSE_PUBLIC_CONTENT_PATHS = new Set([
  "/",
  "/about",
  "/learn",
]);

function RootShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousPathRef = useRef(pathname);
  const shouldLoadVignette = MONETAG_VIGNETTE_PATHS.has(pathname);
  const shouldLoadInPagePush = MONETAG_IN_PAGE_PUSH_PATHS.has(pathname);
  const shouldLoadMonetag = shouldLoadVignette || shouldLoadInPagePush;

  // Monetag and AdSense are permitted only on the explicitly approved public
  // content routes above. On every other tab, remove their loaders and creatives.
  useEffect(() => {
    if (shouldLoadMonetag && shouldLoadAdsense) return;

    const removeAdElements = () => {
      document
        .querySelectorAll(
          [
            'script[src*="n6wxm.com"]',
            'script[src*="nap5k.com"]',
            'script[src*="5gvci.com"]',
            'script[data-zone="12296060"]',
            'script[data-zone="12296064"]',
            'iframe[src*="n6wxm.com"]',
            'iframe[src*="nap5k.com"]',
            'iframe[src*="5gvci.com"]',
            'iframe[src*="monetag"]',
            'iframe[src*="googlesyndication.com"]',
            'iframe[src*="doubleclick.net"]',
            'iframe[id^="google_ads_iframe"]',
            'ins.adsbygoogle',
            '.google-auto-placed',
            '[id*="monetag"]',
            '[class*="monetag"]',
          ].join(", "),
        )
        .forEach((element) => element.remove());
    };

    removeAdElements();
    const observer = new MutationObserver(removeAdElements);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // The Monetag service worker can keep showing push creatives after its
    // page script is removed. Unregister this site's Monetag worker on ad-free tabs.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          const scriptUrl = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? "";
          if (new URL(scriptUrl, window.location.origin).pathname === "/sw.js") {
            void registration.unregister();
          }
        }
      }).catch(() => undefined);
    }

    return () => observer.disconnect();
  }, [pathname, shouldLoadMonetag, shouldLoadAdsense]);

  // Third-party ad scripts can keep document-level listeners alive after a
  // client-side route change. Do a clean document navigation when leaving an
  // ad-enabled page for any tab where ads are not permitted.
  useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = pathname;
    const previousPageHadAds =
      MONETAG_VIGNETTE_PATHS.has(previousPath) ||
      MONETAG_IN_PAGE_PUSH_PATHS.has(previousPath) ||
      ADSENSE_PUBLIC_CONTENT_PATHS.has(previousPath);
    const currentPageAllowsAds = shouldLoadMonetag || shouldLoadAdsense;
    if (previousPath !== pathname && previousPageHadAds && !currentPageAllowsAds) {
      window.location.replace(window.location.pathname + window.location.search + window.location.hash);
    }
  }, [pathname, shouldLoadMonetag, shouldLoadAdsense]);

  return (
    <html lang="en" className="theme-dark dark">
      <head>
        {shouldLoadVignette && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(s){s.dataset.zone='12296060',s.src='https://n6wxm.com/vignette.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))",
            }}
          />
        )}
        {shouldLoadInPagePush && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(s){s.dataset.zone='12296064',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))",
            }}
          />
        )}
        <HeadContent />
        {shouldLoadAdsense && (
          <script
            async
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4535524305819415"
            crossOrigin="anonymous"
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "ExpertsTeam",
              alternateName: ["Experts Team", "expertsteam.giize.com"],
              logo: "https://expertsteam.giize.com/favicon.svg?v=20261121-1",
              sameAs: ["https://www.youtube.com/@expertchris", "https://instagram.com/m_chris_t"],
              contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: "mucyochristhecla@gmail.com" }],
              url: "https://expertsteam.giize.com/",
              description:
                "ExpertsTeam is a digital learning and creator platform to learn coding, build real software with ExpertAI, share projects, connect with developers and discover useful tools.",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "ExpertsTeam",
              alternateName: ["Experts Team", "expertsteam.giize.com"],
              url: "https://expertsteam.giize.com/",
              description:
                "ExpertsTeam is a digital learning and creator platform to learn coding, build real software with ExpertAI, share projects, connect with developers and discover useful tools.",
            }),
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RootContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootContent() {
  const settings = useSiteSettings();
  const currentPathname = useRouterState({ select: (state) => state.location.pathname });
  const isPublishedApp = currentPathname.startsWith("/apps/");
  const isAiWorkspace = currentPathname === "/ai" || currentPathname === "/chat";
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      "expertsteam.error-dialog-enabled",
      settings.error_dialog_enabled === false ? "false" : "true",
    );
  }, [settings.error_dialog_enabled]);

  useEffect(() => {
    const reportRuntimeError = (error: Error, boundary: string) => {
      reportLovableError(error, { boundary });
      if (settings.error_dialog_enabled !== false) {
        setRuntimeError(
          "Something unexpected happened. The error has been recorded; you can safely retry.",
        );
      }
    };
    const onError = (event: ErrorEvent) => {
      reportRuntimeError(
        event.error instanceof Error ? event.error : new Error(event.message),
        "window_error",
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportRuntimeError(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        "unhandled_rejection",
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [settings.error_dialog_enabled]);

  return (
    <>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors position="top-center" />
      <SiteTextEditor />

      <Dialog open={Boolean(runtimeError)} onOpenChange={(open) => !open && setRuntimeError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Something went wrong</DialogTitle>
            <DialogDescription>{runtimeError}</DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload page
          </button>
        </DialogContent>
      </Dialog>

      {!isPublishedApp && !isAiWorkspace &&
        (aiChatOpen ? (
          <div className="fixed bottom-4 right-4 z-[100] h-[min(680px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <ChrisAiChat compact onMinimize={() => setAiChatOpen(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAiChatOpen(true)}
            aria-label="Open ExpertAI"
            title="Open ExpertAI"
            className="fixed bottom-5 right-5 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-2xl transition-all hover:scale-105 hover:bg-primary/90"
          >
            <Bot className="h-7 w-7" />
          </button>
        ))}
    </>
  );
}
