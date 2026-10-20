import { expect, it } from "vitest";
import { createWorkflowV2, stateBinding } from "./factory";
import { replaceInterfaceSchema } from "./graphInterfaceAuthoring";
import { authoringDiagnostics, frontendCapabilities, nodeAuthoring } from "./authoring";
import { definitionSchemaV2 } from "./schema";

it("removes only mappings owned by deleted interface fields, including escaped field names", () => {
  const graph=createWorkflowV2();graph.inputSchema={type:"object",properties:{"a/b":{type:"string"},kept:{type:"string"}}};
  graph.state.inputBindings={removed:{source:"input",pointer:"/a~1b",onMissing:{mode:"error"}},kept:{source:"input",pointer:"/kept",onMissing:{mode:"error"}},whole:{source:"input",pointer:"",onMissing:{mode:"error"}}};
  const next=replaceInterfaceSchema(graph,"input",{type:"object",properties:{kept:{type:"string"}}});
  expect(next.state.inputBindings.removed).toBeUndefined();expect(next.state.inputBindings.kept).toEqual(graph.state.inputBindings.kept);expect(next.state.inputBindings.whole).toEqual(graph.state.inputBindings.whole);
  const readded=replaceInterfaceSchema(next,"input",graph.inputSchema);expect(readded.state.inputBindings.removed).toBeUndefined();expect(graph.state.inputBindings.removed).toBeDefined();
  graph.outputSchema={type:"object",properties:{answer:{type:"string"}},additionalProperties:false};graph.outputBindings={answer:stateBinding("/answer")};
  expect(replaceInterfaceSchema(graph,"output",{type:"object",properties:{},additionalProperties:false}).outputBindings).toEqual({});
  expect(authoringDiagnostics({...graph,outputSchema:{type:"object",properties:{},additionalProperties:false}})).toContain("主流程：图输出映射 answer 未在输出接口中声明");
});
it("roundtrips future node and graph policies but never enables their live execution",()=>{
  const graph=createWorkflowV2();graph.policy.authoring={recursionLimit:75,waitTimeoutMs:604800000,checkpoint:"superstep"};
  graph.nodes[0].config.authoring={cache:{ttlMs:300000},errorHandler:{functionRef:"registered.error"}};
  const parsed=definitionSchemaV2.parse(JSON.parse(JSON.stringify(graph)));
  expect(parsed.policy.authoring).toEqual(graph.policy.authoring);
  expect(frontendCapabilities(parsed)).toEqual(expect.arrayContaining(["图中断等待与持久化策略","节点缓存","节点错误处理"]));
  expect(nodeAuthoring(graph.nodes[0]).errorHandler?.functionRef).toBe("registered.error");
  graph.nodes[0].config.authoring={interrupt:"malformed"};
  expect(nodeAuthoring(graph.nodes[0])).toEqual({});
  expect(authoringDiagnostics(graph)).toContain("主流程 / 入口：运行行为配置格式无效，请检查高级处理参数");
});
