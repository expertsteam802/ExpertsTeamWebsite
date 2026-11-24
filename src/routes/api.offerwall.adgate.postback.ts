import { createFileRoute } from "@tanstack/react-router";
import { handleAdGatePostback } from "@/lib/offerwall-postback.server";

export const Route = createFileRoute("/api/offerwall/adgate/postback")({
  server: {
    handlers: {
      GET: ({ request }) => handleAdGatePostback(request),
    },
  },
});
