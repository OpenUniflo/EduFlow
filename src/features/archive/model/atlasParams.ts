export type ArchivePanel = "courses" | "search" | "people" | "share" | "notifications" | null;

export type ArchiveFocus =
  | { type: "all" }
  | { type: "me" }
  | { type: "knowledge"; id: string }
  | { type: "course"; id: string };

export type ArchiveUrlState = {
  panel: ArchivePanel;
  focus: ArchiveFocus;
  search: string;
  comparePersonIds: string[];
};

const PANELS = new Set(["courses", "search", "people", "share", "notifications"]);

export function parseArchiveSearch(search: string): ArchiveUrlState {
  const params = new URLSearchParams(search);
  const panelParam = params.get("panel");
  const focusParam = params.get("focus");
  const compare = (params.get("compare") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return {
    panel: panelParam && PANELS.has(panelParam) ? panelParam as ArchivePanel : null,
    focus: focusParam === "me"
      ? { type: "me" }
      : focusParam?.startsWith("knowledge:")
        ? { type: "knowledge", id: focusParam.slice("knowledge:".length) }
        : focusParam?.startsWith("course:")
          ? { type: "course", id: focusParam.slice("course:".length) }
          : { type: "all" },
    search: params.get("search") ?? "",
    comparePersonIds: Array.from(new Set(compare)).slice(0, 3)
  };
}

/** A stable, presentation-only archive URL used by Home and Account entry points. */
export function archiveHref(input: { focus?: "me" | `knowledge:${string}` | `course:${string}`; panel?: ArchivePanel; search?: string; compare?: readonly string[] } = {}) {
  const params = new URLSearchParams();
  if (input.focus) params.set("focus", input.focus);
  if (input.panel) params.set("panel", input.panel);
  if (input.search?.trim()) params.set("search", input.search.trim());
  if (input.compare?.length) params.set("compare", input.compare.slice(0, 3).join(","));
  const suffix = params.toString();
  return `/archive${suffix ? `?${suffix}` : ""}`;
}

export function archiveSearchHref(query: string) {
  return archiveHref({ panel: "search", search: query });
}
