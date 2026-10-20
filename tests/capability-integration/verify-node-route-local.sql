-- Transaction-only checks against real seeded facts; no permanent user/history changes.
begin;
create function pg_temp.expect_node_rejection(statement text) returns void language plpgsql as $$
begin
 begin execute statement;exception when sqlstate 'PT409' or check_violation or foreign_key_violation or unique_violation then return;end;
 raise exception 'Expected Node rejection: %',statement;
end $$;
do $$
declare u uuid; c constant text:='TEST-node-route-local'; root constant text:='AG01'; other_root constant text:='PY01'; n1 uuid:=gen_random_uuid(); n2 uuid:=gen_random_uuid(); n3 uuid:=gen_random_uuid(); e1 uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); b1 uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid(); b3 uuid:=gen_random_uuid(); be uuid:=gen_random_uuid(); bm uuid:=gen_random_uuid(); v uuid; snapshot jsonb; steps jsonb; r edge_action_runs; done_id uuid; other_run edge_action_runs; before_uks jsonb; before_facts jsonb; saved record;
begin
 select id into strict u from auth.users order by id limit 1;
 if not is_capability_action_root(root) or not is_capability_action_root(other_root) then raise exception 'Test needs actual real roots';end if;
 insert into courses(id,title,description,revision,course_type,lifecycle,target_outcome) values(c,'TEST Node scope','Rollback-only','test','standard','published','Explain Agent and Python runtime; implement the factual Agent to LLM dependency');
 insert into user_course_states(user_id,course_id) values(u,c);
 delete from user_knowledge_states where user_id=u and node_id in(root,other_root,'A01');
 select coalesce(jsonb_agg(to_jsonb(s) order by s.node_id),'[]') into before_uks from user_knowledge_states s where user_id=u;
 select jsonb_agg(to_jsonb(e) order by e.id) into before_facts from knowledge_edges e;
 insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,experience)
 select c,'task-'||n,n,'TEST artifact '||n,'Submit actual artifact','[]','Artifact','[]','instruction',jsonb_build_object('type','answer','knowledgeNodeId',case when n<3 then root when n=3 then other_root else 'A01' end) from generate_series(1,4) n;
 insert into assignment_coverages(course_id,id,assignment_id,node_id,role) select c,'coverage-'||n,'task-'||n,case when n<3 then root when n=3 then other_root else 'A01' end,'practice' from generate_series(1,4) n;
 insert into knowledge_edge_actions(id,node_id,type,title,description,estimated_minutes,difficulty,expected_evidence) values(n1,root,'practice_task','TEST first root work','Background, method and acceptance',5,1,'Artifact'),(n2,root,'practice_task','TEST second root work','Second distinct artifact',5,1,'Artifact'),(n3,other_root,'practice_task','TEST independent root','Independent artifact',5,1,'Artifact'),(m,root,'micro_learning','TEST Node Micro','Study root capability',5,1,'Micro evidence'),(wrong,'A01','practice_task','TEST reject middle Node','Not a route shortcut',5,1,'Artifact');
 insert into knowledge_edge_actions(id,edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence) values(e1,'knowledge-prerequisite-ag01-a01','practice_task','TEST factual Edge','Progress target',5,1,'Artifact');
 insert into course_action_bindings(id,course_id,action_id,assignment_id,available) values(b1,c,n1,'task-1',true),(b2,c,n2,'task-2',true),(b3,c,n3,'task-3',true),(be,c,e1,'task-4',true);
 insert into course_action_bindings(id,course_id,action_id,micro_path_id,available) values(bm,c,m,'golden-micro-AG01',true);
 perform pg_temp.expect_node_rejection(format('update knowledge_edge_actions set node_id=''A01'' where id=%L',n1));
 perform pg_temp.expect_node_rejection(format('update knowledge_edge_actions set edge_id=''knowledge-prerequisite-ag01-a01'' where id=%L',n1));
 perform pg_temp.expect_node_rejection(format('update course_action_bindings set assignment_id=''task-3'' where id=%L',b1));
 steps:=jsonb_build_array(jsonb_build_object('scope','node','nodeId',root,'actionId',n1,'order',0),jsonb_build_object('scope','node','nodeId',root,'actionId',n2,'order',1),jsonb_build_object('scope','node','nodeId',other_root,'actionId',n3,'order',2),jsonb_build_object('edgeId','knowledge-prerequisite-ag01-a01','actionId',e1,'sourceNodeId',root,'targetNodeId','A01','order',3));
 snapshot:=jsonb_build_object('valid',true,'selectedNodeIds',jsonb_build_array(root,other_root,'A01'),'executionSteps',steps);
 v:=(adopt_personal_course_route(u,c,null,'initial','{}','{}',snapshot,'test')->>'id')::uuid;
 perform pg_temp.expect_node_rejection(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,n2,v));
 perform pg_temp.expect_node_rejection(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,e1,v));
 perform pg_temp.expect_node_rejection(format('select adopt_personal_course_route(%L,%L,%L,''adjustment'',''{}'',''{}'',%L::jsonb,''test'')',u,c,v,jsonb_set(snapshot,'{executionSteps}',jsonb_build_array(jsonb_build_object('scope','node','nodeId','A01','actionId',wrong,'order',0)))));
 perform pg_temp.expect_node_rejection(format('select adopt_personal_course_route(%L,%L,%L,''adjustment'',''{}'',''{}'',%L::jsonb,''test'')',u,c,v,jsonb_set(snapshot,'{executionSteps,0}',(steps->0)-'order')));
 perform pg_temp.expect_node_rejection(format('select adopt_personal_course_route(%L,%L,%L,''adjustment'',''{}'',''{}'',%L::jsonb,''test'')',u,c,v,snapshot||jsonb_build_object('planningCurrentNodeIds',jsonb_build_array('missing-freshness-id'))));
 -- Independent global display order does not gate the other real root.
 other_run:=select_route_action_v3(u,c,n3,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=n3),(select updated_at from course_action_bindings where id=b3),v);
 other_run:=transition_route_action_v3(u,other_run.id,'start',v);
 r:=select_route_action_v3(u,c,n1,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=n1),(select updated_at from course_action_bindings where id=b1),v);
 if r.edge_id is not null or r.node_id<>root or r.execution_snapshot->>'sourceId' is not null or r.execution_snapshot->>'targetId'<>root then raise exception 'Node snapshot invented an Edge/source';end if;
 perform pg_temp.expect_node_rejection(format('insert into edge_action_runs(user_id,course_id,action_id,node_id,status,selection_key,execution_snapshot) values(%L,%L,%L,%L,''selected'',gen_random_uuid(),''{}'')',u,c,n2,root));
 perform pg_temp.expect_node_rejection(format('insert into edge_action_runs(user_id,course_id,action_id,node_id,status,selection_key,execution_snapshot) values(%L,%L,%L,%L,''selected'',gen_random_uuid(),''{}'')',u,c,e1,root));
 r:=transition_route_action_v3(u,r.id,'start',v);
 select * into saved from record_action_assignment_attempt(u,r.id,'node-first','{"kind":"answer","text":"First actual artifact"}','pending',null,'{}','manual');
 done_id:=r.id;
 if root=any(route_execution_reachable_nodes(u,c)) then raise exception 'Partial Node group cannot reach root';end if;
 r:=select_route_action_v3(u,c,n2,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=n2),(select updated_at from course_action_bindings where id=b2),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 select * into saved from record_action_assignment_attempt(u,r.id,'node-second','{"kind":"answer","text":"Second actual artifact"}','failed',0,'{}','manual');
 if not(root=any(route_execution_reachable_nodes(u,c))) then raise exception 'Completed Node group must grant execution reachability';end if;
 perform assert_route_action_choice(u,c,e1,v,false);
 perform pg_temp.expect_node_rejection(format('select select_route_action_v3(%L,%L,%L,gen_random_uuid(),%L,%L,%L)',u,c,n1,(select updated_at from knowledge_edge_actions where id=n1),(select updated_at from course_action_bindings where id=b1),v));
 r:=select_route_action_v3(u,c,n1,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=n1),(select updated_at from course_action_bindings where id=b1),v,null,done_id);
 r:=transition_route_action_v3(u,r.id,'start',v);
 if r.execution_snapshot->>'repeatedFromRunId'<>done_id::text then raise exception 'Repeat lineage missing';end if;
 if (select coalesce(jsonb_agg(to_jsonb(s) order by s.node_id),'[]') from user_knowledge_states s where user_id=u) is distinct from before_uks then raise exception 'UKS changed';end if;
 if (select jsonb_agg(to_jsonb(e) order by e.id) from knowledge_edges e) is distinct from before_facts then raise exception 'Facts changed';end if;
 if (select versions.snapshot from personal_course_route_versions versions where id=v) is distinct from snapshot then raise exception 'Historical snapshot changed';end if;
 raise notice 'PASS Node scope: constraints, binding target, true roots, independent frontier, local ordering, Practice result lineage, all-actions reachability, explicit Repeat, UKS/facts/history unchanged';
end $$;
do $$
declare u uuid; c constant text:='TEST-node-micro-local'; path constant text:='TEST-node-micro-path'; unit constant text:='TEST-node-micro-unit'; step constant text:='TEST-node-micro-step'; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); v uuid; snap jsonb; r edge_action_runs; before_uks jsonb; result jsonb;
begin
 select id into strict u from auth.users order by id limit 1;
 insert into courses(id,title,description,revision,course_type,lifecycle,target_outcome) values(c,'TEST actual Node Micro','Rollback only','test','standard','published','Describe an Agent');
 insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,mode,estimated_minutes,status) values(path,'AG01',c,'course','TEST explain an Agent','learn',5,'published');
 insert into micro_units(id,path_id,title,position,estimated_minutes) values(unit,path,'Agent fundamentals',0,5);
 insert into micro_steps(id,unit_id,position,kind,title,content) values(step,unit,0,'explanation','What is an Agent?','An Agent observes an environment, chooses actions towards a goal and uses feedback.');
 insert into knowledge_edge_actions(id,node_id,type,title,description,estimated_minutes,difficulty,expected_evidence) values(a,'AG01','micro_learning','TEST Node Micro','Read Agent definition and produce an observation',5,1,'Micro observation');
 insert into course_action_bindings(id,course_id,action_id,micro_path_id) values(b,c,a,path);
 snap:=jsonb_build_object('valid',true,'selectedNodeIds',jsonb_build_array('AG01'),'executionSteps',jsonb_build_array(jsonb_build_object('scope','node','nodeId','AG01','actionId',a,'order',0)));
 v:=(adopt_personal_course_route(u,c,null,'initial','{}','{}',snap,'test')->>'id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.node_id),'[]') into before_uks from user_knowledge_states s where user_id=u;
 r:=select_route_action_v3(u,c,a,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=a),(select updated_at from course_action_bindings where id=b),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 perform start_micro_for_route_v2(u,path,c,v,array['AG01']);
 result:=record_action_micro_step(u,path,unit,step,c,'TEST-node-micro-completion','{}',true,'observed',repeat('a',64),1,null,jsonb_build_object('interaction',null,'kind','explanation','revision',1),array['AG01'],v,r.id);
 if (select status from edge_action_runs where id=r.id)<>'completed' then raise exception 'Actual Micro must complete Node Run';end if;
 if not('AG01'=any(route_execution_reachable_nodes(u,c))) then raise exception 'Actual Micro must grant execution reachability';end if;
 if not exists(select 1 from micro_step_attempts where action_run_id=r.id and step_id=step and completion_accepted) then raise exception 'Run-scoped Micro lineage missing';end if;
 if (select coalesce(jsonb_agg(to_jsonb(s) order by s.node_id),'[]') from user_knowledge_states s where user_id=u) is distinct from before_uks then raise exception 'Actual Micro changed UKS';end if;
 raise notice 'PASS actual Node Micro: start, submission, observation lineage, completion, reachability; UKS byte-equivalent';
end $$;
do $$
declare viewer uuid; owner_user uuid; root constant text:='AG01';
begin
 select min(id::text)::uuid,max(id::text)::uuid into viewer,owner_user from auth.users;
 if viewer=owner_user then raise exception 'Visibility check needs two users';end if;
 insert into knowledge_nodes(id,title,description,node_type,mastery_criteria,scope,owner_id,provenance,current_revision_id,status)
 select 'TEST-private-root-probe',title,description,node_type,mastery_criteria,'user',owner_user::text,provenance,'TEST-private-root-probe-rev','active' from knowledge_nodes where id=root;
 insert into knowledge_node_revisions(id,node_id,version,title,description,node_type,mastery_criteria) select 'TEST-private-root-probe-rev',id,1,title,description,node_type,mastery_criteria from knowledge_nodes where id='TEST-private-root-probe';
 insert into knowledge_edges(id,source_node_id,target_node_id,relation,reason,associative_strength) values('TEST-private-root-probe-edge','TEST-private-root-probe',root,'enables','TEST private factual context only',0.1);
 if not is_capability_action_root(root,viewer) or is_capability_action_root(root,owner_user) then raise exception 'Caller-visible root mismatch';end if;
 perform set_config('request.jwt.claim.sub',viewer::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from knowledge_nodes where id='TEST-private-root-probe') or exists(select 1 from knowledge_edges where id='TEST-private-root-probe-edge') then raise exception 'Private facts leaked';end if;
 if not exists(select 1 from knowledge_edge_actions where node_id=root) then raise exception 'Visible Node action missing under RLS';end if;
 if exists(select 1 from edge_action_runs where user_id<>viewer) then raise exception 'Run ownership RLS failed';end if;
 execute 'reset role';
 raise notice 'PASS caller-visible root and authenticated RLS: other user private incoming does not disqualify root or leak facts/runs';
end $$;
rollback;
