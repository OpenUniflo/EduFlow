/**
 * The rail shows a compact given-name label. Prefer the first word; when that
 * is still too wide for the 52px rail, fall back to its first glyph instead of
 * clipping the name with an ellipsis.
 */
export function shortDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "学习者";
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  const characters = Array.from(firstWord);
  const cjk = /[\u3400-\u9fff]/.test(firstWord);
  const limit = cjk ? 4 : 7;
  if (characters.length <= limit) return firstWord;
  return characters[0] ?? "学习者";
}
