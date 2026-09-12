import { computeNavigationPlan } from './navigationEngine.js';
import { satisfiesTeachingPrerequisite } from '../../src/shared/learning/teachingPrerequisites.js';
import type { NavigationEngineInput } from '../../src/shared/learning/navigation.js';
import type { CandidateAction, RecommendationPolicy, RecommendationPolicyKey, ModelPolicy } from '../../src/shared/learning/recommendation.js';

/** Inputs are published, visible server-loaded assets. No policy receives blocked actions. */
export function generateCandidates(input: NavigationEngineInput, criterionIdsByPath: ReadonlyMap<string, string[]>): CandidateAction[] {
  const baseline = computeNavigationPlan(input);
  const frontier = baseline.path.find(item => item.state !== 'learned' && item.state !== 'skipped');
  // Preserve the route stop at a blocked or contentless frontier even for Rule.
  if (!frontier || baseline.nextAction.resourceKind !== 'micro') return [];
  const courseNodes = new Set(input.nodes.map(node => node.id));
  return baseline.path.flatMap(node => {
    if (node.state !== 'eligible' && node.state !== 'underway') return [];
    if (input.prerequisiteEdges.some(edge => edge.target === node.nodeId && courseNodes.has(edge.source)
      && !satisfiesTeachingPrerequisite(input.knowledgeStatuses[edge.source]))) return [];
    const matching = input.microPaths.filter(path => path.nodeId === node.nodeId);
    const required = matching.filter(path => path.required);
    return (required.length ? required : matching).filter(path => !input.completedMicroPathIds.includes(path.id))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(path => ({
        id: JSON.stringify(['micro', input.courseId, path.id]), kind: 'micro' as const,
        courseId: input.courseId, knowledgeId: node.nodeId, resourceId: path.id,
        criterionIds: [...new Set(criterionIdsByPath.get(path.id) ?? [])].sort(),
        navigationAction: { kind: node.state === 'underway' ? 'review' as const : 'next' as const,
          nodeId: node.nodeId, resourceKind: 'micro' as const, resourceId: path.id,
          reasonCode: node.state === 'underway' ? 'resume_required_micro' : 'begin_required_micro',
          reason: node.state === 'underway' ? '继续或复习尚未完成的必修 Micro。' : '从该 Knowledge 的必修 Micro 开始。' },
      }));
  });
}

export const FixedPolicy: RecommendationPolicy = {
  key: 'fixed', version: 'fixed-course-rule-v4-v1',
  recommend({ baseline }, candidates) {
    const selectedAction = candidates.find(candidate => candidate.resourceId === baseline.nextAction.resourceId
      && candidate.knowledgeId === baseline.nextAction.nodeId) ?? null;
    return { selectedAction, reasonCode: baseline.nextAction.reasonCode, reason: baseline.nextAction.reason };
  },
};
export const RulePolicy: RecommendationPolicy = {
  key: 'rule_v1', version: 'rule-v1',
  recommend(context, candidates) {
    // A recorded failed observation is useful even when its support is still low.
    // Unknown never enters this set; there is no probabilistic or weighted score.
    const insufficient = new Set(context.states.filter(state => state.attainment === 'insufficient' && state.evidenceCount > 0).map(state => state.criterionId));
    const selectedAction = candidates.find(candidate => candidate.criterionIds.some(id => insufficient.has(id)));
    return selectedAction
      ? { selectedAction, reasonCode: 'criterion_insufficient', reason: '先继续与最近未通过的检查对应的学习内容。' }
      : FixedPolicy.recommend(context, candidates);
  },
};
const registry: Record<RecommendationPolicyKey, RecommendationPolicy> = { fixed: FixedPolicy, rule_v1: RulePolicy };
export const modelPolicy: ModelPolicy = { key: 'model', status: 'unsupported' };
export function resolveRecommendationPolicy(key: unknown): RecommendationPolicy {
  if (key == null) return FixedPolicy;
  if (key === 'fixed' || key === 'rule_v1') return registry[key];
  throw new Error('Unsupported recommendation policy');
}

export function recommend(input: NavigationEngineInput, states: Parameters<RecommendationPolicy['recommend']>[0]['states'], mapping: ReadonlyMap<string, string[]>, key: unknown) {
  const baseline = computeNavigationPlan(input);
  const candidates = generateCandidates(input, mapping);
  const policy = resolveRecommendationPolicy(key);
  const selection = policy.recommend({ baseline, states }, candidates);
  if (selection.selectedAction && !candidates.includes(selection.selectedAction)) throw new Error('Policy selected an ineligible action');
  const safeBaseline = !selection.selectedAction && baseline.nextAction.resourceKind === 'micro'
    ? { ...baseline, nextAction: { kind: 'remediation' as const, resourceKind: 'course' as const,
        nodeId: baseline.nextAction.nodeId, reasonCode: 'teaching_prerequisite_required', reason: '先完成当前学习内容的前置 Knowledge。' } }
    : baseline;
  return { baseline: safeBaseline, candidates, policy, selection };
}
