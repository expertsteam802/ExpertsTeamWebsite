import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const aiRequest = z.object({
  prompt: z.string().trim().min(1).max(6000),
  mode: z.enum(["chat", "workspace"]),
  history: z
    .array(z.object({ role: z.string().max(20), content: z.string().max(4000) }))
    .max(10)
    .optional(),
});

export const askChrisAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => aiRequest.parse(input))
  .handler(async ({ data }) => {
    const { askChrisAi: generate } = await import("./ai.server");
    return generate({ ...data, history: data.history ?? [] }, process.env["GEMINI_API_KEY"]);
  });
