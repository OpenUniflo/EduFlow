import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { practiceContextsForSource, readPracticeContext, readPracticeReview } from './practiceContext';
type Row=Record<string,any>;
const rows:Record<string,Row[]>={
 learning_attempts:[{id:'attempt',user_id:'owner',course_id:'course',assignment_id:'task',action_run_id:'run',attempt_number:2,submitted_at:'date',response:{kind:'answer',text:'actual user work',attachmentSourceIds:['file']}}],
 course_assignments:[{id:'task',course_id:'course',title:'Calculate',description:'real scenario',requirements:['calculate'],expected_output:'table',acceptance_criteria:['correct balance'],experience:{type:'answer'}}],
 performance_results:[{id:'result',attempt_id:'attempt',user_id:'owner',version:2,outcome:'failed',feedback:{message:'incorrect balance'}}],
 edge_action_runs:[{id:'run',user_id:'owner',course_id:'course',assignment_id:'task',action_id:'action',edge_id:'edge',status:'completed',execution_snapshot:{targetId:'target'}}],
 knowledge_edge_actions:[{id:'action',edge_id:'edge',title:'Act',type:'practice_task'}],knowledge_edges:[{id:'edge',source_node_id:'source',target_node_id:'target',relation:'enables'}],assignment_coverages:[{course_id:'course',assignment_id:'task',node_id:'target'}],
 user_evidence_sources:[{id:'file',user_id:'owner',title:'actual.csv',parsed_lines:[{line:1,text:'actual private bytes'}],parse_status:'ready',archived_at:null}],
};
function client(tables=rows){return {from(table:string){let selected=[...(tables[table]??[])];const q={select(){return q;},eq(key:string,value:unknown){selected=selected.filter(row=>row[key]===value);return q;},in(key:string,value:unknown[]){selected=selected.filter(row=>value.includes(row[key]));return q;},contains(key:string,value:Row){selected=selected.filter(row=>Object.entries(value).every(([field,ids])=>ids.every((id:string)=>row[key][field]?.includes(id))));return q;},order(){return q;},limit(){return q;},range(start:number,end:number){return Promise.resolve({data:selected.slice(start,end+1),error:null});},maybeSingle(){return Promise.resolve({data:selected[0]??null,error:null});},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:selected,error:null}).then(resolve);}};return q;}} as unknown as SupabaseClient;}
it('dynamically resolves task, criteria, original response, latest outcome/feedback and real Action/Edge without writes',async()=>{
 const before=JSON.stringify(rows);const context=await readPracticeContext(client(),'owner','attempt');
 expect(context).toMatchObject({assignment:{scenario:'real scenario',expectedOutput:'table',acceptanceCriteria:['correct balance']},attempt:{id:'attempt',number:2,response:{text:'actual user work'}},performanceResult:{id:'result',outcome:'failed',feedback:{message:'incorrect balance'}},actionRun:{id:'run',status:'completed'},action:{id:'action'},edge:{id:'edge',source_node_id:'source',target_node_id:'target'}});
 expect(JSON.stringify(rows)).toBe(before);
});
it('file-only work finds the formal attempt independently of text Evidence creation',async()=>{
 expect(await practiceContextsForSource(client(),'owner',{id:'file',provenance:{kind:'practice-attachment'}})).toHaveLength(1);
 const context=await readPracticeReview(client(),'owner','attempt');expect(context.attachments[0].parsed_lines).toEqual([{line:1,text:'actual private bytes'}]);expect(context.authority).toContain('Never grade');
});
it('rejects foreign attempts and forged formal source lineage',async()=>{
 await expect(readPracticeContext(client(),'other','attempt')).rejects.toMatchObject({status:404});
 await expect(practiceContextsForSource(client(),'owner',{id:'forged',provenance:{kind:'assignment-response',attemptId:'attempt',courseId:'course',assignmentId:'task'}})).rejects.toMatchObject({status:409});
});
it.each(['passed','pending','failed'])('preserves %s as separate evidence context without assigning capabilities',async outcome=>{
 const context=await readPracticeContext(client({...rows,performance_results:[{...rows.performance_results[0],outcome}]}),'owner','attempt');expect(context.performanceResult.outcome).toBe(outcome);
});
it('resolves owned Node Practice evidence without inventing or querying an Edge',async()=>{
 const tables={...rows,edge_action_runs:[{...rows.edge_action_runs[0],edge_id:null,node_id:'target'}],knowledge_edge_actions:[{...rows.knowledge_edge_actions[0],edge_id:null,node_id:'target'}]};
 const before=JSON.stringify(tables);const owned=client(tables),from=owned.from.bind(owned);owned.from=((table:string)=>{if(table==='knowledge_edges')throw new Error('Node context must not query an Edge');return from(table);}) as typeof owned.from;
 const context=await readPracticeContext(owned,'owner','attempt');
 expect(context).toMatchObject({knowledgeIds:['target'],action:{node_id:'target',edge_id:null},edge:null,actionRun:{id:'run'}});
 expect(JSON.stringify(tables)).toBe(before);
 expect(await practiceContextsForSource(client(tables),'owner',{id:'attempt',provenance:{kind:'assignment-response',attemptId:'attempt',courseId:'course',assignmentId:'task'}})).toHaveLength(1);
});
it.each(['different-node','missing-coverage','mixed-scope'])('rejects invalid Node Practice %s lineage',async reason=>{
 const tables={...rows,edge_action_runs:[{...rows.edge_action_runs[0],edge_id:null,node_id:'target'}],knowledge_edge_actions:[{...rows.knowledge_edge_actions[0],edge_id:reason==='mixed-scope'?'edge':null,node_id:reason==='different-node'?'other':'target'}],assignment_coverages:reason==='missing-coverage'?[]:rows.assignment_coverages};
 await expect(readPracticeContext(client(tables),'owner','attempt')).rejects.toMatchObject({status:409});
});
