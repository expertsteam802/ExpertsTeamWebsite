import { defineConfig } from "nitro";

export default defineConfig({
  vercel: {
    // Give the publishing server function enough time to finish its build
    // and persist the published URL instead of being cut off by a short default.
    functions: {
      maxDuration: 300,
    },
  },
});
