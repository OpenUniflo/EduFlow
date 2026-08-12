import type { WorkflowDefinition } from "../domain/types";

export function WorkflowPreview({ template }: { template: WorkflowDefinition }) {
  const visibleNodes = template.nodes.slice(0, 5);
  const left = Math.min(...visibleNodes.map((item) => item.x));
  const top = Math.min(...visibleNodes.map((item) => item.y));
  const width = Math.max(1, Math.max(...visibleNodes.map((item) => item.x)) - left);
  const height = Math.max(1, Math.max(...visibleNodes.map((item) => item.y)) - top);
  return (
    <div className="workflow-preview" aria-hidden="true">
      <div className="preview-grid" />
      {template.edges.slice(0, 5).map((item) => {
        const from = visibleNodes.find((nodeItem) => nodeItem.id === item.from);
        const to = visibleNodes.find((nodeItem) => nodeItem.id === item.to);
        if (!from || !to) return null;
        const x1 = 18 + ((from.x - left) / width) * 144;
        const y1 = 20 + ((from.y - top) / height) * 74;
        const x2 = 18 + ((to.x - left) / width) * 144;
        const y2 = 20 + ((to.y - top) / height) * 74;
        return <span key={item.id} className={`preview-edge ${item.kind}`} style={{ left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.max(24, Math.abs(x2 - x1))}px` }} />;
      })}
      {visibleNodes.map((item) => <span key={item.id} className={`preview-node ${item.kind}`} style={{ left: `${18 + ((item.x - left) / width) * 144}px`, top: `${20 + ((item.y - top) / height) * 74}px` }} />)}
    </div>
  );
}
