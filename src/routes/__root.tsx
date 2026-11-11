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
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6"><Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go home</Link></div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  const dialogEnabled = typeof window === "undefined" || window.localStorage.getItem("expertsteam.error-dialog-enabled") !== "false";
  return dialogEnabled ? (
    <div className="flex min-h-screen items-center justify-center bg-background px-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. The error has been recorded for the site owner. You can retry or return home.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
        <a href="/" className="rounded-md border border-input px-4 py-2 text-sm">Go home</a>
      </div>
    </div></div>
  ) : <div className="flex min-h-screen items-center justify-center bg-background px-4"><div className="text-center"><p className="text-sm text-muted-foreground">This section couldn't load. Please refresh the page.</p><button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm">Refresh page</button></div></div>;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "referrer", content: "strict-origin-when-cross-origin" },
      { title: "ExpertsTeam | Coding, AI Studio & Developer Community" },
      { name: "description", content: "ExpertsTeam is a developer community to learn coding, share projects, watch practical tutorials, collaborate and build applications with ExpertAI Studio." },
      { name: "author", content: "Chris Expert" },
      { name: "google-site-verification", content: "YdY2ygzprZLok7-Cvwg_j29cI4ycK480HDQmh0d-JIg" },
      { name: "google-adsense-account", content: "ca-pub-4535524305819415" },
      { property: "og:site_name", content: "ExpertsTeam" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "ExpertsTeam | Coding, AI Studio & Developer Community" },
      { name: "twitter:title", content: "ExpertsTeam | Coding, AI Studio & Developer Community" },
      { property: "og:description", content: "Learn to code, share practical projects, join the developer community and build applications with ExpertAI Studio." },
      { name: "twitter:description", content: "Learn to code, share practical projects, join the developer community and build applications with ExpertAI Studio." },
      { property: "og:url", content: "https://expertsteam.giize.com/" },
      { property: "og:image", content: "https://expertsteam.giize.com/logo.png" },
      { property: "og:image:alt", content: "ExpertsTeam logo" },
      { name: "twitter:image", content: "https://expertsteam.giize.com/logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/logo.png" },
      { rel: "apple-touch-icon", href: "/logo.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap" },
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ExpertsTeam",
          url: "https://expertsteam.giize.com/",
          logo: "https://expertsteam.giize.com/logo.png",
          description: "ExpertsTeam is an independent developer community for coding education, practical projects, collaboration and AI-assisted app building.",
          founder: { "@type": "Person", name: "Chris Expert" },
          sameAs: ["https://www.youtube.com/@expertchris", "https://instagram.com/m.chris_t2011"]
        }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "ExpertsTeam",
          url: "https://expertsteam.giize.com/"
        }) }} />
      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <QueryClientProvider client={queryClient}><ThemeProvider><AuthProvider><RootContent /></AuthProvider></ThemeProvider></QueryClientProvider>;
}

function RootContent() {
  const settings = useSiteSettings();
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem("expertsteam.error-dialog-enabled", settings.error_dialog_enabled === false ? "false" : "true");
  }, [settings.error_dialog_enabled]);

  useEffect(() => {
    const logo = settings.logo_url || "/logo.png";
    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
    icon.href = logo;
    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleIcon) appleIcon.href = logo;
  }, [settings.logo_url]);

  useEffect(() => {
    const reportRuntimeError = (error: Error, boundary: string) => {
      reportLovableError(error, { boundary });
      if (settings.error_dialog_enabled !== false) setRuntimeError("Something unexpected happened. The error has been recorded; you can safely retry.");
    };
    const onError = (event: ErrorEvent) => reportRuntimeError(event.error instanceof Error ? event.error : new Error(event.message), "window_error");
    const onRejection = (event: PromiseRejectionEvent) => reportRuntimeError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), "unhandled_rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, [settings.error_dialog_enabled]);

  return <>
    <Outlet />
    <Toaster richColors position="top-center" />
    <Dialog open={Boolean(runtimeError)} onOpenChange={(open) => !open && setRuntimeError(null)}>
      <DialogContent><DialogHeader><DialogTitle>Something went wrong</DialogTitle><DialogDescription>{runtimeError}</DialogDescription></DialogHeader>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Reload page</button>
      </DialogContent>
    </Dialog>
    {aiChatOpen ? <div className="fixed bottom-4 right-4 z-[100] h-[min(680px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"><ChrisAiChat onMinimize={() => setAiChatOpen(false)} /></div> :
      <button type="button" onClick={() => setAiChatOpen(true)} aria-label="Open ExpertAI" title="Open ExpertAI" className="fixed bottom-5 right-5 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-2xl transition-all hover:scale-105 hover:bg-primary/90"><Bot className="h-7 w-7" /></button>}
  </>;
}
