import type { CourseGraphData } from "@/features/course/runtime/courseRuntime";
import {
  PLANE_CARD_HEIGHT,
  PLANE_CARD_WIDTH,
  PLANE_CHAPTER_GAP,
  buildPlaneChapterLayout,
  getCoursePlaneBasis,
  type PlaneChapterLayout
} from "@/features/course/graph/elkCourseLayout";
import type { Vec3 } from "./atlas3dLayout";
import { buildPlaneDependencyRoutes, type PlaneDependencyRoute } from "./coursePlaneDependencies";

export type PlaneChapter = { id: string; title: string; x: number; y: number; width: number; height: number };
export type CoursePlaneLayout = {
  positions: Record<string, Vec3>;
  chapters: PlaneChapter[];
  /** Real in-course prerequisite/enables routes, already orthogonal and card-safe. */
  dependencies: PlaneDependencyRoute[];
  width: number;
  height: number;
  /** World footprint of one Knowledge card; identical to the ELK input node size. */
  cardWidth: number;
  cardHeight: number;
  source: "elk-course" | "elk-draft";
};

type ChapterMeta = { id: string; title: string; order: number };

/**
 * Compose per-chapter plane layouts into one front-facing map. Chapters are
 * columns left-to-right; local ELK coordinates keep each chapter's rows. The
 * result is centred and flipped from ELK's y-down space to the Archive's y-up
 * space. Card footprints are not rescaled: the world card size equals the ELK
 * input node size, so screen cards can be scaled directly from distance.
 */
export function composeCoursePlane(
  locals: ReadonlyMap<string, PlaneChapterLayout>,
  chapters: readonly ChapterMeta[],
  source: CoursePlaneLayout["source"]
): CoursePlaneLayout {
  const ordered = chapters.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const compiled: Array<{ meta: ChapterMeta; local: PlaneChapterLayout; x: number }> = [];
  let cursorX = 0;
  ordered.forEach((meta) => {
    const local = locals.get(meta.id);
    if (!local) return;
    compiled.push({ meta, local, x: cursorX });
    cursorX += local.width + PLANE_CHAPTER_GAP;
  });
  if (!compiled.length) {
    return { positions: {}, chapters: [], dependencies: [], width: 1, height: 1, cardWidth: PLANE_CARD_WIDTH, cardHeight: PLANE_CARD_HEIGHT, source };
  }
  const rawPositions: Array<{ id: string; x: number; y: number }> = [];
  compiled.forEach(({ local, x }) => {
    local.nodes.forEach((node) => {
      rawPositions.push({
        id: node.nodeId,
        x: x + node.x + node.width / 2,
        y: node.y + node.height / 2
      });
    });
  });
  const rawChapters = compiled.map(({ meta, local, x }) => ({
    id: meta.id,
    title: meta.title,
    x,
    y: 0,
    width: local.width,
    height: local.height
  }));
  const cardWidth = PLANE_CARD_WIDTH;
  const cardHeight = PLANE_CARD_HEIGHT;
  const minX = Math.min(
    ...rawChapters.map((chapter) => chapter.x),
    ...rawPositions.map((point) => point.x - cardWidth / 2)
  );
  const maxX = Math.max(
    ...rawChapters.map((chapter) => chapter.x + chapter.width),
    ...rawPositions.map((point) => point.x + cardWidth / 2)
  );
  const minY = Math.min(
    ...rawChapters.map((chapter) => chapter.y),
    ...rawPositions.map((point) => point.y - cardHeight / 2)
  );
  const maxY = Math.max(
    ...rawChapters.map((chapter) => chapter.y + chapter.height),
    ...rawPositions.map((point) => point.y + cardHeight / 2)
  );
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const positions: Record<string, Vec3> = {};
  rawPositions.forEach((point) => {
    positions[point.id] = { x: point.x - centerX, y: centerY - point.y, z: 0 };
  });
  const composedChapters: PlaneChapter[] = rawChapters.map((chapter) => ({
    ...chapter,
    x: chapter.x - centerX,
    // ELK's y is the top edge; after flipping, the box extends downward.
    y: centerY - chapter.y
  }));
  return { positions, chapters: composedChapters, dependencies: [], width, height, cardWidth, cardHeight, source };
}

export async function buildCoursePlane(graphData: CourseGraphData): Promise<CoursePlaneLayout> {
  const locals = await getCoursePlaneBasis(graphData);
  const plane = composeCoursePlane(
    new Map(locals.map((local) => [local.chapterId, local] as const)),
    graphData.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, order: chapter.order })),
    "elk-course"
  );
  return {
    ...plane,
    dependencies: buildPlaneDependencyRoutes({
      positions: plane.positions,
      chapters: plane.chapters,
      cardWidth: plane.cardWidth,
      cardHeight: plane.cardHeight,
      edges: graphData.knowledgeEdges
    })
  };
}

export async function buildDraftPlane(input: {
  ids: readonly string[];
  edges: readonly { id: string; source: string; target: string; relation: string }[];
  titles: ReadonlyMap<string, string>;
}): Promise<CoursePlaneLayout> {
  const ids = Array.from(new Set(input.ids)).sort();
  const idSet = new Set(ids);
  const chapterId = "draft";
  const local = await buildPlaneChapterLayout({
    chapterId,
    nodes: ids.map((id, index) => ({ id, lesson: index + 1 })),
    edges: input.edges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target))
  });
  const plane = composeCoursePlane(
    new Map([[chapterId, local]]),
    [{ id: chapterId, title: "课程创建草稿", order: 1 }],
    "elk-draft"
  );
  return {
    ...plane,
    dependencies: buildPlaneDependencyRoutes({
      positions: plane.positions,
      chapters: plane.chapters,
      cardWidth: plane.cardWidth,
      cardHeight: plane.cardHeight,
      edges: input.edges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target))
    })
  };
}
