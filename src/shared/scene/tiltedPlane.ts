/**
 * Pure presentation math for a plane that can be viewed from the front, the
 * side or the back. The product rule (§10.10) is deliberately split into small
 * deterministic functions so the course tree and the Archive course plane share
 * one angle simplification, one screen-space label rule and one picker.
 *
 * Nothing here knows about three.js, React or feature data. Positions and
 * sizes are already in CSS pixels / world units supplied by the caller.
 */

export type TiltedPoint = { x: number; y: number; z: number };

export type TiltedStage = "full" | "pill" | "handoff" | "dot";

export type TiltedAngleState = {
  /** Angle between the view direction and the plane normal, in degrees. */
  theta: number;
  stage: TiltedStage;
  /** Card body -> name-only capsule (35–55°). */
  pill: number;
  /** Secondary rows (actions / status / reflection copy) 1 -> 0 by ~42°. */
  extra: number;
  /** Capsule name -> outside screen-facing name (55–65°). */
  handoff: number;
  /** Card body -> screen-facing dot (55–65°). */
  dot: number;
  /** Hide mirrored card content once the plane faces away (84–92°). */
  back: number;
  /** Billboard the shrinking card so it never becomes a tilted teardrop. */
  billboard: number;
  /** Plane-attached chapter title 1 -> 0 after the front zone. */
  chapterTitle: number;
  /** Name rendered inside the capsule. */
  cardName: number;
  /** Name rendered in the screen-facing label layer. */
  outsideName: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 === edge0) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** View/plane angle from a camera-to-target direction (the plane normal is +Z). */
export function tiltAngleDegrees(direction: TiltedPoint): number {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return (Math.acos(clamp(direction.z / length, -1, 1)) * 180) / Math.PI;
}

/**
 * Continuous simplification parameters. There is intentionally no boolean
 * "collapsed" switch: every renderer multiplies the same values so the card
 * never pops between states.
 */
export function simplificationForAngle(theta: number): TiltedAngleState {
  const angle = Math.max(0, theta);
  const pill = smoothstep(35, 48, angle);
  const extra = 1 - smoothstep(35, 42, angle);
  const handoff = smoothstep(55, 60, angle);
  const dot = handoff;
  const back = smoothstep(84, 92, angle);
  const billboard = smoothstep(0.02, 0.72, pill);
  const chapterTitle = 1 - smoothstep(34, 46, angle);
  const cardName = 1 - smoothstep(55, 60, angle);
  const outsideName = smoothstep(55, 60, angle);
  const stage: TiltedStage = angle <= 35 ? "full" : angle <= 55 ? "pill" : angle <= 65 ? "handoff" : "dot";
  return { theta: angle, stage, pill, extra, handoff, dot, back, billboard, chapterTitle, cardName, outsideName };
}

// ---------------------------------------------------------------------------
// Screen-facing labels on the turned plane

export type TiltedLabelCandidate = {
  id: string;
  x: number;
  y: number;
  /** Camera distance; smaller means nearer. */
  distance: number;
  /** Screen diameter of the node marker. */
  diameter: number;
  /** Opacity after selection / layer filtering. */
  visibility: number;
  /** 0 selected/hovered, 1 current, 2 on route, 3 other. */
  priority: number;
  text: string;
};

export type TiltedLabelAnchor = "above" | "right" | "below" | "left";

export type TiltedLabelRect = { x: number; y: number; width: number; height: number };

export type TiltedLabelChoice = {
  id: string;
  anchor: TiltedLabelAnchor;
  rect: TiltedLabelRect;
  alpha: number;
  distance: number;
  priority: number;
};

export type TiltedLabelOptions = {
  width: number;
  height: number;
  maxLabels?: number;
  showDiameter?: number;
  hideDiameter?: number;
  lineHeight?: number;
  margin?: number;
  /** Text width estimate supplied by the renderer (font-measured). */
  measure: (text: string) => number;
  /** Previously chosen ids, used for the appearance/disappearance hysteresis. */
  previous?: ReadonlySet<string>;
  /** Node obstacles in screen space; the label avoids every other marker. */
  obstacles?: readonly (TiltedLabelRect & { id?: string })[];
  /** HUD rectangles that labels must not overlap. */
  exclusions?: readonly TiltedLabelRect[];
};

export function labelRectForAnchor(
  node: { x: number; y: number; diameter: number },
  anchor: TiltedLabelAnchor,
  width: number,
  lineHeight: number
): TiltedLabelRect {
  const radius = Math.max(7, Math.min(24, node.diameter / 2 + 3));
  const gap = 5;
  if (anchor === "right") return { x: node.x + radius + gap, y: node.y - lineHeight / 2, width, height: lineHeight };
  if (anchor === "left") return { x: node.x - radius - gap - width, y: node.y - lineHeight / 2, width, height: lineHeight };
  if (anchor === "below") return { x: node.x - width / 2, y: node.y + radius + gap, width, height: lineHeight };
  return { x: node.x - width / 2, y: node.y - radius - gap - lineHeight, width, height: lineHeight };
}

export function overlapRatio(a: TiltedLabelRect, b: TiltedLabelRect) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  if (!width || !height) return 0;
  return (width * height) / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

const LABEL_ORDER: readonly TiltedLabelAnchor[] = ["above", "right", "below", "left"];

function bestLabelRect(
  node: TiltedLabelCandidate,
  options: TiltedLabelOptions,
  placed: readonly TiltedLabelRect[]
): { anchor: TiltedLabelAnchor; rect: TiltedLabelRect; overlap: number; labelOverlap: number; obstacleOverlap: number } | null {
  const lineHeight = options.lineHeight ?? 22;
  const margin = options.margin ?? 8;
  const width = Math.max(24, options.measure(node.text) + 18);
  const obstacles = options.obstacles ?? [];
  const exclusions = options.exclusions ?? [];
  let best: { anchor: TiltedLabelAnchor; rect: TiltedLabelRect; overlap: number; labelOverlap: number; obstacleOverlap: number } | null = null;
  for (const anchor of LABEL_ORDER) {
    const rect = labelRectForAnchor(node, anchor, width, lineHeight);
    if (rect.x < margin || rect.y < margin || rect.x + rect.width > options.width - margin || rect.y + rect.height > options.height - margin) continue;
    let labelOverlap = 0;
    for (const other of placed) labelOverlap = Math.max(labelOverlap, overlapRatio(rect, other));
    let obstacleOverlap = 0;
    for (const obstacle of obstacles) {
      if (obstacle.id === node.id) continue;
      obstacleOverlap = Math.max(obstacleOverlap, overlapRatio(rect, obstacle));
    }
    for (const exclusion of exclusions) obstacleOverlap = Math.max(obstacleOverlap, overlapRatio(rect, exclusion));
    const overlap = Math.max(labelOverlap, obstacleOverlap);
    if (!best || overlap < best.overlap) best = { anchor, rect, overlap, labelOverlap, obstacleOverlap };
    if (overlap <= 0.001) break;
  }
  return best;
}

/**
 * Distance-based, capped label set with hysteresis. Forced labels (selection,
 * hover) are always kept; auto labels only enter above `showDiameter` and only
 * leave below `hideDiameter`, so a node hovering around the threshold cannot
 * flicker.
 */
export function chooseTiltedLabels(
  candidates: readonly TiltedLabelCandidate[],
  options: TiltedLabelOptions
): TiltedLabelChoice[] {
  const showDiameter = options.showDiameter ?? 14;
  const hideDiameter = options.hideDiameter ?? 10;
  const maxLabels = options.maxLabels ?? 8;
  const previous = options.previous ?? new Set<string>();
  const forced = candidates.filter((candidate) => candidate.priority <= 0 && candidate.visibility > 0.02);
  const eligible = candidates
    .filter((candidate) => candidate.visibility > 0.08 && candidate.priority > 0)
    .filter((candidate) => previous.has(candidate.id) ? candidate.diameter >= hideDiameter : candidate.diameter > showDiameter)
    .sort((left, right) => left.priority - right.priority || left.distance - right.distance || left.id.localeCompare(right.id));
  const ordered = [...forced.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id)), ...eligible];
  const selectedIds = new Set<string>();
  const chosen: TiltedLabelChoice[] = [];
  const placed: TiltedLabelRect[] = [];
  for (const node of ordered) {
    if (chosen.length >= maxLabels) break;
    if (selectedIds.has(node.id)) continue;
    const best = bestLabelRect(node, options, placed);
    if (!best) {
      // Selection / hover must remain readable even in a dense cluster.
      if (node.priority > 0) continue;
      const lineHeight = options.lineHeight ?? 22;
      const width = Math.max(24, options.measure(node.text) + 18);
      const margin = options.margin ?? 8;
      const fallback = labelRectForAnchor(node, "above", width, lineHeight);
      const rect = {
        x: clamp(fallback.x, margin, Math.max(margin, options.width - width - margin)),
        y: clamp(fallback.y, margin, Math.max(margin, options.height - lineHeight - margin)),
        width,
        height: lineHeight
      };
      chosen.push({ id: node.id, anchor: "above", rect, alpha: 1, distance: node.distance, priority: node.priority });
      selectedIds.add(node.id);
      placed.push(rect);
      continue;
    }
    // Labels never overlap each other. A small overlap with the node marker is
    // acceptable in a dense column; hiding every name would leave the plane
    // unreadable at the very angles where names matter most.
    if (node.priority > 0 && (best.labelOverlap > 0.02 || best.obstacleOverlap > 0.22)) continue;
    if (node.priority <= 0 && best.overlap > 0.001 && best.labelOverlap > 0.05) continue;
    selectedIds.add(node.id);
    chosen.push({ id: node.id, anchor: best.anchor, rect: best.rect, alpha: 1, distance: node.distance, priority: node.priority });
    placed.push(best.rect);
  }
  // Near names are fully opaque, farther names fade to ~60%. Priority names
  // (selection / hover / current) keep full contrast.
  if (chosen.length > 1) {
    const distances = chosen.map((choice) => choice.distance);
    const near = Math.min(...distances);
    const far = Math.max(...distances);
    for (const choice of chosen) {
      if (choice.priority <= 1) continue;
      choice.alpha = 1 - 0.4 * smoothstep(near, far, choice.distance);
    }
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Excentric / surrounding labels when the pointer rests in a dense cluster.

export type ExcentricNode = {
  id: string;
  x: number;
  y: number;
  distance: number;
  visibility: number;
  text: string;
};

export type ExcentricRow = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExcentricLine = { x1: number; y1: number; x2: number; y2: number };

export type ExcentricLayout = {
  x: number;
  y: number;
  width: number;
  rows: ExcentricRow[];
  lines: ExcentricLine[];
};

export function chooseExcentricNodes(
  nodes: readonly ExcentricNode[],
  anchor: { x: number; y: number },
  options: { radius?: number; minNodes?: number; maxNodes?: number } = {}
): ExcentricNode[] {
  const radius = options.radius ?? 50;
  const minNodes = options.minNodes ?? 3;
  const maxNodes = options.maxNodes ?? 6;
  const near = nodes
    .filter((node) => node.visibility > 0.1)
    .map((node) => ({ node, distance: Math.hypot(node.x - anchor.x, node.y - anchor.y) }))
    .filter((entry) => entry.distance <= radius)
    .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id));
  if (near.length < minNodes) return [];
  return near.slice(0, maxNodes).map((entry) => entry.node).sort((left, right) => left.y - right.y || left.id.localeCompare(right.id));
}

export function layoutExcentric(
  nodes: readonly ExcentricNode[],
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  options: { measure: (text: string) => number; rowHeight?: number; margin?: number; topInset?: number; bottomInset?: number } = { measure: (text) => text.length * 12 }
): ExcentricLayout | null {
  if (nodes.length < 3) return null;
  const rowHeight = options.rowHeight ?? 22;
  const margin = options.margin ?? 12;
  const topInset = options.topInset ?? margin;
  const bottomInset = options.bottomInset ?? margin;
  const widths = nodes.map((node) => Math.max(40, options.measure(node.text) + 22));
  const width = Math.max(...widths);
  const fitRight = anchor.x + 24 + width < viewport.width - margin;
  const left = fitRight ? anchor.x + 24 : Math.max(margin, anchor.x - 24 - width);
  const totalHeight = nodes.length * rowHeight;
  const top = clamp(anchor.y - totalHeight / 2, topInset, Math.max(topInset, viewport.height - bottomInset - totalHeight));
  const rows = nodes.map((node, index) => {
    const rowWidth = widths[index];
    return {
      id: node.id,
      text: node.text,
      x: fitRight ? left : left + width - rowWidth,
      y: top + index * rowHeight,
      width: rowWidth,
      height: rowHeight
    };
  });
  const lines = nodes.map((node, index) => ({
    x1: fitRight ? left : left + width,
    y1: top + index * rowHeight + rowHeight / 2,
    x2: node.x,
    y2: node.y
  }));
  return { x: left, y: top, width, rows, lines };
}

// ---------------------------------------------------------------------------
// One screen-space picker for full cards, capsules, points, occluded and back
// faces. The caller supplies every candidate that may be clicked; the picker
// only answers "which node is nearest the pointer within the minimum radius?".

export type PickCandidate = {
  id: string;
  x: number;
  y: number;
  /** Camera distance; smaller is nearer / front-most. */
  distance: number;
  /** Optional card body rectangle in screen space (front card stage only). */
  rect?: TiltedLabelRect;
  /** Optional larger hit radius for a selected / forced marker. */
  radius?: number;
  /**
   * Same-position precedence: knowledge 0, capability 1, reflection 2.
   * Screen proximity stays primary; priority only wins within ~4px per rank.
   */
  priority?: number;
  /** Rendered opacity and draw state. Invisible nodes never enter the pick. */
  visible?: boolean;
};

export function pickScreenSpace(
  candidates: readonly PickCandidate[],
  pointer: { x: number; y: number },
  options: { minRadius?: number; priorityGap?: number } = {}
): string | null {
  const minRadius = options.minRadius ?? 22;
  const priorityGap = options.priorityGap ?? 4;
  const usable = candidates.filter((candidate) => candidate.visible !== false);
  const contains = (rect: TiltedLabelRect) =>
    pointer.x >= rect.x && pointer.x <= rect.x + rect.width
    && pointer.y >= rect.y && pointer.y <= rect.y + rect.height;
  // Front stage: a pointer inside a drawn card body hits that card itself.
  // Overlapping cards resolve by camera depth, so the front card wins even
  // when the reflection body extends underneath it.
  const rectHits = usable.filter((candidate) => candidate.rect && contains(candidate.rect));
  if (rectHits.length) {
    // Same-position precedence first: the Knowledge card owns the area where
    // its reflection body peeks underneath, even though the offset reflection
    // can be marginally nearer in straight-line camera distance.
    rectHits.sort((left, right) =>
      (left.priority ?? 0) - (right.priority ?? 0)
      || left.distance - right.distance
      || left.id.localeCompare(right.id));
    return rectHits[0].id;
  }
  // Turned plane: pointer proximity to the visible mark decides. A reflected
  // practice marker can only win when it is clearly closer than the Knowledge
  // or capability marker at the same place; priority breaks exact ties.
  let best: { id: string; score: number; screenDistance: number; priority: number; distance: number } | null = null;
  for (const candidate of usable) {
    const screenDistance = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y);
    const radius = Math.max(minRadius, candidate.radius ?? 0);
    if (screenDistance > radius) continue;
    const priority = candidate.priority ?? 0;
    const score = screenDistance + priority * priorityGap;
    if (!best
      || score < best.score - 0.001
      || (Math.abs(score - best.score) <= 0.001 && (
        screenDistance < best.screenDistance - 0.001
        || (Math.abs(screenDistance - best.screenDistance) <= 0.001 && (
          priority < best.priority
          || (priority === best.priority && candidate.distance < best.distance - 0.001)
        ))
      ))) {
      best = { id: candidate.id, score, screenDistance, priority, distance: candidate.distance };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Orbit pan envelope

export type PanBounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

/** Pan centre limits that still contain every layer plus a breathing margin. */
export function panBoundsFor(points: readonly TiltedPoint[], padding = 260): PanBounds | null {
  if (!points.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  return {
    minX: minX - padding, maxX: maxX + padding,
    minY: minY - padding, maxY: maxY + padding,
    minZ: minZ - padding, maxZ: maxZ + padding
  };
}

export function clampToPanBounds(point: TiltedPoint, bounds: PanBounds | null): TiltedPoint {
  if (!bounds) return point;
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
    z: clamp(point.z, bounds.minZ, bounds.maxZ)
  };
}

/** True when the target has moved outside the allowed centre box. */
export function panOffsetToBounds(point: TiltedPoint, bounds: PanBounds | null): TiltedPoint | null {
  if (!bounds) return null;
  const clamped = clampToPanBounds(point, bounds);
  if (clamped.x === point.x && clamped.y === point.y && clamped.z === point.z) return null;
  return { x: clamped.x - point.x, y: clamped.y - point.y, z: clamped.z - point.z };
}
