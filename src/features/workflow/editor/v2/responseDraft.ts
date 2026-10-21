import type { JsonSchema, JsonValue } from "../../domain/v2/types";

type JsonObject = Record<string, JsonValue>;

/**
 * A required plain text response field is a property that must exist but may be
 * empty. Only human-response drafts receive the explicit empty string; run
 * input, State and historical values must not be rewritten by this policy.
 */
export function isPlainRequiredTextSchema(schema: JsonSchema | boolean | undefined): schema is JsonSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  if (schema.type !== "string" || Array.isArray(schema.type)) return false;
  if (schema.enum !== undefined || schema.const !== undefined) return false;
  return true;
}

export function initializeResponseDraft(schema: JsonSchema, value: JsonObject): JsonObject {
  return initializeObject(schema, value).value;
}

function initializeObject(schema: JsonSchema, value: JsonObject): { value: JsonObject; changed: boolean } {
  if (schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    return { value, changed: false };
  }
  const properties = schema.properties as Record<string, JsonValue>;
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  let changed = false;
  const next: JsonObject = { ...value };
  for (const [name, raw] of Object.entries(properties)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const property = raw as JsonSchema;
    const current = next[name];
    if (required.has(name) && isPlainRequiredTextSchema(property)) {
      // A missing required text property becomes an explicit empty string.
      // Existing null, false, 0, [] and strings are preserved as user values.
      if (current === undefined) { next[name] = ""; changed = true; }
      continue;
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
      const nested = initializeObject(property, current as JsonObject);
      if (nested.changed) { next[name] = nested.value; changed = true; }
    }
  }
  return changed ? { value: next, changed: true } : { value, changed: false };
}
