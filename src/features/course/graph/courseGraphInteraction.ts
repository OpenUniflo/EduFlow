import type { SelectedAnchor } from "@/features/course/courseSelection";
import type { ManualNodePosition } from "@/features/course/authoring/courseAuthoringDraft";

export type CourseGraphRect = ManualNodePosition & { id: string; width: number; height: number };

export function shouldReserveCourseDrawer(input: { drawerVisible: boolean; selectedAnchor: SelectedAnchor | null; materialsOpen: boolean }) {
  return input.materialsOpen || Boolean(input.drawerVisible && input.selectedAnchor);
}

export function findChapterDropTarget(node: CourseGraphRect, chapters: CourseGraphRect[]) {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  return chapters.find((chapter) => centerX >= chapter.x && centerX <= chapter.x + chapter.width && centerY >= chapter.y && centerY <= chapter.y + chapter.height)?.id ?? null;
}

export function toChapterRelativePosition(node: CourseGraphRect, chapter: CourseGraphRect): ManualNodePosition {
  const headerReserve = 88;
  return {
    x: Math.max(0, Math.min(node.x - chapter.x, Math.max(0, chapter.width - node.width))),
    y: Math.max(headerReserve, Math.min(node.y - chapter.y, Math.max(headerReserve, chapter.height - node.height)))
  };
}
