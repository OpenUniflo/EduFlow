import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DynamicWorkspacePage } from "./DynamicWorkspacePage";

it("shows the chat workspace prototype instead of a bare graph", () => {
  const html = renderToStaticMarkup(<DynamicWorkspacePage />);
  expect(html).toContain('src="/dynamic-workspace/prototype.html"');
  expect(html).not.toContain("127.0.0.1:8765");
  const prototype = readFileSync("public/dynamic-workspace/prototype.html", "utf8");
  expect(prototype).toContain("工作台");
  expect(prototype).toContain("目标与进展");
  expect(prototype).toContain("/dynamic-workspace/graph/index.html?embed=1&view=");
  expect(prototype).not.toContain("127.0.0.1:8765");
});
