export type NodeKind = "system" | "function" | "transform" | "llm" | "agent" | "tool" | "http" | "database" | "file" | "router" | "loop" | "output";
export type EdgeKind = "normal";
export type EdgeSide = "top" | "right" | "bottom" | "left";

export type FlowNode = {
  id: string;
  label: string;
  subtitle: string;
  kind: NodeKind;
  x: number;
  y: number;
  reads: string[];
  writes: string[];
  logic: string;
  code?: string;
  codeReview?: { before: string; after: string; summary: string };
  codeSnapshots?: string[];
  control?: { branches: string[] };
  status?: "idle" | "running" | "success";
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  sourceHandle?: string;
  targetHandle?: string;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  runOrder: string[];
  result: string;
  code: string;
  /** Optional template-level starting assets shown by the generic editor. */
  inheritedAssets?: string[];
  reliabilityNotes?: string[];
};

// Compatibility name used by the current UI and persisted v2 payload.
export type Template = WorkflowDefinition;

export type CreateNodePayload = {
  label: string;
  kind: NodeKind;
  position?: { x: number; y: number };
};

export type RenameNodeResult = { ok: true; name: string } | { ok: false; message: string };

export type Field = {
  name: string;
  type: string;
  defaultValue: string;
  note: string;
};

export type CodeFile = { path: string; title: string; code: string };

export type NodePositionMap = Record<string, { x: number; y: number }>;
