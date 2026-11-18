/** Structured understanding checks are learning content, never artifact Practice. */
export function isArtifactPracticeExecutor(assignment: { mode?: unknown; experience?: unknown } | null | undefined): boolean {
  if (!assignment || assignment.mode === 'workflow') return false;
  const experience = assignment.experience as { type?: unknown } | null | undefined;
  // `answer` stays readable for historical records; `code` and `trace` are
  // presented as the unified file/link practice in P2. Server evaluation
  // remains authoritative for every legacy response.
  return experience?.type == null || experience.type === 'answer' || experience.type === 'code' || experience.type === 'trace';
}
