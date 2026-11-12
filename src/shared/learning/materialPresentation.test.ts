import { describe, expect, it } from "vitest";
import {
  materialCoverageRoleLabelFor,
  materialCoverageRoleSummary,
  materialSegmentCountLabel,
  materialTypeLabel
} from "./materialPresentation";

describe("material presentation vocabulary", () => {
  it("maps every coverage role to learner Chinese and never leaks the enum", () => {
    expect(materialCoverageRoleLabelFor("introduce")).toBe("引入");
    expect(materialCoverageRoleLabelFor("explain")).toBe("讲解");
    expect(materialCoverageRoleLabelFor("example")).toBe("示例");
    expect(materialCoverageRoleLabelFor("practice-reference")).toBe("练习参考");
    expect(materialCoverageRoleLabelFor("unknown")).toBe("关联");
    expect(materialCoverageRoleSummary(["introduce", "practice-reference"])).toBe("引入 · 练习参考");
  });

  it("labels PDF pages and other Materials without internal type names", () => {
    expect(materialTypeLabel("pdf")).toBe("PDF 原文");
    expect(materialTypeLabel("article")).toBe("图文资料");
    expect(materialTypeLabel("document")).toBe("文档");
    expect(materialSegmentCountLabel("pdf", 307)).toBe("共 307 页");
    expect(materialSegmentCountLabel("article", 12)).toBe("共 12 段");
  });
});
