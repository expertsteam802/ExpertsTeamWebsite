import { generateOpenRouterContent } from "./openrouter.server";

export type GeminiContent = {
  role: "user" | "model";
  parts: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
};
export type GeminiRequest = {
  systemInstruction: { parts: { text: string }[] };
  contents: GeminiContent[];
  generationConfig?: { responseMimeType?: "application/json"; maxOutputTokens?: number };
};
export type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
};

/** Shared ExpertAI provider entry point. Legacy arguments are ignored so no AI request can route through Kilo. */
export async function generateGeminiContent(request: GeminiRequest, _apiKey?: string, _providerOrder?: string[], _modelOverride?: string): Promise<GeminiResponse> {
  return generateOpenRouterContent(request);
}
