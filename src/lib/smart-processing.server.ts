export type SmartPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

export type SmartContent = {
  role: "user" | "model";
  parts: SmartPart[];
};

export type SmartRequest = {
  systemInstruction: { parts: { text: string }[] };
  contents: SmartContent[];
  generationConfig?: {
    responseMimeType?: "application/json";
    maxOutputTokens?: number;
  };
};

const DEFAULT_TEXT_BUDGET = 9_000;
const SYSTEM_TEXT_BUDGET = 2_000;
const HISTORY_TEXT_BUDGET = 1_800;
const LATEST_MESSAGE_BUDGET = 7_200;

function trimText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  if (limit < 100) return value.slice(-limit);
  const head = Math.floor(limit * 0.35);
  const tail = limit - head;
  return value.slice(0, head) + "\n[Earlier content compacted]\n" + value.slice(-tail);
}

/**
 * Conservative, provider-neutral request compaction. It keeps the newest user
 * request intact as the first priority, then recent context, and preserves
 * image payloads for Gemini. This is a safety budget, not an exact tokenizer.
 */
export function compactSmartContents(
  contents: SmartContent[],
  maxTextCharacters = DEFAULT_TEXT_BUDGET,
): SmartContent[] {
  if (!contents.length) return [];
  const latestUserIndex = contents.findLastIndex((item) => item.role === "user");
  const latestIndex = latestUserIndex >= 0 ? latestUserIndex : contents.length - 1;
  const latest = contents[latestIndex];
  if (!latest) return [];
  const older = contents.slice(0, latestIndex).slice(-4);

  const latestTextParts = latest.parts.filter((part) => typeof part.text === "string");
  const latestImages = latest.parts.filter((part) => part.inlineData?.data);
  const latestText = latestTextParts.map((part) => part.text ?? "");
  const latestTextJoined = latestText.join("\n");
  const latestBudget = Math.min(LATEST_MESSAGE_BUDGET, maxTextCharacters - HISTORY_TEXT_BUDGET);
  const compactedLatestText = trimText(latestTextJoined, Math.max(500, latestBudget));
  const historyBudget = Math.max(0, maxTextCharacters - compactedLatestText.length);

  let historyRemaining = Math.min(HISTORY_TEXT_BUDGET, historyBudget);
  const compactedHistory: SmartContent[] = [];
  for (let index = older.length - 1; index >= 0; index--) {
    const item = older[index];
    if (!item) continue;
    const text = item.parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("\n");
    if (!text || historyRemaining <= 0) continue;
    const kept = trimText(text, Math.min(text.length, Math.min(700, historyRemaining)));
    historyRemaining -= kept.length;
    compactedHistory.unshift({ role: item.role, parts: [{ text: kept }] });
  }

  const latestParts: SmartPart[] = [{ text: compactedLatestText }];
  // Images are intentionally retained for Gemini's multimodal endpoint.
  latestParts.push(...latestImages.slice(0, 2));
  return [...compactedHistory, { role: latest.role, parts: latestParts }];
}

export function compactSmartRequest(request: SmartRequest): SmartRequest {
  const systemText = request.systemInstruction.parts.map((part) => part.text).join("\n");
  return {
    ...request,
    systemInstruction: {
      parts: [{ text: trimText(systemText, SYSTEM_TEXT_BUDGET) }],
    },
    contents: compactSmartContents(request.contents),
  };
}

/** Rough upper-bound planning estimate; code and multilingual text can vary. */
export function estimateSmartTokens(text: string): number {
  return Math.ceil(text.length / 2);
}
