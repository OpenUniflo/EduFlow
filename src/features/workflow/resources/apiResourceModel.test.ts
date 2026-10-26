import { describe, expect, it } from "vitest";
import {
  apiContentFromDraft, apiDisplayUrl, apiDraftFromContent, apiDraftIssue, apiTestArguments, emptyApiDraft, platformToolDraft,
  requestHeadersForDisplay, splitRequestUrl, uniqueConnectionRef,
} from "./apiResourceModel";

describe("generic API resource model", () => {
  it("splits and rejoins a full URL without losing path variables", () => {
    expect(splitRequestUrl("https://api.github.com/repos/{{owner}}/{{repo}}?page=1")).toEqual({
      baseUrl: "https://api.github.com",
      path: "/repos/{{owner}}/{{repo}}?page=1",
    });
    expect(splitRequestUrl("https://api.github.com")).toEqual({ baseUrl: "https://api.github.com", path: "/" });
    expect(splitRequestUrl("not a url")).toEqual({ baseUrl: "", path: "" });
  });

  it("publishes node parameters as required inputs and keeps fixed/variable values out of inputs", () => {
    const content = apiContentFromDraft({
      ...emptyApiDraft(),
      name: "GitHub 仓库",
      url: "https://api.github.com/repos/{{owner}}/{{repo}}",
      params: [
        { name: "owner", source: "node", value: "", required: true, description: "仓库所有者" },
        { name: "repo", source: "node", value: "", required: true, description: "仓库名" },
        { name: "tags", source: "fixed", value: "story", required: false, description: "帖子" },
        { name: "hitsPerPage", source: "fixed", value: "5", required: false, description: "条数" },
        { name: "secret", source: "variable", value: "API_KEY", required: false, description: "" },
      ],
      auth: { type: "bearer", name: "" },
      settings: { timeoutMs: 15000, retries: 1, resultPath: "data" },
      outputMap: [{ name: "items", path: "items", type: "array" }],
    });
    expect(content.baseUrl).toBe("https://api.github.com");
    expect(content.path).toBe("/repos/{{owner}}/{{repo}}");
    expect((content.inputSchema as { properties: Record<string, unknown> }).properties).toMatchObject({ owner: { type: "string" }, repo: { type: "string" } });
    expect(content.inputSchema).not.toHaveProperty("properties.tags");
    expect(content.inputSchema).not.toHaveProperty("properties.secret");
    expect(content.params).toContainEqual({ name: "tags", source: "fixed", value: "story", required: false, description: "帖子" });
    expect(content.settings).toEqual({ timeoutMs: 15000, retries: 1, resultPath: "data" });
    expect(content.outputMap).toEqual([{ name: "items", path: "items", type: "array" }]);
  });

  it("derives a compact row URL and credential-safe request headers", () => {
    const content = apiContentFromDraft({
      ...emptyApiDraft(), name: "HN", url: "https://hn.algolia.com/api/v1/search",
      params: [{ name: "query", source: "node", value: "", required: true, description: "" }],
      headers: [{ name: "Accept", value: "application/json" }],
      auth: { type: "api-key-header", name: "X-API-Key" },
    });
    expect(apiDisplayUrl(content)).toBe("GET hn.algolia.com/api/v1/search · 1 个参数");
    expect(requestHeadersForDisplay(content, true)).toEqual([
      { name: "Accept", value: "application/json" },
      { name: "X-API-Key", value: "••••••" },
    ]);
    expect(requestHeadersForDisplay(content, false).slice(-1)[0]).toEqual({ name: "X-API-Key", value: "未设置" });
  });

  it("round-trips an existing connection and only node params become test inputs", () => {
    const content = apiContentFromDraft({
      ...emptyApiDraft(), name: "GitHub", url: "https://api.github.com/repos/{{owner}}/{{repo}}",
      params: [
        { name: "owner", source: "node", value: "", required: true, description: "" },
        { name: "repo", source: "node", value: "", required: true, description: "" },
        { name: "per_page", source: "fixed", value: "5", required: false, description: "" },
      ],
      outputMap: [{ name: "hits", path: "hits", type: "array" }],
    });
    const draft = apiDraftFromContent(content);
    expect(draft.url).toBe("https://api.github.com/repos/{{owner}}/{{repo}}");
    expect(draft.params).toHaveLength(3);
    expect(apiTestArguments(draft, { owner: "openai", repo: "openai-python", per_page: "3" })).toEqual({ owner: "openai", repo: "openai-python" });
  });

  it("rejects duplicate rows and invalid JSON bodies with readable messages", () => {
    const duplicate = { ...emptyApiDraft(), name: "x", url: "https://example.com/a", params: [
      { name: "q", source: "node" as const, value: "", required: true, description: "" },
      { name: "q", source: "fixed" as const, value: "1", required: false, description: "" },
    ] };
    expect(apiDraftIssue(duplicate)).toContain("重复");
    const badBody = { ...emptyApiDraft(), name: "x", url: "https://example.com/a", method: "POST", body: { mode: "json" as const, text: "{" } };
    expect(apiDraftIssue(badBody)).toContain("JSON");
  });

  it("prefills the platform Hacker News copy with word-optional matching and no typo fallback", () => {
    const draft = platformToolDraft({ name: "Hacker News 搜索", description: "搜索" });
    expect(draft.url).toContain("optionalWords={{query}}");
    expect(draft.params).toContainEqual({ name: "typoTolerance", source: "fixed", value: "false", required: false, description: "不允许拼写近似，避免无关结果" });
    expect(draft.params.some(param => param.name === "removeWordsIfNoResults")).toBe(false);
    expect(draft.params.find(param => param.name === "hitsPerPage")).toMatchObject({ source: "fixed", value: "5" });
    expect(draft.outputMap).toEqual([{ name: "hits", path: "hits", type: "array" }, { name: "total", path: "nbHits", type: "number" }]);
  });

  it("keeps generated references valid and unique", () => {
    expect(uniqueConnectionRef("Hacker News 搜索", [])).toMatch(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);
    expect(uniqueConnectionRef("api", ["api", "api_2"])).toBe("api_3");
  });
});
