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

const DEFAULT_TEXT_BUDGET = 80_000;
const SYSTEM_TEXT_BUDGET = 5_000;
const LATEST_MESSAGE_BUDGET = 48_000;
const MAX_HISTORY_MESSAGES = 100;

function compactText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const marker = "\n[...middle of this message compacted; beginning and ending preserved...]\n";
  if (limit <= marker.length) return value.slice(-Math.max(0, limit));
  const available = limit - marker.length;
  const head = Math.ceil(available * 0.55);
  const tail = available - head;
  return value.slice(0, head) + marker + (tail ? value.slice(-tail) : "");
}

/**
 * Provider-neutral context compaction. The newest user request gets priority;
 * older turns are retained in chronological order and compacted according to
 * recency. Full source messages remain untouched in chat storage.
 */
export function compactSmartContents(
  contents: SmartContent[],
  maxTextCharacters = DEFAULT_TEXT_BUDGET,
): SmartContent[] {
  if (!contents.length || maxTextCharacters <= 0) return [];
  const latestUserIndex = contents.findLastIndex((item) => item.role === "user");
  const latestIndex = latestUserIndex >= 0 ? latestUserIndex : contents.length - 1;
  const latest = contents[latestIndex];
  if (!latest) return [];

  const older = contents.slice(0, latestIndex).slice(-MAX_HISTORY_MESSAGES);
  const latestText = latest.parts
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n");
  const latestImages = latest.parts.filter((part) => part.inlineData?.data);
  const latestLimit = Math.min(
    LATEST_MESSAGE_BUDGET,
    Math.max(1_000, Math.floor(maxTextCharacters * 0.6)),
  );
  const compactedLatestText = compactText(latestText, Math.min(latestLimit, maxTextCharacters));
  let remaining = Math.max(0, maxTextCharacters - compactedLatestText.length);
  const compactedHistory: SmartContent[] = [];
  const pending: { role: SmartContent["role"]; text: string }[] = [];

  for (const item of older) {
    const text = item.parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("\n");
    if (text) pending.push({ role: item.role, text });
  }

  // Allocate the remaining budget from newest to oldest, then restore chronology.
  const kept: SmartContent[] = [];
  for (let index = pending.length - 1; index >= 0 && remaining > 0; index--) {
    const item = pending[index];
    if (!item) continue;
    const slotsLeft = index + 1;
    const fairShare = Math.max(300, Math.floor(remaining / slotsLeft));
    const allowance = Math.min(item.text.length, fairShare, remaining);
    if (allowance <= 0) continue;
    const text = compactText(item.text, allowance);
    kept.unshift({ role: item.role, parts: [{ text }] });
    remaining -= text.length;
  }

  const latestParts: SmartPart[] = [{ text: compactedLatestText }];
  latestParts.push(...latestImages.slice(0, 2));
  return [...kept, { role: latest.role, parts: latestParts }];
}

export function compactSmartRequest(
  request: SmartRequest,
  maxTextCharacters = DEFAULT_TEXT_BUDGET,
): SmartRequest {
  const systemText = request.systemInstruction.parts.map((part) => part.text).join("\n");
  return {
    ...request,
    systemInstruction: {
      parts: [{ text: compactText(systemText, SYSTEM_TEXT_BUDGET) }],
    },
    contents: compactSmartContents(request.contents, maxTextCharacters),
  };
}

/** Rough upper-bound planning estimate; code and multilingual text can vary. */
export function estimateSmartTokens(text: string): number {
  return Math.ceil(text.length / 2);
}
