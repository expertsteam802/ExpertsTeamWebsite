import { createFileRoute } from "@tanstack/react-router";
import { handleLootablyPostback } from "@/lib/offerwall-postback.server";

export const Route = createFileRoute("/api/offerwall/lootably/postback")({
  server: {
    handlers: {
      GET: ({ request }) => handleLootablyPostback(request),
      POST: ({ request }) => handleLootablyPostback(request),
    },
  },
});
