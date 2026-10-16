import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("serves a same-origin embeddable graph", () => {
  const html = readFileSync("public/dynamic-workspace/graph/index.html", "utf8");
  expect(html).toContain('src="app.js');
  expect(html).toContain('href="styles.css');
  expect(html).toContain('get("bare")');
  expect(html).not.toContain("127.0.0.1:8765");
});
