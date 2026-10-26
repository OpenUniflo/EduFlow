import type { JsonValue, ResourceReferenceRow } from "../domain/v2/types";

/** The five resource-center categories. The platform runtime environment is deliberately not one of them. */
export type ResourceSection = "providers" | "apis" | "mcp" | "functions" | "variables";

/** Called after a resource version is published; `content` is the published connection content. */
export type ResourceCreated = (ref: string, version: number, content?: Record<string, JsonValue>) => void;

/** A node-level "create here" request. The dialog keeps the intent section visible until the user closes it. */
export type ResourceIntent = {
  kind: "create";
  section: ResourceSection;
  onCreated: ResourceCreated;
};

/** Alias used by wiring code that names the intent after the dialog. */
export type ResourceCenterIntent = ResourceIntent;

/** Props of the L3 resource-center dialog. Environment identity is internal and never shown. */
export type ResourceCenterProps = {
  open: boolean;
  environmentRef: string;
  initialSection?: ResourceSection;
  intent?: ResourceIntent;
  onClose: () => void;
  onOpenReference?: (row: ResourceReferenceRow) => void;
  onResourcesChanged?: () => void;
};

/** Shared props of one resource-center section. */
export type ResourceSectionProps = {
  environmentRef: string;
  create?: boolean;
  onCreated?: ResourceCreated;
  onResourcesChanged?: () => void;
  onOpenReference?: (row: ResourceReferenceRow) => void;
};

export type ResourceSectionMeta = {
  id: ResourceSection;
  label: string;
  hint: string;
};

export const RESOURCE_SECTIONS: readonly ResourceSectionMeta[] = [
  { id: "providers", label: "模型供应商", hint: "一个供应商保存一条连接，节点从已启用的模型里选择。" },
  { id: "apis", label: "API", hint: "每个连接保存地址、参数和认证方式，节点只引用连接本身。" },
  { id: "mcp", label: "MCP 服务", hint: "MCP 服务连接；测试会列出可发现的工具。" },
  { id: "functions", label: "函数", hint: "函数在资源编辑器中编写并发布为固定版本。" },
  { id: "variables", label: "变量", hint: "变量按环境保存不同的值；整表保存后，新的运行使用新配置。" },
];

export function resourceSectionMeta(section: ResourceSection): ResourceSectionMeta {
  return RESOURCE_SECTIONS.find(item => item.id === section) ?? RESOURCE_SECTIONS[0];
}
