import { expect, it } from "vitest";
import { connectionDraftIssue } from "./connectionDraft";

const base = { kind: "http", ref: "price_service", url: "https://example.com", credential: "", version: 1 };

it("requires a ref and a positive integer version", () => {
  expect(connectionDraftIssue({ ...base, ref: " " })).toContain("连接标识");
  expect(connectionDraftIssue({ ...base, version: 0 })).toContain("大于 0");
  expect(connectionDraftIssue({ ...base, version: 1.5 })).toContain("整数");
});

it("requires a URL for HTTP and MCP connections", () => {
  expect(connectionDraftIssue({ ...base, url: "" })).toContain("连接地址");
  expect(connectionDraftIssue({ ...base, kind: "mcp-http", url: "" })).toContain("连接地址");
  expect(connectionDraftIssue({ ...base, kind: "mcp-http" })).toBe("");
});

it("requires a credential for a model connection", () => {
  expect(connectionDraftIssue({ ...base, kind: "deepseek" })).toContain("模型连接需要凭据");
  expect(connectionDraftIssue({ ...base, kind: "deepseek", credential: "sk-local" })).toBe("");
});
