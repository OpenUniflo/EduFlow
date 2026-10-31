/**
 * Course-page-only learning-state colour encoding (2026-11-01):
 * green = acquired, blue = pending Course target, gray = pending intermediate
 * capability, plus practice identity. The Archive keeps Domain and its own
 * learner colours; do not apply this mapping outside the learner course page.
 */

export type ProjectTone = "acquired" | "target" | "intermediate" | "practice";

export type ProjectToneInput = {
  kind: "knowledge" | "assignment" | "capability" | "chapter" | "chapter-empty" | "route" | "route-chapter";
  /** Learner category when known; `completed` / `learning` are also accepted. */
  category?: "acquired" | "learning" | "pending" | null;
  status?: string | null;
};

export function projectToneFor(input: ProjectToneInput): ProjectTone {
  if (input.kind === "assignment") return "practice";
  const acquired = input.category === "acquired"
    || input.status === "completed";
  if (input.kind === "capability") return acquired ? "acquired" : "intermediate";
  return acquired ? "acquired" : "target";
}

/** CSS custom property for the tone; all colours come from tokens. */
export function projectColorVar(tone: ProjectTone) {
  if (tone === "acquired") return "var(--course-acquired)";
  if (tone === "target") return "var(--course-target)";
  if (tone === "intermediate") return "var(--course-intermediate)";
  return "var(--practice)";
}

export function projectColorValue(tone: ProjectTone) {
  if (tone === "acquired") return "var(--course-acquired)";
  if (tone === "target") return "var(--course-target)";
  if (tone === "intermediate") return "var(--course-intermediate)";
  return "var(--practice)";
}

export function projectToneLegend(): Array<{ tone: ProjectTone; label: string }> {
  return [
    { tone: "acquired", label: "已具备" },
    { tone: "target", label: "待学目标" },
    { tone: "intermediate", label: "待学中间能力" }
  ];
}
