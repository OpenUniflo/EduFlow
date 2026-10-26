import { describe, expect, it } from "vitest";
import { presentExecutionError } from "./errorPresentation";

describe("execution error presentation", () => {
  it("explains an expired model credential without exposing the provider exception", () => {
    const card = presentExecutionError({ code: "MODEL_REQUEST_FAILED", message: "Model request failed", reason: "auth_failed", provider: "DeepSeek", model: "deepseek-chat", httpStatus: 401 }, { savedAt: "2026-10-24T10:16:00Z" });
    expect(card?.title).toBe("模型请求失败");
    expect(card?.message).toBe("DeepSeek 返回 401：API Key 无效或已过期。");
    expect(card?.savedAtLabel).toMatch(/本次运行使用的是 \d{2}:\d{2} 保存的版本/);
    expect(card?.actions.map(action => action.hint)).toEqual(["model-settings", "run"]);
  });
  it("explains connection, model name and rate limit failures", () => {
    expect(presentExecutionError({ code: "MODEL_REQUEST_FAILED", message: "", reason: "connection_refused", host: "api.deepseek.com" })?.message).toContain("无法连接 api.deepseek.com");
    expect(presentExecutionError({ code: "MODEL_REQUEST_FAILED", message: "", reason: "model_not_found", provider: "DeepSeek", model: "missing" })?.message).toContain("找不到模型「missing」");
    expect(presentExecutionError({ code: "MODEL_REQUEST_FAILED", message: "", reason: "rate_limited", provider: "DeepSeek", httpStatus: 429 })?.message).toContain("请求过于频繁");
  });
  it("maps binding and state update failures to Chinese reasons and locators", () => {
    const binding = presentExecutionError({ code: "BINDING_MISSING", message: "binding missing" });
    expect(binding?.title).toBe("数据字段缺失");
    expect(binding?.message).toContain("参数来源");
    expect(binding?.actions[0].hint).toBe("node");
    const state = presentExecutionError({ code: "INVALID_STATE_UPDATE", message: "bad state" });
    expect(state?.title).toBe("写入数据不符合要求");
    expect(state?.actions[0].hint).toBe("field");
    expect(state?.technical).toContain("INVALID_STATE_UPDATE");
  });
  it("keeps tool identity readable", () => {
    const card = presentExecutionError({ code: "HTTP_TOOL_FAILED", message: "HTTP tool returned status 401", reason: "auth_failed", provider: "Hacker News 搜索", tool: "Hacker News 搜索", host: "hn.algolia.com", httpStatus: 401 });
    expect(card?.title).toBe("工具请求失败");
    expect(card?.message).toContain("Hacker News 搜索 返回 401");
    expect(card?.actions[0].hint).toBe("tool-settings");
  });
});
  it("explains model timeouts and interrupted streams with elapsed seconds and model names", () => {
    const timeout = presentExecutionError({ code: "MODEL_TIMEOUT", message: "Model response exceeded the node time limit", category: "timeout", reason: "timeout", provider: "DeepSeek", model: "deepseek-flash", elapsedMs: 120000, timeoutMs: 120000 });
    expect(timeout?.title).toBe("模型回复超时");
    expect(timeout?.message).toContain("模型「deepseek-flash」回复超时（已等待 120 秒）");
    expect(timeout?.message).toContain("缩短回答要求");
    expect(timeout?.actions.map(action => action.hint)).toEqual(["model-settings", "run"]);
    const interrupted = presentExecutionError({ code: "MODEL_STREAM_INTERRUPTED", message: "Model stream stopped producing output", reason: "stream_interrupted", model: "deepseek-flash", elapsedMs: 41000 });
    expect(interrupted?.title).toBe("模型输出中断");
    expect(interrupted?.message).toContain("已等待 41 秒");
    const truncated = presentExecutionError({ code: "MODEL_OUTPUT_TRUNCATED", message: "Model reached its output limit before completing the response", reason: "output_truncated", model: "deepseek-flash" });
    expect(truncated?.title).toBe("模型回答未完成");
    expect(truncated?.message).toContain("长度上限");
  });
  it("never shows an English infrastructure message in the readable card", () => {
    const card = presentExecutionError({ code: "NODE_EXECUTION_FAILED", message: "Node execution or persistence failed", category: "infrastructure" });
    expect(card?.title).toBe("运行失败");
    expect(card?.message).toBe("请求没有完成，请检查配置后重试。");
    expect(card?.technical).toContain("Node execution or persistence failed");
  });

it("renders a concrete write type mismatch with the fix-field action", () => {
  const card = presentExecutionError({ code: "INVALID_STATE_UPDATE", message: "result 字段是文本，但工具返回的是对象", field: "result", expectedType: "string", actualType: "object", expectedLabel: "文本", actualLabel: "对象", valueSource: "工具" });
  expect(card?.title).toBe("写入的数据类型不符");
  expect(card?.message).toBe("result 字段是文本，但工具返回的是对象");
  expect(card?.actions.map(action => action.label)).toEqual(["把字段改为对象", "定位字段"]);
  expect(card?.actions.map(action => action.hint)).toEqual(["fix-field-type", "field"]);
});
