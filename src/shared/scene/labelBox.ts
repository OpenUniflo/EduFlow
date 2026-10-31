/**
 * Measured label boxes shared by the Archive and the course plane.
 *
 * The old estimates reserved a fixed number of pixels per Latin letter, which
 * under-measured bold uppercase names and omitted the status dot, the gap and
 * the border. The DOM box then became narrower than the text and truncated
 * short names such as "A…" or "Wor…". This module turns injected canvas
 * measurement into the exact box the DOM uses.
 */

export type LabelMeasure = (text: string, font: string) => number;

export type KnowledgeLabelBoxOptions = {
  /** Injected canvas `measureText`; fallback keeps the function pure in tests. */
  measure?: LabelMeasure;
  /** Same font declaration the label DOM uses. */
  font?: string;
  /** `is-strong` labels are 600 instead of the normal 400 weight. */
  strong?: boolean;
  /** Status dot diameter (0 when the label has no dot). */
  dot?: number;
  /** Gap between dot and text. */
  dotGap?: number;
  paddingX?: number;
  border?: number;
  /** Only names wider than this are allowed to ellipsize. */
  maxWidth?: number;
  lineHeight?: number;
};

export type KnowledgeLabelBox = {
  /** Full text width from the injected measurement. */
  textWidth: number;
  /** Box width including dot, gap, padding and border. */
  width: number;
  height: number;
  /** False when the measured text plus chrome stays within `maxWidth`. */
  truncated: boolean;
  /** The DOM should ellipsize with CSS but keep `title` at full text. */
  maxWidth: number;
};

// The Archive and the course plane render labels in Inter (see tokens.css).
// Measure with the same family/weight the DOM actually uses; measuring the
// system fallback under-reported by 2–4px and made short names ellipsize.
export const KNOWLEDGE_LABEL_FONT =
  '400 12px Inter, -apple-system, "system-ui", "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif';
export const KNOWLEDGE_LABEL_STRONG_FONT =
  '600 12px Inter, -apple-system, "system-ui", "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif';

export function fallbackTextWidth(text: string, strong = false) {
  let width = 0;
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code > 0x2e80) width += 12;
    else if (code > 0xff) width += 8;
    else if (character === " " || character === "." || character === "," || character === "'" || character === "i" || character === "l" || character === "I") width += 5;
    else if (character === "W" || character === "M" || character === "@") width += 11;
    else width += strong ? 8.2 : 7.4;
  }
  return width;
}

export function measureKnowledgeLabelBox(
  text: string,
  options: KnowledgeLabelBoxOptions = {}
): KnowledgeLabelBox {
  const dot = options.dot ?? 6;
  const dotGap = dot > 0 ? (options.dotGap ?? 4) : 0;
  const paddingX = options.paddingX ?? 9;
  const border = options.border ?? 1;
  const maxWidth = options.maxWidth ?? 260;
  const lineHeight = options.lineHeight ?? 22;
  const font = options.font ?? (options.strong ? KNOWLEDGE_LABEL_STRONG_FONT : KNOWLEDGE_LABEL_FONT);
  const textWidth = options.measure
    ? options.measure(text, font)
    : fallbackTextWidth(text, options.strong);
  const chrome = dot + dotGap + paddingX * 2 + border * 2;
  const full = textWidth + chrome;
  return {
    textWidth,
    // Round up so a fractional canvas advance can never become a DOM content
    // width one pixel narrower than the text it has to show.
    width: Math.min(maxWidth, Math.ceil(Math.max(dot + dotGap + paddingX * 2 + border * 2 + 8, full))),
    height: lineHeight,
    truncated: full > maxWidth + 0.5,
    maxWidth
  };
}

/**
 * Plane labels (`.ef-atlas-plane-label` / `.ef-imm-tilt-label`) have no dot:
 * 8px horizontal padding and a 1px border on each side.
 */
export function measurePlaneLabelWidth(text: string, measure?: LabelMeasure, font = KNOWLEDGE_LABEL_STRONG_FONT) {
  const textWidth = measure ? measure(text, font) : fallbackTextWidth(text, true);
  return Math.max(24, Math.ceil(textWidth + 18));
}

export type SelectionEdge = { id?: string; source: string; target: string };

export type SelectionRelationSet = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
};

/**
 * Archive / course ordinary selection: the node, its one-hop factual neighbours
 * and every incident edge. Direction is irrelevant because the relationship is
 * visual both ways.
 */
export function oneHopRelation(
  selectedId: string | null | undefined,
  edges: readonly SelectionEdge[]
): SelectionRelationSet {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!selectedId) return { nodeIds, edgeIds };
  nodeIds.add(selectedId);
  edges.forEach((edge, index) => {
    if (edge.source === selectedId) {
      nodeIds.add(edge.target);
      edgeIds.add(edge.id ?? `edge:${index}`);
    } else if (edge.target === selectedId) {
      nodeIds.add(edge.source);
      edgeIds.add(edge.id ?? `edge:${index}`);
    }
  });
  return { nodeIds, edgeIds };
}
