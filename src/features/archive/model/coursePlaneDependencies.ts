import type { Vec3 } from "./atlas3dLayout";

/** A real KnowledgeEdge that should be drawn on the Archive course plane. */
export type PlaneDependencyEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
};

export type PlaneDependencyChapter = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlaneDependencyRoute = {
  id: string;
  source: string;
  target: string;
  relation: string;
  /** Orthogonal polyline in the same centred world space as card positions. */
  points: Array<{ x: number; y: number; z: number }>;
};

type PlaneCard = {
  id: string;
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  chapterIndex: number;
};

const EPSILON = 0.5;

/**
 * Route only factual Knowledge dependencies (prerequisite / enables) inside the
 * Course plane. Lines leave the facing card edge, run through the gutters and
 * row alleys reserved by the plane layout, and never cross a card interior.
 *
 * - same column, adjacent rows: one vertical segment at the shared column axis;
 * - same column, skipped rows: a short side gutter around the cards in between;
 * - adjacent columns: horizontal → vertical → horizontal through the column gap;
 * - distant columns: the same H-V-H shape extended through a row alley so the
 *   horizontal runs pass between cards instead of through intermediate columns.
 */
export function buildPlaneDependencyRoutes(input: {
  positions: Readonly<Record<string, Vec3>>;
  chapters: readonly PlaneDependencyChapter[];
  cardWidth: number;
  cardHeight: number;
  edges: readonly PlaneDependencyEdge[];
}): PlaneDependencyRoute[] {
  const { chapters, cardWidth, cardHeight, edges } = input;
  if (!chapters.length) return [];
  const halfWidth = cardWidth / 2;
  const halfHeight = cardHeight / 2;

  const chapterIndex = (position: Vec3) => {
    let best = 0;
    let bestDistance = Infinity;
    chapters.forEach((chapter, index) => {
      const distance = Math.abs(position.x - (chapter.x + chapter.width / 2));
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  const cards = new Map<string, PlaneCard>();
  Object.entries(input.positions).forEach(([id, position]) => {
    cards.set(id, {
      id,
      x: position.x,
      y: position.y,
      left: position.x - halfWidth,
      right: position.x + halfWidth,
      top: position.y + halfHeight,
      bottom: position.y - halfHeight,
      chapterIndex: chapterIndex(position)
    });
  });
  const cardsByChapter = new Map<number, PlaneCard[]>();
  cards.forEach((card) => {
    cardsByChapter.set(card.chapterIndex, [...(cardsByChapter.get(card.chapterIndex) ?? []), card]);
  });
  cardsByChapter.forEach((chapterCards) => chapterCards.sort((left, right) => right.y - left.y || left.id.localeCompare(right.id)));

  const point = (x: number, y: number) => ({ x, y, z: 0 });

  function routeSameColumn(source: PlaneCard, target: PlaneCard): Array<{ x: number; y: number; z: number }> {
    const between = (cardsByChapter.get(source.chapterIndex) ?? []).some((card) => (
      card.id !== source.id
      && card.id !== target.id
      && card.y > Math.min(source.y, target.y) + EPSILON
      && card.y < Math.max(source.y, target.y) - EPSILON
    ));
    const x = (source.x + target.x) / 2;
    if (!between) {
      return source.y > target.y
        ? [point(x, source.bottom), point(x, target.top)]
        : [point(x, source.top), point(x, target.bottom)];
    }
    const chapter = chapters[source.chapterIndex];
    // Stay just outside the card footprint; the chapter padding is only 8px on
    // the compact plane, so a channel at the region edge would sit on the card.
    const rightGutter = chapter.x + chapter.width - 4;
    const leftGutter = chapter.x + 4;
    const gutter = rightGutter > source.right + 2 ? rightGutter : leftGutter;
    const direction = gutter >= source.x ? 1 : -1;
    return [
      point(source.x + direction * halfWidth, source.y),
      point(gutter, source.y),
      point(gutter, target.y),
      point(target.x + direction * halfWidth, target.y)
    ];
  }

  function routeAcrossColumns(source: PlaneCard, target: PlaneCard): Array<{ x: number; y: number; z: number }> {
    const direction = target.x >= source.x ? 1 : -1;
    const sourceChapter = chapters[source.chapterIndex];
    const targetChapter = chapters[target.chapterIndex];
    const sourceGutter = direction > 0 ? sourceChapter.x + sourceChapter.width : sourceChapter.x;
    const targetGutter = direction > 0 ? targetChapter.x : targetChapter.x + targetChapter.width;
    const start = point(source.x + direction * halfWidth, source.y);
    const end = point(target.x - direction * halfWidth, target.y);
    if (Math.abs(target.chapterIndex - source.chapterIndex) <= 1) {
      const gutter = (sourceGutter + targetGutter) / 2;
      return [start, point(gutter, source.y), point(gutter, target.y), end];
    }
    const targetCards = cardsByChapter.get(target.chapterIndex) ?? [];
    const above = targetCards
      .filter((card) => card.id !== target.id && card.y > target.y + EPSILON)
      .sort((left, right) => left.y - right.y)[0];
    const below = targetCards
      .filter((card) => card.id !== target.id && card.y < target.y - EPSILON)
      .sort((left, right) => right.y - left.y)[0];
    const approachFromAbove = source.y > target.y + EPSILON;
    const corridorY = approachFromAbove
      ? (target.top + (above ? above.bottom : target.top + Math.min(cardHeight, 32))) / 2
      : (target.bottom + (below ? below.top : target.bottom - Math.min(cardHeight, 32))) / 2;
    return [
      start,
      point(sourceGutter, source.y),
      point(sourceGutter, corridorY),
      point(targetGutter, corridorY),
      point(targetGutter, target.y),
      end
    ];
  }

  return edges.flatMap((edge) => {
    if (edge.relation !== "prerequisite" && edge.relation !== "enables") return [];
    if (edge.source === edge.target) return [];
    const source = cards.get(edge.source);
    const target = cards.get(edge.target);
    if (!source || !target) return [];
    const points = source.chapterIndex === target.chapterIndex
      ? routeSameColumn(source, target)
      : routeAcrossColumns(source, target);
    if (points.length < 2) return [];
    return [{ id: edge.id, source: edge.source, target: edge.target, relation: edge.relation, points }];
  });
}
