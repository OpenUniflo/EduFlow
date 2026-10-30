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
      for (let ring = 1; ring <= 5; ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          for (let dy = -ring; dy <= ring; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            // Chapter titles stay anchored to their region's centre line; only
            // vertical nudging is allowed to clear a HUD or a sibling title.
            offsets.push([candidate.kind === "chapter" || candidate.kind === "topic" ? 0 : dx * rect.width * 0.62, dy * (rect.height + gap)]);
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
