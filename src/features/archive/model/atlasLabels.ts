/**
 * Pure screen-space label collision. Labels never overlap: when a candidate
 * cannot be placed it is hidden. Domain labels are allowed to nudge because
 * they carry the primary map reading, but they still respect every already
 * placed rectangle, every excluded HUD rectangle and the canvas bounds.
 */

export type AtlasLabelKind = "domain" | "topic" | "knowledge" | "chapter" | "column";

export type AtlasLabelCandidate = {
  key: string;
  kind: AtlasLabelKind;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  force?: boolean;
  alpha?: number;
  /** Normalised text used to suppress duplicate topic/domain labels. */
  text?: string;
};

export type AtlasPlacedLabel = AtlasLabelCandidate & { x: number; y: number };
export type AtlasLabelRect = { x: number; y: number; width: number; height: number };

function intersects(left: AtlasLabelRect, right: AtlasLabelRect, gap = 0) {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function clampRect(rect: AtlasLabelRect, viewport: { width: number; height: number }, margin: number) {
  rect.x = Math.max(margin, Math.min(viewport.width - rect.width - margin, rect.x));
  rect.y = Math.max(margin, Math.min(viewport.height - rect.height - margin, rect.y));
}

function normalizeLabelText(text: string) {
  return text.replace(/[…\.]+$/u, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/**
 * Knowledge names are anchored to their own node (above / right / below /
 * left) or hidden. They are never nudged to a distant free spot: losing the
 * name is better than pointing at nothing. Domain / topic / chapter labels
 * may still move a few pixels around their centroid.
 */
export type AtlasKnowledgeLabelCandidate = {
  key: string;
  nodeId: string;
  text: string;
  /** Node centre in screen space. */
  x: number;
  y: number;
  /** Node marker diameter in screen space. */
  diameter: number;
  width: number;
  height: number;
  priority: number;
  alpha?: number;
};

export type AtlasKnowledgeAnchor = "above" | "right" | "below" | "left";

export type AtlasKnowledgeLabel = AtlasKnowledgeLabelCandidate & {
  anchor: AtlasKnowledgeAnchor;
};

const KNOWLEDGE_ANCHORS: readonly AtlasKnowledgeAnchor[] = ["above", "right", "below", "left"];

export function knowledgeLabelRect(
  node: AtlasKnowledgeLabelCandidate,
  anchor: AtlasKnowledgeAnchor,
  gap = 4
): AtlasLabelRect {
  const radius = Math.max(6, Math.min(24, node.diameter / 2 + 1));
  if (anchor === "right") return { x: node.x + radius + gap, y: node.y - node.height / 2, width: node.width, height: node.height };
  if (anchor === "left") return { x: node.x - radius - gap - node.width, y: node.y - node.height / 2, width: node.width, height: node.height };
  if (anchor === "below") return { x: node.x - node.width / 2, y: node.y + radius + gap, width: node.width, height: node.height };
  return { x: node.x - node.width / 2, y: node.y - radius - gap - node.height, width: node.width, height: node.height };
}

export function placeAtlasKnowledgeLabels(
  candidates: readonly AtlasKnowledgeLabelCandidate[],
  viewport: { width: number; height: number },
  options: {
    margin?: number;
    gap?: number;
    maxLabels?: number;
    exclusions?: readonly AtlasLabelRect[];
    obstacles?: readonly (AtlasLabelRect & { id?: string })[];
    /** Text already shown by domain / topic labels. */
    reservedTexts?: ReadonlySet<string>;
  } = {}
): AtlasKnowledgeLabel[] {
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 5;
  const maxLabels = options.maxLabels ?? 140;
  const exclusions = options.exclusions ?? [];
  const obstacles = options.obstacles ?? [];
  const reservedTexts = options.reservedTexts ?? new Set<string>();
  const sorted = candidates
    .filter((candidate) => (candidate.alpha ?? 1) >= 0.08)
    .slice()
    .sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key));
  const placed: AtlasKnowledgeLabel[] = [];
  const nodeIds = new Set<string>();
  const texts = new Set<string>();
  const blocked = (rect: AtlasLabelRect) =>
    placed.some((other) => intersects(rect, other, gap))
    || exclusions.some((other) => intersects(rect, other, gap))
    || obstacles.some((other) => intersects(rect, other, gap));
  for (const candidate of sorted) {
    if (placed.length >= maxLabels) break;
    if (nodeIds.has(candidate.nodeId)) continue;
    const textKey = normalizeLabelText(candidate.text);
    if (textKey && (texts.has(textKey) || reservedTexts.has(textKey))) continue;
    let chosen: AtlasKnowledgeLabel | null = null;
    for (const anchor of KNOWLEDGE_ANCHORS) {
      const rect = knowledgeLabelRect(candidate, anchor);
      if (rect.x < margin || rect.y < margin || rect.x + rect.width > viewport.width - margin || rect.y + rect.height > viewport.height - margin) continue;
      if (blocked(rect)) continue;
      chosen = { ...candidate, anchor, x: rect.x, y: rect.y };
      break;
    }
    if (!chosen) continue;
    placed.push(chosen);
    nodeIds.add(candidate.nodeId);
    if (textKey) texts.add(textKey);
  }
  return placed;
}

export function placeAtlasLabels(
  candidates: readonly AtlasLabelCandidate[],
  viewport: { width: number; height: number },
  options: { margin?: number; gap?: number; maxLabels?: number; exclusions?: readonly AtlasLabelRect[] } = {}
): AtlasPlacedLabel[] {
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 5;
  const maxLabels = options.maxLabels ?? 140;
  const exclusions = options.exclusions ?? [];
  const sorted = candidates
    .filter((candidate) => (candidate.alpha ?? 1) >= 0.08)
    .slice()
    .sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key));
  const placed: AtlasPlacedLabel[] = [];
  const dedupeKeys = new Set<string>();
  const blocked = (rect: AtlasLabelRect) =>
    placed.some((other) => intersects(rect, other, gap))
    || exclusions.some((other) => intersects(rect, other, gap));
  for (const candidate of sorted) {
    if (placed.length >= maxLabels) break;
    const textKey = normalizeLabelText(candidate.text ?? "");
    if (textKey && candidate.kind !== "knowledge" && dedupeKeys.has(textKey)) continue;
    const rect = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
    const nudgeable = candidate.force || candidate.kind === "domain" || candidate.kind === "topic" || candidate.kind === "chapter" || candidate.kind === "column";
    if (!nudgeable) {
      if (rect.x + rect.width < margin || rect.x > viewport.width - margin || rect.y + rect.height < margin || rect.y > viewport.height - margin) continue;
      clampRect(rect, viewport, margin);
      if (blocked(rect)) continue;
    } else {
      const originalX = rect.x;
      const originalY = rect.y;
      const offsets: Array<[number, number]> = [[0, 0]];
      for (let ring = 1; ring <= 3; ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          for (let dy = -ring; dy <= ring; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            // Domain / topic names may only nudge a few pixels around their
            // centroid. Chapter titles stay anchored to their region centre
            // line; only vertical nudging is allowed to clear a HUD.
            offsets.push([
              candidate.kind === "chapter" ? 0 : dx * 8,
              dy * Math.max(10, (rect.height + gap) * 0.8)
            ]);
          }
        }
      }
      let accepted = false;
      for (let attempt = 0; attempt < offsets.length; attempt += 1) {
        rect.x = Math.max(margin, Math.min(viewport.width - rect.width - margin, originalX + offsets[attempt][0]));
        rect.y = Math.max(margin, Math.min(viewport.height - rect.height - margin, originalY + offsets[attempt][1]));
        if (!blocked(rect)) { accepted = true; break; }
      }
      if (!accepted) continue;
    }
    placed.push({ ...candidate, x: rect.x, y: rect.y });
    if (textKey) dedupeKeys.add(textKey);
  }
  return placed;
}

export function labelsToKeySet(labels: readonly AtlasPlacedLabel[]) {
  return new Set(labels.map((label) => label.key));
}
