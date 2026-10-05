/** Structured understanding checks are learning content, never artifact Practice. */
export function isArtifactPracticeExecutor(assignment: { mode?: unknown; experience?: unknown } | null | undefined): boolean {
  if (!assignment || assignment.mode === 'workflow') return false;
  const experience = assignment.experience as { type?: unknown } | null | undefined;
  return experience?.type == null || experience.type === 'answer' || experience.type === 'code';
}
