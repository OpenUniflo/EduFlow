import type { KnowledgeNode, KnowledgeNodeType } from "../types";

export const DEMO_TIME = "2026-08-01T00:00:00.000Z";

function criteria(title: string, type: KnowledgeNodeType) {
  const action = type === "procedural" ? "独立完成" : type === "representational" ? "正确解释并使用" : type === "meta" ? "判断适用条件并运用" : "清楚解释";
  return [
    `能${action}${title}的核心目标与边界`,
    `能在具体场景中识别${title}的正确用法与常见误用`,
    `能用可检查的示例证明对${title}的掌握`
  ];
}

function globalNode(
  id: string,
  title: string,
  provenanceSourceId: string,
  description: string,
  type: KnowledgeNodeType,
  masteryCriteria = criteria(title, type),
  tags?: string[]
): KnowledgeNode {
  return {
    id,
    title,
    description,
    type,
    masteryCriteria,
    scope: "global",
    provenance: [{ sourceType: "global-catalog", sourceId: provenanceSourceId, discoveredAt: DEMO_TIME }],
    currentRevisionId: `${id}-r1`,
    status: "active",
    createdAt: DEMO_TIME,
    updatedAt: DEMO_TIME,
    tags
  };
}

export const agenticNode = (id: string, title: string, description: string, type: KnowledgeNodeType, mastery?: string[], tags?: string[]) =>
  globalNode(id, title, "agentic-ai-knowledge-v1", description, type, mastery, tags);

export const pythonNode = (id: string, title: string, description: string, type: KnowledgeNodeType = "conceptual") =>
  globalNode(id, title, "python-engineering-knowledge-v1", description, type);

export const splitPythonNode = (id: string, title: string, description: string, splitFrom: string, type: KnowledgeNodeType = "conceptual") => ({
  ...pythonNode(id, title, description, type),
  splitFrom
});

export const legacyAgenticNode = (id: string, title: string, supersededBy: string[]) => ({
  ...agenticNode(id, title, "Knowledge Architecture v1 前的复合节点，仅为历史 identity 与 lineage 保留。", "meta", ["历史节点不再直接评测；应使用其原子 successor 的 mastery criteria。"]),
  status: "superseded" as const,
  supersededBy
});

export const legacyPythonNode = (id: string, title: string, supersededBy: string[]) => ({
  ...pythonNode(id, title, "Knowledge Architecture v1 前的 Python 复合节点，仅为稳定 identity 与 lineage 保留。", "meta"),
  status: "superseded" as const,
  supersededBy
});
