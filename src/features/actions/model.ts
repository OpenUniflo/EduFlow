/** Global templates attach to factual edges; courses supply resources, never template copies. */
export type EdgeAction = {
  id: string;
  edge_id: string;
  type: 'micro_learning' | 'practice_task';
  title: string;
  description: string;
  estimated_minutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  resource_requirements: string[];
  required_capability_ids: string[];
  expected_evidence: string;
  status: 'active' | 'archived';
  provenance: Record<string, unknown>;
};
export type CourseActionBinding = {
  id: string;
  course_id: string;
  action_id: string;
  context: string;
  contact: string;
  instructions: string;
  resources: { key: string; label: string; reference: string; available: boolean }[];
  available: boolean;
  micro_path_id?: string | null;
  assignment_id?: string | null;
};
export type ActionRun = {
  id: string;
  user_id: string;
  course_id: string;
  action_id: string;
  binding_id: string | null;
  status: 'selected' | 'in_progress' | 'completed' | 'cancelled';
  edge_id: string;
  execution_snapshot: { action: EdgeAction; binding: CourseActionBinding | null; sourceId: string; targetId: string; repeatedFromRunId?: string | null };
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  evidence_source_id: string | null;
  micro_path_id: string | null;
  assignment_id?: string | null;
  execution_version?: number;
};
export type ActionReason = { code: 'time' | 'difficulty' | 'missing_resource' | 'missing_capability' | 'source_unacquired' | 'binding_unavailable' | 'archived' | 'micro_unavailable' | 'executor_unavailable'; message: string; cost: number };
export type ActionCost = { available: boolean; weight: number; reasons: ActionReason[] };

/** Cost units: minutes + 15 per difficulty level above 1.
 * An unacquired source and missing mandatory capabilities/resources block execution.
 * No similarity, LLM output, Course progress or Assignment completion enters this calculation.
 */
export function evaluateAction(action: EdgeAction, input: {
  sourceId: string;
  microAvailable?: boolean;
  executionAvailable?: boolean;
  acquiredIds: ReadonlySet<string>;
  binding?: CourseActionBinding;
}): ActionCost {
  const reasons: ActionReason[] = [
    { code: 'time', cost: action.estimated_minutes, message: `预计 ${action.estimated_minutes} 分钟` },
    { code: 'difficulty', cost: (action.difficulty - 1) * 15, message: `难度 ${action.difficulty}/5` },
  ];
  let available = true;
  const block = (code: ActionReason['code'], message: string) => { available = false; reasons.push({ code, message, cost: 0 }); };
  if (input.executionAvailable === false) block('executor_unavailable', '尚未配置可执行内容，或执行条件未满足');
  if (action.type === 'micro_learning' && input.microAvailable === false) block('micro_unavailable', '微学习尚未就绪：需已发布内容、有效课程路线及必需前置能力');
  if (action.status !== 'active') block('archived', '行动模板已归档');
  if (input.binding && (input.binding.action_id !== action.id || !input.binding.available)) block('binding_unavailable', '项目资源绑定不可用');
  for (const id of [...new Set(action.required_capability_ids)].sort()) {
    if (!input.acquiredIds.has(id)) block('missing_capability', `尚未具备执行条件：${id}`);
  }
  for (const key of [...new Set(action.resource_requirements)].sort()) {
    if (!input.binding?.resources.some(resource => resource.key === key && resource.available && resource.reference.trim())) block('missing_resource', `缺少可用资源：${key}`);
  }
  if (!input.acquiredIds.has(input.sourceId)) block('source_unacquired', '需要先形成起点能力，才能开始这条关系上的行动');
  return { available, weight: reasons.reduce((sum, reason) => sum + reason.cost, 0), reasons };
}

/** Recommendation order is a presentation, never an automatic user choice. */
export function rankActions<T extends { action: { id: string }; cost: ActionCost }>(alternatives: readonly T[]): T[] {
  return [...alternatives].sort((a, b) => Number(b.cost.available) - Number(a.cost.available)
    || a.cost.weight - b.cost.weight || a.action.id.localeCompare(b.action.id));
}

/** Projection only: action alternatives never add nodes, edges or inferred connectivity. */
export function projectEdgeActions(edgeIds: ReadonlySet<string>, actions: readonly EdgeAction[], bindings: readonly CourseActionBinding[], courseId: string) {
  return actions.filter(action => action.status === 'active' && edgeIds.has(action.edge_id))
    .map(action => ({ action, binding: bindings.find(binding => binding.course_id === courseId && binding.action_id === action.id) }))
    .sort((a, b) => a.action.id.localeCompare(b.action.id));
}

export type ActionData = { actions: EdgeAction[]; bindings: CourseActionBinding[]; runs: ActionRun[]; availableMicroActionIds: string[]; availableActionIds: string[]; continuableRunIds?: string[] };
export function actionAlternatives(courseId: string, edge: { id: string; source: string } | undefined, data: ActionData, acquiredIds: ReadonlySet<string>) {
  return rankActions(projectEdgeActions(new Set(edge ? [edge.id] : []), data.actions, data.bindings, courseId).map(item => ({ ...item,
    run: data.runs.find(run => run.action_id === item.action.id && run.status !== 'cancelled'),
    cost: evaluateAction(item.action, { sourceId: edge!.source, acquiredIds, binding: item.binding, microAvailable: data.availableMicroActionIds.includes(item.action.id), executionAvailable: data.availableActionIds.includes(item.action.id) }),
  })));
}
