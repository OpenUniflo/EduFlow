export type PlaceState = "done" | "now" | "ahead" | "goal";
export type WorkspacePlace = { id: string; title: string; state: PlaceState };
export type WorkspaceChapter = { id: string; title: string; order: number; nodeIds: string[] };

export function markChapters(chapters: WorkspaceChapter[], known: ReadonlySet<string>): WorkspacePlace[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const done = sorted.map((chapter) => chapter.nodeIds.length > 0 && chapter.nodeIds.every((id) => known.has(id)));
  const now = done.findIndex((flag) => !flag);
  return sorted.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    state: done[index] ? "done" : index === now ? "now" : index === sorted.length - 1 ? "goal" : "ahead",
  }));
}

export function laneColumns(places: WorkspacePlace[]) {
  if (!places.length) return [];
  const size = Math.ceil(places.length / 4);
  const columns = [];
  for (let index = 0; index < places.length; index += size) {
    const cards = places.slice(index, index + size);
    columns.push({ title: cards[0]?.title ?? "", cards });
  }
  return columns;
}

export type MapPlace = { id: string; title: string; state: PlaceState };
export function mapLands(nodes: Array<{ id: string; title: string; domain: string; state: PlaceState }>) {
  const lands = new Map<string, MapPlace[]>();
  nodes.forEach((node) => {
    const name = node.domain || "未分类";
    const places = lands.get(name) ?? [];
    places.push({ id: node.id, title: node.title, state: node.state });
    lands.set(name, places);
  });
  return [...lands.entries()].map(([name, places]) => ({ name, places }));
}
