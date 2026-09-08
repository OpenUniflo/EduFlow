/** Instructional readiness only; this is never evidence of mastery. */
export function satisfiesTeachingPrerequisite(status: string | undefined): boolean {
  return status === "learned" || status === "practicing" || status === "mastered";
}
