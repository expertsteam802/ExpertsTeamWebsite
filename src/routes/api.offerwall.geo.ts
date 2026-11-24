import { createFileRoute } from "@tanstack/react-router";

const providers = ["torox", "adgate", "cpx", "lootably"] as const;

function countryList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
}

function providerAvailable(provider: (typeof providers)[number], country: string | null): boolean {
  if (!country) return true;
  const allowed = countryList(provider.toUpperCase() + "_ALLOWED_COUNTRIES");
  const blocked = countryList(provider.toUpperCase() + "_BLOCKED_COUNTRIES");
  if (blocked.includes(country)) return false;
  return allowed.length === 0 || allowed.includes(country);
}

function handleGeo(request: Request): Response {
  const rawCountry =
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-vercel-ip-country") ??
    "";
  const normalized = rawCountry.trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(normalized) && normalized !== "XX" && normalized !== "T1"
    ? normalized
    : null;
  const availability = Object.fromEntries(
    providers.map((provider) => [provider, providerAvailable(provider, country)]),
  );
  return Response.json({ country, providers: availability }, {
    headers: { "Cache-Control": "private, no-store", Vary: "CF-IPCountry, X-Vercel-IP-Country" },
  });
}

export const Route = createFileRoute("/api/offerwall/geo")({
  server: {
    handlers: {
      GET: ({ request }) => handleGeo(request),
    },
  },
});
