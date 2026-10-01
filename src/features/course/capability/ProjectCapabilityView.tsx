import { useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minus, Plus, X } from 'lucide-react';
import type { KnowledgeGraph } from '@/features/knowledge/types';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseRuntimeData } from '../runtime/courseRuntime';
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from '@/features/knowledge/components/KnowledgeAtlasScene';
import { useDomainGovernance } from '@/features/knowledge/domain/domainStore';
import { buildProjectCapabilityModel, projectCapabilityAtlas } from './projectCapability';
import './projectCapability.css';

export function ProjectCapabilityView({ graph, runtime, knowledge, selectedId, onSelect, onRoute }: {
  graph: KnowledgeGraph; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[];
  selectedId: string | null; onSelect(id: string | null): void; onRoute(): void;
}) {
  const governance = useDomainGovernance();
  const scene = useRef<KnowledgeAtlasSceneHandle>(null);
  const [query, setQuery] = useState('');
  const result = useMemo(() => {
    try {
      const model = buildProjectCapabilityModel(graph, runtime, knowledge);
      return { model, projection: projectCapabilityAtlas(graph, model, governance, knowledge), error: null };
    } catch (error) { return { model: null, projection: null, error: error instanceof Error ? error.message : '能力依赖计算失败' }; }
  }, [graph, runtime, knowledge, governance]);
  const selected = result.projection?.nodes.find(node => node.id === selectedId);
  const matches = result.projection?.nodes.filter(node => `${node.title} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const roles = (node: NonNullable<typeof selected>) => [node.capabilityRoles?.current && '当前已具备', node.capabilityRoles?.course && '项目能力', node.capabilityRoles?.bridge && '中间能力'].filter(Boolean).join(' · ');
  return <section className="project-capability" aria-label="项目能力模型">
    {result.error ? <div className="project-capability-info glass-v2" role="alert"><h2>能力依赖暂时无法展示</h2><p>{result.error}</p></div> : result.projection && result.model ? <>
      <KnowledgeAtlasScene ref={scene} nodes={result.projection.nodes} edges={result.projection.edges} variant="project" selectedId={selected?.id} onNodeClick={node => onSelect(node.id)} onBackgroundClick={() => onSelect(null)} />
      <aside className="project-capability-info glass-v2"><h2>从当前能力到项目能力</h2><p>只展示真实前置关系；多个前置能力需要全部满足。</p>
        <div className="project-capability-legend"><span>斜环 · 当前已具备 {result.model.currentKnowledgeIds.length}</span><span>正环 · 项目能力 {result.model.courseKnowledgeIds.length}</span><span>横环 · 中间能力 {result.model.bridgeKnowledgeIds.length}</span></div><small>颜色表示知识领域；角色可以重叠。</small>
        {!result.model.connectedCourseKnowledgeIds.length ? <p>当前能力与课程尚无前置连接，保留课程自身能力与路线。</p> : result.model.disconnectedCourseKnowledgeIds.length ? <p>{result.model.disconnectedCourseKnowledgeIds.length} 个项目能力暂无当前能力连接，仍保留在路线中。</p> : null}
        {!result.projection.nodes.length ? <p role="status">当前课程没有可展示的有效能力。</p> : null}
        <label>查找能力<input aria-label="查找项目能力" placeholder="输入能力名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="project-capability-results">{matches.map(node => <button key={node.id} onClick={() => { onSelect(node.id); scene.current?.focus(node.id); }}><i style={{ background: node.color }} /><span>{node.title}<small>{roles(node)}</small></span></button>)}</div>
        <button className="atlas-primary" onClick={onRoute}>进入课程路线</button>
      </aside>
      <div className="project-capability-controls glass-v2"><button aria-label="放大能力模型" onClick={() => scene.current?.zoomBy(1.2)}><Plus size={18}/></button><button aria-label="缩小能力模型" onClick={() => scene.current?.zoomBy(.8)}><Minus size={18}/></button><button aria-label="适配能力模型" onClick={() => scene.current?.fit()}><Maximize2 size={18}/></button><button aria-label="聚焦所选能力" disabled={!selected} onClick={() => selected && scene.current?.focus(selected.id)}><Crosshair size={18}/></button></div>
      {selected ? <aside className="project-capability-detail glass-v2" aria-label="能力详情"><button className="atlas-panel-close" aria-label="关闭能力详情" onClick={() => onSelect(null)}><X size={17}/></button><span>{roles(selected)}</span><h2>{selected.title}</h2><p><i className="project-domain-dot" style={{ background: selected.color }}/>{selected.domainTitle}</p><p>{selected.description}</p>{selected.knowledge?.masteryCriteria.length ? <><h3>能力要求</h3><ul>{selected.knowledge.masteryCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></> : null}<p>前置关系用于学习顺序。下一步与学习内容是否可用，请查看课程路线。</p><button className="atlas-primary" onClick={onRoute}>查看课程路线</button></aside> : null}
    </> : null}
  </section>;
}
