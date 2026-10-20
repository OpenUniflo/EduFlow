import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createWorkflowV2, createEditorV2 } from "./factory";
import { canonicalSemanticJson, validateSchemaValue, schemaDiagnostics } from "./validation";

it("exposes structured AJV field pointers without interpreting error prose or filling values", () => {
  const schema = { type:"object",properties:{"a/b~c":{type:"integer"},enabled:{type:"boolean"}},required:["a/b~c"] };
  expect(validateSchemaValue(schema,{enabled:false}).issues).toContainEqual({pointer:"/a~1b~0c",keyword:"required"});
  expect(validateSchemaValue(schema,{"a/b~c":"0",enabled:false}).issues).toContainEqual({pointer:"/a~1b~0c",keyword:"type"});
  expect(validateSchemaValue(schema,{"a/b~c":0,enabled:false}).valid).toBe(true);
});

describe("Workflow V2 semantic identity", () => {
  it("preserves execution identity across renames, layout and array ordering", () => {
    const definition = createWorkflowV2();
    const original = canonicalSemanticJson(definition);
    const editor = createEditorV2(definition); editor.nodes.start.x = 500;
    definition.name = "不同名称"; definition.revision = 9; definition.nodes[0].label = "改名"; definition.nodes.reverse();
    expect(canonicalSemanticJson(definition)).toBe(original);
    definition.transitions[0].to = "start";
    expect(canonicalSemanticJson(definition)).not.toBe(original);
  });
  it("rejects non-interoperable numbers and invalid unicode before canonicalizing", () => {
    const definition = createWorkflowV2();
    definition.state.initial.value = Number.MAX_SAFE_INTEGER + 1;
    expect(() => canonicalSemanticJson(definition)).toThrow();
    definition.state.initial = { value: "\ud800" };
    expect(() => canonicalSemanticJson(definition)).toThrow();
    definition.state.initial = { ["\ud800"]: 42 };
    expect(() => canonicalSemanticJson(definition)).toThrow();
    definition.state.initial = {};
    definition.state.schema = { type: "object", properties: { ["\ud800"]: { type: "string" } } };
    expect(() => canonicalSemanticJson(definition)).toThrow();
  });
  it("rejects recursive schemas rather than silently accepting them", () => {
    expect(schemaDiagnostics({ $defs: { recursive: { $ref: "#/$defs/recursive" } }, $ref: "#/$defs/recursive" }).some(item => item.code === "UNSUPPORTED_SCHEMA_REFERENCE")).toBe(true);
  });
  it("has a reproducible cross-language semantic hash", () => {
    const definition = createWorkflowV2();
    expect(createHash("sha256").update(canonicalSemanticJson(definition)).digest("hex")).toHaveLength(64);
  });
});
describe("Workflow V2 Schema boundary", () => {
  it("uses JSON schema validation without coercion or implicit defaults", () => {
    const schema = { type: "object", properties: { value: { type: ["number", "null"], default: 3 } }, required: ["value"], additionalProperties: false };
    expect(validateSchemaValue(schema, { value: null }).valid).toBe(true);
    expect(validateSchemaValue(schema, { value: "2" }).valid).toBe(false);
    const input = {}; expect(validateSchemaValue(schema, input).valid).toBe(false); expect(input).toEqual({});
  });
  it("treats advertised dialect as retained annotation with consistent repeat validation", () => {
    const schema = { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { value: { type: "number" } }, required: ["value"] };
    for (let index=0; index<2; index++) {
      expect(schemaDiagnostics(schema)).toEqual([]);
      expect(validateSchemaValue(schema, { value: "bad" }).valid).toBe(false);
      expect(validateSchemaValue(schema, { value: 42 }).valid).toBe(true);
    }
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
  });
  it("rejects unsupported validation and remote references", () => {
    expect(schemaDiagnostics({ type: "string", pattern: ".*" })[0].code).toBe("UNSUPPORTED_SCHEMA_KEYWORD");
    expect(schemaDiagnostics({ $ref: "https://example.com/schema" })[0].code).toBe("UNSUPPORTED_SCHEMA_REFERENCE");
  });
  it('accepts MCP extension annotations while retaining actual output validation',()=>{
    const schema={type:'object',properties:{result:{type:'array',items:{type:'string'}}},required:['result'],'x-fastmcp-wrap-result':true};
    expect(schemaDiagnostics(schema)).toEqual([]);
    expect(validateSchemaValue(schema,{result:['Overview']}).valid).toBe(true);
    expect(validateSchemaValue(schema,{result:42}).valid).toBe(false);
  });
});
