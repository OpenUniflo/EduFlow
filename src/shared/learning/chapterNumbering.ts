/**
 * Chapter display ordinals are a dense, one-based presentation projection.
 * `order` is persisted curriculum data and may be non-dense; it must not be
 * shown directly. Every surface uses this function so a chapter has one number.
 */
export type ChapterOrdinalInput = { id: string; order?: number | null };

/** Maps each chapter id to its one-based position in canonical curriculum order. */
export function chapterDisplayNumbers(chapters: readonly ChapterOrdinalInput[]): Map<string, number> {
  const ordered = chapters
    .filter((chapter) => Boolean(chapter.id))
    .slice()
    .sort((left, right) => {
      const leftOrder = typeof left.order === "number" && Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.order === "number" && Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
  return new Map(ordered.map((chapter, index) => [chapter.id, index + 1]));
}

export function chapterDisplayNumber(chapters: readonly ChapterOrdinalInput[], chapterId: string | undefined | null): number | undefined {
  return chapterId ? chapterDisplayNumbers(chapters).get(chapterId) : undefined;
}

export function chapterNumberLabel(number: number | undefined | null): string {
  return typeof number === "number" && Number.isFinite(number) ? `第 ${number} 章` : "";
}
