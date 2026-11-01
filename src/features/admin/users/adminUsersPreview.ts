export type AdminPreviewRole = "student" | "teacher" | "admin";
export type AdminPreviewStatus = "active" | "pending" | "disabled";
export type AdminPreviewAccent = "brand" | "orange" | "cyan" | "rose" | "blue" | "quiet";

export type AdminPreviewUser = {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  roles: AdminPreviewRole[];
  organization: string;
  lastActive: string;
  status: AdminPreviewStatus;
  accent: AdminPreviewAccent;
};

export const ADMIN_ROLE_LABELS: Record<AdminPreviewRole, string> = {
  student: "学员",
  teacher: "教师",
  admin: "管理员"
};

export const ADMIN_STATUS_LABELS: Record<AdminPreviewStatus, string> = {
  active: "活跃",
  pending: "待激活",
  disabled: "已停用"
};
