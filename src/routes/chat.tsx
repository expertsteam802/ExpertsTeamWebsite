import { createFileRoute, redirect } from "@tanstack/react-router";

// Keep old bookmarks working while consolidating the product around Agent Builder.
export const Route = createFileRoute("/chat")({
  beforeLoad: () => {
    throw redirect({ to: "/ai" });
  },
});
