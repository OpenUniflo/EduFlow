-- Transaction-only fixtures. Run on Local Supabase after the committed migrations.
begin;
create function pg_temp.reject_frontier(statement text) returns void language plpgsql as $$
begin
 begin execute statement; exception when sqlstate 'PT409' or check_violation then return;end;
 raise exception 'Expected frontier rejection: %',statement;
end $$;
do $$
declare u uuid;c constant text:='acceptance-frontier-local';v uuid;steps jsonb;reordered jsonb;r edge_action_runs;run_first uuid;run_parallel uuid;before_uks jsonb;after_uks jsonb;i integer;actions uuid[];bindings uuid[];
begin
 select id into strict u from auth.users order by id limit 1;
 insert into knowledge_nodes select (jsonb_populate_record(null::knowledge_nodes,to_jsonb(n)||jsonb_build_object('id','frontier-'||fixture.id,'title','Transaction-only frontier capability '||fixture.id))).* from knowledge_nodes n cross join unnest(array['A','B','C','D','E']) fixture(id) where n.id='A01';
 insert into knowledge_edges(id,source_node_id,target_node_id,relation,reason,prerequisite_strength,associative_strength) values
 ('frontier-ab','frontier-A','frontier-B','prerequisite','Test real dependency','hard',null),
 ('frontier-cb','frontier-C','frontier-B','prerequisite','Test hard conjunction','hard',null),
 ('frontier-bd','frontier-B','frontier-D','enables','Test downstream',null,.5),
 ('frontier-ae','frontier-A','frontier-E','enables','Independent optional branch',null,.5);
 insert into courses(id,title,description,revision,course_type,lifecycle,target_outcome) values(c,'Local frontier RPC test','Rollback-only fixture','test','standard','published','Reach B/D/E');
 insert into user_course_states(user_id,course_id) values(u,c);
 steps:='[]';actions:='{}';bindings:='{}';
 for i in 1..5 loop
  actions:=array_append(actions,gen_random_uuid());bindings:=array_append(bindings,gen_random_uuid());
  insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,experience) values(c,'task-'||i,i,'Submit work '||i,'Actual task','[]','Artifact','[]','instruction','{"type":"answer"}');
  insert into assignment_coverages(course_id,id,assignment_id,node_id,role) values(c,'coverage-'||i,'task-'||i,case when i<=3 then 'frontier-B' when i=4 then 'frontier-D' else 'frontier-E' end,'practice');
  insert into knowledge_edge_actions(id,edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence) values(actions[i],case when i<=2 then 'frontier-ab' when i=3 then 'frontier-cb' when i=4 then 'frontier-bd' else 'frontier-ae' end,'practice_task','Action '||i,'Transaction test',5,1,'Artifact');
  insert into course_action_bindings(id,course_id,action_id,assignment_id,available) values(bindings[i],c,actions[i],'task-'||i,true);
  steps:=steps||jsonb_build_array(jsonb_build_object('edgeId',case when i<=2 then 'frontier-ab' when i=3 then 'frontier-cb' when i=4 then 'frontier-bd' else 'frontier-ae' end,'actionId',actions[i],'sourceNodeId',case when i<=2 or i=5 then 'frontier-A' when i=3 then 'frontier-C' else 'frontier-B' end,'targetNodeId',case when i<=3 then 'frontier-B' when i=4 then 'frontier-D' else 'frontier-E' end,'order',i-1));
 end loop;
 insert into user_knowledge_states(user_id,node_id,status,mastery_origin) values(u,'frontier-A','learned','direct'),(u,'frontier-C','learned','direct');
 select jsonb_agg(to_jsonb(s) order by node_id) into before_uks from user_knowledge_states s where user_id=u;
 v:=(adopt_personal_course_route(u,c,null,'initial','{}','{}',jsonb_build_object('valid',true,'prerequisiteEdges',jsonb_build_array(jsonb_build_object('id','frontier-ab','source','frontier-A','target','frontier-B','strength','hard'),jsonb_build_object('id','frontier-cb','source','frontier-C','target','frontier-B','strength','hard')),'executionSteps',steps),'test')->>'id')::uuid;
 perform assert_route_action_choice(u,c,actions[1],v,false);
 perform assert_route_action_choice(u,c,actions[3],v,false);
 perform assert_route_action_choice(u,c,actions[5],v,false);
 perform pg_temp.reject_frontier(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,actions[2],v));
 perform pg_temp.reject_frontier(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,actions[4],v));
 -- UKS satisfies progression, never fabricates an incoming completed Run.
 insert into user_knowledge_states(user_id,node_id,status,mastery_origin) values(u,'frontier-B','learned','direct');
 perform assert_route_action_choice(u,c,actions[4],v,false);
 if exists(select 1 from edge_action_runs where user_id=u and course_id=c) then raise exception 'Satisfaction fabricated Run';end if;
 perform pg_temp.reject_frontier(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,actions[2],v));
 delete from user_knowledge_states where user_id=u and node_id='frontier-B';
 -- Independent groups may both be active, in any display order.
 r:=select_route_action_v3(u,c,actions[3],gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=actions[3]),(select updated_at from course_action_bindings where id=bindings[3]),v);
 r:=transition_route_action_v3(u,r.id,'start',v);run_parallel:=r.id;
 r:=select_route_action_v3(u,c,actions[1],gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=actions[1]),(select updated_at from course_action_bindings where id=bindings[1]),v);
 r:=transition_route_action_v3(u,r.id,'start',v);run_first:=r.id;
 if (select count(*) from edge_action_runs where user_id=u and course_id=c and status='in_progress')<>2 then raise exception 'Independent active runs serialized';end if;
 reordered:=jsonb_build_array((steps->2)||'{"order":0}',(steps->0)||'{"order":1}',(steps->1)||'{"order":2}',steps->3,steps->4);
 v:=(adopt_personal_course_route(u,c,v,'adjustment','{}','{}',jsonb_build_object('valid',true,'prerequisiteEdges',jsonb_build_array(jsonb_build_object('id','frontier-ab','source','frontier-A','target','frontier-B','strength','hard'),jsonb_build_object('id','frontier-cb','source','frontier-C','target','frontier-B','strength','hard')),'executionSteps',reordered),'test')->>'id')::uuid;
 perform pg_temp.reject_frontier(format('select adopt_personal_course_route(%L,%L,%L,''adjustment'',''{}'',''{}'',%L::jsonb,''test'')',u,c,v,jsonb_build_object('valid',true,'prerequisiteEdges',jsonb_build_array(jsonb_build_object('id','frontier-ab','source','frontier-A','target','frontier-B','strength','hard'),jsonb_build_object('id','frontier-cb','source','frontier-C','target','frontier-B','strength','hard')),'executionSteps',jsonb_build_array((steps->1)||'{"order":0}',(steps->0)||'{"order":1}',(steps->2)||'{"order":2}',steps->3,steps->4))));
 perform record_action_assignment_attempt(u,run_parallel,'parallel','{"kind":"answer","text":"Independent work"}','pending',null,'{}','manual');
 if 'frontier-B'=any(route_execution_reachable_nodes(u,c)) then raise exception 'Hard conjunction bypassed';end if;
 perform record_action_assignment_attempt(u,run_first,'first-submit','{"kind":"answer","text":"First work"}','failed',null,'{}','manual');
 if 'frontier-B'=any(route_execution_reachable_nodes(u,c)) then raise exception 'Partial same-Edge group reached target';end if;
 r:=select_route_action_v3(u,c,actions[2],gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=actions[2]),(select updated_at from course_action_bindings where id=bindings[2]),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 perform record_action_assignment_attempt(u,r.id,'second-submit','{"kind":"answer","text":"Second work"}','pending',null,'{}','manual');
 if not('frontier-B'=any(route_execution_reachable_nodes(u,c))) then raise exception 'All hard groups failed to propagate';end if;
 update knowledge_edges set lifecycle_status='deprecated' where id='frontier-ab';
 if 'frontier-B'=any(route_execution_reachable_nodes(u,c)) then raise exception 'Archived selected hard group dropped from conjunction';end if;
 update knowledge_edges set lifecycle_status='active' where id='frontier-ab';
 perform assert_route_action_choice(u,c,actions[4],v,false);
 -- A performed independent late group propagates despite an unfinished earlier one.
 r:=select_route_action_v3(u,c,actions[5],gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=actions[5]),(select updated_at from course_action_bindings where id=bindings[5]),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 perform record_action_assignment_attempt(u,r.id,'optional','{"kind":"answer","text":"Independent optional work"}','pending',null,'{}','manual');
 if not('frontier-E'=any(route_execution_reachable_nodes(u,c))) then raise exception 'Global prefix still gates propagation';end if;
 select jsonb_agg(to_jsonb(s) order by node_id) into after_uks from user_knowledge_states s where user_id=u;
 if before_uks is distinct from after_uks then raise exception 'Route execution changed formal UKS';end if;
 raise notice 'PASS: independent frontier/active runs, same-Edge order, hard conjunction, UKS satisfaction, display reorder, fixed point, unchanged UKS';
end $$;
-- Two independent Micro Runs share a target; an invalid sibling cannot veto
-- the exact valid Run's nested teaching/attempt/completion transaction.
do $$
declare u uuid;c constant text:='acceptance-frontier-micro';v uuid;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ba uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();r edge_action_runs;valid_run uuid;steps jsonb;expected jsonb;result jsonb;
begin
 select id into strict u from auth.users order by id limit 1;
 insert into courses(id,title,description,revision,course_type,lifecycle,target_outcome) values(c,'Parallel Micro regression','Rollback-only','test','standard','published','Target B');
 insert into user_course_states(user_id,course_id) values(u,c);
 insert into micro_learning_paths select (jsonb_populate_record(null::micro_learning_paths,to_jsonb(p)||jsonb_build_object('id','frontier-micro-path','knowledge_id','frontier-B','course_id',c,'required',false))).* from micro_learning_paths p where p.id='cds525-k001-rule-vs-learning';
 insert into micro_units select (jsonb_populate_record(null::micro_units,to_jsonb(unit)||jsonb_build_object('id','frontier-micro-unit','path_id','frontier-micro-path'))).* from micro_units unit where unit.id='cds525-k001-rule-vs-learning-unit-1';
 insert into micro_steps select (jsonb_populate_record(null::micro_steps,to_jsonb(step)||jsonb_build_object('id','frontier-micro-step','unit_id','frontier-micro-unit'))).* from micro_steps step where step.id='cds525-k001-rule-vs-learning-step-explanation';
 insert into knowledge_edge_actions(id,edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence) values(a,'frontier-ab','micro_learning','First micro','Exact source A',5,1,'Observation'),(b,'frontier-cb','micro_learning','Second micro','Exact source C',5,1,'Observation');
 insert into course_action_bindings(id,course_id,action_id,micro_path_id,available) values(ba,c,a,'frontier-micro-path',true),(bb,c,b,'frontier-micro-path',true);
 steps:=jsonb_build_array(jsonb_build_object('edgeId','frontier-ab','actionId',a,'sourceNodeId','frontier-A','targetNodeId','frontier-B','order',0),jsonb_build_object('edgeId','frontier-cb','actionId',b,'sourceNodeId','frontier-C','targetNodeId','frontier-B','order',1));
 v:=(adopt_personal_course_route(u,c,null,'initial','{}','{}',jsonb_build_object('valid',true,'selectedNodeIds',jsonb_build_array('frontier-A','frontier-C','frontier-B'),'executionSteps',steps),'test')->>'id')::uuid;
 r:=select_route_action_v3(u,c,a,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=a),(select updated_at from course_action_bindings where id=ba),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 r:=select_route_action_v3(u,c,b,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=b),(select updated_at from course_action_bindings where id=bb),v);
 r:=transition_route_action_v3(u,r.id,'start',v);valid_run:=r.id;
 update course_action_bindings set available=false where id=ba;
 select jsonb_build_object('interaction',step.interaction,'kind',step.kind,'revision',path.revision) into expected from micro_steps step join micro_units unit on unit.id=step.unit_id join micro_learning_paths path on path.id=unit.path_id where step.id='frontier-micro-step';
 result:=record_action_micro_step(u,'frontier-micro-path','frontier-micro-unit','frontier-micro-step',c,'valid-parallel-micro','{}',true,'correct',repeat('a',64),1,null,expected,array['frontier-A','frontier-C','frontier-B'],v,valid_run);
 if result->'attempt'->>'action_run_id'<>valid_run::text then raise exception 'Valid Micro did not commit exact Run observation';end if;
 if not exists(select 1 from micro_step_attempts where action_run_id=valid_run and completion_accepted) then raise exception 'Valid parallel Micro step blocked by invalid sibling';end if;
 raise notice 'PASS: same-target parallel Micro exact-run submission survives invalid sibling';
end $$;
rollback;
