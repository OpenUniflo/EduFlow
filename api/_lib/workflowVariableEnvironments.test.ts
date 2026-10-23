import { describe, expect, it } from "vitest";
import { cleanVariableOverrides, configurationSaveIssue, configurationSaveSchema, frozenVariableEnvironment, normalizeConfiguration, resolveDefaultEnvironmentId, withFrozenVariableEnvironment } from "./workflowVariableEnvironments.js";
import { workflowRunDto } from "./workflowV2.js";

const development = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "开发", description: "开发环境", order: 0 };
const production = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "正式", description: "", order: 1 };

describe("configuration save schema", () => {
  it("accepts the whole-table shape with environments as variable override keys", () => {
    const parsed = configurationSaveSchema.safeParse({
      baseRevision: 2,
      variables: [{ key: "API_URL", value: "https://default", overrides: { [development.id]: "https://dev" }, description: "接口地址" }],
      environments: [development, { name: "本地" }],
      defaultEnvironmentId: development.id,
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["more than 20 environments", { baseRevision: 1, variables: [], environments: Array.from({ length: 21 }, (_, index) => ({ name: `e${index}` })) }],
    ["a blank name", { baseRevision: 1, variables: [], environments: [{ name: "   " }] }],
    ["an over-long name", { baseRevision: 1, variables: [], environments: [{ name: "字".repeat(41) }] }],
    ["an over-long description", { baseRevision: 1, variables: [], environments: [{ name: "开发", description: "字".repeat(301) }] }],
    ["a legacy platform override key", { baseRevision: 1, variables: [{ key: "API_URL", value: "x", overrides: { local: "x" } }] }],
    ["an unknown environment field", { baseRevision: 1, variables: [], environments: [{ name: "开发", unknown: true }] }],
    ["a malformed default id", { baseRevision: 1, variables: [], defaultEnvironmentId: "default" }],
    ["a negative revision", { baseRevision: -1, variables: [] }],
  ])("rejects %s", (_label, payload) => {
    expect(configurationSaveSchema.safeParse(payload).success).toBe(false);
  });
});

describe("configuration normalization", () => {
  it("fills the required environments and default pointer defaults", () => {
    expect(normalizeConfiguration({ revision: 3, variables: [] })).toEqual({ revision: 3, variables: [], environments: [], defaultEnvironmentId: null });
  });

  it("keeps a default pointer that exists, sorts environments and disposes a dangling default", () => {
    const normalized = normalizeConfiguration({ revision: 2, variables: [], environments: [production, development], defaultEnvironmentId: development.id });
    expect(normalized.environments).toEqual([development, production]);
    expect(normalized.defaultEnvironmentId).toBe(development.id);
    expect(normalizeConfiguration({ revision: 2, variables: [], environments: [development], defaultEnvironmentId: production.id })).toMatchObject({ defaultEnvironmentId: null });
  });

  it("accepts the snake_case default from the Worker RPC and drops malformed rows", () => {
    const normalized = normalizeConfiguration({
      revision: 5,
      variables: [{ key: "COUNT", value: 2, overrides: { [development.id]: 3 } }, { key: "", value: 1 }, { key: "BAD" }],
      environments: [{ id: development.id, name: "开发" }, { name: "missing id" }],
      default_environment_id: development.id,
    });
    expect(normalized.variables).toEqual([{ key: "COUNT", value: 2, overrides: { [development.id]: 3 } }]);
    expect(normalized.environments).toEqual([{ id: development.id, name: "开发", description: "", order: 0 }]);
    expect(normalized.defaultEnvironmentId).toBe(development.id);
  });
});

describe("override cleanup", () => {
  const variables = [{ key: "API_URL", value: "default", overrides: { [development.id]: "dev", [production.id]: "prod" }, description: "接口地址" }];

  it("removes overrides for environments that no longer exist without mutating its input", () => {
    const cleaned = cleanVariableOverrides(variables, new Set([production.id]));
    expect(cleaned).toEqual([{ key: "API_URL", value: "default", overrides: { [production.id]: "prod" }, description: "接口地址" }]);
    expect(variables[0].overrides).toHaveProperty(development.id);
  });

  it("keeps every override when all environments remain and clears them all when none do", () => {
    expect(cleanVariableOverrides(variables, new Set([development.id, production.id]))[0].overrides).toEqual(variables[0].overrides);
    expect(cleanVariableOverrides(variables, new Set())[0].overrides).toEqual({});
  });
});

describe("default environment resolution", () => {
  it("keeps the requested environment when it survives and otherwise falls back to the first", () => {
    expect(resolveDefaultEnvironmentId([development, production], production.id)).toBe(production.id);
    expect(resolveDefaultEnvironmentId([development, production], "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe(development.id);
    expect(resolveDefaultEnvironmentId([{}], null)).toBeNull();
    expect(resolveDefaultEnvironmentId([], development.id)).toBeNull();
  });
});

describe("whole-table save issues", () => {
  it("rejects duplicate names and identifiers and an unknown default", () => {
    expect(configurationSaveIssue({ environments: [{ name: "开发" }, { name: "开发" }] })).toContain("名称");
    expect(configurationSaveIssue({ environments: [{ name: "开发", id: development.id }, { name: "正式", id: development.id }] })).toContain("标识");
    expect(configurationSaveIssue({ environments: [development], defaultEnvironmentId: production.id })).toContain("默认");
  });

  it("accepts a coherent submission and a legacy client without environments", () => {
    expect(configurationSaveIssue({ environments: [development, { name: "本地" }], defaultEnvironmentId: development.id })).toBeUndefined();
    expect(configurationSaveIssue({ defaultEnvironmentId: development.id })).toBeUndefined();
  });
});

describe("frozen run environment", () => {
  it("reads the frozen identity from the registry snapshot object only", () => {
    expect(frozenVariableEnvironment({ variableEnvironment: { id: development.id, name: "开发" } })).toEqual({ id: development.id, name: "开发" });
    expect(frozenVariableEnvironment({ variableEnvironment: { id: development.id } })).toEqual({ id: development.id, name: null });
    expect(frozenVariableEnvironment({ variableEnvironment: "开发" })).toEqual({ id: null, name: null });
    expect(frozenVariableEnvironment(undefined)).toEqual({ id: null, name: null });
  });

  it("freezes the selected environment without mutating the Worker snapshot", () => {
    const snapshot = { variables: { API_URL: "default" } };
    expect(withFrozenVariableEnvironment(snapshot, { id: development.id, name: "开发" })).toEqual({ variables: { API_URL: "default" }, variableEnvironment: { id: development.id, name: "开发" } });
    expect(snapshot).toEqual({ variables: { API_URL: "default" } });
    expect(withFrozenVariableEnvironment(snapshot, null)).toEqual(snapshot);
  });
});

describe("run projection", () => {
  const run = {
    run_id: "11111111-1111-4111-8111-111111111111", workflow_id: "workflow", revision: 1, mode: "live", verification: "unverified",
    status: "success", definition_hash: "hash", semantic_hash: "semantic", compile_fingerprint: "fingerprint",
    environment_ref: "local", environment_revision: "1", policy_version: "m1.1", input: {}, output: {}, raw_state: {},
    created_at: "2026-10-23T00:00:00Z", last_seq: 0,
  };

  it("prefers the frozen name so a deleted environment still renders", () => {
    const projected = workflowRunDto({ ...run, variable_environment_id: null, registry_snapshot: { variableEnvironment: { id: development.id, name: "开发" } } }, true);
    expect(projected).toMatchObject({ variableEnvironmentId: development.id, variableEnvironment: "开发" });
  });

  it("falls back to the current environment name for older Runs without a frozen name", () => {
    const names = new Map([[production.id, "正式"]]);
    const projected = workflowRunDto({ ...run, variable_environment_id: production.id, registry_snapshot: {} }, false, names);
    expect(projected).toMatchObject({ variableEnvironmentId: production.id, variableEnvironment: "正式" });
  });

  it("returns null fields when no variable environment was selected", () => {
    expect(workflowRunDto({ ...run, registry_snapshot: {} })).toMatchObject({ variableEnvironmentId: null, variableEnvironment: null });
  });
});
