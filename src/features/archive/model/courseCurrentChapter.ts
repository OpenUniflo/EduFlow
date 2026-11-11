/**
 * The chapter the course plane should open on. This is a projection of real
 * course state only: a learning node wins, then the first unfinished node, then
 * the last chapter when everything is complete.
 */
export function selectCurrentChapterId(input: {
  chapters: ReadonlyArray<{ id: string; order: number }>;
  nodes: ReadonlyArray<{ id: string; chapterId: string; lesson?: number; status: string }>;
}): string | null {
  if (!input.chapters.length) return null;
  const order = new Map(input.chapters.map((chapter) => [chapter.id, chapter.order]));
  const sorted = [...input.nodes].sort((left, right) =>
    (order.get(left.chapterId) ?? 0) - (order.get(right.chapterId) ?? 0)
    || (left.lesson ?? 0) - (right.lesson ?? 0)
    || left.id.localeCompare(right.id)
  );
  const current = sorted.find((node) => node.status === "learning")
    ?? sorted.find((node) => node.status !== "completed")
    ?? sorted[sorted.length - 1];
  return current?.chapterId
    ?? [...input.chapters].sort((left, right) => left.order - right.order)[0]?.id
    ?? null;
}
