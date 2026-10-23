import { describe, expect, it } from "vitest";
import type { JsonValue } from "../domain/v2/types";
import {
  compareModelNames, groupCatalogByRef, latestConnectionsOfType, latestEntries, latestVersion,
  mergeDiscoveredModels, parseModelList, resourceCounts, type CatalogConnection,
} from "./resourceModel";

const connection = (ref: string, version: number, content: Record<string, JsonValue>, extra: Partial<CatalogConnection> = {}): CatalogConnection => ({
  connectionKey: `p4:owner:${ref}:${version}`, ref, version, disabled: false, hasCredential: true, content, ...extra,
});

const connections: CatalogConnection[] = [
  connection("price_api", 1, { type: "http", name: "价格服务", baseUrl: "https://example.com" }),
  connection("price_api", 2, { type: "http", name: "价格服务", baseUrl: "https://example.com" }),
  connection("mcp_docs", 1, { type: "mcp-http", name: "文档 MCP", url: "https://mcp.example.com" }),
  connection("my_deepseek", 1, { type: "deepseek", name: "我的 DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat"] }),
  connection("my_deepseek", 2, { type: "deepseek", name: "我的 DeepSeek", baseUrl: "https://api.deepseek.com", modelRefs: ["deepseek-chat", "deepseek-reasoner"] }),
];

describe("groupCatalogByRef", () => {
  it("groups every version of a reference newest first and sorts groups by name", () => {
    const groups = groupCatalogByRef(connections);
    expect(groups.map(group => group.ref)).toEqual(["mcp_docs", "my_deepseek", "price_api"]);
    const price = groups.find(group => group.ref === "price_api")!;
    expect(price.versions.map(entry => entry.version)).toEqual([2, 1]);
    expect(price.latest.version).toBe(2);
    expect(price.latestVersion).toBe(2);
  });

  it("does not reorder the caller's array in place", () => {
    const entries = [connection("b", 1, {}), connection("a", 1, {}), connection("b", 2, {})];
    const order = entries.map(entry => `${entry.ref}@${entry.version}`);
    groupCatalogByRef(entries);
    expect(entries.map(entry => `${entry.ref}@${entry.version}`)).toEqual(order);
  });

  it("keeps disabled versions inspectable while exposing the newest version", () => {
    const groups = groupCatalogByRef([connection("old", 3, {}, { disabled: true }), connection("old", 2, {}, { disabled: false })]);
    expect(groups[0].latest.disabled).toBe(true);
    expect(groups[0].versions.map(entry => entry.version)).toEqual([3, 2]);
  });
});

describe("latestVersion and latestEntries", () => {
  it("reads the highest version overall or for one reference", () => {
    expect(latestVersion(connections)).toBe(2);
    expect(latestVersion(connections, "price_api")).toBe(2);
    expect(latestVersion(connections, "missing")).toBe(0);
  });

  it("returns one newest entry per reference", () => {
    expect(latestEntries(connections).map(entry => `${entry.ref}@${entry.version}`)).toEqual(["mcp_docs@1", "my_deepseek@2", "price_api@2"]);
  });
});

describe("latestConnectionsOfType", () => {
  it("filters by category using the newest version of each reference", () => {
    expect(latestConnectionsOfType(connections, "http").map(entry => entry.version)).toEqual([2]);
    expect(latestConnectionsOfType(connections, "mcp-http").map(entry => entry.ref)).toEqual(["mcp_docs"]);
    expect(latestConnectionsOfType(connections, "provider").map(entry => entry.ref)).toEqual(["my_deepseek"]);
  });
});

describe("mergeDiscoveredModels", () => {
  it("drops enabled models and duplicates, then sorts for stable presentation", () => {
    expect(mergeDiscoveredModels(["deepseek-chat"], ["deepseek-reasoner", "deepseek-chat", " deepseek-reasoner ", ""])).toEqual(["deepseek-reasoner"]);
    expect(mergeDiscoveredModels([], ["b-model", "a-model"])).toEqual(["a-model", "b-model"]);
    expect(mergeDiscoveredModels(["everything"], ["everything"])).toEqual([]);
  });

  it("uses the shared deterministic model ordering", () => {
    const names = ["model-10", "model-2", "Model-1"];
    expect([...names].sort(compareModelNames)).toEqual(["Model-1", "model-10", "model-2"]);
  });
});

describe("parseModelList", () => {
  it("splits commas and newlines, trims and deduplicates while keeping user order", () => {
    expect(parseModelList("deepseek-chat, deepseek-reasoner\ndeepseek-chat , ")).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(parseModelList("")).toEqual([]);
  });
});

describe("resourceCounts", () => {
  it("counts unique references per section", () => {
    expect(resourceCounts({ connections, functions: [{ ref: "f1", version: 1, language: "python" }, { ref: "f1", version: 2, language: "python" }, { ref: "f2", version: 1, language: "javascript" }], variables: [{ key: "A" }, { key: "B" }] }))
      .toEqual({ providers: 1, apis: 1, mcp: 1, functions: 2, variables: 2 });
  });

  it("leaves badges undefined until the matching catalog has loaded", () => {
    expect(resourceCounts({})).toEqual({ providers: undefined, apis: undefined, mcp: undefined, functions: undefined, variables: undefined });
  });
});
