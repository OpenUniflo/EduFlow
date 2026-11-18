import { archiveHref } from "@/features/archive/model/atlasParams";

/**
 * Course entries are one route (`/courses/:id`) reached from several surfaces.
 * The entry carries its own return address and a stable source identity; the
 * Course header only ever renders the source's label from this one map.
 */
export type CourseEntrySource = "home" | "my" | "archive" | "works" | "records" | "teaching";

export const COURSE_ENTRY_LABELS: Record<CourseEntrySource, string> = {
  home: "首页",
  my: "我的",
  archive: "档案",
  works: "作品",
  records: "记录",
  teaching: "教学"
};

/** Longest prefix wins; `/works/...` still returns to 作品. */
const SOURCE_BY_PATH: ReadonlyArray<{ prefix: string; source: CourseEntrySource }> = [
  { prefix: "/works", source: "works" },
  { prefix: "/archive", source: "archive" },
  { prefix: "/records", source: "records" },
  { prefix: "/teaching", source: "teaching" },
  { prefix: "/profile", source: "my" },
  { prefix: "/", source: "home" }
];

export type CourseEntry = {
  source: CourseEntrySource;
  label: string;
  returnTo: string;
};

export type CourseEntryState = {
  courseEntry: {
    source: CourseEntrySource;
    returnTo: string;
  };
};

export type CourseView = "route" | "tree";

function isSource(value: unknown): value is CourseEntrySource {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COURSE_ENTRY_LABELS, value);
}

function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\r\n]/.test(value)) return null;
  return value;
}

export function courseEntrySourceForPath(path: string): CourseEntrySource | null {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  const match = SOURCE_BY_PATH.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
  return match?.source ?? null;
}

export function fallbackCourseReturn(courseId: string) {
  return archiveHref({ focus: `course:${courseId}` });
}

/** Nested state used by every surface that opens the Course page. */
export function courseEntryState(source: CourseEntrySource, returnTo: string): CourseEntryState {
  return { courseEntry: { source, returnTo } };
}

/**
 * Resolve the one visible back label and target. An explicit source wins;
 * otherwise the return path identifies the surface. A missing or foreign
 * return target falls back to the Course plane in the Archive.
 */
export function resolveCourseEntry(state: unknown, courseId: string): CourseEntry {
  const fallback = fallbackCourseReturn(courseId);
  const record = state && typeof state === "object" ? state as Record<string, unknown> : null;
  const nested = record?.courseEntry && typeof record.courseEntry === "object"
    ? record.courseEntry as Record<string, unknown>
    : null;
  const candidate = safeInternalPath(nested?.returnTo) ?? safeInternalPath(record?.returnTo);
  if (!candidate) return { source: "archive", label: COURSE_ENTRY_LABELS.archive, returnTo: fallback };
  const inferred = courseEntrySourceForPath(candidate);
  const source = isSource(nested?.source) ? nested.source : inferred;
  if (!source) return { source: "archive", label: COURSE_ENTRY_LABELS.archive, returnTo: fallback };
  return {
    source,
    label: COURSE_ENTRY_LABELS[source],
    returnTo: candidate
  };
}

export function courseViewFromSearch(search: string): CourseView {
  return new URLSearchParams(search).get("view") === "course" ? "tree" : "route";
}

/** `view=course` is the sole URL representation of the Course tree. */
export function courseViewSearch(search: string, view: CourseView): URLSearchParams {
  const next = new URLSearchParams(search);
  if (view === "tree") next.set("view", "course");
  else next.delete("view");
  return next;
}
