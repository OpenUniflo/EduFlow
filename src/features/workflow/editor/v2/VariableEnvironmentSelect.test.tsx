import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VariableEnvironmentSelect, environmentBadgeName } from "./VariableEnvironmentSelect";

const environments = [
  { id: "prod", name: "正式", order: 2 },
  { id: "dev", name: "开发", order: 1 },
  { id: "default", name: "仅默认值", order: 0 },
];

describe("VariableEnvironmentSelect", () => {
  it("renders a single-row merged control with the environment badge, select and resource button", () => {
    const html = renderToStaticMarkup(createElement(VariableEnvironmentSelect, { environments, value: "dev", onChange: vi.fn(), onToggleResources: vi.fn() }));
    expect(html).toContain('class="wf-variable-environment"');
    expect(html).toContain('data-config-field="变量环境"');
    expect(html).toContain(">开</span>");
    expect(html).toContain('aria-label="变量环境"');
    expect(html).toContain('aria-label="打开资源面板"');
    expect(html).toContain('title="资源"');
    expect(html).not.toContain(">变量环境<");
    expect(html.indexOf("开发")).toBeLessThan(html.indexOf("正式"));
  });

  it("uses 默 for the implicit default-only environment and when no environment exists", () => {
    expect(environmentBadgeName("仅默认值")).toBe("默");
    expect(environmentBadgeName(undefined)).toBe("默");
    expect(environmentBadgeName("正式")).toBe("正");
    const html = renderToStaticMarkup(createElement(VariableEnvironmentSelect, { environments: [], value: null, onChange: vi.fn() }));
    expect(html).toContain(">默</span>");
    expect(html).toContain("暂无变量环境");
  });

  it("shows the amber new-version dot only when the resource count is positive", () => {
    const withUpdates = renderToStaticMarkup(createElement(VariableEnvironmentSelect, { environments, value: "dev", onChange: vi.fn(), resourceUpdates: 2, resourcesOpen: true }));
    expect(withUpdates).toContain("wf-variable-environment-dot");
    expect(withUpdates).toContain('aria-pressed="true"');
    const withoutUpdates = renderToStaticMarkup(createElement(VariableEnvironmentSelect, { environments, value: "dev", onChange: vi.fn(), resourceUpdates: 0 }));
    expect(withoutUpdates).not.toContain("wf-variable-environment-dot");
  });
});
