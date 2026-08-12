import type { EdgeSide, FlowNode } from "../domain/types";

export type Selection = { type: "state" } | { type: "node"; id: string } | { type: "edge"; id: string } | { type: "workflow" };
export type ConfigTarget = { type: "node"; id: string } | { type: "edge"; id: string };
export type WorkflowViewMode = "gallery" | "list";
export type PortDirection = "in" | "out" | "both";
export type WorkflowNodeData = {
  node: FlowNode;
  active: boolean;
  portDirections: Partial<Record<EdgeSide, PortDirection>>;
  onQuickAdd: (sourceId: string, side: EdgeSide, payload: { label: string; kind: FlowNode["kind"] }) => void;
};
export type PopoverPosition = { x: number; y: number };
export type DragState = PopoverPosition;
export type NodeTestStatus = "idle" | "running" | "success" | "error";
export type WorkflowStatusKind = "ready" | "warning" | "blocked";
export type WorkflowHealthItem = { ok: boolean; label: string };
export type WorkflowHealthSummary = { status: WorkflowStatusKind; summary: string; guidance: string; canRun: boolean; checks: WorkflowHealthItem[] };
export const bottomTabs = ["运行结果", "执行轨迹", "节点日志"] as const;
export type BottomTab = (typeof bottomTabs)[number];
export const stateTabs = ["Schema", "代码", "历史记录"] as const;
export type StateTab = (typeof stateTabs)[number];
export const nodeWorkbenchTabs = ["配置", "测试运行", "日志"] as const;
export type NodeWorkbenchTab = (typeof nodeWorkbenchTabs)[number];
