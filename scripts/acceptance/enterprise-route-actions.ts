/** Explicit acceptance resources. Production never imports this catalog. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import scenario from './fixtures/enterprise-project-v1.json' with { type:'json' };
import teaching from './fixtures/enterprise-route-action-v3.json' with { type:'json' };
import practiceGold from './fixtures/practice-gold-v1.json' with { type:'json' };
const courseId=scenario.courseId;
const identity=(key:string)=>{const h=createHash('sha256').update(`${teaching.version}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const node=(key:string)=>{const found=scenario.nodes.find(n=>n.key===key);if(!found)throw new Error(`Unknown real Knowledge ${key}`);return found;};
export function enterpriseActionFixture(){
 const paths=teaching.cases.map(c=>({id:`${teaching.version}-${c.key}`,knowledge_id:node(c.key).id,course_id:courseId,scope:'course',title:`${node(c.key).title}：案例与边界`,description:teaching.note,mode:'learn',estimated_minutes:8,required:false,status:'published',revision:1}));
 const units=paths.map(p=>({id:`${p.id}-unit`,path_id:p.id,title:'解释、判断与迁移',position:0,estimated_minutes:8,required:true}));
 const steps=teaching.cases.flatMap((c,i)=>[
  {id:`${paths[i].id}-explain`,unit_id:units[i].id,position:0,kind:'explanation',title:'案例规则与计算依据',content:`${teaching.note}\n${c.explanation}`,interaction:null,success_feedback:null,retry_feedback:null},
  {id:`${paths[i].id}-check`,unit_id:units[i].id,position:1,kind:'check',title:'核验当前案例',content:c.question,interaction:{type:'choice',options:c.options,correctIndex:c.correct},success_feedback:`正确：${c.options[c.correct]}。${c.explanation}`,retry_feedback:`重新核对案例规则。${c.explanation}`},
  {id:`${paths[i].id}-apply`,unit_id:units[i].id,position:2,kind:'application',title:'检验边界条件',content:c.application,interaction:{type:'choice',options:c.applicationOptions,correctIndex:c.applicationCorrect},success_feedback:`正确：${c.applicationOptions[c.applicationCorrect]}。请保留题目给定的业务假设。`,retry_feedback:'区分已核验事实、缺失证据和不满足的业务门槛。不要用一个通过条件抵消其他门槛。'}
 ]);
 const makeAssignment=(c:typeof teaching.cases[number],variant:boolean,order:number)=>{
  const options=variant?c.applicationOptions:c.options,correct=variant?c.applicationCorrect:c.correct;
  const question=variant?c.application:c.question;
  const wrong=options[(correct+1)%options.length];
  const id=`${teaching.version}-${c.key}-${variant?'boundary':'trace'}`;
  return {course_id:courseId,id,display_order:order,title:`复核${node(c.key).title}${variant?'边界条件':'案例判断'}`,description:`${teaching.note}\n${c.explanation}`,requirements:[node(c.key).criterion,'定位轨迹中第一处违背案例依据的判断。'],expected_output:'明确指出错误判断的步骤；复核说明保持给定条件。',acceptance_criteria:['定位第一个错误判断，不把后续传播误认为最初错误。'],mode:'instruction',estimated_minutes:12,experience:{type:'trace',knowledgeNodeId:node(c.key).id,prompt:question,faultyStepId:'decision',traceSteps:[{id:'input',label:`读取已核验输入：${c.explanation}`},{id:'decision',label:`对“${question}”得出：${wrong}`},{id:'propagate',label:'将上述判断写入供应协同决策记录并交给下游执行。'}]}};
 };
 const assignments=teaching.cases.map((c,i)=>makeAssignment(c,false,4+i));
 const extraKeys=['exposure','impact','compare'];
 const extras=extraKeys.map((key,i)=>makeAssignment(teaching.cases.find(c=>c.key===key)!,true,4+assignments.length+i));assignments.push(...extras);
 // One explicit file executor preserves the upload Action; the other remains a text executor.
 const legacyAssignments=[['exposure','核算缺料暴露窗口'],['impact','推导订单停线与恢复窗口']].map(([key,title],i)=>({course_id:courseId,id:`${teaching.version}-${key}-record`,display_order:4+assignments.length+i,title,description:`${teaching.note}\n${teaching.cases.find(c=>c.key===key)!.explanation}`,requirements:[node(key).criterion],expected_output:'包含原始输入、计算过程、判断和假设的工作记录。',acceptance_criteria:[node(key).criterion],mode:'instruction',estimated_minutes:40,experience:{type:key==='exposure'?'code':'answer',knowledgeNodeId:node(key).id,prompt:key==='exposure'?'上传本人核算缺料暴露窗口的 TXT、Markdown 或 CSV 原始记录，可补充计算说明；文件名不能替代实际内容。':'提交本人推导订单停线与恢复窗口的工作记录。能力更新仍由独立证据分析与明确确认完成。'}}));
 const allAssignments=[...assignments,...legacyAssignments].map(assignment=>({...assignment,...practiceGold.assignments.find(gold=>gold.id===assignment.id)}));
 const coverages=allAssignments.map(a=>({course_id:courseId,id:`${a.id}-coverage`,assignment_id:a.id,node_id:a.experience.knowledgeNodeId,role:'practice',required:false}));
 const actions=scenario.relations.flatMap(([source,target,type])=>{
  const edgeId=`knowledge-${type==='enables'?'enables':'prerequisite'}-${node(source).id}-${node(target).id}`;
  const variants=['micro','practice',...((source==='net'&&target==='exposure')||(source==='exposure'&&target==='impact')||(source==='cost'&&target==='compare')?['boundary']:[])];
  return variants.map(variant=>({id:identity(`${edgeId}:${variant}`),edge_id:edgeId,type:variant==='micro'?'micro_learning':'practice_task',title:variant==='micro'?`学习${node(target).title}案例`:`复核${node(target).title}${variant==='boundary'?'边界条件':'案例判断'}`,description:`${teaching.note} ${node(source).title} → ${node(target).title}。`,estimated_minutes:variant==='micro'?8:12,difficulty:variant==='micro'?2:3,resource_requirements:[],required_capability_ids:[],expected_evidence:variant==='micro'?'绑定教学步骤的完成记录；不直接赋予正式能力。':'既有 Assignment Attempt、Performance Result 与 Evidence lineage；不直接赋予正式能力。',status:variant==='micro'?'active':'archived',provenance:{kind:'acceptance',version:teaching.version,courseId},target,variant}));
 });
 const bindings=actions.map(a=>({id:identity(`binding:${a.id}`),course_id:courseId,action_id:a.id,context:teaching.note,instructions:a.variant==='micro'?'完成解释、当前案例检查和边界应用。':'定位案例轨迹中第一处错误判断。',resources:[],available:a.variant==='micro',micro_path_id:a.variant==='micro'?`${teaching.version}-${a.target}`:null,assignment_id:a.variant==='micro'?null:`${teaching.version}-${a.target}-${a.variant==='boundary'?'boundary':'trace'}`}));
 const legacyBindings=[{action_id:'f2136047-8a15-480d-88ed-8fcb70ac599a',micro_path_id:'micro-shortage-exposure',assignment_id:null},{action_id:'3680f15d-f70b-4100-8cdc-7c281207a94d',micro_path_id:null,assignment_id:`${teaching.version}-exposure-record`},{action_id:'d4878d21-3971-4a70-bed6-0b31c3f43baa',micro_path_id:null,assignment_id:`${teaching.version}-impact-record`}];
 return {courseId,version:teaching.version,paths,units,steps,assignments:allAssignments,coverages,actions,bindings,legacyBindings};
}
const quote=(value:unknown)=>`'${(typeof value==='string'?value:JSON.stringify(value)).replace(/'/g,"''")}'`;
/** Upgrade only two existing Gold tasks; no user state, IDs or relationship writes. */
export function practiceGoldUpdateSql(){
 const tasks=practiceGold.assignments.map(task=>`update course_assignments set title=${quote(task.title)},description=${quote(task.description)},requirements=${quote(task.requirements)}::jsonb,expected_output=${quote(task.expected_output)},acceptance_criteria=${quote(task.acceptance_criteria)}::jsonb,experience=${quote(task.experience)}::jsonb where course_id=${quote(practiceGold.courseId)} and id=${quote(task.id)};`);
 const actions=practiceGold.actions.flatMap(link=>{
  const task=practiceGold.assignments.find(task=>task.id===link.assignmentId)!;
  const scope=`course_id=${quote(practiceGold.courseId)} and assignment_id=${quote(task.id)} and action_id=${quote(link.actionId)}::uuid`;
  return [`update knowledge_edge_actions set description=${quote(task.experience.prompt)},expected_evidence=${quote(task.expected_output)} where id=${quote(link.actionId)}::uuid and exists(select 1 from course_action_bindings where ${scope});`,
   `update course_action_bindings set context=${quote(task.description)},instructions=${quote(task.requirements.join('\n'))},resources=${quote([{key:link.resourceKey,label:link.resourceLabel,reference:task.description,available:true}])}::jsonb where ${scope};`];
 });
 return [...tasks,...actions].join('\n');
}
export function fixtureSQL(){
 const f=enterpriseActionFixture();
 const records:Array<[string,Record<string,unknown>[]]>=[['micro_learning_paths',f.paths],['micro_units',f.units],['micro_steps',f.steps],['course_assignments',f.assignments],['assignment_coverages',f.coverages],['knowledge_edge_actions',f.actions.map(({target:_t,variant:_v,...a})=>a)],['course_action_bindings',f.bindings]];
 const insert=(table:string,rows:Record<string,unknown>[])=>{const columns=Object.keys(rows[0]).join(',');return `insert into public.${table}(${columns}) select ${columns} from jsonb_populate_recordset(null::public.${table},${quote(rows)}::jsonb) on conflict do nothing;`;};
 const users=[['4eee17e2-6fe7-4de2-b0ba-3a177fe235f0','A'],['54cd7725-ae57-464b-beba-18e950546f0b','B']] as const;
 const states=users.flatMap(([user,actor])=>scenario.states[actor].map(key=>({user_id:user,node_id:node(key).id,status:'learned',mastery_origin:'direct',evidence:[{source:f.version,type:'acceptance-baseline',note:'用户明确授权的受控验收状态，不是测评或真实企业能力证据。'}]})));
 return `begin; select pg_advisory_xact_lock(hashtext(${quote(f.version)}));\n${records.map(([t,r])=>insert(t,r)).join('\n')}\n${practiceGoldUpdateSql()}\n${f.legacyBindings.map(b=>`update public.course_action_bindings set micro_path_id=${b.micro_path_id?quote(b.micro_path_id):'null'}, assignment_id=${b.assignment_id?quote(b.assignment_id):'null'} where course_id=${quote(f.courseId)} and action_id=${quote(b.action_id)} and micro_path_id is null and assignment_id is null;`).join('\n')}\n${insert('user_knowledge_states',states)}\ncommit;`;
}
if(process.argv[1]?.endsWith('/enterprise-route-actions.ts')){const output=process.argv[2];if(!output)throw new Error('Provide SQL output path; no implicit database writes.');writeFileSync(output,process.argv[3]==='--gold-only'?`begin;\n${practiceGoldUpdateSql()}\ncommit;`:fixtureSQL());console.log(JSON.stringify({output,...Object.fromEntries(Object.entries(enterpriseActionFixture()).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,(v as unknown[]).length]))}));}
