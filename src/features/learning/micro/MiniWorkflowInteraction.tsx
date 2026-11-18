import { useEffect, useMemo, useState } from "react";
import { Background, BackgroundVariant, MarkerType, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutMicroWorkflow } from "./miniWorkflowLayout";
import "./microImmersive.css";

function nodesFor(order: string[]): Node[] {
  return layoutMicroWorkflow(order).map((box) => ({
    id: box.id,
    position: { x: box.x, y: box.y },
    data: { label: box.id },
    draggable: true,
    selectable: true,
    className: "micro-workflow-node"
  }));
}

export default function MiniWorkflowInteraction({ items, value, disabled, onChange, onReset }: { items: string[]; value: string[]; disabled: boolean; onChange(value: string[]): void; onReset(): void }) {
  const order = value.length === items.length ? value : items;
  const [nodes, setNodes] = useState<Node[]>(() => nodesFor(order));
  useEffect(() => setNodes(nodesFor(order)), [order.join("|")]);
  const edges = useMemo(() => order.slice(0, -1).map((source, index) => ({
    id: `${source}-${order[index + 1]}`,
    source,
    target: order[index + 1],
    markerEnd: { type: MarkerType.ArrowClosed },
    className: "micro-workflow-edge"
  })), [order]);
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (disabled || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <div className="micro-mini-workflow">
    <div className="micro-workflow-palette">
      <span className="micro-workflow-palette-title">节点</span>
      <ol aria-label="Workflow 连接顺序">
        {order.map((item, index) => <li key={item}>
          <span className="micro-workflow-index" aria-hidden="true">{index + 1}</span>
          <strong title={item}>{item}</strong>
          <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`${item} 前移`}>←</button>
          <button type="button" disabled={disabled || index === order.length - 1} onClick={() => move(index, 1)} aria-label={`${item} 后移`}>→</button>
        </li>)}
      </ol>
      <p className="micro-workflow-help">拖动右侧节点调整顺序；也可用这里的按钮。</p>
      <button type="button" className="atlas-secondary micro-workflow-reset" disabled={disabled} onClick={onReset}>重置</button>
    </div>
    <div className="micro-workflow-canvas" aria-label="可拖动 Mini Workflow 画布">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => setNodes((current) => changes.reduce((all, change) => change.type === "position" ? all.map((node) => node.id === change.id ? { ...node, position: change.position ?? node.position } : node) : all, current))}
        onNodeDragStop={(_, dragged) => {
          if (disabled) return;
          const next = nodes.map((node) => node.id === dragged.id ? dragged : node).sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y).map((node) => node.id);
          onChange(next);
        }}
        nodesDraggable={!disabled}
        nodesConnectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line-strong)" />
      </ReactFlow>
    </div>
  </div>;
}
