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

describe("Resource center reference and test requests (M3)", () => {
  beforeEach(() => request.mockReset());

  it("queries connection references for the selected environment", async () => {
    const items = [{ workflowId: "wf", workflowName: "流程", revision: 4, graphPath: [], nodeId: "model", nodeLabel: "模型", version: 2, modelRef: "deepseek-chat" }];
    request.mockResolvedValueOnce({ items });
    const result = await new WorkflowApiV2().extensionReferences("price_service", "local-env");
    expect(result).toEqual({ items });
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=extensions&view=references&ref=price_service&environmentRef=local-env");
    expect(request.mock.calls[0][1]).toBeUndefined();
  });

  it("omits the environment when none is supplied", async () => {
    request.mockResolvedValueOnce({ items: [] });
    await new WorkflowApiV2().extensionReferences("price_service");
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=extensions&view=references&ref=price_service");
  });

  it("queries variable references without a Workflow identity", async () => {
    const items = [{ workflowId: "wf", workflowName: "流程", revision: 1, graphPath: [], nodeId: "node", nodeLabel: "节点", variableKey: "API_URL" }];
    request.mockResolvedValueOnce({ items });
    const result = await new WorkflowApiV2().variableReferences();
    expect(result).toEqual({ items });
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=configuration&view=references");
  });

  it("posts a connection test and preserves the Worker test fields", async () => {
    const outcome = { ok: true, elapsedMs: 321, status: 200, preview: "{\"answer\":42}", models: ["deepseek-chat"], tools: [{ name: "lookup", description: "查询价格" }] };
    request.mockResolvedValueOnce(outcome);
    const result = await new WorkflowApiV2().testExtension("local-env", { ref: "price", version: 2, arguments: { q: "a" }, confirmExternalEffect: false });
    expect(result).toEqual(outcome);
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=extensions");
    expect(request.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ action: "test", kind: "connection", ref: "price", version: 2, arguments: { q: "a" }, confirmExternalEffect: false, environmentRef: "local-env" });
  });
});

describe("Variable environment contract (M13)", () => {
  beforeEach(() => request.mockReset());
  const environment = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "开发", description: "", order: 0 };

  it("normalizes a configuration read that omits environments", async () => {
    request.mockResolvedValueOnce({ revision: 2, variables: [] });
    await expect(new WorkflowApiV2().configuration()).resolves.toEqual({ revision: 2, variables: [], environments: [], defaultEnvironmentId: null });
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=configuration");
  });

  it("saves the whole environment table and normalizes the response", async () => {
    request.mockResolvedValueOnce({ revision: 3, variables: [], environments: [environment], defaultEnvironmentId: environment.id });
    const result = await new WorkflowApiV2().saveConfiguration({ revision: 2, variables: [], environments: [environment], defaultEnvironmentId: environment.id });
    expect(result).toEqual({ revision: 3, variables: [], environments: [environment], defaultEnvironmentId: environment.id });
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=configuration");
    expect(request.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ baseRevision: 2, variables: [], environments: [environment], defaultEnvironmentId: environment.id });
  });

  it("sends a variableEnvironmentId only when one was selected", async () => {
    const receipt = { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", revision: 1, status: "queued" };
    request.mockResolvedValueOnce(receipt);
    await new WorkflowApiV2().createRun("workflow", 1, {}, "environment", "key", undefined, environment.id);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ workflowId: "workflow", revision: 1, input: {}, environmentRef: "environment", variableEnvironmentId: environment.id });
    request.mockResolvedValueOnce(receipt);
    await new WorkflowApiV2().createRun("workflow", 1, {}, "environment", "key");
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ workflowId: "workflow", revision: 1, input: {}, environmentRef: "environment" });
  });

  it("passes frozen variable environment fields through Run reads", async () => {
    const run = { runId: "ca72a44b-7a80-47b1-a93b-451775c03ddb", workflowId: "workflow", revision: 1, variableEnvironmentId: environment.id, variableEnvironment: "开发" };
    request.mockResolvedValueOnce(run);
    await expect(new WorkflowApiV2().run(run.runId)).resolves.toEqual(run);
    expect(request.mock.calls[0][0]).toBe("/api/workflows?resource=runs&id=ca72a44b-7a80-47b1-a93b-451775c03ddb");
  });
});
