import type { SettingsPreview } from "@/features/settings/model/settingsPreview";

/** Obviously synthetic Feature Preview values; never presented as real state. */
export const sampleSettingsPreview: SettingsPreview = {
  notifications: [
    { id: "review", label: "学习提醒", description: "每天 09:00 汇总一次", enabled: true },
    { id: "comments", label: "课程评论与提问", description: "有人回复时通知", enabled: true },
    { id: "weekly", label: "每周学习进展", description: "周一早上发送", enabled: false },
    { id: "product", label: "产品更新", description: "每月一次", enabled: false }
  ],
  devices: [
    { id: "current", name: "示例 · MacBook Pro", detail: "示例位置 · 当前设备", current: true },
    { id: "tablet", name: "示例 · iPad Air", detail: "示例位置 · 7 天前", current: false }
  ],
  privacy: {
    visibility: "private",
    learningProgress: false,
    works: false,
    heatmap: false,
    capabilityOverview: false
  }
};
