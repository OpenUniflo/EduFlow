import type { UserRole } from "./types";

export function roleLabel(role: UserRole): string {
  if (role === "admin") return "管理员";
  if (role === "teacher") return "教师";
  return "学习者";
}
