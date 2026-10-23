import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/shared/api/apiClient";
import type { VariableEnvironment, WorkflowConfiguration, WorkflowVariable } from "../domain/v2/types";
import {
  clearEnvironmentVariableValue, coerceVariableValue, configurationForSave, configurationSaveFailure,
  configurationSaveNotice, createVariableEnvironment, defaultValueForType, deleteVariableEnvironment,
  environmentOverrideCount, environmentVariableValue, hasEnvironmentOverride, mergeSavedVariableConfiguration,
  moveVariableEnvironment, newVariable, newVariableEnvironmentId, normalizeVariableConfiguration,
  normalizeVariableEnvironments, renameVariableEnvironment, setDefaultVariableEnvironment,
  setEnvironmentVariableValue, setVariableDescription, setVariableEnvironmentDescription, setVariableType,
  setVariableValue, variableConfigurationIssue, variableDescriptionIssue, variableEnvironmentDescriptionIssue,
  variableEnvironmentNameIssue, variableKeyIssue, variableTableDirty, variableTypeOf, VARIABLE_DESCRIPTION_LIMIT,
  VARIABLE_ENVIRONMENT_LIMIT, VARIABLE_TABS,
} from "./variableModel";

const variable = (patch: Partial<WorkflowVariable> = {}): WorkflowVariable => ({ key: "API_BASE", value: "https://example.com", overrides: {}, ...patch });

describe("variable keys", () => {
  it("rejects empty, lowercase, invalid and duplicate names", () => {
    expect(variableKeyIssue("", [])).toContain("请填写");
    expect(variableKeyIssue("api_base", [])).toContain("大写字母开头");
    expect(variableKeyIssue("API-BASE", [])).toContain("大写字母开头");
    expect(variableKeyIssue("API_BASE", ["API_BASE"])).toContain("已存在");
  });

  it("accepts uppercase names with digits and underscores", () => {
    expect(variableKeyIssue("API_BASE_URL_2", [])).toBe("");
    expect(variableKeyIssue(" A ", [])).toBe("");
  });

  it("bounds names at 80 characters", () => {
    expect(variableKeyIssue(`A${"B".repeat(79)}`, [])).toBe("");
    expect(variableKeyIssue(`A${"B".repeat(80)}`, [])).toContain("80");
  });
});

describe("variable values", () => {
  it("detects types and provides default values", () => {
    expect(variableTypeOf("text")).toBe("string");
    expect(variableTypeOf(12)).toBe("number");
    expect(variableTypeOf(false)).toBe("boolean");
    expect(defaultValueForType("string")).toBe("");
    expect(defaultValueForType("number")).toBe(0);
    expect(defaultValueForType("boolean")).toBe(false);
  });

  it("coerces raw input without throwing", () => {
    expect(coerceVariableValue("number", "12.5")).toBe(12.5);
    expect(coerceVariableValue("number", "not-a-number")).toBe(0);
    expect(coerceVariableValue("boolean", "true")).toBe(true);
    expect(coerceVariableValue("boolean", "false")).toBe(false);
    expect(coerceVariableValue("string", 7)).toBe("7");
  });

  it("changes a variable type by converting the current value", () => {
    expect(setVariableType(variable({ value: "42" }), "number").value).toBe(42);
    expect(setVariableType(variable({ value: 0 }), "boolean").value).toBe(false);
    expect(setVariableType(variable({ value: true }), "string").value).toBe("true");
    expect(setVariableValue(variable(), "number", "3").value).toBe(3);
  });
});

describe("variable descriptions", () => {
  it("limits the description to 300 characters", () => {
    expect(VARIABLE_DESCRIPTION_LIMIT).toBe(300);
    expect(variableDescriptionIssue("短说明")).toBe("");
    expect(variableDescriptionIssue("说".repeat(300))).toBe("");
    expect(variableDescriptionIssue("说".repeat(301))).toContain("300");
  });

  it("stores descriptions and clears them when emptied", () => {
    expect(setVariableDescription(variable(), "接口地址").description).toBe("接口地址");
    expect(setVariableDescription(variable({ description: "旧说明" }), "").description).toBeUndefined();
    expect(setVariableDescription(variable(), "说".repeat(400)).description).toHaveLength(300);
  });
});

describe("newVariable and dirty tracking", () => {
  it("creates a default variable with no overrides", () => {
    expect(newVariable(" RETRY_COUNT ", "number")).toEqual({ key: "RETRY_COUNT", value: 0, overrides: {} });
  });

  it("compares the whole table against the loaded revision", () => {
    const saved: WorkflowConfiguration = { revision: 2, variables: [variable()] };
    expect(variableTableDirty(saved, saved)).toBe(false);
    expect(variableTableDirty({ ...saved, variables: [variable({ description: "新说明" })] }, saved)).toBe(true);
  });
});

describe("variable save feedback", () => {
  it("maps a revision conflict to an explicit refresh prompt", () => {
    const failure = configurationSaveFailure(new ApiRequestError("REVISION_CONFLICT", "Configuration revision changed", 409));
    expect(failure.conflict).toBe(true);
    expect(failure.message).toContain("保存冲突");
    expect(failure.message).toContain("刷新");
  });

  it("treats a bare 409 as a conflict as well", () => {
    expect(configurationSaveFailure(new ApiRequestError(undefined, "Conflict", 409)).conflict).toBe(true);
  });

  it("keeps other failures as ordinary errors", () => {
    const failure = configurationSaveFailure(new ApiRequestError("INVALID_CONFIGURATION", "Invalid", 400));
    expect(failure.conflict).toBe(false);
    expect(failure.message).not.toContain("保存冲突");
    expect(configurationSaveFailure(new Error("offline")).conflict).toBe(false);
  });

  it("reports the saved revision and frozen run values", () => {
    const notice = configurationSaveNotice({ revision: 4, variables: [] });
    expect(notice).toContain("修订 v4");
    expect(notice).toContain("启动时的值");
  });

  it("exposes the default-value and variable-environment tabs", () => {
    expect([...VARIABLE_TABS]).toEqual([{ id: "default", label: "默认值" }, { id: "environments", label: "变量环境" }]);
  });
});

const environment = (id: string, name: string, order = 0, description = ""): VariableEnvironment => ({ id, name, order, description });
const configuration = (patch: Partial<WorkflowConfiguration> = {}): WorkflowConfiguration => normalizeVariableConfiguration({
  revision: 1, variables: [variable()], environments: [], defaultEnvironmentId: null, ...patch,
});

describe("variable environment configuration", () => {
  it("normalizes environments into a stable order and backs off an unknown default", () => {
    const normalized = normalizeVariableConfiguration({
      revision: 4,
      variables: [{ ...variable(), overrides: { dev: "x" } }],
      environments: [environment("prod", "正式", 5), environment("dev", "开发", 1)],
      defaultEnvironmentId: "missing",
    });
    expect(normalized.environments?.map(item => `${item.id}:${item.order}`)).toEqual(["dev:0", "prod:1"]);
    expect(normalized.defaultEnvironmentId).toBeNull();
    expect(normalized.variables[0].overrides).toEqual({ dev: "x" });
    expect(normalized.environments).not.toBeUndefined();
  });

  it("treats missing environment fields as empty", () => {
    const normalized = normalizeVariableConfiguration({ revision: 0, variables: [] });
    expect(normalized.environments).toEqual([]);
    expect(normalized.defaultEnvironmentId).toBeNull();
  });

  it("de-duplicates environments and fills missing order values", () => {
    const normalized = normalizeVariableEnvironments([environment("a", "开发"), environment("a", "重复"), environment("b", "正式", 0)]);
    expect(normalized.map(item => item.id)).toEqual(["a", "b"]);
    expect(normalized.map(item => item.order)).toEqual([0, 1]);
  });

  it("validates environment names and descriptions", () => {
    const environments = [environment("dev", "开发")];
    expect(variableEnvironmentNameIssue("", environments)).toContain("请填写");
    expect(variableEnvironmentNameIssue(" 开发 ", environments)).toContain("已存在");
    expect(variableEnvironmentNameIssue("开发", environments, "dev")).toBe("");
    expect(variableEnvironmentNameIssue("正".repeat(41), environments)).toContain("40");
    expect(variableEnvironmentNameIssue("正式", environments)).toBe("");
    expect(variableEnvironmentDescriptionIssue("说".repeat(300))).toBe("");
    expect(variableEnvironmentDescriptionIssue("说".repeat(301))).toContain("300");
  });

  it("creates deterministic drafts with contiguous order values", () => {
    const created = createVariableEnvironment(" 开发 ", [environment("prod", "正式")], "dev");
    expect(created).toEqual({ id: "dev", name: "开发", description: "", order: 1 });
    expect(newVariableEnvironmentId()).toMatch(/^[a-z0-9][a-z0-9_-]{0,39}$/);
  });

  it("renames, describes and reorders environments", () => {
    const environments = [environment("dev", "开发"), environment("test", "测试"), environment("prod", "正式")];
    expect(renameVariableEnvironment(environments, "dev", "开发环境")[0].name).toBe("开发环境");
    expect(setVariableEnvironmentDescription(environments, "dev", "本地")[0].description).toBe("本地");
    expect(moveVariableEnvironment(environments, "test", "up").map(item => item.id)).toEqual(["test", "dev", "prod"]);
    expect(moveVariableEnvironment(environments, "test", "down").map(item => item.id)).toEqual(["dev", "prod", "test"]);
    expect(moveVariableEnvironment(environments, "dev", "up").map(item => item.id)).toEqual(["dev", "test", "prod"]);
    expect(moveVariableEnvironment(environments, "prod", "down").map(item => item.id)).toEqual(["dev", "test", "prod"]);
    expect(moveVariableEnvironment(environments, "prod", "up").map(item => item.order)).toEqual([0, 1, 2]);
  });

  it("sets and clears the default environment", () => {
    const base = configuration({ environments: [environment("dev", "开发"), environment("prod", "正式")] });
    expect(setDefaultVariableEnvironment(base, "prod").defaultEnvironmentId).toBe("prod");
    expect(setDefaultVariableEnvironment(base, "missing").defaultEnvironmentId).toBeNull();
    expect(setDefaultVariableEnvironment({ ...base, defaultEnvironmentId: "dev" }, null).defaultEnvironmentId).toBeNull();
  });

  it("deletes an environment, its overrides and falls back for a deleted default", () => {
    const base = configuration({
      variables: [{ ...variable(), overrides: { dev: "dev-value", prod: "prod-value" } }, { ...variable({ key: "RETRY" }), overrides: { dev: 3 } }],
      environments: [environment("prod", "正式", 2), environment("dev", "开发", 1)],
      defaultEnvironmentId: "dev",
    });
    const deleted = deleteVariableEnvironment(base, "dev");
    expect(deleted.environments?.map(item => item.id)).toEqual(["prod"]);
    expect(deleted.defaultEnvironmentId).toBe("prod");
    expect(deleted.variables[0].overrides).toEqual({ prod: "prod-value" });
    expect(deleted.variables[1].overrides).toEqual({});
    const other = deleteVariableEnvironment(base, "prod");
    expect(other.defaultEnvironmentId).toBe("dev");
    expect(deleteVariableEnvironment(base, "missing")).toEqual(base);
  });

  it("edits and recovers one environment's overridden values", () => {
    const base = variable();
    expect(hasEnvironmentOverride(base, "dev")).toBe(false);
    expect(environmentVariableValue(base, "dev")).toBe("https://example.com");
    const overridden = setEnvironmentVariableValue(base, "dev", "dev-value");
    expect(overridden.overrides.dev).toBe("dev-value");
    expect(environmentVariableValue(overridden, "dev")).toBe("dev-value");
    expect(clearEnvironmentVariableValue(overridden, "dev")).toEqual(base);
    const numeric = setEnvironmentVariableValue(variable({ value: 2 }), "dev", "5");
    expect(numeric.overrides.dev).toBe(5);
    expect(environmentOverrideCount(configuration({ variables: [overridden], environments: [environment("dev", "开发")] }), "dev")).toBe(1);
  });

  it("coerces existing overrides when the shared variable type changes", () => {
    const changed = setVariableType(variable({ value: "2", overrides: { dev: "5" } }), "number");
    expect(changed.value).toBe(2);
    expect(changed.overrides.dev).toBe(5);
  });

  it("builds a save payload that drops overrides of deleted environments", () => {
    const base = configuration({
      variables: [{ ...variable(), description: "接口", overrides: { dev: "dev-value", ghost: "stale" } }],
      environments: [environment("dev", " 开发 ", 0), environment("prod", "正式", 1)],
      defaultEnvironmentId: "dev",
    });
    expect(configurationForSave(base)).toEqual({
      revision: 1,
      variables: [{ key: "API_BASE", value: "https://example.com", description: "接口", overrides: { dev: "dev-value" } }],
      environments: [
        { id: "dev", name: "开发", description: "", order: 0 },
        { id: "prod", name: "正式", description: "", order: 1 },
      ],
      defaultEnvironmentId: "dev",
    });
  });

  it("merges a save response that does not yet return environments", () => {
    const draft = configuration({ environments: [environment("dev", "开发")], defaultEnvironmentId: "dev" });
    const merged = mergeSavedVariableConfiguration(draft, { revision: 2, variables: draft.variables });
    expect(merged.revision).toBe(2);
    expect(merged.environments?.map(item => item.id)).toEqual(["dev"]);
    expect(merged.defaultEnvironmentId).toBe("dev");
    const replaced = mergeSavedVariableConfiguration(draft, { revision: 3, variables: draft.variables, environments: [environment("prod", "正式")], defaultEnvironmentId: "prod" });
    expect(replaced.environments?.map(item => item.id)).toEqual(["prod"]);
    expect(replaced.defaultEnvironmentId).toBe("prod");
  });

  it("blocks saving with invalid environment names or descriptions", () => {
    expect(variableConfigurationIssue(configuration({ environments: [environment("dev", "")] }))).toContain("请填写");
    expect(variableConfigurationIssue(configuration({ environments: [environment("a", "同名"), environment("b", "同名")] }))).toContain("已存在");
    expect(variableConfigurationIssue(configuration({ environments: [environment("a", "开发", 0, "说".repeat(301))] }))).toContain("300");
    expect(variableConfigurationIssue(configuration({ environments: Array.from({ length: VARIABLE_ENVIRONMENT_LIMIT + 1 }, (_, index) => environment(`e${index}`, `环境${index}`)) }))).toContain(String(VARIABLE_ENVIRONMENT_LIMIT));
    expect(variableConfigurationIssue(configuration({ environments: [environment("dev", "开发")] }))).toBe("");
  });

  it("mentions environments in the save notice", () => {
    expect(configurationSaveNotice({ revision: 5, variables: [], environments: [environment("dev", "开发")] })).toContain("1 个变量环境");
  });
});
