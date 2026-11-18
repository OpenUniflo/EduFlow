import type { SettingsPreview } from "@/features/settings/model/settingsPreview";

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (!name) return "显示名称不能为空。";
  if (name.length > 40) return "显示名称不能超过 40 个字符。";
  return null;
}

export function validateNewPassword(newPassword: string, confirmPassword: string): string | null {
  if (!newPassword) return "请输入新密码。";
  if (newPassword.length < 8 || !/[a-z]/i.test(newPassword) || !/\d/.test(newPassword)) {
    return "新密码至少 8 位，并同时包含字母和数字。";
  }
  if (newPassword !== confirmPassword) return "两次输入的新密码不一致。";
  return null;
}

export function validatePasswordChange(input: { currentPassword: string; newPassword: string; confirmPassword: string }): string | null {
  if (!input.currentPassword) return "请输入当前密码。";
  const validation = validateNewPassword(input.newPassword, input.confirmPassword);
  if (validation) return validation;
  if (input.newPassword === input.currentPassword) return "新密码不能与当前密码相同。";
  return null;
}

export const EMPTY_SETTINGS_PREVIEW: SettingsPreview = {
  notifications: [],
  devices: [],
  privacy: { visibility: "private", learningProgress: false, works: false, heatmap: false, capabilityOverview: false }
};
