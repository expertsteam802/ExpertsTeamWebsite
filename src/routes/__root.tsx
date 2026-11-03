
import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";

import { ChrisAiChat } from "@/components/chris-ai";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
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
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Chris Programs — Watch, Learn & Share Code" },
      {
        name: "description",
        content:
          "Chris Programs is the home of Chris Expert: watch every channel video inside the site, download games and resources, learn to code and join the community.",
      },
      { name: "author", content: "Chris Expert" },
      {
        name: "google-site-verification",
        content: "YdY2ygzprZLok7-Cvwg_j29cI4ycK480HDQmh0d-JIg",
      },
      {
        name: "keywords",
        content:
          "chrisprograms, chris programs, chris expert, expertchris, learn coding, coding lessons, game downloads",
      },
      { property: "og:site_name", content: "Chris Programs" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Chris Programs — Watch, Learn & Share Code" },
      { name: "twitter:title", content: "Chris Programs — Watch, Learn & Share Code" },
      {
        property: "og:description",
        content:
          "Chris Programs is the home of Chris Expert: watch every channel video inside the site, download games and resources, learn to code and join the community.",
      },
      {
        name: "twitter:description",
        content:
          "Chris Programs is the home of Chris Expert: watch every channel video inside the site, download games and resources, learn to code and join the community.",
      },
      { property: "og:image", content: "https://chrisprograms.lovable.app/social-preview.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Chris Programs logo" },
      { name: "twitter:image", content: "https://chrisprograms.lovable.app/social-preview.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/logo.png" },
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

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="theme-neon dark">
      <head>
        <HeadContent />
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
  const [aiChatOpen, setAiChatOpen] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />

          <Toaster richColors position="top-center" />

          {/* Global Expert AI floating window */}
          {aiChatOpen ? (
            <div className="fixed bottom-4 right-4 z-[100] h-[min(680px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
              <ChrisAiChat onMinimize={() => setAiChatOpen(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAiChatOpen(true)}
              aria-label="Open Expert AI"
              title="Open Expert AI"
              className="fixed bottom-5 right-5 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-2xl transition-all hover:scale-105 hover:bg-primary/90"
            >
              <Bot className="h-7 w-7" />
            </button>
          )}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
