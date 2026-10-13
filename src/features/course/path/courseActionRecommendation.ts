import { actionAlternatives, rankActions, type ActionData } from '@/features/actions/model';
import type { CapabilityRelation } from '@/shared/learning/routePlanning';

/** Shared Action availability and cost remain authoritative; this only chooses emphasis. */
export function courseActionRecommendation(courseId: string, relations: readonly CapabilityRelation[], data: ActionData, acquired: ReadonlySet<string>) {
  const active = data.runs.filter(run => run.course_id === courseId && data.continuableRunIds?.includes(run.id) && ['selected', 'in_progress'].includes(run.status))
    .sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))[0];
  if (active) return { kind: 'active' as const, run: active, outsideRoute: !relations.some(edge => edge.id === active.edge_id) };
  const choices = rankActions(relations.filter(edge => !acquired.has(edge.target)).flatMap(edge => actionAlternatives(courseId, edge, data, acquired).filter(item => item.cost.available && item.run?.status !== 'completed').map(item => ({ ...item, edge }))));
  if (!choices.length) return { kind: 'empty' as const };
  const recommended = choices[0];
  return { kind: 'candidate' as const, recommended, alternatives: choices.filter(item => item.edge.id === recommended.edge.id) };
}
