import { ArrowRight, ChevronLeft, ChevronRight, Network, Pin, PinOff } from "lucide-react";
import type { AssignmentContext } from "@/features/course/types";
import type { MaterialKnowledgeContext as MaterialKnowledgeContextItem, MaterialSegmentProjection } from "../materialProjection";

export function MaterialKnowledgeContext({ projection, selectedKnowledgeId, pinnedKnowledgeId, effectiveKnowledge, knowledgeAssignmentContexts, collapsed, onToggle, onSelect, onTogglePin, onAssignment }: {
  projection: MaterialSegmentProjection | null;
  selectedKnowledgeId: string | null;
  pinnedKnowledgeId: string | null;
  effectiveKnowledge: MaterialKnowledgeContextItem | null;
  knowledgeAssignmentContexts: AssignmentContext[];
  collapsed: boolean;
  onToggle(): void;
  onSelect(nodeId: string): void;
  onTogglePin(): void;
  onAssignment(assignmentId: string): void;
}) {
  const effectiveKnowledgeId = pinnedKnowledgeId ?? selectedKnowledgeId;
  return <aside className="atlas-lesson-knowledge glass-v2">
    <button className="atlas-lesson-collapse" onClick={onToggle} aria-label="折叠知识上下文">{collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
    {!collapsed ? <>
      <div className="atlas-outline-head"><Network size={16} /><span><strong>Knowledge Context</strong><small>MaterialKnowledgeCoverage</small></span></div>
      {!pinnedKnowledgeId ? <>
        <div className="atlas-context-section-label">当前页覆盖</div>
        {projection?.knowledgeContexts.length ? <div className="atlas-knowledge-context-list">{projection.knowledgeContexts.map((context) => <button className={effectiveKnowledgeId === context.nodeId ? "active" : ""} key={context.nodeId} onClick={() => onSelect(context.nodeId)} aria-pressed={selectedKnowledgeId === context.nodeId}><span style={{ background: context.color }} /><div><strong>{context.title}</strong><small>{context.roles.join(" · ")}</small></div></button>)}</div> : <p className="atlas-material-empty">当前内容段暂无 Knowledge 映射。</p>}
        <div className="atlas-context-divider" />
      </> : null}
      <div className={`atlas-knowledge-mode ${pinnedKnowledgeId ? "pinned" : "auto"}`}><span>{pinnedKnowledgeId ? <><Pin size={12} />已固定 {effectiveKnowledge?.title ?? pinnedKnowledgeId}</> : "随内容联动"}</span><button className={`atlas-knowledge-pin ${pinnedKnowledgeId ? "active" : ""}`} disabled={!effectiveKnowledge} onClick={onTogglePin}>{pinnedKnowledgeId ? <PinOff size={12} /> : <Pin size={12} />}{pinnedKnowledgeId ? "取消固定" : "固定"}</button></div>
      {effectiveKnowledge ? <section className="atlas-active-knowledge"><h2>{effectiveKnowledge.title}</h2>{effectiveKnowledge.roles.length ? <div className="atlas-active-knowledge-roles">{effectiveKnowledge.roles.map((role) => <span key={role}>{role}</span>)}</div> : null}<p>{effectiveKnowledge.description}</p></section> : <p className="atlas-material-empty">当前页暂无可查看的 Knowledge Detail。</p>}
      {effectiveKnowledge && knowledgeAssignmentContexts.length ? <section className="atlas-drawer-section"><h3>关联实训</h3><div className="atlas-assignment-switcher">{knowledgeAssignmentContexts.map((context) => <button key={context.assignmentId} onClick={() => onAssignment(context.assignmentId)}><strong>{context.assignment.title}</strong><small>{context.state?.status ?? "not-started"}</small><ArrowRight size={13} /></button>)}</div></section> : effectiveKnowledge ? <p className="atlas-material-empty">该 KnowledgeNode 暂无关联实训。</p> : null}
    </> : null}
  </aside>;
}
