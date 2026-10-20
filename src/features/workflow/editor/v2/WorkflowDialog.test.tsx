import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkflowDialog } from "./WorkflowDialog";

it("exposes an operation failure in the modal's fixed heading without interpreting server text as markup", () => {
  const onClose = vi.fn();
  const html = renderToStaticMarkup(createElement(WorkflowDialog, {
    title: "修订 112 只读预览", onClose,
    error: "保存冲突：服务器已有更新。<script>unsafe()</script>",
    children: createElement("p", null, "当前草稿仍保留"),
  }));
  const heading = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? "";
  const descriptionId = html.match(/<dialog\b[^>]*aria-describedby="([^"]+)"/)?.[1];
  expect(heading).toContain('role="alert"');
  expect(heading).toContain("保存冲突：服务器已有更新。");
  expect(descriptionId).toBeTruthy();
  expect(heading).toContain(`id="${descriptionId}"`);
  expect(heading).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("当前草稿仍保留");
  expect(onClose).not.toHaveBeenCalled();
});

it("keeps an ordinary read-only preview free of failure announcements", () => {
  const html = renderToStaticMarkup(createElement(WorkflowDialog, {
    title: "版本与恢复", onClose: () => undefined,
    children: createElement("p", null, "已有版本保持只读"),
  }));
  expect(html).toContain('aria-label="关闭版本与恢复"');
  expect(html).toContain("已有版本保持只读");
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain("aria-describedby");
});
