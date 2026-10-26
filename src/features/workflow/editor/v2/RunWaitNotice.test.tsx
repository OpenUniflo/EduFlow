import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { workflowQueueWaitMessage } from "../../domain/v2/runMessages";
import type { WorkflowRunV2 } from "../../domain/v2/types";
import { RunWaitNotice } from "./RunWaitNotice";

const run = (status: string) => ({ runId: "run", revision: 1, status, createdAt: "2026-10-24T10:00:00.000Z" }) as WorkflowRunV2;
const now = Date.parse("2026-10-24T10:00:31.000Z");

it("shows the plain wait hint for a Run queued past the grace period", () => {
  const html = renderToStaticMarkup(createElement(RunWaitNotice, { run: run("queued"), now }));
  expect(html).toContain(workflowQueueWaitMessage);
  expect(html).not.toContain("Worker");
  expect(html).not.toContain("digest");
});

it("hides the hint as soon as the Run starts", () => {
  expect(renderToStaticMarkup(createElement(RunWaitNotice, { run: run("running"), now }))).toBe("");
  expect(renderToStaticMarkup(createElement(RunWaitNotice, { run: run("success"), now }))).toBe("");
});
