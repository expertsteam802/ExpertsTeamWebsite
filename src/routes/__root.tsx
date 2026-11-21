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

  const dialogEnabled = (() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("expertsteam.error-dialog-enabled") !== "false";
    } catch {
      return true;
    }
  })();

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
      { title: "ExpertsTeam | AI, Software & Technology Solutions" },
      {
        name: "description",
        content:
          "ExpertsTeam is a software and technology company building AI systems, websites, applications and digital solutions for people and businesses.",
      },

      {
        name: "google-site-verification",
        content: "YdY2ygzprZLok7-Cvwg_j29cI4ycK480HDQmh0d-JIg",
      },
      { name: "google-adsense-account", content: "ca-pub-4535524305819415" },
      { property: "og:site_name", content: "ExpertsTeam" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "ExpertsTeam | AI, Software & Technology Solutions" },
      { name: "twitter:title", content: "ExpertsTeam | AI, Software & Technology Solutions" },
      {
        property: "og:description",
        content:
          "ExpertsTeam builds intelligent AI systems, custom software, websites, mobile applications and digital solutions.",
      },
      {
        name: "twitter:description",
        content:
          "Discover AI development, software engineering, web and mobile applications, and digital innovation from ExpertsTeam.",
      },
      { property: "og:image", content: "https://expertsteam.giize.com/experts-team-brand.svg?v=20261121-2" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "670" },
      { property: "og:image:alt", content: "ExpertsTeam logo" },
      { name: "twitter:image", content: "https://expertsteam.giize.com/experts-team-brand.svg?v=20261121-2" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", sizes: "any", href: "/favicon.svg?v=20261121-2" },
      { rel: "shortcut icon", href: "/favicon.svg?v=20261121-2" },
      { rel: "apple-touch-icon", href: "/favicon.svg?v=20261121-2" },
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
  const shouldLoadAdsense = ADSENSE_PUBLIC_CONTENT_PATHS.has(pathname);

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
            'script[src*="googlesyndication.com"]',
            'script[src*="doubleclick.net"]',
            'script[src*="googleadservices.com"]',
            'script[data-zone="12296060"]',
            'script[data-zone="12296064"]',
            'iframe[src*="n6wxm.com"]',
            'iframe[src*="nap5k.com"]',
            'iframe[src*="5gvci.com"]',
            'iframe[src*="monetag"]',
            'iframe[src*="googlesyndication.com"]',
            'iframe[src*="googleadservices.com"]',
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
          const workerUrl = new URL(scriptUrl, window.location.origin);
          const isMonetagWorker =
            /5gvci\.com|n6wxm\.com|nap5k\.com|monetag/i.test(scriptUrl) ||
            workerUrl.pathname === "/sw.js";
          if (isMonetagWorker) void registration.unregister();
        }
      }).catch(() => undefined);
    }

    return () => observer.disconnect();
  }, [pathname, shouldLoadMonetag, shouldLoadAdsense]);

  // Ad providers attach document-level scripts, listeners and creatives.
  // A client-side route transition across the ad boundary must become a full
  // document navigation in BOTH directions: ad -> ad-free and ad-free -> ad.
  // This gives the destination page a clean document and initializes only the
  // ad providers allowed for that destination route.
  useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = pathname;

    const previousPageAllowsAds =
      MONETAG_VIGNETTE_PATHS.has(previousPath) ||
      MONETAG_IN_PAGE_PUSH_PATHS.has(previousPath) ||
      ADSENSE_PUBLIC_CONTENT_PATHS.has(previousPath);
    const currentPageAllowsAds = shouldLoadMonetag || shouldLoadAdsense;

    if (previousPath !== pathname && previousPageAllowsAds !== currentPageAllowsAds) {
      window.location.reload();
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
              logo: "https://expertsteam.giize.com/experts-team-brand.svg?v=20261121-2",
              sameAs: ["https://www.youtube.com/@expertchris", "https://instagram.com/m_chris_t"],
              contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: "mucyochristhecla@gmail.com" }],
              url: "https://expertsteam.giize.com/",
              description:
                "ExpertsTeam is a software and technology company building AI systems, custom software, websites, mobile applications and digital solutions.",
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
                "ExpertsTeam is a software and technology company building AI systems, custom software, websites, mobile applications and digital solutions for people and businesses.",
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
  const currentPathname = useRouterState({ select: (state) => state.location.pathname });
  const siteSettings = useSiteSettings();
  const isPublishedApp = currentPathname.startsWith("/apps/");
  const isAiWorkspace = currentPathname === "/ai" || currentPathname === "/chat";
  const [aiChatOpen, setAiChatOpen] = useState(false);

  // Keep browser icons, social previews and cinematic backdrops tied to the
  // single logo/background uploaded from Admin -> Site settings.
  useEffect(() => {
    const logo = siteSettings.logo_url || "/logo.svg?v=20261121-3";
    const background = siteSettings.background_image_url || "/experts-team-background.svg?v=20261121-3";
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').forEach((link) => {
      link.href = logo;
    });
    document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]').forEach((meta) => {
      meta.content = logo;
    });
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]').forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "null");
        if (data && typeof data === "object" && data["@type"] === "Organization") {
          data.logo = logo;
          script.textContent = JSON.stringify(data);
        }
      } catch {
        // Ignore unrelated structured data blocks.
      }
    });
    const safeBackground = background.replace(/["\\\\]/g, "");
    document.documentElement.style.setProperty("--et-site-background-image", `url("${safeBackground}")`);
  }, [siteSettings.logo_url, siteSettings.background_image_url, currentPathname]);

  // Record unexpected browser errors for debugging without interrupting a page
  // that has already rendered. Background rejections must never open a modal.
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportLovableError(
        event.error instanceof Error ? event.error : new Error(event.message),
        { boundary: "window_error" },
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportLovableError(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        { boundary: "unhandled_rejection" },
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors position="top-center" />
      <SiteTextEditor />

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
