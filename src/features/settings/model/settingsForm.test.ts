import { describe, expect, it } from "vitest";
import { validateDisplayName, validateNewPassword, validatePasswordChange } from "./settingsForm";

describe("settings form validation", () => {
  it("validates the display name", () => {
    expect(validateDisplayName("  ")).toBe("显示名称不能为空。");
    expect(validateDisplayName("x".repeat(41))).toBe("显示名称不能超过 40 个字符。");
    expect(validateDisplayName(" 小林 ")).toBeNull();
  });

  it("requires a current password and a strong new password", () => {
    expect(validatePasswordChange({ currentPassword: "", newPassword: "abc12345", confirmPassword: "abc12345" })).toBe("请输入当前密码。");
    expect(validatePasswordChange({ currentPassword: "old", newPassword: "short", confirmPassword: "short" })).toBe("新密码至少 8 位，并同时包含字母和数字。");
    expect(validatePasswordChange({ currentPassword: "old", newPassword: "abc12345", confirmPassword: "abc12346" })).toBe("两次输入的新密码不一致。");
    expect(validatePasswordChange({ currentPassword: "abc12345", newPassword: "abc12345", confirmPassword: "abc12345" })).toBe("新密码不能与当前密码相同。");
    expect(validatePasswordChange({ currentPassword: "old", newPassword: "abc12345", confirmPassword: "abc12345" })).toBeNull();
  });

  it("validates a recovery password without a current password", () => {
    expect(validateNewPassword("", "")).toBe("请输入新密码。");
    expect(validateNewPassword("12345678", "12345678")).toBe("新密码至少 8 位，并同时包含字母和数字。");
    expect(validateNewPassword("abc12345", "abc12345")).toBeNull();
  });
});
