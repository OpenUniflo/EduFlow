import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ThreadRecoveryPanel} from './ThreadRecoveryPanel';
import type {WorkflowThreadV2} from '../../domain/v2/types';
it('does not offer recovery for preparation failures without a safe checkpoint',()=>{
 const thread={threadId:'thread',status:'closed',checkpointId:'',lastError:{code:'COMPILE_FINGERPRINT_CHANGED'},interrupts:[],state:null} as unknown as WorkflowThreadV2;
 const render=(value:WorkflowThreadV2)=>renderToStaticMarkup(<ThreadRecoveryPanel run={null} thread={value} historyExpired={false} error="" onLocate={()=>{}} onRecover={()=>{}}/>);
 const unavailable=render(thread);expect(unavailable).toContain('没有可安全继续的进度');expect(unavailable).not.toContain('尝试从上次进度继续');
 const eligible=render({...thread,checkpointId:'cp',lastError:{code:'WORKER_LOST'}});expect(eligible).toContain('尝试从上次进度继续');
});
