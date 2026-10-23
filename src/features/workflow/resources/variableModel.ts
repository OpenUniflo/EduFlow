import { ApiRequestError } from "@/shared/api/apiClient";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { WorkflowConfiguration, WorkflowVariable } from "../domain/v2/types";

export const VARIABLE_DESCRIPTION_LIMIT = 300;
export const VARIABLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export type VariableType = "string" | "number" | "boolean";

/** The only visible variable tab in M5; variable environments are added later. */
export const VARIABLE_TABS = [{ id: "default", label: "默认值" }] as const;

export function variableTypeOf(value: WorkflowVariable["value"]): VariableType {
  return typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
}

export function defaultValueForType(type: VariableType): string | number | boolean {
  return type === "number" ? 0 : type === "boolean" ? false : "";
}

export function coerceVariableValue(type: VariableType, raw: string | number | boolean): string | number | boolean {
  if (type === "number") {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (type === "boolean") return raw === true || raw === "true";
  return String(raw);
}

export function variableKeyIssue(key: string, existingKeys: readonly string[]): string {
  const value = key.trim();
  if (!value) return "请填写变量名称。";
  if (value.length > 80) return "变量名称最长 80 个字符。";
  if (!VARIABLE_KEY_PATTERN.test(value)) return "变量名称需以大写字母开头，只能包含大写字母、数字和下划线。";
  if (existingKeys.includes(value)) return "变量名称已存在。";
  return "";
}

export function variableDescriptionIssue(description: string): string {
  return description.length > VARIABLE_DESCRIPTION_LIMIT ? `说明最长 ${VARIABLE_DESCRIPTION_LIMIT} 个字符。` : "";
}

export function newVariable(key: string, type: VariableType): WorkflowVariable {
  return { key: key.trim(), value: defaultValueForType(type), overrides: {} };
}

export function setVariableValue(variable: WorkflowVariable, type: VariableType, raw: string | number | boolean): WorkflowVariable {
  return { ...variable, value: coerceVariableValue(type, raw) };
}

export function setVariableType(variable: WorkflowVariable, type: VariableType): WorkflowVariable {
  if (variableTypeOf(variable.value) === type) return variable;
  return { ...variable, value: coerceVariableValue(type, variable.value) };
}

export function setVariableDescription(variable: WorkflowVariable, description: string): WorkflowVariable {
  const next = description.slice(0, VARIABLE_DESCRIPTION_LIMIT);
  return next ? { ...variable, description: next } : { ...variable, description: undefined };
}

export function variableTableDirty(configuration: WorkflowConfiguration, baseline: WorkflowConfiguration): boolean {
  return JSON.stringify(configuration) !== JSON.stringify(baseline);
}

/** Maps a failed whole-table save to the UI state; revision conflicts ask for an explicit refresh. */
export function configurationSaveFailure(reason: unknown): { conflict: boolean; message: string } {
  const conflict = reason instanceof ApiRequestError && (reason.status === 409 || reason.code === "REVISION_CONFLICT");
  if (conflict) return { conflict: true, message: "保存冲突：服务器上的变量已更新。请刷新后重新编辑；当前表格内容已保留。" };
  return { conflict: false, message: workflowErrorMessage(reason) };
}

export function configurationSaveNotice(saved: WorkflowConfiguration): string {
  return `变量已保存为修订 v${saved.revision}；后续运行使用新配置，已有运行保留启动时的值。`;
}
