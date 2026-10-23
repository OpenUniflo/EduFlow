import type { JsonSchema, JsonValue } from "../../domain/v2/types";
import { resolveFormSchema } from "./SchemaForm";

/**
 * Binding type helpers extracted from `BindingFields.tsx` (M8). These are the single
 * implementation the unified node panel uses; `BindingFields` keeps its local copy until
 * the lead rewires it, so its existing tests stay untouched.
 */

const typeNames: Record<string, string> = { object: "对象", string: "文本", number: "数字", integer: "整数", boolean: "是或否", array: "列表", null: "空值" };

/** Declared types of a Schema node, resolving local `$ref`s against `root`. */
export function types(schema: JsonSchema, root: JsonSchema = schema): string[] {
  const resolved = resolveFormSchema(schema, root);
  return (Array.isArray(resolved.type) ? resolved.type : [resolved.type]).filter((value): value is string => typeof value === "string");
}

/**
 * A binding is usable when no side declares a type, when the declared types intersect, or
 * when integer/number cross. Empty target/source means "not declared", never a mismatch.
 */
export function compatible(source: string[], target: string[]): boolean {
  return !source.length || !target.length || source.some(type => target.includes(type) || type === "integer" && target.includes("number") || type === "number" && target.includes("integer"));
}

/** Human label for a declared-type list, e.g. `["string","null"]` → `文本或空值`. */
export function typeLabel(value: string[]): string {
  return value.map(type => typeNames[type] ?? type).join("或") || "类型未声明";
}

export type SchemaFieldOption = { pointer: string; label: string; types: string[] };

function asSchema(value: JsonValue | undefined): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Top-level Schema properties as pickable pointers, preserving declaration order. */
export function schemaOptions(schema: JsonSchema): SchemaFieldOption[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).map(([name, value]) => {
    const property = asSchema(value);
    return { pointer: `/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`, label: typeof property.title === "string" ? property.title : name, types: types(property, schema) };
  });
}

/** Plan 3.2 calls this helper `options()`; keep that name available for callers that copied it. */
export const options = schemaOptions;
