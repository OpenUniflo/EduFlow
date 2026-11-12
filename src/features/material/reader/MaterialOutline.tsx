import { ChevronDown, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Material } from "@/features/course/types";
import { materialSegmentCountLabel, materialTypeLabel } from "@/shared/learning/materialPresentation";
import { sortMaterialSegments } from "../materialOrdering";
import {
  buildOutlineRows,
  groupIdForSegment,
  groupMaterialOutline,
  initialExpandedOutlineGroups
} from "./materialOutlineModel";
import { outlineWindow } from "./virtualWindow";
import "./materialOutline.css";

export function MaterialOutline({ material, activeSegmentId, collapsed, onToggle, onSelect }: {
  material: Material;
  activeSegmentId: string;
  collapsed: boolean;
  onToggle(): void;
  onSelect(segmentId: string): void;
}) {
  const ordered = useMemo(() => sortMaterialSegments(material), [material]);
  const groups = useMemo(() => groupMaterialOutline(ordered), [ordered]);
  const [expanded, setExpanded] = useState(() => initialExpandedOutlineGroups(groups, activeSegmentId));
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => buildOutlineRows(groups, expanded), [expanded, groups]);
  const visible = outlineWindow(rows, scrollTop, viewportHeight);
  const activeRow = rows.findIndex((row) => row.kind === "segment" && row.segment.id === activeSegmentId);

  // Following the reading position may enter another chapter; open that chapter
  // without folding the ones the learner opened by hand.
  useEffect(() => {
    const groupId = groupIdForSegment(groups, activeSegmentId);
    if (!groupId) return;
    setExpanded((current) => current.has(groupId) ? current : new Set([...current, groupId]));
  }, [activeSegmentId, groups]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const measure = () => setViewportHeight(list.clientHeight || 420);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list || activeRow < 0) return;
    const offset = rows.slice(0, activeRow).reduce((sum, row) => sum + row.height, 0);
    const rowHeight = rows[activeRow].height;
    if (offset < list.scrollTop || offset + rowHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, offset - list.clientHeight / 2 + rowHeight / 2), behavior: "smooth" });
    }
  }, [activeRow, rows]);

  let rowTop = visible.top;

  return <aside className="atlas-lesson-outline glass-v2">
    <button className="atlas-lesson-collapse" onClick={onToggle} aria-label="折叠课件目录">{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
    {!collapsed ? <>
      <div className="atlas-outline-head"><FileText size={16} /><span><strong>课件目录</strong><small>{materialSegmentCountLabel(material.type, ordered.length)}</small></span></div>
      <div
        className="atlas-outline-list"
        ref={listRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="atlas-outline-virtual" style={{ height: visible.totalHeight }}>
          {rows.slice(visible.start, visible.end).map((row) => {
            const top = rowTop;
            rowTop += row.height;
            if (row.kind === "group") {
              return <div className="atlas-outline-row" key={row.group.id} style={{ height: row.height, transform: `translateY(${top}px)` }}>
                <button
                  type="button"
                  className={`atlas-outline-group${row.expanded ? " is-open" : ""}`}
                  aria-expanded={row.expanded}
                  onClick={() => setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(row.group.id)) next.delete(row.group.id);
                    else next.add(row.group.id);
                    return next;
                  })}
                >
                  {row.expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                  <strong>{row.group.title}</strong>
                  <small>{materialSegmentCountLabel(material.type, row.group.segments.length)}</small>
                </button>
              </div>;
            }
            return <div className="atlas-outline-row" key={row.segment.id} style={{ height: row.height, transform: `translateY(${top}px)` }}>
              <button
                type="button"
                className={`atlas-outline-item${row.segment.id === activeSegmentId ? " active" : ""}`}
                aria-current={row.segment.id === activeSegmentId ? "true" : undefined}
                onClick={() => onSelect(row.segment.id)}
              >
                <span>{String(row.segment.page ?? row.segment.order).padStart(2, "0")}</span>
                <div>
                  <strong>{row.segment.title ?? `第 ${row.segment.page ?? row.segment.order} 页`}</strong>
                  <small>{row.segment.section ?? materialTypeLabel(material.type)}</small>
                </div>
              </button>
            </div>;
          })}
        </div>
      </div>
    </> : null}
  </aside>;
}
