import { useEffect, useRef } from "react";
import type { Material } from "../../types";
import { selectPageAtReadingAnchor, type MaterialNavigationRequest, type VisiblePageCandidate } from "./materialReaderState";
import { sortMaterialSegments } from "../materialOrdering";

export function DocumentMaterialViewer({ material, activeSegmentId, zoom, navigationRequest, onVisibleSegmentChange, onNavigationSettled }: {
  material: Material;
  activeSegmentId: string;
  zoom: number;
  navigationRequest: MaterialNavigationRequest | null;
  onVisibleSegmentChange(segmentId: string): void;
  onNavigationSettled(token: number): void;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!navigationRequest) return;
    const target = rootRef.current?.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(navigationRequest.segmentId)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: navigationRequest.behavior, block: "center" });
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => onNavigationSettled(navigationRequest.token)));
    return () => window.cancelAnimationFrame(frame);
  }, [navigationRequest, onNavigationSettled]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<Element, IntersectionObserverEntry>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting ? visible.set(entry.target, entry) : visible.delete(entry.target));
      const rootRect = root.getBoundingClientRect();
      const candidates: VisiblePageCandidate[] = Array.from(visible.values()).flatMap((entry) => {
        const element = entry.target as HTMLElement;
        const segmentId = element.dataset.segmentId;
        const page = Number(element.dataset.pageNumber);
        return segmentId && Number.isFinite(page) ? [{ page, segmentId, top: entry.boundingClientRect.top, bottom: entry.boundingClientRect.bottom, intersectionRatio: entry.intersectionRatio }] : [];
      });
      const selected = selectPageAtReadingAnchor(candidates, rootRect.top, rootRect.height);
      if (selected) onVisibleSegmentChange(selected.segmentId);
    }, { root, threshold: [0.1, 0.25, 0.5, 0.75] });
    root.querySelectorAll<HTMLElement>("[data-segment-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [material, onVisibleSegmentChange]);

  return <section className="atlas-lesson-scroll" ref={rootRef}>
    <div className="atlas-lesson-pages" style={{ "--lesson-zoom": zoom } as React.CSSProperties}>
      {sortMaterialSegments(material).map((segment) => {
        const content = segment.content ?? {};
        return <article className={`atlas-lesson-slide atlas-slide-${content.visual ?? (content.table ? "comparison" : content.code ? "trace" : "overview")} ${segment.id === activeSegmentId ? "current" : ""}`} key={segment.id} data-segment-id={segment.id} data-page-number={segment.page ?? segment.order}>
          <div className="atlas-slide-number">{String(segment.page ?? segment.order).padStart(2, "0")}</div><span className="atlas-kicker">{segment.section ?? material.title}</span><h2>{segment.title}</h2>
          {content.lead ? <p className="atlas-slide-lead">{content.lead}</p> : null}
          {content.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {content.bullets?.length ? <ul>{content.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
          {content.code ? <pre><code>{content.code}</code></pre> : null}
          {content.table ? <div className="atlas-table-wrap"><table><thead><tr>{content.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{content.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={`${rowIndex}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
        </article>;
      })}
    </div>
  </section>;
}
