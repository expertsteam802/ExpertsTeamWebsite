import { createFileRoute } from "@tanstack/react-router";
import { handleCpxPostback } from "@/lib/offerwall-postback.server";

export const Route = createFileRoute("/api/offerwall/cpx/postback")({
  server: {
    handlers: {
      GET: ({ request }) => handleCpxPostback(request),
    },
  },
});
