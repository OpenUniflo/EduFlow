import { BookOpen, X } from "lucide-react";
import { applicationServices } from "@/app/services/applicationServices";
import { sortMaterialSegments } from "@/features/material/materialOrdering";
import { MaterialPageView } from "@/features/material/reader/MaterialPageView";
import { PanelActions } from "./PanelActions";

/**
 * The material panel shows the active segment through the reader's own page
 * renderer. Its single expand action opens the reader page at that segment;
 * there is no second, panel-only material presentation.
 */
export function MaterialPanel({ courseId, materialId, segmentId, onClose }: {
  courseId: string;
  materialId: string;
  segmentId?: string;
  onClose(): void;
}) {
  const material = applicationServices.courseRepository.getCourse(courseId)?.materials.find((item) => item.id === materialId);
  const segments = material ? sortMaterialSegments(material) : [];
  const segment = segments.find((item) => item.id === segmentId) ?? segments[0];
  const readerHref = `/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}${segment ? `?segment=${encodeURIComponent(segment.id)}` : ""}`;

  if (!material) {
    return <aside className="ef-object-panel" aria-label="资料面板">
      <header className="ef-object-panel-head"><div><span>资料</span><h2>资料暂时无法加载</h2></div><button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭资料面板"><X size={15} /></button></header>
      <div className="ef-object-panel-body"><p className="ef-object-empty">这份资料可能已下架或不可见。</p></div>
    </aside>;
  }

  if (!segment) {
    return <aside className="ef-object-panel" aria-label="资料面板">
      <header className="ef-object-panel-head"><div><span>资料</span><h2>{material.title}</h2></div><button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭资料面板"><X size={15} /></button></header>
      <div className="ef-object-panel-body"><p className="ef-object-empty">这份资料还没有可阅读的内容。</p></div>
    </aside>;
  }

  return <aside className="ef-object-panel" aria-label={`${material.title} 资料面板`}>
    <header className="ef-object-panel-head">
      <span className="ef-object-panel-icon" aria-hidden="true"><BookOpen size={16} /></span>
      <div><span>资料 · {segments.length} 段</span><h2>{material.title}</h2></div>
      <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭资料面板"><X size={15} /></button>
    </header>
    <div className="ef-object-panel-body"><MaterialPageView material={material} segment={segment} /></div>
    <footer className="ef-object-panel-foot">
      <span>{segment.page ? `第 ${segment.page} 页` : "只读资料"}</span>
      <PanelActions expand={{ kind: "page", href: readerHref }} />
    </footer>
  </aside>;
}
