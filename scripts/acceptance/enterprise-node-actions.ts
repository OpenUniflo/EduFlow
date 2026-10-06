/** Explicit TEST resources for existing enterprise roots. Never imported by production. */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import scenario from './fixtures/enterprise-project-v1.json' with {type:'json'};
const version='enterprise-node-action-v5';
const notice='TEST 受控业务案例；数值仅用于核验方法。完成执行不授予正式能力。';
const cases=[
 {key:'critical',input:'物料 A 没有已批准替代品，断供会使主线停产 12 小时；包装 B 有两家已批准替代供应商。',method:'按停产影响、替代可用性和恢复时间判断关键性，不能只按单价或采购金额排序。A 应优先核验与保障；B 的替代能力仍需验证产能和交期。',task:'制作两项物料的关键性判定表，列出影响、替代证据、待核验信息及保障优先级。',output:'两行判定表及每项结论的事实依据。'},
 {key:'lead',input:'各阶段顺序且不重叠：生产 5 天、运输 3 天、清关 2 天、收货 1 天；风险缓冲另计 2 天。',method:'基础交期为 5+3+2+1=11 天，含缓冲计划为 13 天。不能把缓冲当作已发生事实，也不能把顺序阶段按最大值计算。',task:'制作交期分解表，计算基础与含缓冲交期，并注明顺序、重叠和日历假设。',output:'交期表、11 天与 13 天的计算过程，以及需要业务核验的假设。'},
 {key:'cost',input:'统一币种与每件口径：采购 20、运费 2、关税 1、收货处理 0.5；这些项目互不包含。',method:'单位落地成本为 20+2+1+0.5=23.5。比较前统一币种、数量口径及贸易条款，避免重复计入已包含的费用。',task:'制作单位落地成本表，计算合计并说明费用边界与缺失项目的核验办法。',output:'费用明细、23.5 合计、口径与避免重复计费的说明。'},
 {key:'net',input:'需求 1000 件；可用库存 250 件；需求日期前已确认到货 150 件；另有待检库存 100 件，不可使用。',method:'净需求为 max(0,1000-250-150)=600 件。待检库存不属于可用库存，不扣减净需求；延期到货也不能冲抵当前需求。',task:'制作净需求核算记录，保留需求、可用库存、按期到货及排除项目的依据。',output:'600 件净需求计算、待检 100 件排除说明和日期核验项。'},
 {key:'criteria',input:'采购需求：6061 合金板，厚度 2.0±0.1 mm，约定日期前交付 2000 件；有效材料认证为准入门槛。成本评分只在全部门槛通过后比较。',method:'把材料、尺寸、数量、交期和认证分别写成可检验准则，并明确证据和责任人。缺少有效认证必须待核验或不通过；低成本不能抵消准入门槛失败。',task:'制定供应商筛选准则表，区分强制门槛与评分项，为各门槛定义验证证据、通过条件及缺失证据处理。',output:'筛选准则表：材料、厚度、数量、交期、认证门槛，以及成本评分的适用条件。'}
];
const identity=(key:string)=>{const h=createHash('sha256').update(`${version}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const quote=(value:unknown)=>`'${(typeof value==='string'?value:JSON.stringify(value)).replace(/'/g,"''")}'`;
export function enterpriseNodeActionFixture(){
 const groups=cases.map((c,index)=>{
  const node=scenario.nodes.find(n=>n.key===c.key);if(!node||scenario.relations.some(r=>r[1]===c.key))throw new Error('Node executor requires a real root');
  const pathId=`${version}-${c.key}`,unitId=`${pathId}-unit`,assignmentId=`${version}-${c.key}-artifact`;
  const path={id:pathId,knowledge_id:node.id,course_id:scenario.courseId,scope:'course',title:`TEST ${node.title}：方法与边界`,description:notice,mode:'learn',estimated_minutes:8,required:false,status:'published',revision:1};
  const unit={id:unitId,path_id:pathId,title:'业务输入、方法与边界',position:0,estimated_minutes:8,required:true};
  const steps=[
   {id:`${pathId}-input`,unit_id:unitId,position:0,kind:'explanation',title:'核验业务输入',content:`${notice}\n${c.input}`,interaction:null},
   {id:`${pathId}-method`,unit_id:unitId,position:1,kind:'explanation',title:'方法与条件',content:c.method,interaction:null},
   {id:`${pathId}-boundary`,unit_id:unitId,position:2,kind:'summary',title:'成果与能力边界',content:`${c.task}\n${c.output}\n执行完成与正式能力分开。保留计算、证据和假设；能力仅由独立证据分析与明确确认更新。`,interaction:null}
  ];
  const assignment={course_id:scenario.courseId,id:assignmentId,display_order:124+index,title:`TEST ${node.title}业务成果`,description:`${notice}\n${c.input}`,requirements:[c.task,'提交本人制作的成果，保留原始输入、依据、假设及待核验项。'],expected_output:c.output,acceptance_criteria:[node.criterion,'成果与给定输入一致；未证实信息不写成已验证事实。'],mode:'instruction',estimated_minutes:30,experience:{type:'answer',knowledgeNodeId:node.id,prompt:`${c.task}\n${c.input}\n成果：${c.output}\n可提交文字、真实私有附件或二者；需要人工判断时保留 pending。`}};
  const coverage={course_id:scenario.courseId,id:identity(`coverage:${node.id}`),assignment_id:assignmentId,node_id:node.id,role:'practice',required:false};
  const actions=['micro_learning','practice_task'].map(type=>({id:identity(`${node.id}:${type}`),edge_id:null,node_id:node.id,type,title:type==='micro_learning'?`TEST 学习${node.title}`:assignment.title,description:type==='micro_learning'?c.method:c.task,estimated_minutes:type==='micro_learning'?8:30,difficulty:2,resource_requirements:type==='practice_task'?['business-input']:[],required_capability_ids:[],expected_evidence:type==='micro_learning'?'本 Path 的步骤完成记录；不更新 UKS。':c.output,status:'active',provenance:{kind:'acceptance',version,courseId:scenario.courseId}}));
  const bindings=actions.map(action=>({id:identity(`binding:${action.id}`),course_id:scenario.courseId,action_id:action.id,context:`${notice}\n${c.input}`,instructions:action.type==='micro_learning'?'完成输入、方法和成果边界三个步骤。':c.task,resources:action.type==='practice_task'?[{key:'business-input',label:'受控案例输入',reference:c.input,available:true}]:[],available:true,micro_path_id:action.type==='micro_learning'?pathId:null,assignment_id:action.type==='practice_task'?assignmentId:null}));
  return {node,input:c.input,path,unit,steps,assignment,coverage,actions,bindings};
 });
 return {version,courseId:scenario.courseId,groups,paths:groups.map(g=>g.path),units:groups.map(g=>g.unit),steps:groups.flatMap(g=>g.steps),assignments:groups.map(g=>g.assignment),coverages:groups.map(g=>g.coverage),actions:groups.flatMap(g=>g.actions),bindings:groups.flatMap(g=>g.bindings)};
}
export function enterpriseNodeSql(){
 const f=enterpriseNodeActionFixture();
 const checks=f.groups.map(g=>`if not exists(select 1 from knowledge_nodes where id=${quote(g.node.id)} and status='active' and scope='global') or exists(select 1 from knowledge_edges where target_node_id=${quote(g.node.id)} and lifecycle_status='active') then raise exception 'Existing real root required';end if;`).join('\n');
 const records:Array<[string,Record<string,unknown>[]]>=[['micro_learning_paths',f.paths],['micro_units',f.units],['micro_steps',f.steps],['course_assignments',f.assignments],['assignment_coverages',f.coverages],['knowledge_edge_actions',f.actions],['course_action_bindings',f.bindings]];
 const inserts=records.map(([table,rows])=>{const cols=Object.keys(rows[0]).join(',');return `insert into public.${table}(${cols}) select ${cols} from jsonb_populate_recordset(null::public.${table},${quote(rows)}::jsonb) on conflict do nothing;`;});
 return `begin;\nselect pg_advisory_xact_lock(hashtext(${quote(version)}));\ndo $$ begin\n${checks}\nend $$;\n${inserts.join('\n')}\ncommit;\n`;
}
if(process.argv[1]?.endsWith('/enterprise-node-actions.ts')){const output=process.argv[2];if(!output)throw new Error('Provide output path; generator never mutates a database.');writeFileSync(output,enterpriseNodeSql());console.log(JSON.stringify({output,roots:5,micro:5,practice:5}));}
