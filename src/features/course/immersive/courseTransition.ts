/**
 * Scene-level course entry/exit transition. The origin rectangle is captured at
 * the click target and replayed by the immersive page as a 600ms scale/fade;
 * reduced motion uses a plain fade. It carries presentation geometry only.
 */
export type CourseOriginRect = { left: number; top: number; width: number; height: number };

const PREFIX = "ef-course-origin:";
const memory = new Map<string, CourseOriginRect>();

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

export function rememberCourseOrigin(courseId: string, rect: CourseOriginRect | DOMRect | null | undefined) {
  if (!courseId || !rect) return;
  const value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  memory.set(courseId, value);
  try { storage()?.setItem(`${PREFIX}${courseId}`, JSON.stringify(value)); } catch { /* presentation only */ }
}

export function readCourseOrigin(courseId: string): CourseOriginRect | null {
  const cached = memory.get(courseId);
  if (cached) return cached;
  try {
    const raw = storage()?.getItem(`${PREFIX}${courseId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<CourseOriginRect>;
    if (![value.left, value.top, value.width, value.height].every((item) => typeof item === "number" && Number.isFinite(item))) return null;
    return value as CourseOriginRect;
  } catch { return null; }
}

export function clearCourseOrigin(courseId: string) {
  memory.delete(courseId);
  try { storage()?.removeItem(`${PREFIX}${courseId}`); } catch { /* presentation only */ }
}

export function courseTransitionCss(origin: CourseOriginRect | null, viewport = { width: 1440, height: 960 }) {
  if (!origin) return null;
  const scaleX = Math.max(0.02, origin.width / Math.max(1, viewport.width));
  const scaleY = Math.max(0.02, origin.height / Math.max(1, viewport.height));
  return {
    transform: `translate(${origin.left}px, ${origin.top}px) scale(${scaleX}, ${scaleY})`,
    width: `${viewport.width}px`,
    height: `${viewport.height}px`,
    borderRadius: "24px"
  };
}
