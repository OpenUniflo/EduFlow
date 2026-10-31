/**
 * Course colour encoding shared by the learner course tree and the Archive
 * course plane (2026-11-01): green = acquired, blue = pending Course target,
 * gray = pending intermediate capability. The Archive's default star map,
 * Domain colours and person colours deliberately do not use this mapping.
 */

export type CourseTone = "acquired" | "target" | "intermediate" | "practice";

export type CourseToneKind =
  | "knowledge"
  | "assignment"
  | "capability"
  | "chapter"
  | "chapter-empty"
  | "route"
  | "route-chapter";

export type CourseToneInput = {
  kind: CourseToneKind;
  /** Learner category when known; `completed` / `learning` are also accepted. */
  category?: "acquired" | "learning" | "pending" | null;
  status?: string | null;
};

const ACQUIRED_STATUSES = new Set(["completed", "learned", "mastered"]);

export function isAcquiredStatus(status?: string | null): boolean {
  return status ? ACQUIRED_STATUSES.has(status) : false;
}

export function courseToneFor(input: CourseToneInput): CourseTone {
  if (input.kind === "assignment") return "practice";
  const acquired = input.category === "acquired" || isAcquiredStatus(input.status);
  if (input.kind === "capability") return acquired ? "acquired" : "intermediate";
  return acquired ? "acquired" : "target";
}

/** Knowledge-only helper used by the Archive course plane. */
export function courseToneForStatus(status?: string | null): CourseTone {
  return isAcquiredStatus(status) ? "acquired" : "target";
}

/** CSS custom property for a tone; all colours come from tokens. */
export function courseColorVar(tone: CourseTone): string {
  if (tone === "acquired") return "var(--course-acquired)";
  if (tone === "target") return "var(--course-target)";
  if (tone === "intermediate") return "var(--course-intermediate)";
  return "var(--practice)";
}

export function courseToneLegend(): Array<{ tone: CourseTone; label: string }> {
  return [
    { tone: "acquired", label: "已具备" },
    { tone: "target", label: "待学目标" },
    { tone: "intermediate", label: "待学中间能力" }
  ];
}
