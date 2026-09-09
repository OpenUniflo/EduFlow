import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

// Standard Tiptap attrs, restricted to existing product typography/colors.
export const contentStyles = {
  fontSize: ["0.875em", "1em", "1.125em", "1.25em"],
  fontFamily: ["inherit", "Inter, sans-serif", "ui-monospace, monospace"],
  color: ["inherit", "var(--atlas-muted)", "var(--atlas-brand)", "var(--green)", "var(--amber)", "var(--red)"],
  backgroundColor: ["var(--panel)", "var(--atlas-panel)", "var(--green)", "var(--amber)", "var(--red)"],
} as const;
const allowed = (values: readonly string[]) => z.string().refine(value => values.includes(value));
const mark = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bold") }),
  z.strictObject({ type: z.literal("italic") }),
  z.strictObject({ type: z.literal("code") }),
  z.strictObject({ type: z.literal("link"), attrs: z.strictObject({
    href: z.string().max(2000).refine(value => { try { return ["https:", "http:", "mailto:"].includes(new URL(value).protocol); } catch { return false; } }),
    target: z.enum(["_blank", "_self"]).nullable().optional(), rel: z.string().max(100).nullable().optional(), class: z.null().optional(),
  }) }),
  z.strictObject({ type: z.literal("textStyle"), attrs: z.strictObject({
    fontSize: allowed(contentStyles.fontSize).optional(), fontFamily: allowed(contentStyles.fontFamily).optional(),
    color: allowed(contentStyles.color).optional(), backgroundColor: allowed(contentStyles.backgroundColor).optional(),
  }) }),
  z.strictObject({ type: z.literal("highlight"), attrs: z.strictObject({ color: allowed(contentStyles.backgroundColor).nullable().optional() }).optional() }),
]);
const node: z.ZodType<JSONContent> = z.lazy(() => z.strictObject({
  type: z.enum(["doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak"]),
  text: z.string().min(1).max(20000).optional(),
  attrs: z.strictObject({ level: z.number().int().min(2).max(4).optional(), textAlign: z.enum(["left", "center", "right", "justify"]).nullable().optional(), start: z.number().int().min(1).max(1000).optional(), language: z.enum(["text", "javascript", "typescript", "python", "json", "sql"]).nullable().optional() }).optional(),
  marks: z.array(mark).max(8).optional(), content: z.array(node).max(300).optional(),
}));
export const richTextSchema = node.refine((value): value is RichTextDocument => value.type === "doc", "Expected a Tiptap document").transform(value => value as RichTextDocument);
export type RichTextDocument = JSONContent & { type: "doc" };
export type LearningContent = string | RichTextDocument;

/** Text columns retain legacy strings; only an explicit doc opts into JSON rendering. */
export function decodeLearningContent(value: unknown): LearningContent | null {
  let candidate = value;
  if (typeof value === "string") {
    if (!value.trimStart().startsWith("{")) return value;
    try { candidate = JSON.parse(value); } catch { return value; }
    if (!candidate || typeof candidate !== "object" || !("type" in candidate) || candidate.type !== "doc") return value;
  }
  try {
    if (JSON.stringify(candidate).length > 100000) return null;
    const parsed = richTextSchema.safeParse(candidate);
    return parsed.success ? parsed.data as RichTextDocument : null;
  } catch { return null; }
}
