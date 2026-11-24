import { createFileRoute } from "@tanstack/react-router";
import { handleToroxPostback } from "@/lib/offerwall-postback.server";

export const Route = createFileRoute("/api/offerwall/torox/postback")({
  server: {
    handlers: {
      GET: ({ request }) => handleToroxPostback(request),
    },
  },
});
