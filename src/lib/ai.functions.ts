
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const attachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().max(150).optional(),
  text: z.string().max(200_000).optional(),
  dataUrl: z.string().max(4_000_000).optional(),
  size: z.number().int().nonnegative().max(3_000_000).optional(),
});

const aiRequest = z.object({
  prompt: z.string().trim().min(1).max(6000),
  mode: z.enum(["chat", "workspace", "plan"]),
  history: z
    .array(
      z.object({
        role: z.string().max(20),
        content: z.string().max(4000),
      }),
    )
    .max(10)
    .optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
}).superRefine((data, context) => {
  const totalSize = (data.attachments ?? []).reduce(
    (total, file) =>
      total +
      (file.dataUrl?.length ?? 0) +
      (file.text?.length ?? 0),
    0,
  );

  if (totalSize > 4_000_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attachments are too large. Please upload smaller files.",
      path: ["attachments"],
    });
  }
});

const imageRequest = z.object({
  prompt: z.string().trim().min(1).max(2000),
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
  .validator((input: unknown) => imageRequest.parse(input))
  .handler(async ({ data }) => {
    const { generateExpertImage: generate } = await import("./ai.server");

    return generate(
      { prompt: data.prompt },
      process.env["GEMINI_API_KEY"],
    );
  });
