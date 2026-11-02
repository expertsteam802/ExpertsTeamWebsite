import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const aiAttachment = z.object({
  name: z.string().max(200).default("attachment"),
  mimeType: z.string().max(100).optional(),
  dataUrl: z.string().max(2000000).optional(),
  text: z.string().max(40000).optional(),
  size: z.number().max(20000000).optional(),
});

const aiRequest = z.object({
  prompt: z.string().trim().min(1).max(6000),
  mode: z.enum(["chat", "workspace", "plan"]),
  history: z
    .array(z.object({ role: z.string().max(20), content: z.string().max(4000) }))
    .max(10)
    .optional(),
  attachments: z.array(aiAttachment).max(5).optional(),
});

export const askChrisAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => aiRequest.parse(input))
  .handler(async ({ data }) => {
    const { askChrisAi: generate } = await import("./ai.server");
    return generate(
      {
        ...data,
        history: data.history ?? [],
        attachments: data.attachments ?? [],
      },
      process.env["GEMINI_API_KEY"],
    );
  });

export const generateExpertImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { generateExpertImage: generateImage } = await import("./ai.server");
    return generateImage(data, process.env["GEMINI_API_KEY"]);
  });
