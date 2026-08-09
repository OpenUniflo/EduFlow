import { ArrowRight, ChevronLeft, ChevronRight, Network, Pin, PinOff } from "lucide-react";
import type { MaterialSegmentProjection } from "../materialProjection";

export type MaterialKnowledgeItem = MaterialSegmentProjection["knowledgeContexts"][number];

export function MaterialKnowledgeContext({ projection, pinnedKnowledge, collapsed, onToggle, onPin, onAssignment }: {
  projection: MaterialSegmentProjection | null;
  pinnedKnowledge: MaterialKnowledgeItem | null;
  collapsed: boolean;
  onToggle(): void;
  onPin(item: MaterialKnowledgeItem | null): void;
  onAssignment(assignmentId: string): void;
}) {
  const activeKnowledge = pinnedKnowledge ?? projection?.knowledgeContexts[0] ?? null;
  return <aside className="atlas-lesson-knowledge glass-v2">
    <button className="atlas-lesson-collapse" onClick={onToggle} aria-label="折叠知识上下文">{collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
    {!collapsed ? <>
      <div className="atlas-outline-head"><Network size={16} /><span><strong>Knowledge Context</strong><small>MaterialKnowledgeCoverage</small></span></div>
      {projection?.knowledgeContexts.length ? <div className="atlas-knowledge-context-list">{projection.knowledgeContexts.map((context) => <button className={activeKnowledge?.nodeId === context.nodeId ? "active" : ""} key={context.nodeId} onClick={() => onPin(context)}><span style={{ background: context.color }} /><div><strong>{context.title}</strong><small>{context.roles.join(" · ")}</small></div></button>)}</div> : <p className="atlas-material-empty">当前内容段暂无 Knowledge 映射。</p>}
      {activeKnowledge ? <section className="atlas-active-knowledge"><button className={`atlas-knowledge-pin ${pinnedKnowledge ? "active" : ""}`} onClick={() => onPin(pinnedKnowledge ? null : activeKnowledge)}>{pinnedKnowledge ? <PinOff size={12} /> : <Pin size={12} />}{pinnedKnowledge ? "取消固定" : "固定知识"}</button><div className="atlas-pill">{pinnedKnowledge ? "已固定 · 不随翻页变化" : "随当前页联动"}</div><h2>{activeKnowledge.title}</h2><p>{activeKnowledge.description}</p></section> : null}
      {projection?.assignmentContexts.length ? <section className="atlas-drawer-section"><h3>关联实训</h3><div className="atlas-assignment-switcher">{projection.assignmentContexts.map((context) => <button key={context.assignmentId} onClick={() => onAssignment(context.assignmentId)}><strong>{context.assignment.title}</strong><small>{context.state?.status ?? "not-started"}</small><ArrowRight size={13} /></button>)}</div></section> : <p className="atlas-material-empty">当前内容段暂无关联实训。</p>}
    </> : null}
  </aside>;
}
