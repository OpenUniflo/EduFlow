import { authoringExample, liveQuestionExample } from "@/features/workflow/domain/v2/authoringExamples";
import { createWorkflowV2 } from "@/features/workflow/domain/v2/factory";
import type { Binding, JsonSchema, WorkflowDefinitionV2, WorkflowDocumentV2 } from "@/features/workflow/domain/v2/types";
const obj=(properties:Record<string,JsonSchema>,required=Object.keys(properties)):JsonSchema=>({type:'object',properties,required,additionalProperties:false});
const state=(field:string):Binding=>({source:'state',pointer:'/'+field,onMissing:{mode:'error'}});
export function expenseExample():WorkflowDocumentV2 {
  const definition:WorkflowDefinitionV2={schemaVersion:'2.0',workflowId:'',revision:0,name:'差旅报销金额核算',description:'填写本次住宿费用，与已配置的交通费 200 元汇总，生成报销总额。此示例真实执行本地计算，不调用模型或外部服务。',inputSchema:obj({}),outputSchema:obj({'住宿费用（元）':{type:'number'},'交通费用（元）':{type:'number'},'报销合计（元）':{type:'number'}}),state:{schema:obj({accommodation:{type:'number',minimum:0},transport:{type:'number',minimum:0},total:{type:'number',minimum:0}}),initial:{accommodation:0,transport:200,total:0},inputBindings:{},reducers:{}},entryNodeId:'start',nodes:[{id:'start',label:'开始',type:'core.start',typeVersion:1,config:{},inputs:{},writes:{}},{id:'total',label:'汇总差旅费用',type:'core.transform',typeVersion:1,config:{operationRef:'core.add',operationVersion:1,authoring:{interrupt:{title:'请补充本次住宿费用',schema:obj({accommodation:{type:'number',title:'住宿费用（元）',description:'用于与交通费 200 元合计；如果没有住宿费用可填 0。',minimum:0,maximum:100000}}),resumeWrites:{accommodation:'accommodation'}}}},inputs:{left:state('accommodation'),right:state('transport')},writes:{total:'/value'}},{id:'end',label:'生成费用汇总',type:'core.end',typeVersion:1,config:{},inputs:{},writes:{}}],transitions:[{id:'start-total',from:'start',outlet:'next',to:'total'},{id:'total-end',from:'total',outlet:'next',to:'end'}],outputBindings:{'住宿费用（元）':state('accommodation'),'交通费用（元）':state('transport'),'报销合计（元）':state('total')},policy:{timeoutMs:120000,nodeTimeoutMs:30000,maxNodeExecutions:50,maxToolCalls:10,maxInputBytes:65536,maxStateBytes:1048576,maxEventBytes:65536,maxOutputTokens:2048,maxAttempts:1,authoring:{checkpoint:'superstep',waitTimeoutMs:86400000,recursionLimit:50}},requiredCapabilities:[]};
  const editor:WorkflowDocumentV2['editor']={schemaVersion:1,workflowId:'',definitionRevision:0,editorRevision:0,nodes:{start:{x:60,y:100},total:{x:350,y:100},end:{x:750,y:100}},edges:{}};
  return {definition,editor};
}
/** Explicit seed input; generic feature code never imports these fixtures as a fallback. */
export function workspaceWorkflowExamples(providerRef='',modelRef='') {
  const expense=expenseExample();expense.definition.workflowId='workspace-expense';
  const question=liveQuestionExample({...createWorkflowV2('节点提问与模型问答'),workflowId:'workspace-question'},providerRef,modelRef);
  const order=authoringExample('parallel',{...createWorkflowV2('订单并行与子图（前端演示）'),workflowId:'workspace-order-preview'});
  return [expense,question,order];
}
