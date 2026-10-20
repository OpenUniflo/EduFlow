import { z } from "zod";
import type { JsonValue } from "./types";

function wellFormedUnicode(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { const following = value.charCodeAt(++index); if (!(following >= 0xdc00 && following <= 0xdfff)) return false; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const jsonStringSchema = z.string().refine(wellFormedUnicode, "JSON 文本含无效 Unicode。");
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), jsonStringSchema, z.number().finite().refine(value => !Number.isInteger(value) || Number.isSafeInteger(value), "整数超出可互操作范围。"),
  z.array(jsonValueSchema), z.record(jsonStringSchema, jsonValueSchema)
]));
const jsonObject = z.record(jsonStringSchema, jsonValueSchema);
export const bindingSchema = z.union([
  z.object({ source: z.literal("literal"), value: jsonValueSchema }).strict(),
  z.object({ source: z.enum(["input", "state", "environment"]), pointer: z.string(), onMissing: z.union([z.object({ mode: z.literal("error") }).strict(), z.object({ mode: z.literal("default"), value: jsonValueSchema }).strict()]) }).strict()
]);
export const stateSchemaV2 = z.object({ schema: jsonObject, initial: jsonObject, inputBindings: z.record(z.string(), bindingSchema), reducers: z.record(z.string(), z.object({ name: z.string().min(1), version: z.literal(1) }).strict()) }).strict();
export const executionPolicySchema = z.object({ timeoutMs: z.number().int().positive(), nodeTimeoutMs: z.number().int().positive(), maxNodeExecutions: z.number().int().positive(), maxToolCalls: z.number().int().nonnegative(), maxInputBytes: z.number().int().positive(), maxStateBytes: z.number().int().positive(), maxEventBytes: z.number().int().positive(), maxOutputTokens: z.number().int().positive(), maxAttempts: z.number().int().min(1).max(10), authoring: z.object({recursionLimit:z.number().int().min(1).max(500),waitTimeoutMs:z.number().int().positive().max(604800000),checkpoint:z.literal("superstep"),interruptBefore:z.array(z.string()).optional(),interruptAfter:z.array(z.string()).optional(),entryRouter:z.string().optional()}).strict().optional(), maxCost: z.object({ amount: z.string(), currency: z.string() }).optional() }).strict();
export const definitionSchemaV2 = z.object({ schemaVersion: z.literal("2.0"), workflowId: z.string(), revision: z.number().int().nonnegative(), name: z.string().min(1), description: z.string(), inputSchema: jsonObject, outputSchema: jsonObject, state: stateSchemaV2,
  entryNodeId: z.string(), nodes: z.array(z.object({ id: z.string().min(1), label: z.string(), type: z.string().min(1), typeVersion: z.number().int().positive(), config: jsonObject, inputs: z.record(z.string(), bindingSchema), writes: z.record(z.string(), z.string()) }).strict()),
  transitions: z.array(z.object({ id: z.string().min(1), from: z.string(), outlet: z.string(), to: z.string() }).strict()), outputBindings: z.record(z.string(), bindingSchema), policy: executionPolicySchema, requiredCapabilities: z.array(z.string())
});
export function formatSchemaError(error: z.ZodError) { return error.issues.map(issue => `${issue.path.join(".") || "/"}: ${issue.message}`).join("\n"); }
