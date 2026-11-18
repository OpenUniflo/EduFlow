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

/**
 * Shared level-of-detail state for the front (zoom) and oblique (angle) views.
 * The two inputs feed one continuous set of parameters, so a Knowledge is
 * never drawn twice: full card -> name capsule -> a single screen-facing point.
 * The discrete stage is remembered and the thresholds have a gap, so zooming
 * around a boundary cannot flicker.
 */
export type LodSizeStage = "full" | "pill" | "dot";

export type LodViewInput = {
  theta: number;
  /** Current card width in CSS pixels (before simplification). */
  screenWidth: number;
  /** Previous size-driven stage, used for the hysteresis gap. */
  previousSizeStage?: LodSizeStage;
  /** Width at which the full card starts collapsing to a capsule. */
  fullEnter?: number;
  /** Width at which a capsule is fully collapsed. */
  pillEnter?: number;
  /** Width at which the capsule starts becoming a point. */
  dotEnter?: number;
  /** Width at which a point is fully collapsed / a previous point re-expands. */
  dotExit?: number;
};

export function sizeStageForWidth(width: number, previous?: LodSizeStage, input: LodViewInput = { theta: 0, screenWidth: width }): LodSizeStage {
  const fullEnter = input.fullEnter ?? 114;
  const pillEnter = input.pillEnter ?? 108;
  const dotEnter = input.dotEnter ?? 60;
  const dotExit = input.dotExit ?? 74;
  if (previous === "dot") {
    if (width < dotExit) return width < dotEnter ? "dot" : "pill";
    return width > fullEnter ? "full" : "pill";
  }
  if (previous === "pill") {
    if (width < dotEnter) return "dot";
    return width > fullEnter ? "full" : "pill";
  }
  if (width < pillEnter) return width < dotEnter ? "dot" : "pill";
  return "full";
}

export function simplificationForView(input: LodViewInput): TiltedAngleState & { sizeStage: LodSizeStage } {
  const angle = simplificationForAngle(input.theta);
  const width = Math.max(0, input.screenWidth);
  const fullEnter = input.fullEnter ?? 114;
  const pillEnter = input.pillEnter ?? 108;
  const dotEnter = input.dotEnter ?? 60;
  const dotExit = input.dotExit ?? 74;
  const sizeStage = sizeStageForWidth(width, input.previousSizeStage, { ...input, fullEnter, pillEnter, dotEnter, dotExit });
  // Continuous ramps use the same thresholds; the remembered stage only keeps
  // tiny threshold crossings from flipping the label/marker ownership.
  const sizePill = 1 - smoothstep(pillEnter, fullEnter, width);
  // The visual point ramp is deliberately narrower than the stage's
  // hysteresis window: 50–60% still reads as capsules, below ~55% (about
  // 45–60 screen px here) the marker becomes a point.
  const sizeDot = 1 - smoothstep(56, 60, width);
  const pill = Math.max(angle.pill, sizePill);
  const dot = Math.max(angle.dot, sizeDot);
  const stage: TiltedStage = angle.stage === "dot" || sizeStage === "dot"
    ? "dot"
    : angle.stage === "pill" || sizeStage === "pill"
      ? "pill"
      : "full";
  return {
    ...angle,
    stage,
    pill,
    dot,
    extra: angle.extra * (1 - sizePill),
    billboard: Math.max(angle.billboard, smoothstep(0.02, 0.72, pill)),
    cardName: 1 - dot,
    // Screen-size simplification never invents an outside name: at the front a
    // far point only carries a name on hover / selection.
    outsideName: angle.outsideName,
    sizeStage
  };
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
  /** Additional outward offset used when a name escapes a dense cluster or HUD panel. */
  extra?: number;
  /** Exact displacement from the immediate anchor (parked names far out). */
  offset?: { x: number; y: number };
  /** True when the name left its immediate anchor and needs a short leader line. */
  leader?: boolean;
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
    // A name is anchored to its own marker or hidden; never moved to a
    // distant free slot. This is the core of the stability rule.
    if (!best) continue;
    // A name never overlaps another name, a HUD rectangle or a node marker:
    // if no anchor is free, the node stays unnamed.
    if (best.labelOverlap > 0.02 || best.obstacleOverlap > 0.02) continue;
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
// Selection names: the selected node plus every lit one-hop neighbour

export type TiltedSelectionLabelCandidate = {
  id: string;
  x: number;
  y: number;
  /** Camera distance; smaller means nearer. */
  distance: number;
  /** Screen diameter of the node marker. */
  diameter: number;
  text: string;
  /** Measured label width in CSS pixels. */
  width: number;
  selected?: boolean;
};

export type TiltedSelectionLabelMarker = TiltedLabelRect & { id: string };

export type TiltedSelectionLabelOptions = {
  width: number;
  height: number;
  lineHeight?: number;
  margin?: number;
  selectedId?: string;
  /** Every related point / ring, including the selected node's ring. */
  markers?: readonly TiltedSelectionLabelMarker[];
  /** Page HUD rectangles (detail panel, toolbar, status / zoom bars, top bar). */
  exclusions?: readonly TiltedLabelRect[];
  /** Card bodies of other nodes; a selected name may sit over one if needed. */
  cardBoxes?: readonly TiltedLabelRect[];
  anchors?: readonly TiltedLabelAnchor[];
  selectedAnchors?: readonly TiltedLabelAnchor[];
  /** Outward offsets, tried from the immediate anchor outward. */
  offsets?: readonly number[];
};

const SELECTION_ANCHORS: readonly TiltedLabelAnchor[] = ["above", "right", "below", "left"];
const SELECTION_SELECTED_ANCHORS: readonly TiltedLabelAnchor[] = ["above", "left", "right", "below"];
const SELECTION_OFFSETS: readonly number[] = [0, 14, 24, 36, 52, 72, 96, 126, 162, 206, 260, 326, 404, 500, 610];

function expandRect(rect: TiltedLabelRect, padding: number): TiltedLabelRect {
  return { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 };
}

function segmentHitsRect(segment: { x1: number; y1: number; x2: number; y2: number }, rect: TiltedLabelRect) {
  const contains = (x: number, y: number) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  if (contains(segment.x1, segment.y1) || contains(segment.x2, segment.y2)) return true;
  const hit = (ax: number, ay: number, bx: number, by: number) => {
    const denominator = (bx - ax) * (segment.y2 - segment.y1) - (by - ay) * (segment.x2 - segment.x1);
    if (Math.abs(denominator) < 1e-6) return false;
    const t = ((segment.x1 - ax) * (segment.y2 - segment.y1) - (segment.y1 - ay) * (segment.x2 - segment.x1)) / denominator;
    const u = ((segment.x1 - ax) * (by - ay) - (segment.y1 - ay) * (bx - ax)) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  return hit(rect.x, rect.y, rect.x + rect.width, rect.y)
    || hit(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height)
    || hit(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height)
    || hit(rect.x, rect.y + rect.height, rect.x, rect.y);
}

/**
 * Short leader from the node marker edge to the near edge of a moved name.
 * The start point always sits on the node, never on the label.
 */
export function labelLeaderFor(
  node: { x: number; y: number; diameter: number },
  anchor: TiltedLabelAnchor,
  rect: TiltedLabelRect
) {
  const radius = Math.max(7, Math.min(24, node.diameter / 2 + 3));
  if (anchor === "right") return { x1: node.x + radius, y1: node.y, x2: rect.x, y2: rect.y + rect.height / 2 };
  if (anchor === "left") return { x1: node.x - radius, y1: node.y, x2: rect.x + rect.width, y2: rect.y + rect.height / 2 };
  if (anchor === "below") return { x1: node.x, y1: node.y + radius, x2: rect.x + rect.width / 2, y2: rect.y };
  return { x1: node.x, y1: node.y - radius, x2: rect.x + rect.width / 2, y2: rect.y + rect.height };
}

function leaderHitsLabelOrMarker(
  segment: { x1: number; y1: number; x2: number; y2: number },
  placed: readonly TiltedLabelRect[],
  markers: readonly TiltedSelectionLabelMarker[],
  ownId: string
) {
  // The line may not cut through another name; it also must not cross a
  // related point / ring on its way out (except its own marker at the start).
  for (const rect of placed) if (segmentHitsRect(segment, expandRect(rect, 1))) return true;
  for (const marker of markers) {
    if (marker.id === ownId) continue;
    if (segmentHitsRect(segment, expandRect(marker, 1))) return true;
  }
  return false;
}

function selectionAnchorToward(rect: TiltedLabelRect, candidate: TiltedSelectionLabelCandidate): TiltedLabelAnchor {
  const dx = rect.x + rect.width / 2 - candidate.x;
  const dy = rect.y + rect.height / 2 - candidate.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "below" : "above";
}

function parkSelectionLabel(
  candidate: TiltedSelectionLabelCandidate,
  placed: readonly TiltedLabelRect[],
  placedLeaders: readonly { x1: number; y1: number; x2: number; y2: number }[],
  markers: readonly TiltedSelectionLabelMarker[],
  exclusions: readonly TiltedLabelRect[],
  cardBoxes: readonly TiltedLabelRect[],
  options: Required<Pick<TiltedSelectionLabelOptions, "width" | "height" | "lineHeight" | "margin">>,
  selected: boolean
): TiltedLabelRect | null {
  const fits = (rect: TiltedLabelRect) => {
    if (rect.x < options.margin || rect.y < options.margin
      || rect.x + rect.width > options.width - options.margin
      || rect.y + rect.height > options.height - options.margin) return false;
    if (placed.some((other) => overlapRatio(rect, other) > 0)) return false;
    if (placedLeaders.some((leader) => segmentHitsRect(leader, expandRect(rect, 1)))) return false;
    if (exclusions.some((other) => overlapRatio(rect, other) > 0)) return false;
    // A name never covers any related point / ring, including its own.
    if (markers.some((other) => overlapRatio(rect, other) > 0)) return false;
    if (!selected && cardBoxes.some((other) => overlapRatio(rect, other) > 0)) return false;
    return true;
  };
  const fitsWithLeader = (rect: TiltedLabelRect) => {
    if (!fits(rect)) return false;
    const anchor = selectionAnchorToward(rect, candidate);
    const leader = labelLeaderFor(candidate, anchor, rect);
    return !leaderHitsLabelOrMarker(leader, placed, markers, candidate.id);
  };
  // First walk outward around the node; this keeps dense columns readable
  // (the preferred side slot is usually only one row away).
  const maxRadius = Math.min(720, Math.hypot(options.width, options.height));
  for (let radius = 26; radius <= maxRadius; radius += 22) {
    const steps = Math.max(12, Math.round((Math.PI * 2 * radius) / 120));
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2 - Math.PI / 2;
      const rect = {
        x: candidate.x + Math.cos(angle) * radius - candidate.width / 2,
        y: candidate.y + Math.sin(angle) * radius - options.lineHeight / 2,
        width: candidate.width,
        height: options.lineHeight
      };
      if (fitsWithLeader(rect)) return rect;
    }
  }
  // Last resort: a free slot anywhere in the stage, nearest first. This keeps
  // the hard rule "a related node always keeps a name" even in a crowded pose.
  let best: TiltedLabelRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const step = 24;
  for (let y = options.margin; y + options.lineHeight <= options.height - options.margin; y += step) {
    for (let x = options.margin; x + candidate.width <= options.width - options.margin; x += step) {
      const rect = { x, y, width: candidate.width, height: options.lineHeight };
      if (!fitsWithLeader(rect)) continue;
      const distance = Math.hypot(x + candidate.width / 2 - candidate.x, y + options.lineHeight / 2 - candidate.y);
      if (distance < bestDistance) {
        best = rect;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * Selection layout: one name for the selected node and one for every related
 * one-hop node. The set is never reduced by avoidance; a name that cannot sit
 * beside its marker moves outward and gets a short leader line. The only
 * allowed omissions happen before this call (out of frustum / HUD-covered).
 */
export function layoutSelectionLabels(
  candidates: readonly TiltedSelectionLabelCandidate[],
  options: TiltedSelectionLabelOptions
): TiltedLabelChoice[] {
  const lineHeight = options.lineHeight ?? 22;
  const margin = options.margin ?? 8;
  const selectedId = options.selectedId;
  const markers = options.markers ?? [];
  const exclusions = options.exclusions ?? [];
  const cardBoxes = options.cardBoxes ?? [];
  const anchors = options.anchors ?? SELECTION_ANCHORS;
  const selectedAnchors = options.selectedAnchors ?? SELECTION_SELECTED_ANCHORS;
  const offsets = options.offsets ?? SELECTION_OFFSETS;
  const ordered = [...candidates].sort((left, right) => {
    const leftSelected = left.selected || left.id === selectedId ? 0 : 1;
    const rightSelected = right.selected || right.id === selectedId ? 0 : 1;
    // Top-to-bottom packing keeps a dense vertical column readable: the upper
    // names claim their side / above slot before the lower ones.
    return leftSelected - rightSelected
      || right.x - left.x
      || right.distance - left.distance
      || left.id.localeCompare(right.id);
  });
  const chosen: TiltedLabelChoice[] = [];
  const placed: TiltedLabelRect[] = [];
  const placedLeaders: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const candidate of ordered) {
    const selected = Boolean(candidate.selected || candidate.id === selectedId);
    const order = selected ? selectedAnchors : anchors;
    let choice: TiltedLabelChoice | null = null;
    for (const extra of offsets) {
      for (const anchor of order) {
        const base = labelRectForAnchor(candidate, anchor, candidate.width, lineHeight);
        const shifted = {
          ...base,
          x: base.x + (anchor === "left" ? -extra : anchor === "right" ? extra : 0),
          y: base.y + (anchor === "above" ? -extra : anchor === "below" ? extra : 0)
        };
        // A moved name is clamped into the stage; the immediate anchor is
        // rejected when it would leave the stage.
        const rect = extra > 0 ? {
          ...shifted,
          x: Math.max(margin, Math.min(shifted.x, options.width - margin - candidate.width)),
          y: Math.max(margin, Math.min(shifted.y, options.height - margin - lineHeight))
        } : shifted;
        if (rect.x < margin || rect.y < margin
          || rect.x + rect.width > options.width - margin
          || rect.y + rect.height > options.height - margin) continue;
        if (placed.some((other) => overlapRatio(rect, other) > 0)) continue;
        // A new name may not be placed across an already drawn leader; later
        // labels must respect the earlier name/leader pair.
        if (placedLeaders.some((leader) => segmentHitsRect(leader, expandRect(rect, 1)))) continue;
        if (exclusions.some((other) => overlapRatio(rect, other) > 0)) continue;
        // Never cover any related point / circle (own marker included).
        if (markers.some((other) => overlapRatio(rect, other) > 0)) continue;
        if (!selected && cardBoxes.some((other) => overlapRatio(rect, other) > 0)) continue;
        const leader = extra > 0 ? labelLeaderFor(candidate, anchor, rect) : null;
        if (leader && leaderHitsLabelOrMarker(leader, placed, markers, candidate.id)) continue;
        if (leader) placedLeaders.push(leader);
        choice = {
          id: candidate.id, anchor, rect, alpha: 1, distance: candidate.distance,
          priority: selected ? 0 : 1, extra, leader: Boolean(leader)
        };
        break;
      }
      if (choice) break;
    }
    if (!choice) {
      const parked = parkSelectionLabel(candidate, placed, placedLeaders, markers, exclusions, cardBoxes,
        { width: options.width, height: options.height, lineHeight, margin }, selected);
      if (parked) {
        const anchor = selectionAnchorToward(parked, candidate);
        const base = labelRectForAnchor(candidate, anchor, candidate.width, lineHeight);
        const leader = labelLeaderFor(candidate, anchor, parked);
        if (!leaderHitsLabelOrMarker(leader, placed, markers, candidate.id)) {
          placedLeaders.push(leader);
          choice = {
            id: candidate.id, anchor, rect: parked, alpha: 1, distance: candidate.distance,
            priority: selected ? 0 : 1, extra: 1, leader: true,
            offset: { x: parked.x - base.x, y: parked.y - base.y }
          };
        }
      }
    }
    if (!choice) continue;
    chosen.push(choice);
    placed.push(choice.rect);
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
  const radius = options.radius ?? 22;
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

/**
 * Ambiguous-cluster detector used by both the course plane and the Archive.
 * The pointer must be inside the 22px pick radius of at least three nodes; a
 * tiny snap (<= 6px) keeps a cluster from being missed when the camera is
 * still settling between the pointer move and the 400ms dwell. It never
 * invents nodes: only nodes that pass the pick radius are returned.
 */
export function findExcentricCluster(
  nodes: readonly ExcentricNode[],
  anchor: { x: number; y: number },
  options: { radius?: number; minNodes?: number; maxNodes?: number; snap?: number } = {}
): { anchor: { x: number; y: number }; nodes: ExcentricNode[] } | null {
  const radius = options.radius ?? 22;
  const minNodes = options.minNodes ?? 3;
  const maxNodes = options.maxNodes ?? 6;
  const snap = Math.max(0, options.snap ?? 6);
  const usable = nodes.filter((node) => node.visibility > 0.02);
  const candidates: Array<{ x: number; y: number }> = [{ x: anchor.x, y: anchor.y }];
  if (snap > 0) {
    for (let dx = -snap; dx <= snap; dx += 3) {
      for (let dy = -snap; dy <= snap; dy += 3) {
        if (dx === 0 && dy === 0) continue;
        candidates.push({ x: anchor.x + dx, y: anchor.y + dy });
      }
    }
  }
  let best: { anchor: { x: number; y: number }; nodes: ExcentricNode[]; score: number; maxDistance: number; offset: number } | null = null;
  for (const point of candidates) {
    const near = usable
      .map((node) => ({ node, distance: Math.hypot(node.x - point.x, node.y - point.y) }))
      .filter((entry) => entry.distance <= radius)
      .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id));
    if (near.length < minNodes) continue;
    const maxDistance = near[Math.min(near.length, maxNodes) - 1].distance;
    const offset = Math.hypot(point.x - anchor.x, point.y - anchor.y);
    const score = near.length * 100 - maxDistance - offset * 0.5;
    if (!best || score > best.score) {
      best = { anchor: point, nodes: near.slice(0, maxNodes).map((entry) => entry.node), score, maxDistance, offset };
    }
  }
  if (!best) return null;
  return { anchor: best.anchor, nodes: [...best.nodes].sort((left, right) => left.y - right.y || left.id.localeCompare(right.id)) };
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

/**
 * Excentric list placed outside the plane's screen bounding box. Rows follow
 * the nodes' vertical order, so leader lines never cross. Used by both the
 * course plane and the Archive course focus.
 */
export function layoutExcentricOutside(
  nodes: readonly ExcentricNode[],
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  planeBounds: TiltedLabelRect,
  options: { measure: (text: string) => number; rowHeight?: number; margin?: number; gap?: number; topInset?: number; bottomInset?: number; maxNodes?: number } = { measure: (text) => text.length * 12 }
): ExcentricLayout | null {
  if (nodes.length < 3) return null;
  const maxNodes = options.maxNodes ?? 6;
  const rowHeight = options.rowHeight ?? 22;
  const margin = options.margin ?? 12;
  const gap = options.gap ?? 16;
  const topInset = options.topInset ?? margin;
  const bottomInset = options.bottomInset ?? margin;
  const sorted = [...nodes].sort((left, right) => left.y - right.y || left.id.localeCompare(right.id)).slice(0, maxNodes);
  const widths = sorted.map((node) => Math.max(40, options.measure(node.text) + 22));
  const width = Math.max(...widths);
  const totalHeight = sorted.length * rowHeight;
  const top = clamp(anchor.y - totalHeight / 2, topInset, Math.max(topInset, viewport.height - bottomInset - totalHeight));
  const rightX = planeBounds.x + planeBounds.width + gap;
  const leftX = planeBounds.x - gap - width;
  const fitsRight = rightX + width <= viewport.width - margin;
  const fitsLeft = leftX >= margin;
  const onRight = fitsRight || !fitsLeft;
  const left = onRight
    ? Math.min(Math.max(margin, rightX), Math.max(margin, viewport.width - margin - width))
    : Math.max(margin, leftX);
  const rows = sorted.map((node, index) => {
    const rowWidth = widths[index];
    return {
      id: node.id,
      text: node.text,
      x: onRight ? left : left + width - rowWidth,
      y: top + index * rowHeight,
      width: rowWidth,
      height: rowHeight
    };
  });
  const lines = sorted.map((node, index) => ({
    // The connector leaves the list edge that faces the plane.
    x1: onRight ? left : left + width,
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
