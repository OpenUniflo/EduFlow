export type ActionBranch = { id: string; edgeId: string; title: string; status: 'candidate' | 'selected' | 'in_progress' | 'completed' | 'unavailable' };
export const actionBranchColors = { candidate: '#64748b', selected: '#7c3aed', in_progress: '#0891b2', completed: '#059669', unavailable: '#a1a1aa' };
/** Screen-space presentation only; the force engine retains ownership of endpoints. */
export function actionBranchPath(start: { x: number; y: number }, end: { x: number; y: number }, index: number, count: number) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const offset = (index - (count - 1) / 2) * 42;
  const x = (start.x + end.x) / 2 - dy / length * offset;
  const y = (start.y + end.y) / 2 + dx / length * offset;
  return { path: `M ${start.x} ${start.y} Q ${x} ${y} ${end.x} ${end.y}`, x: (start.x + 2 * x + end.x) / 4, y: (start.y + 2 * y + end.y) / 4 };
}
