import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEditorV2, createNodeV2, createWorkflowV2 } from '../../domain/v2/factory';
import type { WorkflowThreadV2 } from '../../domain/v2/types';
import { ExecutionBubbles } from './ExecutionBubbles';
import { NodeResponseForm } from './NodeResponseForm';
import { ThreadRecoveryPanel } from './ThreadRecoveryPanel';

vi.mock('@xyflow/react', () => ({ ViewportPortal: ({children}:{children:ReactNode}) => children }));
const schema={type:'object',properties:{accommodation:{type:'number',title:'住宿费用（元）',description:'与交通费 200 元合计；没有住宿费用可填 0。',minimum:0}},required:['accommodation'],additionalProperties:false};
const thread:WorkflowThreadV2={threadId:'thread',workflowId:'workflow',revision:3,status:'waiting',currentRunId:'selected-run',checkpointId:'checkpoint',state:{transport:200},stateVersion:1,interrupts:[{id:'interrupt',nodeId:'total',title:'请补充住宿费用',schema}],updatedAt:'2026-10-18T00:00:00Z',nodeExecutions:1,toolCalls:0,computeMs:0};
const definition=createWorkflowV2();definition.nodes.push({...createNodeV2('core.transform','total'),label:'汇总差旅费用'});
const editor=createEditorV2(definition);

describe('node response placement',()=>{
  it('blocks approval and offers cancellation when review evidence is missing',()=>{
    const html=renderToStaticMarkup(<NodeResponseForm title="请确认费用" schema={schema} value={{accommodation:0}} onChange={()=>undefined} onInvalid={()=>undefined} onSubmit={()=>true} contextMissing onCancel={()=>undefined}/>);
    expect(html).toContain('缺少可核对的执行依据');
    expect(html).toContain('取消本次执行');
    expect(html).toMatch(/class="primary" disabled/);
  });
  it('shows an interrupted node without a completed step and keeps it visible when ordinary bubbles are off',()=>{
    const html=renderToStaticMarkup(<ExecutionBubbles definition={definition} editor={editor} steps={[]} events={[]} sizes={{}} onOpen={()=>undefined} showCompleted={false} waiting={{runId:'selected-run',nodeId:'total',content:<NodeResponseForm title="请补充住宿费用" schema={schema} value={{accommodation:0}} onChange={()=>undefined} onInvalid={()=>undefined} onSubmit={()=>true}/>}}/>);
    expect(html).toContain('data-bubble-node="total"');
    expect(html).toContain('data-run-id="selected-run"');
    expect(html).toContain('汇总差旅费用 · 等待回应');
    expect(html).toContain('住宿费用（元）');
    expect(html).toContain('value="0"');
    expect(html).toContain('提交回应并继续');
    expect(html).not.toContain('此字段必填');
  });
  it('does not show a completed-state summary alongside the pending response for the same node',()=>{
    const html=renderToStaticMarkup(<ExecutionBubbles definition={definition} editor={editor} steps={[{stepId:'prior',runId:'selected-run',nodeId:'total',invocation:1,attempt:1,status:'completed',output:{answer:999}}]} events={[]} sizes={{}} onOpen={()=>undefined} waiting={{runId:'selected-run',nodeId:'total',content:<span>需要当前回应</span>}}/>);
    expect(html).toContain('需要当前回应');expect(html).not.toContain('查看汇总差旅费用执行详情');expect(html).not.toContain('999');
  });
  it('keeps the execution panel observational even when early run logs have expired',()=>{
    const html=renderToStaticMarkup(<ThreadRecoveryPanel thread={thread} historyExpired error="" onLocate={()=>undefined} onRecover={()=>undefined}/>);
    expect(html).toContain('定位：请补充住宿费用');expect(html).toContain('早期步骤日志');expect(html).toContain('selected-run');expect(html).toContain('200');
    expect(html).not.toMatch(/<(input|textarea|select|form)\b/);expect(html).not.toContain('提交回应并继续');
  });
});
