import type { WorkflowRunV2, WorkflowThreadV2 } from '../../domain/v2/types';
import { StructuredValue } from './RunOutput';
import { executionObservation } from './executionObservation';

/** Execution panel is an observation/navigation surface, never a second response form. */
export function ThreadRecoveryPanel({run,thread,historyExpired,error,onLocate,onRecover}:{run?:WorkflowRunV2|null;thread:WorkflowThreadV2|null;historyExpired:boolean;error:string;onLocate:(nodeId:string,graphPath?:string[],interruptId?:string)=>void;onRecover:()=>void}){
  const state=executionObservation(run,thread,historyExpired);
  return <>{error?<p role="alert">等待状态读取失败：{error}</p>:null}{thread?<section className="wf-thread-status" aria-label="当前执行状态">
    <strong>{state.label}</strong>
    <p>流程版本 {thread.revision} · 累计执行 {thread.nodeExecutions} 个节点</p>
    {state.phase==='waiting'?<><p>请在对应节点的气泡中填写回应。</p>{thread.interrupts.map(item=><button key={item.id} onClick={()=>onLocate(item.nodeId,item.graphPath,item.id)}>定位：{item.graphPath?.length?"子图 / ":""}{item.title} · {item.taskId?.slice(0,8)??item.id.slice(0,8)}</button>)}</>:null}
    {state.phase==='failed'&&thread.status==='closed'&&thread.lastError&&!['RUN_CANCELLED','WAIT_EXPIRED'].includes(thread.lastError.code)?<><p>停止原因：{thread.lastError.code}</p>{!thread.checkpointId||['COMPILE_FINGERPRINT_CHANGED','CHECKPOINT_MISSING'].includes(thread.lastError.code)?<p>此运行没有可安全继续的检查点。请返回流程编辑，检查当前配置后点击运行，新建会话；原记录会保留。</p>:<><p>继续检查点会沿用原流程版本。配置错误需返回流程编辑，修正后新建运行；继续检查点不会应用新修改。</p><button onClick={onRecover}>尝试从检查点继续</button></>}</>:null}
    {historyExpired?<><p>这次执行的早期步骤日志已按保留规则清理；当前持久状态仍保留。</p><details><summary>当前 State</summary><StructuredValue value={thread.state}/></details></>:null}
    {state.phase==='waiting'&&thread.waitExpiresAt?<small>等待截止：{new Date(thread.waitExpiresAt).toLocaleString()}</small>:null}
    <details><summary>当前运行与检查点身份</summary><small>Run {thread.currentRunId}<br/>Thread {thread.threadId}<br/>Checkpoint {thread.checkpointId}</small></details>
  </section>:null}</>;
}
