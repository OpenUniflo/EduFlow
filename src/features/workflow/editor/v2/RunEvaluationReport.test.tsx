import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunEvaluationReport, RunEvaluationSummary } from "./RunEvaluationReport";
import type { WorkflowEvaluation, WorkflowEvaluationReport } from "../../domain/v2/types";

const report: WorkflowEvaluationReport = {
  schemaVersion: 1, promptVersion: "workflow-eval-v1", generatedAt: "2026-11-14T00:00:00Z", mode: "semantic",
  outcome: "needs_improvement", headline: "执行完成，但仍有需要改进的地方", summary: "运行成功；记录了 2 个步骤；语义评价 1/2 项通过。",
  dimensions: [
    { key: "execution", label: "执行状态", status: "passed", source: "rule", reason: "工作流运行已成功结束。", evidence: [{ label: "运行状态", value: "success" }] },
    { key: "goal_completion", label: "目标完成", status: "failed", source: "semantic", reason: "输出没有给出订单状态。", evidence: [{ label: "GEval 评分", value: "0.30" }], score: 0.3, threshold: 0.7, passed: false },
  ],
  hardFailures: [{ code: "OUTPUT_SCHEMA_MISMATCH", reason: "输出缺少必要字段", evidence: "/result" }],
  suggestions: ["检查最终输出字段。"],
  semantic: { status: "completed", reason: "语义评价已完成。", model: "fixture-model", provider: "Fixture", adapter: "deepeval-geval", deepevalVersion: "3.7.0", metrics: [] },
  trace: { complete: true, expectedNodeCount: 2, stepCount: 2, failedStepCount: 0, toolEventCount: 1, toolFailureCount: 1, toolCallCount: 1, toolRecoveredCount: 0, toolFinalFailureCount: 1 },
  rubric: { version: 3, goal: "返回订单状态", criteria: ["给出订单号", "给出状态"] },
  limitations: ["评价只读取真实运行记录。"],
};
const evaluation: WorkflowEvaluation = {
  evaluationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  workflowId: "workflow", revision: 1, trigger: "manual", status: "completed", outcome: "needs_improvement",
  mode: "semantic", semanticStatus: "completed", rubricVersion: 3, providerRef: "provider", modelRef: "fixture-model",
  report, error: null, attemptCount: 1, maxAttempts: 3, supersedesId: null,
  createdAt: "2026-11-14T00:00:00Z", startedAt: "2026-11-14T00:00:01Z", finishedAt: "2026-11-14T00:00:02Z",
};

describe("run evaluation report", () => {
  it("shows the total judgment, evidence, suggestions, rubric and retry actions", () => {
    const html = renderToStaticMarkup(<RunEvaluationReport evaluations={[evaluation]} loading={false} error="" runStatus="success" onRefresh={() => {}} onRetry={() => {}} />);
    expect(html).toContain("执行完成，但仍有需要改进的地方");
    expect(html).toContain("目标完成");
    expect(html).toContain("输出没有给出订单状态");
    expect(html).toContain("0.30");
    expect(html).toContain("检查最终输出字段");
    expect(html).toContain("标准版本 3");
    expect(html).toContain("重新评价");
    expect(html).toContain("刷新评价");
    expect(html).toContain("确定性检查未通过");
  });

  it("always offers refresh and a recovery trigger when no evaluation task is visible yet", () => {
    const html = renderToStaticMarkup(<RunEvaluationReport evaluations={[]} loading={false} error="" runStatus="success" onRefresh={() => {}} onRetry={() => {}} />);
    expect(html).toContain("尚未生成评价");
    expect(html).toContain("刷新评价");
    expect(html).toContain("重新触发评价");
    expect(html).toContain("不会重新运行工作流");
  });

  it("keeps failed evaluation errors visible and offers a retry path", () => {
    const failed: WorkflowEvaluation = { ...evaluation, status: "failed", outcome: null, report: null, error: { code: "EVALUATION_MODEL_TIMEOUT", message: "模型评价超时。" } };
    const html = renderToStaticMarkup(<RunEvaluationReport evaluations={[failed]} loading={false} error="" runStatus="success" onRefresh={() => {}} onRetry={() => {}} />);
    expect(html).toContain("本次评价没有完成");
    expect(html).toContain("模型评价超时");
    expect(html).toContain("原运行结果不受影响");
    expect(html).toContain("重新评价");
  });

  it("shows a compact summary without duplicating the report", () => {
    const html = renderToStaticMarkup(<RunEvaluationSummary evaluations={[evaluation]} loading={false} error="" onOpen={() => {}} />);
    expect(html).toContain("待改进");
    expect(html).toContain("查看报告");
    expect(html).not.toContain("目标完成");
  });
});
