import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import "./sceneInteraction.css";

/**
 * One zoom toolbar for the Archive course plane and the learner course tree.
 * Button order and copy are identical on both pages:
 *   −  100%  +   |   适配全图   回正面
 */
export function SceneZoomToolbar({
  percent,
  disabled,
  onZoomIn,
  onZoomOut,
  onFit,
  onFront,
  className = ""
}: {
  percent: number;
  disabled?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onFront: () => void;
  className?: string;
}) {
  return (
    <div className={`ef-scene-zoom ${className}`.trim()} role="group" aria-label="场景镜头">
      <button type="button" onClick={onZoomOut} disabled={disabled} aria-label="缩小"><Minus size={16} aria-hidden /></button>
      <span className="ef-scene-zoom-percent" aria-label={`当前缩放 ${percent}%`}>{percent}%</span>
      <button type="button" onClick={onZoomIn} disabled={disabled} aria-label="放大"><Plus size={16} aria-hidden /></button>
      <i className="ef-scene-zoom-div" aria-hidden />
      <button type="button" className="ef-scene-zoom-wide" onClick={onFit} disabled={disabled} aria-label="适配全图"><Maximize2 size={15} aria-hidden /><span className="ef-scene-zoom-label">适配全图</span></button>
      <button type="button" className="ef-scene-zoom-wide" onClick={onFront} disabled={disabled} aria-label="回正面"><RotateCcw size={15} aria-hidden /><span className="ef-scene-zoom-label">回正面</span></button>
    </div>
  );
}
