/** Scoped Enterprise Scenario V1 setup/verification. No production imports this fixture.
 * Runtime secrets: SUPABASE_SECRET_KEY, ACCEPTANCE_PUBLISHABLE_KEY, ACCEPTANCE_{A,B}_PASSWORD.
 * SQL is transactional and refuses conflicting governance; setup never resets learner history.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';
import scenario from './fixtures/enterprise-project-v1.json' with { type: 'json' };
import { buildCapabilityModel, planCourseRoute, type RoutePlanningInput } from '../../src/shared/learning/routePlanning.js';
import { validateCourseIntegrity } from '../../src/features/course/runtime/courseRuntime.js';
import { validateKnowledgeGraph } from '../../src/features/knowledge/graph.js';
import { InMemoryKnowledgeRepository } from '../../src/features/knowledge/repository/InMemoryKnowledgeRepository.js';
import { userKnowledgeAccess } from '../../src/features/knowledge/repository/KnowledgeRepository.js';
const projectRef = 'uyljtdbvlivxniililay';
const url = `https://${projectRef}.supabase.co`;
const courseId = scenario.courseId;
const stamp = '2026-10-03T00:00:00Z';
const byKey = new Map(scenario.nodes.map(n => [n.key, n]));
const id = (key: string) => { const node = byKey.get(key); assert.ok(node, key); return node.id; };
const actorEmail = (actor: string) => `project-capability-${actor.toLowerCase()}@eduflow.test`;
const quote = (value: unknown) => `'${(typeof value === 'string' ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const output = '.acceptance/enterprise-project-v1';
const provenance = (source: string) => [{ sourceType: 'manual', sourceId: scenario.version, sourceUrl: scenario.sources[source as keyof typeof scenario.sources], discoveredAt: stamp, classification: 'modeling', note: '匿名企业场景；定义与关系是公开框架支持的建模推导，不是现实企业状态。' }];
function tableInsert(table: string, rows: Record<string, unknown>[]) {
  const columns = Object.keys(rows[0]);
  const keys = table === 'domain_assignments' ? ['node_id'] : columns.includes('course_id') ? (table === 'course_curricula' ? ['course_id'] : ['course_id','id']) : ['id'];
  const match = keys.map(k => `t.${k}=r.${k}`).join(' and ');
  const json = quote(rows);
  return `do $$ begin if exists(select 1 from jsonb_populate_recordset(null::public.${table},${json}::jsonb) r join public.${table} t on ${match} where not (to_jsonb(t) @> (select value from jsonb_array_elements(${json}::jsonb) where ${keys.map(k => `value->>'${k}'=r.${k}::text`).join(' and ')}))) then raise exception 'Conflicting ${table} authority; manual review required'; end if; end $$;\ninsert into public.${table}(${columns}) select ${columns} from jsonb_populate_recordset(null::public.${table},${json}::jsonb) on conflict do nothing;`;
}
function catalogSQL(adminId: string) {
  const nodes = scenario.nodes.map(n => ({ id:n.id,title:n.title,description:n.criterion,node_type:'procedural',mastery_criteria:[n.criterion],scope:'global',owner_id:null,provenance:provenance(n.source),current_revision_id:`${n.id}:v1`,status:'active' }));
  const revisions=nodes.map(n=>({id:n.current_revision_id,node_id:n.id,version:1,title:n.title,description:n.description,node_type:n.node_type,mastery_criteria:n.mastery_criteria,created_by:adminId,change_reason:'Enterprise Scenario V1: independent domain review; modeling, not enterprise evidence.'}));
  const edges=scenario.relations.map(([s,t,type,reason])=>({id:`knowledge-${type==='enables'?'enables':'prerequisite'}-${id(s)}-${id(t)}`,source_node_id:id(s),target_node_id:id(t),relation:type==='enables'?'enables':'prerequisite',prerequisite_strength:type==='enables'?null:type,associative_strength:type==='enables'?0.85:null,reason:`[建模] ${reason}`,provenance:provenance(byKey.get(t)!.source),lifecycle_status:'active'}));
  const records: Array<[string,Record<string,unknown>[]]> = [
    ['knowledge_nodes',nodes],['knowledge_node_revisions',revisions],['knowledge_edges',edges],
    ['domain_assignments',nodes.map(n=>({node_id:n.id,domain_id:scenario.domainId,source:'admin',pinned:true,assigned_by:adminId}))],
    ['courses',[{id:courseId,title:scenario.title,subtitle:'同一业务目标 · 从当前能力出发',description:'匿名消费电子制造企业场景。围绕越南基地关键物料，比较供给方案、核验供应商准入与基地切换，并判断恢复优先级。测试主体状态为受控验收数据。',target_outcome:scenario.outcome,accent_color:'#0f766e',revision:scenario.version,generation_status:'ready',lifecycle:'published',author_user_id:adminId,course_type:'standard',owner_user_id:null}]],
    ['course_curricula',[{course_id:courseId,id:'supply-decisions',generation_mode:'manual'}]],
    ['curriculum_chapters',[{course_id:courseId,id:'supply-decisions',title:'供应协同决策',description:'对四类供应决策形成可解释的能力判断。',display_order:0,color:'#0f766e',outcome:scenario.outcome}]],
    ['curriculum_lessons',[{course_id:courseId,id:'decision-evidence',chapter_id:'supply-decisions',title:'供应决策证据',display_order:0}]],
    ['curriculum_coverages',scenario.targets.map((key,order)=>({course_id:courseId,id:`target-${key}`,lesson_id:'decision-evidence',node_id:id(key),role:'introduce',display_order:order}))],
    ['course_assignments',scenario.targets.map((key,order)=>({course_id:courseId,id:`decision-${key}`,display_order:order,title:`${byKey.get(key)!.title}案例评审`,description:'使用项目提供的匿名决策案例；提交结论、证据缺口和敏感性说明。',requirements:[byKey.get(key)!.criterion],expected_output:'有证据引用、判断与不确定性说明的决策记录。',acceptance_criteria:[byKey.get(key)!.criterion],mode:'instruction'}))],
    ['assignment_coverages',scenario.targets.map(key=>({course_id:courseId,id:`decision-coverage-${key}`,assignment_id:`decision-${key}`,node_id:id(key),role:'assess',required:true}))],
  ];
  return `begin; set constraints all deferred; select pg_advisory_xact_lock(hashtext(${quote(scenario.version)}));
  do $$ begin
  if not exists(select 1 from profiles where id=${quote(adminId)} and role='admin') then raise exception 'Explicit administrator required'; end if;
  if not exists(select 1 from knowledge_domains where id=${quote(scenario.domainId)} and status='active') then raise exception 'Reviewed Domain unavailable'; end if;
  if exists(select 1 from knowledge_nodes where title in (${nodes.map(n=>quote(n.title)).join(',')}) and id not in (${nodes.map(n=>quote(n.id)).join(',')})) then raise exception 'Semantic title collision: review reuse'; end if;
  if exists(select 1 from knowledge_edges e join jsonb_populate_recordset(null::knowledge_edges,${quote(edges)}::jsonb) r on e.source_node_id=r.source_node_id and e.target_node_id=r.target_node_id and e.relation=r.relation where e.id<>r.id) then raise exception 'Semantic edge collision'; end if;
  end $$;
  ${records.map(([table,rows])=>tableInsert(table,rows)).join('\n')}
  commit;`;
}
function executeSQL(sql: string) {
  assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),projectRef,'Refuse other Hosted project');
  const dir=mkdtempSync(join(tmpdir(),'eduflow-enterprise-sql-'));
  try { const file=join(dir,'transaction.sql');writeFileSync(file,sql,{mode:0o600});execFileSync('pnpm',['exec','supabase','db','query','--linked','--file',file,'--output','json'],{stdio:['ignore','pipe','pipe']}); }
  finally {rmSync(dir,{recursive:true,force:true});}
}
function privileged() {
  assert.equal(process.env.SUPABASE_URL,url,'Explicit Hosted URL required');
  assert.ok(process.env.SUPABASE_SECRET_KEY,'Server key required only for setup/transition');
  return createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function setup() {
  const c=privileged(); const users: User[]=[];
  for(let page=1;;page++){const r=await c.auth.admin.listUsers({page,perPage:100});assert.ifError(r.error);users.push(...r.data.users);if(r.data.users.length<100)break;}
  const admin=users.find(u=>u.email==='admin@eduflow.test');assert.ok(admin);
  executeSQL(catalogSQL(admin.id));
  for(const actor of ['A','B'] as const){
    let user: User | undefined=users.find(u=>u.email===actorEmail(actor));
    if(!user){const password=process.env[`ACCEPTANCE_${actor}_PASSWORD`];assert.ok(password&&password.length>=24);const r=await c.auth.admin.createUser({email:actorEmail(actor),password,email_confirm:true,user_metadata:{display_name:`供应协同测试主体 ${actor}`,acceptance:scenario.version}});assert.ifError(r.error);user=r.data.user!;}
    assert.equal(user.user_metadata.acceptance,scenario.version,'Refuse adopting unrelated account');
    const initialized=await c.from('profiles').upsert({id:user.id,display_name:`供应协同测试主体 ${actor}`,role:'student',capabilities:[]},{onConflict:'id',ignoreDuplicates:true});assert.ifError(initialized.error);
    const profile=await c.from('profiles').select('role,capabilities').eq('id',user.id).single();assert.ifError(profile.error);assert.deepEqual(profile.data,{role:'student',capabilities:[]});
    const membership=await c.from('user_course_states').upsert({user_id:user.id,course_id:courseId,is_active:true});assert.ifError(membership.error);
    const states=scenario.states[actor].map(key=>({user_id:user.id,node_id:id(key),status:'learned',mastery_origin:'direct',evidence:[{source:scenario.version,type:'acceptance-baseline',note:'受控测试状态，不是现实能力测评。'}],updated_at:stamp}));
    const saved=await c.from('user_knowledge_states').upsert(states,{onConflict:'user_id,node_id',ignoreDuplicates:true});assert.ifError(saved.error);
  }
  console.log('Scoped catalog and A/B baseline present; existing state/history preserved.');
}
async function transition(reset=false){
  const c=privileged();const {data,error}=await c.auth.admin.listUsers({page:1,perPage:100});assert.ifError(error);const user=data.users.find(u=>u.email===actorEmail('A'));assert.equal(user?.user_metadata.acceptance,scenario.version);assert.ok(user);
  const existing=await c.from('user_knowledge_states').select('*').eq('user_id',user.id).eq('node_id',id(scenario.transition.node)).maybeSingle();assert.ifError(existing.error);
  if(existing.data){assert.equal(existing.data.status,'learned');assert.equal(existing.data.mastery_origin,'direct');assert.ok(Array.isArray(existing.data.evidence)&&existing.data.evidence.length===1&&existing.data.evidence[0].source===scenario.version&&existing.data.evidence[0].type==='acceptance-transition','Refuse modifying genuine or mixed learning evidence');}
  if(reset){if(existing.data){const r=await c.from('user_knowledge_states').delete().eq('user_id',user.id).eq('node_id',id(scenario.transition.node));assert.ifError(r.error);}}
  else if(!existing.data){const r=await c.from('user_knowledge_states').insert({user_id:user.id,node_id:id(scenario.transition.node),status:'learned',mastery_origin:'direct',evidence:[{source:scenario.version,type:'acceptance-transition',note:'受控 T0→T1，只验证 State→Gap→Route；非企业 Evidence inference。'}]});assert.ifError(r.error);}
  console.log(reset?'A restored to controlled T0; route history retained.':'A transitioned to T1 through controlled server authority; no route adoption.');
}
async function verify() {
  const preview=process.env.ACCEPTANCE_PREVIEW_URL!;assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);
  const key=process.env.ACCEPTANCE_PUBLISHABLE_KEY!;assert.ok(key);
  const captures=[];
  for(const actor of ['A','B'] as const){
    const auth=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:actorEmail(actor),password:process.env[`ACCEPTANCE_${actor}_PASSWORD`]})});assert.equal(auth.status,200,`${actor} login`);const session=await auth.json();
    const headers={apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
    async function get(path:string,direct=false){const r=await fetch(`${direct?url:preview}${path}`,{headers});assert.equal(r.status,200,path);return r.json();}
    const [view,{graph},{course:runtime},states,profile,membership,history,nav]=await Promise.all([
      get(`/api/learner?resource=route-plan&courseId=${courseId}`),get('/api/knowledge'),get(`/api/courses?id=${courseId}`),get(`/rest/v1/user_knowledge_states?user_id=eq.${session.user.id}&select=*&order=node_id`,true),get(`/rest/v1/profiles?id=eq.${session.user.id}&select=role,capabilities`,true),get(`/rest/v1/user_course_states?course_id=eq.${courseId}&select=is_active`,true),get(`/rest/v1/personal_course_route_versions?course_id=eq.${courseId}&select=*&order=version_number`,true),get(`/api/navigation?courseId=${courseId}`)
    ]);
    assert.deepEqual(profile,[{role:'student',capabilities:[]}]);assert.deepEqual(membership,[{is_active:true}]);
    const changed=actor==='A'&&states.some((s:{node_id:string})=>s.node_id===id(scenario.transition.node));
    const phase=process.env.ACCEPTANCE_PHASE??'current';if(actor==='A'&&phase.endsWith('t0'))assert.equal(changed,false,'T0 baseline');if(actor==='A'&&phase.endsWith('t1'))assert.equal(changed,true,'T1 baseline');
    const expected=[...scenario.states[actor].map(id),...(changed?[id(scenario.transition.node)]:[])].sort();
    assert.deepEqual(states.map((s:{node_id:string})=>s.node_id).sort(),expected,'Exact controlled learner state set; no historical contamination');
    assert.ok(states.every((s:{status:string;mastery_origin:string;evidence:Array<{source:string}>})=>s.status==='learned'&&s.mastery_origin==='direct'&&s.evidence?.length===1&&s.evidence[0].source===scenario.version));
    validateKnowledgeGraph(graph);
    assert.equal(validateCourseIntegrity(runtime,new InMemoryKnowledgeRepository(graph),userKnowledgeAccess(session.user.id)),true);
    for(const node of scenario.nodes)assert.ok(graph.nodes.some((n:{id:string;scope:string})=>n.id===node.id&&n.scope==='global'));
    const input:RoutePlanningInput={nodeIds:graph.nodes.filter((n:{status:string})=>n.status==='active').map((n:{id:string})=>n.id),prerequisiteEdges:graph.edges.filter((e:{relation:string})=>e.relation==='prerequisite').map((e:{id:string;source:string;target:string;strength:'hard'|'soft'})=>({id:e.id,source:e.source,target:e.target,strength:e.strength})),enablesEdges:graph.edges.filter((e:{relation:string})=>e.relation==='enables').map((e:{id:string;source:string;target:string;strength:number})=>({id:e.id,source:e.source,target:e.target,relation:'enables' as const,strength:e.strength})),currentNodeIds:states.filter((s:{status:string})=>['learned','mastered','practicing'].includes(s.status)).map((s:{node_id:string})=>s.node_id),courseOrder:runtime.curriculumCoverages.map((r:{nodeId:string;order:number})=>({nodeId:r.nodeId,lessonOrder:0,coverageOrder:r.order}))};
    assert.deepEqual(view.model,buildCapabilityModel(input));assert.deepEqual(view.plan,planCourseRoute(input,view.activeVersion.constraints));assert.equal(view.plan.valid,true);
    assert.deepEqual([...view.model.courseKnowledgeIds].sort(),scenario.targets.map(id).sort());
    const gray=view.model.bridgeKnowledgeIds.filter((n:string)=>!input.currentNodeIds.includes(n));assert.ok(gray.length>0);
    const stateIds=new Set(input.currentNodeIds);const green=view.model.courseKnowledgeIds.filter((n:string)=>!stateIds.has(n));
    captures.push({actor,userId:session.user.id,profile:profile[0],membership:membership[0],blue:view.model.currentKnowledgeIds,gray,green,model:view.model,plan:view.plan,activeVersionId:view.activeVersion.id,versionNumber:view.activeVersion.versionNumber,history:history.map((r:{id:string})=>({id:r.id,sha256:digest(r)})),states,navigation:nav,sharedGraphNodeCount:graph.nodes.length,sharedGraphEdgeCount:graph.edges.length,courseIntegrity:true});
  }
  assert.notDeepEqual(captures[0].blue,captures[1].blue);assert.notDeepEqual(captures[0].gray,captures[1].gray);assert.notDeepEqual(captures[0].plan.route,captures[1].plan.route);assert.notDeepEqual(captures[0].navigation.path,captures[1].navigation.path);
  mkdirSync(output,{recursive:true});const phase=process.env.ACCEPTANCE_PHASE??'current';assert.match(phase,/^[a-z0-9-]+$/);writeFileSync(`${output}/${phase}.json`,JSON.stringify({preview,capturedAt:new Date().toISOString(),scenario:scenario.version,captures},null,2)+'\n');
  console.log(captures.map(c=>({actor:c.actor,blue:c.blue.length,gray:c.gray.length,green:c.green.length,route:c.plan.route.selectedNodeIds.length,version:c.versionNumber,next:c.navigation.nextAction})));
}
async function security() {
  const preview=process.env.ACCEPTANCE_PREVIEW_URL!;assert.match(new URL(preview).hostname,/^edu-flow-.*\.vercel\.app$/);
  const key=process.env.ACCEPTANCE_PUBLISHABLE_KEY!;
  const sessions: Array<{access_token:string;user:{id:string}}>=[];
  for(const actor of ['A','B']){
    const r=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:actorEmail(actor),password:process.env[`ACCEPTANCE_${actor}_PASSWORD`]})});assert.equal(r.status,200);sessions.push(await r.json());
  }
  const checks:Array<{name:string;status:number}>=[];
  async function request(actor:number,path:string,body?:unknown,direct=false,method?:string){
    const r=await fetch(`${direct?url:preview}${path}`,{method:method??(body?'POST':'GET'),headers:{apikey:key,Authorization:`Bearer ${sessions[actor].access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null};
  }
  function check(name:string,r:{status:number},status:number){assert.equal(r.status,status,name);checks.push({name,status:r.status});}
  const path=`/api/learner?resource=route-plan&courseId=${courseId}`;
  const a=await request(0,path),b=await request(1,path);check('A current route',a,200);check('B current route',b,200);
  for(const [actor,other] of [[0,b],[1,a]] as const){
    const hidden=await request(actor,`/rest/v1/personal_course_route_versions?id=eq.${other.body.activeVersion.id}&select=id`,undefined,true);check(`${actor} cross-user history hidden`,hidden,200);assert.deepEqual(hidden.body,[]);
    const otherStates=await request(actor,`/rest/v1/user_knowledge_states?user_id=eq.${sessions[1-actor].user.id}&select=node_id`,undefined,true);check(`${actor} cross-user states hidden`,otherStates,200);assert.deepEqual(otherStates.body,[]);
    const own=actor===0?a:b;check(`${actor} cross-user restore denied`,await request(actor,path,{action:'restore',baseVersionId:own.body.activeVersion.id,versionId:other.body.activeVersion.id}),404);
    check(`${actor} client history mutation denied`,await request(actor,`/rest/v1/personal_course_route_versions?id=eq.${other.body.activeVersion.id}`,{source:'restore'},true,'PATCH'),403);
    check(`${actor} client state mutation denied`,await request(actor,`/rest/v1/user_knowledge_states?user_id=eq.${sessions[1-actor].user.id}`,{status:'mastered'},true,'PATCH'),403);
  }
  const before=await request(0,`/rest/v1/personal_course_route_versions?course_id=eq.${courseId}&select=*&order=version_number`,undefined,true);
  const include={includeNodeIds:[id('corrective')],excludeNodeIds:[]};
  const pv=await request(0,path,{action:'preview',...include});check('Include preview',pv,200);assert.equal(pv.body.plan.valid,true);assert.ok(pv.body.plan.route.selectedNodeIds.includes(id('defect')));
  const afterPreview=await request(0,`/rest/v1/personal_course_route_versions?course_id=eq.${courseId}&select=*&order=version_number`,undefined,true);assert.deepEqual(afterPreview.body,before.body);
  const invalid=await request(0,path,{action:'preview',includeNodeIds:[],excludeNodeIds:[id('qualification')]});check('hard Exclude conflict preview',invalid,200);assert.equal(invalid.body.plan.valid,false);
  check('hard Exclude adoption rejected',await request(0,path,{action:'adopt',baseVersionId:a.body.activeVersion.id,includeNodeIds:[],excludeNodeIds:[id('qualification')]}),422);
  check('forged authority rejected',await request(0,path,{action:'adopt',baseVersionId:a.body.activeVersion.id,...include,userId:sessions[1].user.id}),400);
  const adopted=await request(0,path,{action:'adopt',baseVersionId:a.body.activeVersion.id,...include});check('explicit Include adoption appends version',adopted,200);assert.equal(adopted.body.activeVersion.versionNumber,a.body.activeVersion.versionNumber+1);
  check('stale route adoption rejected',await request(0,path,{action:'adopt',baseVersionId:a.body.activeVersion.id,includeNodeIds:[],excludeNodeIds:[]}),409);
  const restored=await request(0,path,{action:'restore',baseVersionId:adopted.body.activeVersion.id,versionId:a.body.activeVersion.id});check('restore appends current-world version',restored,200);assert.equal(restored.body.activeVersion.versionNumber,adopted.body.activeVersion.versionNumber+1);assert.deepEqual(restored.body.activeVersion.constraints,a.body.activeVersion.constraints);
  const after=await request(0,`/rest/v1/personal_course_route_versions?course_id=eq.${courseId}&select=*&order=version_number`,undefined,true);assert.deepEqual(after.body.slice(0,before.body.length),before.body);assert.equal(after.body.length,before.body.length+2);
  const unchangedB=await request(1,path);assert.deepEqual(unchangedB.body,b.body);
  writeFileSync(`${output}/security.json`,JSON.stringify({preview,capturedAt:new Date().toISOString(),checks,historyUnchanged:true,previewCreatedVersions:0,explicitEditCreatedVersions:2,otherUserUnchanged:true,staleBase:a.body.activeVersion.id,currentBase:restored.body.activeVersion.id,oldVersionHashes:before.body.map((r:{id:string})=>({id:r.id,sha256:digest(r)}))},null,2)+'\n');
  console.log({securityAssertions:checks.length,historyUnchanged:true,otherUserUnchanged:true});
}
function compareStates(){
  const before=JSON.parse(readFileSync(`${output}/t0.json`,'utf8')),after=JSON.parse(readFileSync(`${output}/t1.json`,'utf8'));
  const a=before.captures[0],next=after.captures[0];assert.ok(a.gray.includes(id('exposure')));assert.ok(next.blue.includes(id('exposure')));assert.ok(!next.gray.includes(id('exposure')));assert.notDeepEqual(a.plan.route,next.plan.route);assert.notDeepEqual(a.navigation.path,next.navigation.path);
  for(let i=0;i<2;i++){assert.equal(before.captures[i].activeVersionId,after.captures[i].activeVersionId);assert.deepEqual(before.captures[i].history,after.captures[i].history);}
  assert.deepEqual(before.captures[1].states,after.captures[1].states);
  const result={beforePreview:before.preview,afterPreview:after.preview,transition:id('exposure'),grayBefore:a.gray.length,grayAfter:next.gray.length,routeBefore:a.plan.route.selectedNodeIds.length,routeAfter:next.plan.route.selectedNodeIds.length,routeVersionsAdded:0,historyHashUnchanged:true,otherUserStateUnchanged:true,navigationPathChanged:true,nextActionChanged:JSON.stringify(a.navigation.nextAction)!==JSON.stringify(next.navigation.nextAction)};
  writeFileSync(`${output}/transition.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}
const mode=process.argv[2];
if(mode==='setup')await setup();else if(mode==='transition')await transition();else if(mode==='reset-t0')await transition(true);else if(mode==='verify')await verify();else if(mode==='security')await security();else if(mode==='compare')compareStates();else throw new Error('Use setup | verify | transition | reset-t0; supply private runtime environment.');
