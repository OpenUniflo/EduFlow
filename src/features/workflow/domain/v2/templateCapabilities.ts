export type TemplateCapability = {
  kind: "model" | "tool";
  label: string;
  detail: string;
};

/**
 * Product-template capability requirements. These are presentation and creation
 * guidance; the authoritative binding is still written into the user's copy.
 */
export const templateCapabilities: Record<string, TemplateCapability[]> = {
  "product-tech-brief": [
    { kind: "model", label: "DeepSeek 模型连接", detail: "归纳检索结果并生成技术简报" },
    { kind: "tool", label: "Hacker News 检索", detail: "公开 HTTP 检索连接" },
    { kind: "tool", label: "arXiv 检索", detail: "公开 HTTP 检索连接" },
    { kind: "tool", label: "Wikipedia 检索", detail: "公开 HTTP 检索连接" },
  ],
  "product-dependency-health": [
    { kind: "model", label: "DeepSeek 模型连接", detail: "解释依赖风险与升级建议" },
    { kind: "tool", label: "PyPI 元数据", detail: "公开 HTTP 检索连接" },
    { kind: "tool", label: "npm 元数据", detail: "公开 HTTP 检索连接" },
  ],
  "product-community-triage": [
    { kind: "model", label: "DeepSeek 模型连接", detail: "归纳社区问题并给出回应草稿" },
    { kind: "tool", label: "Hacker News 检索", detail: "公开 HTTP 检索连接" },
  ],
  "product-content-review": [
    { kind: "model", label: "DeepSeek 模型连接", detail: "核对产品更新草稿中的事实主张" },
  ],
};

export function templateRequirements(templateId: string): TemplateCapability[] {
  return templateCapabilities[templateId] ?? [];
}
