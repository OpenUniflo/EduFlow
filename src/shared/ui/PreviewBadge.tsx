import "./ui.css";

/** Visible marker every Feature Preview region must carry. */
export function PreviewBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`ef-ui-preview-badge ${className}`.trim()} data-preview="sample" role="note" aria-label="预览：示例数据，只读，不会保存">
      <span className="ef-ui-preview-dot" aria-hidden="true" />
      预览 · 示例数据
    </span>
  );
}
