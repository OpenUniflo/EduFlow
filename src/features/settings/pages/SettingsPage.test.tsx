import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MockSession } from "@/features/auth/types";
import { AuthProvider } from "@/features/auth/AuthContext";
import { SettingsPage } from "./SettingsPage";
import type { SettingsPreview } from "../model/settingsPreview";

const session: MockSession = {
  userId: "test-user",
  name: "测试同学",
  email: "test@example.com",
  role: "student",
  capabilities: [],
  createdAt: "2026-01-01",
  emailVerified: true
};

const preview: SettingsPreview = {
  notifications: [{ id: "n1", label: "学习提醒", description: "每天一次", enabled: true }],
  devices: [{ id: "d1", name: "示例 · 设备", detail: "示例位置", current: true }],
  privacy: { visibility: "private", learningProgress: false, works: false, heatmap: false, capabilityOverview: false }
};

function render() {
  return renderToStaticMarkup(
    <AuthProvider value={{ session, signIn: vi.fn(), signUp: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn() }}>
      <SettingsPage session={session} preview={preview} />
    </AuthProvider>
  );
}

describe("settings page (N26a)", () => {
  it("shows only the three decided categories and no retired surfaces", () => {
    const html = render();
    for (const category of ["账户", "通知", "隐私"]) expect(html).toContain(category);
    for (const removed of ["外观", "工作区", "导出数据", "更换头像"]) expect(html).not.toContain(removed);
  });

  it("marks every preview region and shows the verified email as read-only", () => {
    const html = render();
    expect(html.match(/预览 · 示例数据/g)).toHaveLength(3);
    expect(html).toContain("已验证");
    expect(html).not.toContain('type="email"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('role="radiogroup"');
  });
});
