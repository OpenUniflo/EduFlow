/**
 * Variable-environment contracts for M13 (plan 2.6 / 3.2).
 *
 * Pure validation and normalization used by the authenticated Workflow API. Persisted
 * entities live in `public.workflow_variable_environments`; variable overrides are keyed by
 * environment id. These helpers never touch Supabase so they can be unit tested offline.
 */
import { z } from "zod";

export const VARIABLE_ENVIRONMENT_LIMIT = 20;

const variableValue = z.union([z.string().max(8000), z.number().finite(), z.boolean()]);

export const variableEnvironmentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(40),
  description: z.string().max(300).optional(),
  order: z.number().int().min(0).max(100000).optional(),
}).strict();

export const configurationSaveSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  variables: z.array(z.object({
    key: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/),
    value: variableValue,
    overrides: z.record(z.string().uuid(), variableValue),
    description: z.string().max(300).optional(),
  }).strict()).max(100),
  environments: z.array(variableEnvironmentSchema).max(VARIABLE_ENVIRONMENT_LIMIT).optional(),
  defaultEnvironmentId: z.string().uuid().nullable().optional(),
}).strict();

export type ConfigurationSave = z.infer<typeof configurationSaveSchema>;
export type SubmittedEnvironment = z.infer<typeof variableEnvironmentSchema>;
export type VariableRow = { key: string; value: string | number | boolean; overrides: Record<string, string | number | boolean>; description?: string };
export type EnvironmentRow = { id: string; name: string; description: string; order: number };
export type ConfigurationDocument = { revision: number; variables: VariableRow[]; environments: EnvironmentRow[]; defaultEnvironmentId: string | null };

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function primitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" && Number.isFinite(value) || typeof value === "boolean";
}

function variableOf(value: unknown): VariableRow | undefined {
  const record = objectOf(value);
  if (!record || typeof record.key !== "string" || !record.key) return undefined;
  if (!primitive(record.value)) return undefined;
  const overrides: Record<string, string | number | boolean> = {};
  const submitted = objectOf(record.overrides);
  if (submitted) for (const [key, item] of Object.entries(submitted)) if (primitive(item)) overrides[key] = item;
  return {
    key: record.key,
    value: record.value,
    overrides,
    ...(typeof record.description === "string" ? { description: record.description } : {}),
  };
}

function environmentOf(value: unknown, index: number): EnvironmentRow | undefined {
  const record = objectOf(value);
  if (!record || typeof record.id !== "string" || !record.id || typeof record.name !== "string" || !record.name) return undefined;
  const order = typeof record.order === "number" && Number.isInteger(record.order) && record.order >= 0 ? record.order : index;
  return {
    id: record.id,
    name: record.name,
    description: typeof record.description === "string" ? record.description : "",
    order,
  };
}

/**
 * Normalizes a configuration payload (API/RPC response or a client document) to the ONE
 * shape the repository and editor consume: stable key order, `environments` defaulting to
 * `[]`, `defaultEnvironmentId` defaulting to `null`, and a default pointer that references
 * an existing environment.
 */
export function normalizeConfiguration(value: unknown): ConfigurationDocument {
  const record = objectOf(value) ?? {};
  const revision = typeof record.revision === "number" && Number.isInteger(record.revision) && record.revision >= 0 ? record.revision : 0;
  const variables = Array.isArray(record.variables) ? record.variables.map(variableOf).filter((item): item is VariableRow => Boolean(item)) : [];
  const environments = (Array.isArray(record.environments) ? record.environments : [])
    .map(environmentOf)
    .filter((item): item is EnvironmentRow => Boolean(item))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const requested = typeof record.defaultEnvironmentId === "string" ? record.defaultEnvironmentId : typeof record.default_environment_id === "string" ? record.default_environment_id : null;
  const defaultEnvironmentId = requested && environments.some((environment) => environment.id === requested) ? requested : null;
  return { revision, variables, environments, defaultEnvironmentId };
}

/**
 * Drops override keys whose variable environment no longer exists. Whole-table saves send
 * the complete remaining environment list, so any other key belongs to a deleted
 * environment. New environments have no id yet and therefore cannot own an override in the
 * same save.
 */
export function cleanVariableOverrides(variables: readonly VariableRow[], environmentIds: ReadonlySet<string>): VariableRow[] {
  return variables.map((variable) => ({
    ...variable,
    overrides: Object.fromEntries(Object.entries(variable.overrides).filter(([key]) => environmentIds.has(key))),
  }));
}

/** Picks the requested default when it survives; otherwise the first remaining environment. */
export function resolveDefaultEnvironmentId(environments: readonly { id?: string }[], requested: string | null | undefined): string | null {
  if (requested && environments.some((environment) => environment.id === requested)) return requested;
  return environments.find((environment) => typeof environment.id === "string" && environment.id)?.id ?? null;
}

/**
 * Rejects whole-table saves that cannot be represented: duplicate names or ids, or a default
 * variable environment outside the submitted existing set. Returns a user-facing issue or
 * `undefined` when the payload is coherent.
 */
export function configurationSaveIssue(payload: Pick<ConfigurationSave, "environments" | "defaultEnvironmentId">): string | undefined {
  if (!payload.environments) return undefined;
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const environment of payload.environments) {
    if (names.has(environment.name)) return "环境名称不能重复";
    names.add(environment.name);
    if (environment.id !== undefined) {
      if (ids.has(environment.id)) return "变量环境标识不能重复";
      ids.add(environment.id);
    }
  }
  if (payload.defaultEnvironmentId && !ids.has(payload.defaultEnvironmentId)) return "默认变量环境不存在";
  return undefined;
}

/** Reads the frozen `{id, name}` identity the Worker stores in `registry_snapshot`. */
export function frozenVariableEnvironment(snapshot: unknown): { id: string | null; name: string | null } {
  const frozen = objectOf(objectOf(snapshot)?.variableEnvironment);
  return {
    id: typeof frozen?.id === "string" && frozen.id ? frozen.id : null,
    name: typeof frozen?.name === "string" && frozen.name ? frozen.name : null,
  };
}

/**
 * Freezes the selected variable environment into the registry snapshot stored on the Run.
 * The Worker also stores it when it resolves the environment itself; this keeps the Run
 * displayable even after the environment is deleted.
 */
export function withFrozenVariableEnvironment(registrySnapshot: unknown, environment: { id: string; name: string } | null | undefined): Record<string, unknown> {
  const snapshot = { ...(objectOf(registrySnapshot) ?? {}) };
  if (environment) snapshot.variableEnvironment = { id: environment.id, name: environment.name };
  return snapshot;
}
