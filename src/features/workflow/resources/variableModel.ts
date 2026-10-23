import { ApiRequestError } from "@/shared/api/apiClient";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import type { VariableEnvironment, WorkflowConfiguration, WorkflowVariable } from "../domain/v2/types";

export const VARIABLE_DESCRIPTION_LIMIT = 300;
export const VARIABLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const VARIABLE_ENVIRONMENT_NAME_LIMIT = 40;
export const VARIABLE_ENVIRONMENT_DESCRIPTION_LIMIT = 300;
export const VARIABLE_ENVIRONMENT_LIMIT = 20;

export type VariableType = "string" | "number" | "boolean";
export type VariableTab = "default" | "environments";
export type NormalizedWorkflowConfiguration = WorkflowConfiguration & { environments: VariableEnvironment[]; defaultEnvironmentId: string | null };

/** Two visible variable views; the platform runtime environment is never part of the UI. */
export const VARIABLE_TABS = [{ id: "default", label: "默认值" }, { id: "environments", label: "变量环境" }] as const;

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
  const overrides = Object.fromEntries(Object.entries(variable.overrides).map(([id, value]) => [id, coerceVariableValue(type, value)]));
  return { ...variable, value: coerceVariableValue(type, variable.value), overrides };
}

export function setVariableDescription(variable: WorkflowVariable, description: string): WorkflowVariable {
  const next = description.slice(0, VARIABLE_DESCRIPTION_LIMIT);
  return next ? { ...variable, description: next } : { ...variable, description: undefined };
}

export function variableTableDirty(configuration: WorkflowConfiguration, baseline: WorkflowConfiguration): boolean {
  return JSON.stringify(configuration) !== JSON.stringify(baseline);
}

/** Normalizes a configuration received from the API; unknown optional fields become safe defaults. */
export function normalizeVariableConfiguration(configuration?: WorkflowConfiguration | null): NormalizedWorkflowConfiguration {
  const environments = normalizeVariableEnvironments(configuration?.environments);
  const ids = new Set(environments.map(environment => environment.id));
  const defaultEnvironmentId = configuration?.defaultEnvironmentId && ids.has(configuration.defaultEnvironmentId)
    ? configuration.defaultEnvironmentId
    : null;
  return {
    revision: typeof configuration?.revision === "number" ? configuration.revision : 0,
    variables: (configuration?.variables ?? []).map(variable => ({ ...variable, overrides: { ...(variable.overrides ?? {}) } })),
    environments,
    defaultEnvironmentId,
  };
}

/** Sorted, de-duplicated environment list with contiguous 0-based order values. */
export function normalizeVariableEnvironments(environments?: readonly VariableEnvironment[] | null): VariableEnvironment[] {
  const seen = new Set<string>();
  const list: VariableEnvironment[] = [];
  (environments ?? []).forEach((environment, index) => {
    if (!environment || typeof environment.id !== "string" || !environment.id || seen.has(environment.id)) return;
    seen.add(environment.id);
    list.push({
      id: environment.id,
      name: typeof environment.name === "string" ? environment.name : "",
      description: typeof environment.description === "string" ? environment.description : "",
      order: typeof environment.order === "number" && Number.isFinite(environment.order) ? environment.order : index,
    });
  });
  list.sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  return list.map((environment, index) => ({ ...environment, order: index }));
}

/**
 * A save response from an API that still lacks environment support must not wipe the local
 * environment draft; missing fields fall back to the submitted configuration.
 */
export function mergeSavedVariableConfiguration(draft: WorkflowConfiguration, saved: WorkflowConfiguration): NormalizedWorkflowConfiguration {
  return normalizeVariableConfiguration({
    revision: saved.revision,
    variables: saved.variables ?? draft.variables,
    environments: saved.environments !== undefined ? saved.environments : draft.environments,
    defaultEnvironmentId: saved.defaultEnvironmentId !== undefined ? saved.defaultEnvironmentId : draft.defaultEnvironmentId,
  });
}

export function variableEnvironmentNameIssue(name: string, environments: readonly VariableEnvironment[], ignoreId?: string): string {
  const value = name.trim();
  if (!value) return "请填写变量环境名称。";
  if (value.length > VARIABLE_ENVIRONMENT_NAME_LIMIT) return `变量环境名称最长 ${VARIABLE_ENVIRONMENT_NAME_LIMIT} 个字符。`;
  if (environments.some(environment => environment.id !== ignoreId && environment.name.trim() === value)) return "变量环境名称已存在。";
  return "";
}

export function variableEnvironmentDescriptionIssue(description: string): string {
  return description.length > VARIABLE_ENVIRONMENT_DESCRIPTION_LIMIT ? `变量环境说明最长 ${VARIABLE_ENVIRONMENT_DESCRIPTION_LIMIT} 个字符。` : "";
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function newVariableEnvironmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return fallbackUuid();
}

export function createVariableEnvironment(name: string, environments: readonly VariableEnvironment[], id = newVariableEnvironmentId()): VariableEnvironment {
  return { id, name: name.trim(), description: "", order: environments.length };
}

export function renameVariableEnvironment(environments: readonly VariableEnvironment[], id: string, name: string): VariableEnvironment[] {
  return normalizeVariableEnvironments(environments).map(environment => environment.id === id ? { ...environment, name } : environment);
}

export function setVariableEnvironmentDescription(environments: readonly VariableEnvironment[], id: string, description: string): VariableEnvironment[] {
  const next = description.slice(0, VARIABLE_ENVIRONMENT_DESCRIPTION_LIMIT);
  return normalizeVariableEnvironments(environments).map(environment => environment.id === id ? { ...environment, description: next } : environment);
}

export function moveVariableEnvironment(environments: readonly VariableEnvironment[], id: string, direction: "up" | "down"): VariableEnvironment[] {
  const list = normalizeVariableEnvironments(environments);
  const index = list.findIndex(environment => environment.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((environment, position) => ({ ...environment, order: position }));
}

export function setDefaultVariableEnvironment(configuration: WorkflowConfiguration, id: string | null): WorkflowConfiguration {
  const normalized = normalizeVariableConfiguration(configuration);
  const defaultEnvironmentId = id && normalized.environments.some(environment => environment.id === id) ? id : null;
  return { ...normalized, defaultEnvironmentId };
}

/** Deletes one environment and its overrides; a deleted default falls back to the first remaining environment. */
export function deleteVariableEnvironment(configuration: WorkflowConfiguration, id: string): WorkflowConfiguration {
  const normalized = normalizeVariableConfiguration(configuration);
  if (!normalized.environments.some(environment => environment.id === id)) return normalized;
  const environments = normalized.environments.filter(environment => environment.id !== id).map((environment, index) => ({ ...environment, order: index }));
  const variables = normalized.variables.map(variable => {
    if (!Object.prototype.hasOwnProperty.call(variable.overrides, id)) return variable;
    const overrides = { ...variable.overrides };
    delete overrides[id];
    return { ...variable, overrides };
  });
  const defaultEnvironmentId = normalized.defaultEnvironmentId === id ? (environments[0]?.id ?? null) : normalized.defaultEnvironmentId;
  return { ...normalized, environments, variables, defaultEnvironmentId };
}

export function variableEnvironmentById(configuration: WorkflowConfiguration, id: string | null): VariableEnvironment | undefined {
  if (!id) return undefined;
  return normalizeVariableEnvironments(configuration.environments).find(environment => environment.id === id);
}

export function environmentOverrideCount(configuration: WorkflowConfiguration, id: string): number {
  return configuration.variables.filter(variable => Object.prototype.hasOwnProperty.call(variable.overrides, id)).length;
}

export function hasEnvironmentOverride(variable: WorkflowVariable, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(variable.overrides, id);
}

export function environmentVariableValue(variable: WorkflowVariable, id: string): string | number | boolean {
  return hasEnvironmentOverride(variable, id) ? variable.overrides[id] : variable.value;
}

export function setEnvironmentVariableValue(variable: WorkflowVariable, id: string, raw: string | number | boolean): WorkflowVariable {
  return { ...variable, overrides: { ...variable.overrides, [id]: coerceVariableValue(variableTypeOf(variable.value), raw) } };
}

export function clearEnvironmentVariableValue(variable: WorkflowVariable, id: string): WorkflowVariable {
  if (!hasEnvironmentOverride(variable, id)) return variable;
  const overrides = { ...variable.overrides };
  delete overrides[id];
  return { ...variable, overrides };
}

/** Payload for one PUT: cleans overrides of deleted environments and normalizes the environment list. */
export function configurationForSave(configuration: WorkflowConfiguration): WorkflowConfiguration {
  const normalized = normalizeVariableConfiguration(configuration);
  const ids = new Set(normalized.environments.map(environment => environment.id));
  const variables = normalized.variables.map(variable => {
    const overrides = Object.fromEntries(Object.entries(variable.overrides).filter(([id]) => ids.has(id)));
    return {
      key: variable.key,
      value: variable.value,
      overrides,
      ...(variable.description === undefined ? {} : { description: variable.description }),
    };
  });
  return {
    revision: normalized.revision,
    variables,
    environments: normalized.environments.map(environment => ({
      id: environment.id,
      name: environment.name.trim(),
      description: environment.description ?? "",
      order: environment.order ?? 0,
    })),
    defaultEnvironmentId: normalized.defaultEnvironmentId ?? null,
  };
}

export function variableConfigurationIssue(configuration: WorkflowConfiguration): string {
  const normalized = normalizeVariableConfiguration(configuration);
  if (normalized.environments.length > VARIABLE_ENVIRONMENT_LIMIT) return `最多创建 ${VARIABLE_ENVIRONMENT_LIMIT} 个变量环境。`;
  for (const environment of normalized.environments) {
    const nameIssue = variableEnvironmentNameIssue(environment.name, normalized.environments, environment.id);
    if (nameIssue) return nameIssue;
    const descriptionIssue = variableEnvironmentDescriptionIssue(environment.description ?? "");
    if (descriptionIssue) return descriptionIssue;
  }
  return "";
}

/** Maps a failed whole-table save to the UI state; revision conflicts ask for an explicit refresh. */
export function configurationSaveFailure(reason: unknown): { conflict: boolean; message: string } {
  const conflict = reason instanceof ApiRequestError && (reason.status === 409 || reason.code === "REVISION_CONFLICT");
  if (conflict) return { conflict: true, message: "保存冲突：服务器上的变量已更新。请刷新后重新编辑；当前表格内容已保留。" };
  return { conflict: false, message: workflowErrorMessage(reason) };
}

export function configurationSaveNotice(saved: WorkflowConfiguration): string {
  const environments = saved.environments?.length ?? 0;
  const suffix = environments ? `，含 ${environments} 个变量环境` : "";
  return `变量已保存为修订 v${saved.revision}${suffix}；后续运行使用新配置，已有运行保留启动时的值。`;
}
