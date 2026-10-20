import { useState } from "react";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import type { JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "../../domain/v2/types";
import { SchemaForm } from "./SchemaForm";
import { StructuredValue } from "./RunOutput";
export function NodeTestPanel({definition,node,environmentRef,input,blocked}:{definition:WorkflowDefinitionV2;node:WorkflowNodeV2;environmentRef:string;input:JsonValue;blocked:boolean}) {
  const [state,setState]=useState<JsonValue>(definition.state.initial),[testInput,setTestInput]=useState(input),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [confirmed,setConfirmed]=useState(false),[result,setResult]=useState<Awaited<ReturnType<typeof workflowApiV2.testNode>>|null>(null);
  const [invalidInput,setInvalidInput]=useState(""),[invalidState,setInvalidState]=useState("");
  if(["core.start","core.end"].includes(node.type))return null;
  if(node.type.startsWith("control.")||node.type==="core.subgraph")return <p>请运行整个工作流来验证控制流、子图及其中的等待恢复。</p>;
  async function test(){setBusy(true);setError("");setResult(null);try{setResult(await workflowApiV2.testNode({workflowId:definition.workflowId,baseRevision:definition.revision,definition,nodeId:node.id,input:testInput,state,environmentRef,confirmExternalEffect:confirmed}));}catch(reason){setError(workflowErrorMessage(reason));}finally{setBusy(false);}}
  return <details className="wf-node-test"><summary>测试此节点</summary><p>只执行当前节点，展示返回值和拟写入的 State；测试数据不更新正式运行记录。模型和工具会发出真实请求。</p><SchemaForm label="测试外部调用数据" draftKind="run-input" prefix={`test-input-${node.id}`} schema={definition.inputSchema} value={testInput} onChange={setTestInput} onInvalid={setInvalidInput}/><SchemaForm label="测试 State" draftKind="run-input" prefix={`test-state-${node.id}`} schema={definition.state.schema} value={state} onChange={setState} onInvalid={setInvalidState}/>{["core.tool","core.tool_dispatch"].includes(node.type)?<label className="wf-v2-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>允许本次测试调用工具，可能修改外部数据。</span></label>:null}<button disabled={busy||blocked||!environmentRef||Boolean(invalidInput||invalidState)} onClick={()=>void test()}>{busy?"正在测试…":"运行节点测试"}</button>{blocked?<p>请先完成未应用的配置编辑。</p>:null}{error?<p role="alert">{error}</p>:null}{result?<section aria-label="节点测试结果"><h4>实际读取</h4><StructuredValue value={result.input}/><h4>节点返回</h4><StructuredValue value={result.output}/><h4>拟写入 State</h4><StructuredValue value={result.writes}/><details><summary>测试 State 前后值</summary><h4>测试前</h4><StructuredValue value={result.stateBefore}/><h4>测试后</h4><StructuredValue value={result.stateAfter}/></details></section>:null}</details>;
}
