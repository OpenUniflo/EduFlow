import type { MicroLearningPath } from "./microLearning";

export type MicroSurface = "inline" | "panel" | "immersive";

/**
 * Simple paths stay in the conversation card. Paths with more than one unit (or
 * a long interaction sequence) open in the right workspace / immersive shell.
 */
export function microSurfaceForPath(path: Pick<MicroLearningPath, "units">): Exclude<MicroSurface, "immersive"> {
  return path.units.length > 1 ? "panel" : "inline";
}

export function microStepCount(path: Pick<MicroLearningPath, "units">) {
  return path.units.reduce((total, unit) => total + unit.steps.length, 0);
}

export function microImmersiveHref(knowledgeId: string, options: { courseId?: string; pathId?: string; returnTo: string }) {
  const params = new URLSearchParams();
  if (options.courseId) params.set("courseId", options.courseId);
  if (options.pathId) params.set("pathId", options.pathId);
  const query = params.toString();
  return { to: `/learn/micro/${encodeURIComponent(knowledgeId)}${query ? `?${query}` : ""}`, state: { returnTo: options.returnTo } };
}
