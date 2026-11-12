/**
 * One learner-facing vocabulary for Material metadata. Material coverage roles
 * are storage enum values; a reader surface must never print them directly.
 */
export type MaterialCoverageRole = "introduce" | "explain" | "example" | "practice-reference";

export const materialCoverageRoleLabel: Record<MaterialCoverageRole, string> = {
  introduce: "引入",
  explain: "讲解",
  example: "示例",
  "practice-reference": "练习参考"
};

export function materialCoverageRoleLabelFor(role: string | undefined | null): string {
  return role && role in materialCoverageRoleLabel
    ? materialCoverageRoleLabel[role as MaterialCoverageRole]
    : "关联";
}

export function materialTypeLabel(type: string | undefined | null): string {
  if (type === "pdf") return "PDF 原文";
  if (type === "article") return "图文资料";
  if (type === "document") return "文档";
  return "资料";
}

/** "共 307 页" for PDF, "共 12 段" for an article/document Material. */
export function materialSegmentCountLabel(type: string | undefined | null, count: number): string {
  return type === "pdf" ? `共 ${count} 页` : `共 ${count} 段`;
}

export function materialCoverageRoleSummary(roles: readonly string[]): string {
  return roles.map(materialCoverageRoleLabelFor).join(" · ");
}
