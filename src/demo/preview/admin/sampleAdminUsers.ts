import type { AdminPreviewUser } from "@/features/admin/users/adminUsersPreview";

/** Obviously synthetic N17 identities. Never real people, roles or activity. */
export const sampleAdminUsers: readonly AdminPreviewUser[] = [
  { id: "preview-user-chen", displayName: "示例 · 陈老师", handle: "preview_u_6313", email: "preview-chen@example.eduflow.local", roles: ["teacher"], organization: "示例 · 教学中心", lastActive: "10 分钟前", status: "active", accent: "orange" },
  { id: "preview-user-lin", displayName: "示例 · 林管理", handle: "preview_u_6086", email: "preview-lin@example.eduflow.local", roles: ["admin", "student"], organization: "示例 · 平台组", lastActive: "刚刚", status: "active", accent: "brand" },
  { id: "preview-user-zhou", displayName: "示例 · 周敏", handle: "preview_u_3543", email: "preview-zhou@example.eduflow.local", roles: ["teacher"], organization: "示例 · 教学中心", lastActive: "2 小时前", status: "active", accent: "cyan" },
  { id: "preview-user-wang", displayName: "示例 · 王子航", handle: "preview_u_6277", email: "preview-wang@example.eduflow.local", roles: ["student"], organization: "示例 · 数据组", lastActive: "3 天前", status: "pending", accent: "rose" },
  { id: "preview-user-li", displayName: "示例 · 李楠", handle: "preview_u_9422", email: "preview-li@example.eduflow.local", roles: ["admin"], organization: "示例 · 平台组", lastActive: "1 小时前", status: "active", accent: "brand" },
  { id: "preview-user-zhao", displayName: "示例 · 赵一帆", handle: "preview_u_9251", email: "preview-zhao@example.eduflow.local", roles: ["student"], organization: "示例 · 设计组", lastActive: "2 周前", status: "disabled", accent: "quiet" },
  { id: "preview-user-sun", displayName: "示例 · 孙悦", handle: "preview_u_4127", email: "preview-sun@example.eduflow.local", roles: ["teacher"], organization: "示例 · 教学中心", lastActive: "昨天", status: "active", accent: "orange" },
  { id: "preview-user-he", displayName: "示例 · 何雨", handle: "preview_u_5941", email: "preview-he@example.eduflow.local", roles: ["student"], organization: "示例 · 数据组", lastActive: "昨天", status: "active", accent: "cyan" },
  { id: "preview-user-guo", displayName: "示例 · 郭城", handle: "preview_u_6579", email: "preview-guo@example.eduflow.local", roles: ["teacher", "student"], organization: "示例 · 教学中心", lastActive: "4 天前", status: "pending", accent: "rose" },
  { id: "preview-user-tang", displayName: "示例 · 唐宁", handle: "preview_u_1201", email: "preview-tang@example.eduflow.local", roles: ["student"], organization: "示例 · 运营组", lastActive: "2 天前", status: "active", accent: "blue" },
  { id: "preview-user-qin", displayName: "示例 · 秦舟", handle: "preview_u_7702", email: "preview-qin@example.eduflow.local", roles: ["student"], organization: "示例 · 运营组", lastActive: "5 天前", status: "pending", accent: "quiet" },
  { id: "preview-user-yu", displayName: "示例 · 余青", handle: "preview_u_8834", email: "preview-yu@example.eduflow.local", roles: ["teacher"], organization: "示例 · 未来课堂", lastActive: "6 小时前", status: "active", accent: "cyan" }
];
