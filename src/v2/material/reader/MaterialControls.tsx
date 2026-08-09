import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

export function MaterialControls({ current, total, zoom, onZoom, onPrevious, onNext, onFit }: {
  current: number;
  total: number;
  zoom: number;
  onZoom(value: number): void;
  onPrevious(): void;
  onNext(): void;
  onFit(): void;
}) {
  return <div className="atlas-lesson-controls glass-v2">
    <button onClick={() => onZoom(Math.max(0.65, Number((zoom - 0.1).toFixed(2))))} aria-label="缩小课件"><ZoomOut size={16} /></button>
    <button onClick={onFit} aria-label="适合宽度"><Maximize2 size={15} /></button>
    <button onClick={() => onZoom(Math.min(1.6, Number((zoom + 0.1).toFixed(2))))} aria-label="放大课件"><ZoomIn size={16} /></button>
    <span>{Math.max(1, current)} / {total}</span>
    <button disabled={current <= 1} onClick={onPrevious} aria-label="上一页"><ChevronLeft size={16} /></button>
    <button disabled={current < 1 || current >= total} onClick={onNext} aria-label="下一页"><ChevronRight size={16} /></button>
  </div>;
}
