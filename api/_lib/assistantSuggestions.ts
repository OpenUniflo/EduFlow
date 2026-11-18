export type FollowUpSuggestion = { text: string };

/** Normalize model output and legacy persisted rows into the one suggestion shape. */
export function normalizeFollowUps(values: readonly unknown[]): FollowUpSuggestion[] {
  const output: FollowUpSuggestion[] = [];
  for (const value of values) {
    const text = (typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Row).text === "string" ? String((value as Row).text) : "").trim().slice(0, 80);
    if (!text || output.some((item) => item.text === text)) continue;
    output.push({ text });
    if (output.length === 3) break;
  }
  return output;
}
type Row = Record<string, unknown>;
