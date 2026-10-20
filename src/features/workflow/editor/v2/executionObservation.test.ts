import {expect,it} from 'vitest';
import type {WorkflowRunV2,WorkflowThreadV2} from '../../domain/v2/types';
import {executionObservation} from './executionObservation';
const run=(status:string)=>({runId:'r',revision:2,status}) as WorkflowRunV2;
const thread={threadId:'t',currentRunId:'r',revision:2,status:'closed'} as WorkflowThreadV2;
it.each([['success','已完成'],['failed','执行失败'],['cancelled','已取消'],['continued','已继续执行']])('uses Run outcome %s even when Thread lifecycle disagrees',(status,label)=>{
  expect(executionObservation(run(status),{...thread,status:'waiting'})).toMatchObject({label,terminal:true});
  expect(executionObservation(run(status),thread).banner).toBe(`${label} · 运行记录 · 流程版本 2`);
});
it('does not infer success from a closed Thread after its logs are cleared',()=>{
  expect(executionObservation(null,thread,true).label).toBe('运行已结束，详细结果已清理');
  expect(executionObservation(null,{...thread,status:'expired'},true).label).toBe('等待已到期');
});
it('never imports another Run waiting state into a historical record',()=>{
  expect(executionObservation(run('running'),{...thread,currentRunId:'other',status:'waiting'}).label).toBe('运行中');
  expect(executionObservation(run('running'),{...thread,status:'waiting'}).banner).toBe('等待回应 · 流程版本 2');
});
it('does not let a stale expiry reason override a confirmed cancelled Run outcome',()=>{
  const cancelled={...run('cancelled'),error:{code:'WAIT_EXPIRED',message:'deadline race'}};
  expect(executionObservation(cancelled,{...thread,status:'expired'}).label).toBe('已取消');
});
