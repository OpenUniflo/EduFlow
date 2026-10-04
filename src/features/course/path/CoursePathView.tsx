import { useEffect, useMemo, useState } from 'react';
import { BaseEdge, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import type { ElkNode } from 'elkjs/lib/elk-api';
import '@xyflow/react/dist/style.css';
import { layoutCourseRoute, courseEdgePath } from '../graph/elkCourseLayout';
import { relationLabel } from '@/shared/learning/routePresentation';
import type { CourseNavigatorModel } from './courseNavigatorProjection';
import './coursePath.css';

type RouteNodeData = { item: CourseNavigatorModel['route'][number]; select(id: string): void };
function RouteNode({ data }: NodeProps<Node<RouteNodeData>>) {
  const { item } = data;
  return <><Handle type="target" position={Position.Top}/><button className={`route-knowledge ${item.acquired ? 'acquired' : item.bridge ? 'intermediate' : 'target'} ${item.state}`} onClick={() => data.select(item.node.id)} aria-label={`${item.node.title}，查看能力详情`}>
    <small>{item.acquired ? '已具备' : item.state === 'locked' ? '前置未满足 · 可查看' : item.bridge ? '中间能力' : '项目目标'}</small><strong>{item.node.title}</strong><span>查看能力与行动 →</span>
  </button><Handle type="source" position={Position.Bottom}/></>;
}
function RouteEdge({ data, markerEnd, style }: EdgeProps<Edge<{ path: string }>>) {
  return <BaseEdge path={data?.path ?? ''} markerEnd={markerEnd} style={style}/>;
}
const nodeTypes = { route: RouteNode };
const edgeTypes = { route: RouteEdge };
export function CoursePathView({ model, targetOutcome, onInspectCapabilities, onSelect }: { model: CourseNavigatorModel; targetOutcome?: string; onInspectCapabilities?(nodeId?: string): void; onSelect(nodeId: string): void }) {
  const structure = JSON.stringify([model.courseId, model.route.map(item => item.node.id), model.relations.map(edge => ({ id: edge.id, source: edge.source, target: edge.target }))]);
  const [layout, setLayout] = useState<{ key: string; result?: ElkNode; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    const [courseId, ids, edges] = JSON.parse(structure) as [string, string[], { id: string; source: string; target: string }[]];
    void layoutCourseRoute(courseId, ids, edges).then(result => { if (active) setLayout({ key: structure, result }); }).catch(() => { if (active) setLayout({ key: structure, error: '路线布局暂时无法加载。' }); });
    return () => { active = false; };
  }, [structure]);
  const result = layout?.key === structure ? layout.result : undefined;
  const nodes = useMemo(() => (result?.children ?? []).flatMap(node => {
    const item = model.route.find(item => item.node.id === node.id);
    return item ? [{ id: node.id, type: 'route', position: { x: node.x ?? 0, y: node.y ?? 0 }, data: { item, select: onSelect }, width: 224, height: 112 }] : [];
  }), [result, model.route, onSelect]);
  const edges = (result?.edges ?? []).flatMap(edge => {
    const fact = model.relations.find(fact => fact.id === edge.id);
    return fact ? [{ id: fact.id, source: fact.source, target: fact.target, type: 'route', data: { path: courseEdgePath(edge) }, ariaLabel: relationLabel(fact), markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }, style: { stroke: '#64748b', strokeWidth: fact.relation === 'prerequisite' && fact.strength === 'hard' ? 2.2 : 1.4, strokeDasharray: fact.relation === 'enables' ? '3 6' : fact.strength === 'soft' ? '8 5' : undefined } }] : [];
  });
  return <section className="navigator-path" aria-label="学习路线">
    <header className="navigator-path-heading"><span className="atlas-kicker">当前个人路线</span><h2>从已有能力，走向项目目标</h2><p>{targetOutcome ?? '沿真实能力关系选择下一步行动。'}</p><p>已具备 {model.route.filter(item => item.acquired).length} 项 · 待形成 {model.route.filter(item => !item.acquired).length} 项。行动完成和能力状态分别记录。</p>{onInspectCapabilities ? <button className="navigator-locate" onClick={() => onInspectCapabilities()}>调整路线与查看能力关系 →</button> : null}</header>
    <p className="route-canvas-hint">拖动平移 · 使用左下角控件缩放或查看完整路线</p>
    <p className="route-relation-legend"><span>━ 必要前置</span><span>┄ 推荐前置</span><span>┈ 能力支撑 · 非门槛</span></p>
    {!model.route.length ? <p role="status">当前没有可展示的路线节点。</p> : result ? <div className="course-route-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} defaultViewport={{ x: 24, y: 24, zoom: 0.85 }} minZoom={0.2} maxZoom={1.5} aria-label="真实能力关系路线"><Controls showInteractive={false}/></ReactFlow></div> : <p role={layout?.error ? 'alert' : 'status'}>{layout?.error ?? '正在排列能力关系…'}</p>}
    <details className="route-accessible-relations"><summary>查看全部能力与真实关系</summary><ul>{model.route.map(item => <li key={item.node.id}><button onClick={() => onSelect(item.node.id)}>{item.node.title}</button></li>)}</ul><ul>{model.relations.map(edge => <li key={edge.id} data-edge-id={edge.id}>{model.route.find(item => item.node.id === edge.source)?.node.title ?? edge.source} → {model.route.find(item => item.node.id === edge.target)?.node.title ?? edge.target} · {relationLabel(edge)}</li>)}</ul></details>
  </section>;
}
