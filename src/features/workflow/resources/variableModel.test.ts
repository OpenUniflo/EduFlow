import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/shared/api/apiClient";
import type { WorkflowConfiguration, WorkflowVariable } from "../domain/v2/types";
import {
  coerceVariableValue, configurationSaveFailure, configurationSaveNotice, defaultValueForType,
  newVariable, setVariableDescription, setVariableType, setVariableValue, variableDescriptionIssue,
  variableKeyIssue, variableTableDirty, variableTypeOf, VARIABLE_DESCRIPTION_LIMIT, VARIABLE_TABS,
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

  it("only exposes the default-value tab in M5", () => {
    expect([...VARIABLE_TABS]).toEqual([{ id: "default", label: "默认值" }]);
  });
});
