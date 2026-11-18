import { assistantPlugins } from "./plugins/index.js";

/** Core tools live outside feature plugins but still declare their own copy. */
const coreToolProgress: Record<string, string> = {
  getCurrentContext: "读取当前对象",
  displayCard: "整理回答卡片"
};

export const assistantToolProgress: Record<string, string> = Object.assign(
  {},
  coreToolProgress,
  ...assistantPlugins.map((plugin) => plugin.progress)
);

export function assistantToolProgressLabel(toolName: string): string {
  return assistantToolProgress[toolName] ?? "读取产品数据";
}
