import "./ui.css";

/** Visible marker every Feature Preview region must carry. */
export function PreviewBadge({ className = "", label = "预览 · 示例数据", description = "预览：示例数据，只读，不会保存" }: { className?: string; label?: string; description?: string }) {
  return (
    <span className={`ef-ui-preview-badge ${className}`.trim()} data-preview="sample" role="note" aria-label={description}>
      <span className="ef-ui-preview-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
