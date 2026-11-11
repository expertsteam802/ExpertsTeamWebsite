import { defineConfig } from "nitro";

export default defineConfig({
  vercel: {
    // Publishing builds run inside the Vercel Sandbox. Give the server
    // function the full standard Fluid Compute window to finish and persist
    // the published URL instead of being cut off by a short default.
    functions: {
      maxDuration: 300,
    },
  },
});
