import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, ApiResponseError } from "@/shared/api/apiClient";
import { WorkflowApiV2, WorkflowRequestError, workflowErrorMessage } from "./WorkflowApiV2";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/apiClient", async importOriginal => ({
  ...await importOriginal<typeof import("@/shared/api/apiClient")>(),
  apiRequest: request,
}));

describe("Workflow request failures", () => {
  beforeEach(() => request.mockReset());

  it("reports an interrupted read in Chinese without retrying it", async () => {
    const failure = new TypeError("Failed to fetch");
    request.mockRejectedValueOnce(failure);
    const result = await new WorkflowApiV2().environments().catch(error => error);
    expect(result).toBeInstanceOf(WorkflowRequestError);
    expect(result.message).toContain("检查连接与登录状态");
    expect(result.cause).toBe(failure);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves a definitive server rejection and its diagnostic identities", async () => {
    const rejection = new ApiRequestError("FORBIDDEN", "Not permitted", 403, { requestId: "request-403" });
    request.mockRejectedValueOnce(rejection);
    const result = await new WorkflowApiV2().createRun("workflow", 1, {}, "environment", "key").catch(error => error);
    expect(result).toBe(rejection);
    expect(result).not.toBeInstanceOf(WorkflowRequestError);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps a transport-interrupted submission uncertain and never fabricates a Run", async () => {
    request.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await new WorkflowApiV2().createRun("workflow", 1, {}, "environment", "key").catch(error => error);
    expect(result).toBeInstanceOf(WorkflowRequestError);
    expect(result).not.toBeInstanceOf(ApiRequestError);
    expect(result.runId).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    const submitted = request.mock.calls[0][1];
    expect(submitted.headers["Idempotency-Key"]).toBe("key");
    expect(JSON.parse(submitted.body)).toEqual({ workflowId: "workflow", revision: 1, input: {}, environmentRef: "environment" });
  });

  it.each([
    {}, null,
    { runId: "", revision: 1, status: "queued" },
    { runId: "not-a-run-uuid", revision: 1, status: "queued" },
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 2, status: "queued" },
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "unknown" },
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "expired" },
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "queued", historyExpired: true },
  ])("rejects an incomplete or mismatched successful submission receipt as uncertain: %j", async body => {
    request.mockResolvedValueOnce(body);
    const result = await new WorkflowApiV2().createRun("workflow", 1, {}, "environment", "original-key").catch(error => error);
    expect(result).toBeInstanceOf(ApiResponseError);
    expect(result).not.toBeInstanceOf(ApiRequestError);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].headers["Idempotency-Key"]).toBe("original-key");
  });

  it.each([
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "queued", eventsCursor: 0 },
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "success", historyExpired: false },
    { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "expired", historyExpired: true },
  ])("accepts a new or same-key replay receipt without requiring an events cursor: %j", async receipt => {
    request.mockResolvedValueOnce(receipt);
    await expect(new WorkflowApiV2().createRun("workflow", 1, {}, "environment", "key")).resolves.toEqual(receipt);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([[403, "操作权限"], [429, "已达上限"], [503, "执行服务暂不可用"]])("translates HTTP %s without mutating its certainty or leaking the raw server message", (status, message) => {
    const diagnostics = [{ code: "INVALID_SCHEMA", pointer: "/inputSchema" }];
    const details = { requestId: "request-id", diagnostics };
    const rejection = new ApiRequestError("SERVER_CODE", "Internal English detail", status, details);
    expect(workflowErrorMessage(rejection)).toContain(message);
    expect(workflowErrorMessage(rejection)).toContain(`HTTP ${status}`);
    expect(workflowErrorMessage(rejection)).toContain("request-id");
    expect(workflowErrorMessage(rejection)).not.toContain("Internal English detail");
    expect(rejection.status).toBe(status); expect(rejection.code).toBe("SERVER_CODE");
    expect(rejection.details).toBe(details); expect(rejection.message).toBe("Internal English detail");
  });

  it("distinguishes a save revision conflict from an Assignment state conflict", () => {
    expect(workflowErrorMessage(new ApiRequestError("REVISION_CONFLICT", "Conflict", 409))).toContain("保存冲突");
    const message = workflowErrorMessage(new ApiRequestError("ASSIGNMENT_STATE_CONFLICT", "Conflict", 409));
    expect(message).toContain("已提交或完成"); expect(message).not.toContain("保存冲突");
  });
});
