/** Explicit Edge-specific enterprise content; no production imports or user writes. */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import scenario from './fixtures/enterprise-project-v1.json' with {type:'json'};
import content from './fixtures/enterprise-ordered-route-v4.json' with {type:'json'};
import teaching from './fixtures/enterprise-route-action-v3.json' with {type:'json'};
const node=(key:string)=>{const found=scenario.nodes.find(n=>n.key===key);if(!found)throw new Error(`Unknown fixture Knowledge ${key}`);return found;};
const identity=(key:string)=>{const h=createHash('sha256').update(`${content.version}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const quote=(value:unknown)=>`'${(typeof value==='string'?value:JSON.stringify(value)).replace(/'/g,"''")}'`;
export function enterpriseOrderedActionFixture(){
 const groups=content.cases.map(c=>{
  const source=node(c.source),target=node(c.target);
  const relation=scenario.relations.find(r=>r[0]===c.source&&r[1]===c.target);if(!relation)throw new Error('Content must reference an existing factual Edge');
  const edgeId=`knowledge-${relation[2]==='enables'?'enables':'prerequisite'}-${source.id}-${target.id}`;
  const pathId=`${content.version}-${identity(`${edgeId}:micro-resource`)}`;
  const unitId=`${pathId}-unit`;
  const path={id:pathId,knowledge_id:target.id,course_id:content.courseId,scope:'course',title:`${source.title} → ${target.title}：执行信息`,description:`${content.notice}\n${c.microContext}`,mode:'learn',estimated_minutes:8,required:false,status:'published',revision:1};
  const unit={id:unitId,path_id:pathId,title:'源事实、业务转移与执行边界',position:0,estimated_minutes:8,required:true};
  const common=teaching.cases.find(example=>example.key===c.target)?.explanation;if(!common)throw new Error('Target teaching material missing');
  const steps=[
   {id:`${pathId}-context`,unit_id:unitId,position:0,kind:'explanation',title:'已有信息如何支持下一步',content:`${content.notice}\n你从${source.title}出发，目标是${target.title}。\n${c.microContext}`,interaction:null},
   {id:`${pathId}-example`,unit_id:unitId,position:1,kind:'explanation',title:'执行前需要核对的规则与材料',content:`本关系的业务输入：${c.practices[0].inputs}\n通用方法算例（独立案例，不能混作本任务实时输入）：${common}\n执行内容：${c.practices[0].task}`,interaction:null},
   {id:`${pathId}-boundary`,unit_id:unitId,position:2,kind:'summary',title:'成果要求与责任边界',content:`业务成果：${c.practices[0].expectedOutput}\n核验依据：${c.practices[0].acceptanceCriteria}\n学习步骤完成只是本次执行记录；业务成果请在正式选择的实践任务中提交。正式能力由独立证据判断与明确确认更新。`,interaction:null}
  ];
  const microId=identity(`${edgeId}:micro-action`);
  const micro={id:microId,edge_id:edgeId,type:'micro_learning',title:`理解${source.title}到${target.title}的执行信息`,description:c.microContext,estimated_minutes:8,difficulty:2,resource_requirements:[],required_capability_ids:[],expected_evidence:'本次绑定 Path 的教学步骤完成记录，不授予正式能力。',status:'active',provenance:{kind:'acceptance',version:content.version,courseId:content.courseId}};
  const practices=c.practices.map(task=>{
   const actionId=identity(`${edgeId}:${task.key}:action`),assignmentId=`${content.version}-${identity(`${edgeId}:${task.key}:assignment`)}`;
   const description=`${content.notice}\n已有起点：${source.title}。\n${task.inputs}`;
   const assignment={course_id:content.courseId,id:assignmentId,display_order:task.order,title:task.title,description,requirements:[task.task,'在成果中保留原始输入、判断依据、假设和待核验项；不伪造已执行的外部操作。'],expected_output:task.expectedOutput,acceptance_criteria:[task.acceptanceCriteria,'提交本人制作的业务成果，文字、真实私有附件或二者均可；需人工判断时保留 pending。'],mode:'instruction',estimated_minutes:35,experience:{type:'answer',knowledgeNodeId:target.id,prompt:`现在完成：${task.task}\n成果：${task.expectedOutput}\n核验依据：${task.acceptanceCriteria}\n可提交文字、文件或二者；先准备，再正式提交。`}};
   const action={id:actionId,edge_id:edgeId,type:'practice_task',title:task.title,description:`${source.title} → ${target.title}。${task.task}`,estimated_minutes:35,difficulty:3,resource_requirements:['business-input'],required_capability_ids:[],expected_evidence:task.expectedOutput,status:'active',provenance:{kind:'acceptance',version:content.version,courseId:content.courseId}};
   const binding={id:identity(`binding:${actionId}`),course_id:content.courseId,action_id:actionId,context:description,instructions:task.task,resources:[{key:'business-input',label:'本关系业务输入（受控案例）',reference:task.inputs,available:true}],available:true,micro_path_id:null,assignment_id:assignmentId};
   const coverage={course_id:content.courseId,id:identity(`coverage:${assignmentId}:${target.id}`),assignment_id:assignmentId,node_id:target.id,role:'practice',required:false};
   return {assignment,action,binding,coverage};
  });
  const microBinding={id:identity(`binding:${microId}`),course_id:content.courseId,action_id:microId,context:`${content.notice}\n${c.microContext}`,instructions:'阅读本关系的源事实、业务输入、通用算例和成果边界，完成三个信息步骤。',resources:[],available:true,micro_path_id:pathId,assignment_id:null};
  return {source,target,edgeId,relation:relation[2],path,unit,steps,micro,microBinding,practices,designReason:`${c.microContext} ${c.designReason}`};
 });
 return {courseId:content.courseId,version:content.version,groups,paths:groups.map(g=>g.path),units:groups.map(g=>g.unit),steps:groups.flatMap(g=>g.steps),assignments:groups.flatMap(g=>g.practices.map(p=>p.assignment)),coverages:groups.flatMap(g=>g.practices.map(p=>p.coverage)),actions:groups.flatMap(g=>[g.micro,...g.practices.map(p=>p.action)]),bindings:groups.flatMap(g=>[g.microBinding,...g.practices.map(p=>p.binding)])};
}
export function enterpriseOrderedSql(){
 const f=enterpriseOrderedActionFixture();
 const records:Array<[string,Record<string,unknown>[]]>=[['micro_learning_paths',f.paths],['micro_units',f.units],['micro_steps',f.steps],['course_assignments',f.assignments],['assignment_coverages',f.coverages],['knowledge_edge_actions',f.actions],['course_action_bindings',f.bindings]];
 const checks=f.groups.map(g=>`if not exists(select 1 from knowledge_edges where id=${quote(g.edgeId)} and source_node_id=${quote(g.source.id)} and target_node_id=${quote(g.target.id)} and relation=${quote(g.relation==='enables'?'enables':'prerequisite')} and lifecycle_status='active') then raise exception 'Factual Edge missing';end if;`).join('\n');
 const insert=(table:string,rows:Record<string,unknown>[])=>{const columns=Object.keys(rows[0]).join(',');return `insert into public.${table}(${columns}) select ${columns} from jsonb_populate_recordset(null::public.${table},${quote(rows)}::jsonb) on conflict do nothing;`;};
 return `begin;\nselect pg_advisory_xact_lock(hashtext(${quote(f.version)}));\ndo $$ begin\n${checks}\nend $$;\n${records.map(([t,r])=>insert(t,r)).join('\n')}\ncommit;\n`;
}
export function enterpriseOrderedAudit(){
 const f=enterpriseOrderedActionFixture();
 return `# Enterprise factual Edge / Action audit\n\n${content.notice}\n\n${content.sharedResourceRationale}\n\nNew catalog: ${f.groups.length} existing Edges, ${f.paths.length} Edge-specific Micro Paths, ${f.assignments.length} business Assignments. Counts describe this fixture; they are not model cardinality constraints. Existing identities, retired Trace, historical Runs/Versions and user states are untouched.\n\n| Edge | source | target | relation | Micro Actions | Practice Actions / concrete work | inputs | expected result | executor | shared resource | design reason |\n|---|---|---|---|---|---|---|---|---|---|---|\n`+f.groups.map(g=>[g.edgeId,g.source.title,g.target.title,g.relation,g.micro.id,g.practices.map(p=>`${p.action.id}: ${p.action.title}`).join('<br>'),g.practices.map(p=>p.assignment.description).join('<br>'),g.practices.map(p=>p.assignment.expected_output).join('<br>'),'Existing Micro + Assignment artifact submission; text/private file/mix, manual pending supported','Only legacy target method examples; new executor resources are Edge-specific',g.designReason].map(cell=>cell.replace(/\n/g,'<br>').replace(/\|/g,'／')).join(' | ')).map(row=>`| ${row} |`).join('\n')+'\n';
}
if(process.argv[1]?.endsWith('/enterprise-ordered-route-actions.ts')){const output=process.argv[2];if(!output)throw new Error('Supply output path; this generator never writes a database.');writeFileSync(output,process.argv[3]==='--audit'?enterpriseOrderedAudit():enterpriseOrderedSql());const f=enterpriseOrderedActionFixture();console.log(JSON.stringify({output,edges:f.groups.length,Micro:f.paths.length,Practice:f.assignments.length}));}
