import { ActionRunHistory } from '@/features/actions/ActionRunHistory';
import { useState } from 'react';
import type { KnowledgeGraph, KnowledgeNode } from '@/features/knowledge/types';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseSkillTreeNode } from '../types';
import type { CourseRuntimeData } from '../runtime/courseRuntime';
import { actionAlternatives, EdgeActionPanel, type useEdgeActions } from '@/features/actions/EdgeActionPanel';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';
import { relationLabel } from '@/shared/learning/routePresentation';
import type { CapabilityRelation } from '@/shared/learning/routePlanning';
import { buildMaterialDeepLink, resolveKnowledgeMaterialEntry } from '@/features/material/materialNavigation';
import { Link } from 'react-router-dom';

export const knowledgeStateLabel = { explore: '尚未具备', learning: '学习中', learned: '已学会', practicing: '实践中', mastered: '已掌握' };
export function KnowledgeNodeDetail({ node, courseNode, runtime, graph, knowledge, relations, context, actions, onSelect, initialEdgeId, learningPath }: {
  learningPath?: { id: string; title: string }; initialEdgeId?: string | null; node: KnowledgeNode; courseNode?: CourseSkillTreeNode | null; runtime: CourseRuntimeData; graph: KnowledgeGraph;
  knowledge: UserKnowledgeRecord[]; relations: readonly CapabilityRelation[];
  context: 'skill-tree' | 'personal-route' | 'project-capability'; actions: ReturnType<typeof useEdgeActions>; onSelect(id: string): void;
}) {
  const [expandedEdge, setExpandedEdge] = useState<string | null>(initialEdgeId ?? null);
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const title = (id: string) => graph.nodes.find(item => item.id === id)?.title ?? id;
  const current = knowledge.find(record => record.nodeId === node.id);
  const acquired = new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId));
  const outgoing = relations.filter(edge => edge.source === node.id);
  const incoming = relations.filter(edge => edge.target === node.id);
  const runs = actions.runs.filter(run => run.execution_snapshot.sourceId === node.id || run.execution_snapshot.targetId === node.id);
  return <div className="knowledge-node-detail" data-context={context}>
    <section className="atlas-drawer-section"><h3>当前能力</h3><strong>{knowledgeStateLabel[current?.status ?? 'explore']}</strong><p>{node.description}</p>{node.masteryCriteria.length ? <details><summary>能力要求</summary><ul>{node.masteryCriteria.map(item => <li key={item}>{item}</li>)}</ul></details> : null}</section>
    {learningPath ? <section className="atlas-drawer-section"><h3>已有学习内容</h3><p>{learningPath.title}</p><Link className="atlas-secondary" to={`/learn/micro/${encodeURIComponent(node.id)}?courseId=${encodeURIComponent(runtime.course.id)}&pathId=${encodeURIComponent(learningPath.id)}`}>打开这份学习内容</Link><small>学习前置条件仍由正式路线核验。</small></section> : null}
    <section className="atlas-drawer-section"><h3>{context === 'personal-route' ? '沿当前路线继续' : '从这里出发'}</h3>
      {!outgoing.length ? <p>当前范围没有从此能力出发的关系。</p> : outgoing.map(edge => {
        const alternatives = actionAlternatives(runtime.course.id, edge, actions, acquired);
        return <div key={edge.id} className="knowledge-relation-card"><button className="atlas-secondary" aria-expanded={expandedEdge === edge.id} onClick={() => { setExpandedEdge(expandedEdge === edge.id ? null : edge.id); setFocusedAction(alternatives[0]?.action.id ?? null); }}><span>{node.title} → {title(edge.target)}</span><small>{relationLabel(edge)} · {alternatives.length} 个行动方案</small></button>
          {expandedEdge === edge.id ? <EdgeActionPanel embedded alternatives={alternatives} title={title(edge.target)} control={actions} courseId={runtime.course.id} focusedId={focusedAction} onFocus={setFocusedAction} /> : null}
        </div>;
      })}
    </section>
    {incoming.length ? <details className="atlas-drawer-section"><summary>通向这里的关系 · {incoming.length}</summary>{incoming.map(edge => <button className="atlas-requirement interactive" key={edge.id} onClick={() => onSelect(edge.source)}><span>{title(edge.source)} → {node.title}<small>{relationLabel(edge)}</small></span></button>)}</details> : null}
    {courseNode ? <details className="atlas-drawer-section" open={context === 'skill-tree'}><summary>课程内容与实训</summary>
      <ul>{courseNode.curriculumContexts.map(item => <li key={item.id}>{runtime.lessons.find(lesson => lesson.id === item.lessonId)?.title} · {item.role}</li>)}</ul>
      <h3>学习材料</h3>{courseNode.materialContexts.length ? courseNode.materialContexts.map(item => { const material = runtime.materials.find(material => material.id === item.materialId); return material ? <p key={material.id}><Link to={buildMaterialDeepLink({ courseId: runtime.course.id, materialId: material.id, segmentId: resolveKnowledgeMaterialEntry(runtime, node.id, material.id)?.segmentId })}>{material.title}</Link></p> : null; }) : <p>暂无关联材料。</p>}
      <h3>对应实训</h3>{courseNode.assignmentContexts.length ? courseNode.assignmentContexts.map(item => <p key={item.assignment.id}><Link to={`/courses/${encodeURIComponent(runtime.course.id)}/assignments/${encodeURIComponent(item.assignment.id)}`}>{item.assignment.title}</Link></p>) : <p>暂无关联实训。</p>}
    </details> : <p className="atlas-drawer-section">此能力是路线中的补充能力，未配置本课程教学覆盖。</p>}
    <ActionRunHistory runs={runs} control={actions} courseId={runtime.course.id} acquiredIds={acquired} title={title} visibleEdgeIds={new Set(relations.map(edge => edge.id))}/>
    {actions.error ? <p role="alert">{actions.error}</p> : null}
  </div>;
}
