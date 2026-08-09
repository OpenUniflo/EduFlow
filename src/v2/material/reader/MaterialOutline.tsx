import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { Material } from "../../types";

export function MaterialOutline({ material, activeSegmentId, collapsed, onToggle, onSelect }: {
  material: Material;
  activeSegmentId: string;
  collapsed: boolean;
  onToggle(): void;
  onSelect(segmentId: string): void;
}) {
  return <aside className="atlas-lesson-outline glass-v2">
    <button className="atlas-lesson-collapse" onClick={onToggle} aria-label="折叠课件目录">{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
    {!collapsed ? <>
      <div className="atlas-outline-head"><FileText size={16} /><span><strong>课件目录</strong><small>{material.segments.length} Pages / Segments</small></span></div>
      <div className="atlas-outline-list">{material.segments.map((segment) => <button key={segment.id} className={segment.id === activeSegmentId ? "active" : ""} aria-current={segment.id === activeSegmentId ? "true" : undefined} onClick={() => onSelect(segment.id)}><span>{String(segment.page ?? segment.order).padStart(2, "0")}</span><div><strong>{segment.title ?? `第 ${segment.page ?? segment.order} 页`}</strong><small>{segment.section ?? material.type.toUpperCase()}</small></div></button>)}</div>
    </> : null}
  </aside>;
}
