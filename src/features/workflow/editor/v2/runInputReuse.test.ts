import { expect, it } from "vitest";
import type { WorkflowRunV2 } from "../../domain/v2/types";
import { pointerLabel, reusableRunInput, reuseReasonLabel, runRevisionNotice } from "./runInputReuse";

const base: WorkflowRunV2 = {
  runId: "run", workflowId: "workflow", revision: 2, mode: "live", verification: "unverified", status: "failed",
  definitionHash: "definition", semanticHash: "semantic", compileFingerprint: "fingerprint", environmentRef: "local", environmentRevision: "1", policyVersion: "1",
  createdAt: "2026-10-21T00:00:00Z", lastSeq: 1,
};

it("rebuilds the run dialog input from the safe snapshot fields", () => {
  const run: WorkflowRunV2 = { ...base, inputReuse: { available: true, complete: true, fields: [
    { pointer: "/question", value: "HN 上怎么评价 htmx？" },
    { pointer: "/count", value: 0 },
    { pointer: "/nested/enabled", value: false },
    { pointer: "/nested/empty", value: null },
    { pointer: "/a~1b~0c", value: "escaped" },
  ] } };
  expect(reusableRunInput(run)).toEqual({
    available: true,
    complete: true,
    input: { question: "HN 上怎么评价 htmx？", count: 0, nested: { enabled: false, empty: null }, "a/b~c": "escaped" },
    omissions: [],
  });
});

it("keeps sensitive, redacted and missing fields out of the prefilled input and reports them", () => {
  const run: WorkflowRunV2 = { ...base, inputReuse: { available: true, complete: false, fields: [
    { pointer: "/question", value: "HN 上怎么评价 htmx？" },
  ], removedFields: [{ pointer: "/token", reason: "sensitive" }, { pointer: "/secret", reason: "redacted" }, { pointer: "", reason: "missing" }] } };
  const reuse = reusableRunInput(run);
  expect(reuse.input).toEqual({ question: "HN 上怎么评价 htmx？" });
  expect(reuse.complete).toBe(false);
  expect(reuse.omissions).toEqual([{ pointer: "/token", reason: "sensitive" }, { pointer: "/secret", reason: "redacted" }, { pointer: "", reason: "missing" }]);
});

it("does not prefill when the run has no reusable snapshot", () => {
  expect(reusableRunInput(undefined)).toEqual({ available: false, complete: false, input: {}, omissions: [] });
  expect(reusableRunInput({ ...base, inputReuse: { available: false, reason: "missing" } })).toEqual({ available: false, complete: false, input: {}, omissions: [] });
});

it("uses the existing revision-mismatch wording only across revisions", () => {
  expect(runRevisionNotice(2, 2)).toBeUndefined();
  expect(runRevisionNotice(2, 3)).toBe("此运行使用的是保存版本 2；当前编辑为保存版本 3。复用输入会创建当前版本的新运行，不会重放原版本；可先用“查看执行版本的定义与布局”核对。");
});

it("labels snapshot pointers and omission reasons for the dialog", () => {
  expect(pointerLabel("/question")).toBe("question");
  expect(pointerLabel("/nested/a~1b~0c")).toBe("nested / a/b~c");
  expect(pointerLabel("", "全部外部调用数据")).toBe("全部外部调用数据");
  expect(reuseReasonLabel("sensitive")).toBe("敏感字段，需要重新填写");
  expect(reuseReasonLabel("redacted")).toBe("历史值已脱敏，需要重新填写");
  expect(reuseReasonLabel("missing")).toBe("历史记录中缺少完整值");
  expect(reuseReasonLabel("unknown")).toBe("此字段不可从历史复用");
});
