-- Run after the forward migration on a disposable local database, or prepend that
-- migration inside this transaction. All test curriculum/run changes roll back.
begin;
create function pg_temp.expect_route_rejection(statement text) returns void language plpgsql as $$
begin
 begin execute statement; exception when sqlstate 'PT409' or check_violation then return; end;
 raise exception 'Expected ordered Route rejection: %',statement;
end $$;
do $$
declare u uuid; c constant text:='acceptance-ordered-route-local'; a1 uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid(); a3 uuid:=gen_random_uuid(); b1 uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid(); b3 uuid:=gen_random_uuid(); v uuid; steps jsonb; r edge_action_runs; future uuid; before_uks jsonb; after_uks jsonb; saved record;
begin
 select id into strict u from auth.users order by id limit 1;
 insert into courses(id,title,description,revision,course_type,lifecycle,target_outcome) values(c,'Local ordered RPC check','Transaction-only test','test','standard','published','Execute real A01 → A02 → R01');
 insert into user_course_states(user_id,course_id) values(u,c);
 insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,experience)
 select c,'task-'||n,n,'Submit work '||n,'Actual execution record','[]','Work artifact','[]','instruction',jsonb_build_object('type','answer','knowledgeNodeId',case when n<3 then 'A02' else 'R01' end) from generate_series(1,3) n;
 insert into assignment_coverages(course_id,id,assignment_id,node_id,role) select c,'coverage-'||n,'task-'||n,case when n<3 then 'A02' else 'R01' end,'practice' from generate_series(1,3) n;
 insert into knowledge_edge_actions(id,edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence)
 values(a1,'knowledge-prerequisite-a01-a02','practice_task','First','First actual work',5,1,'Artifact'),(a2,'knowledge-prerequisite-a01-a02','practice_task','Second','Second actual work',5,1,'Artifact'),(a3,'knowledge-prerequisite-a02-r01','practice_task','Next edge','Next actual work',5,1,'Artifact');
 insert into course_action_bindings(id,course_id,action_id,assignment_id,available) values(b1,c,a1,'task-1',true),(b2,c,a2,'task-2',true),(b3,c,a3,'task-3',true);
 insert into user_knowledge_states(user_id,node_id,status,mastery_origin) values(u,'A01','learned','direct') on conflict(user_id,node_id) do update set status='learned';
 delete from user_knowledge_states where user_id=u and node_id in('A02','R01');
 select coalesce(jsonb_agg(to_jsonb(s) order by s.node_id),'[]') into before_uks from user_knowledge_states s where user_id=u;
 steps:=jsonb_build_array(jsonb_build_object('edgeId','knowledge-prerequisite-a01-a02','actionId',a1,'sourceNodeId','A01','targetNodeId','A02','order',0),jsonb_build_object('edgeId','knowledge-prerequisite-a01-a02','actionId',a2,'sourceNodeId','A01','targetNodeId','A02','order',1),jsonb_build_object('edgeId','knowledge-prerequisite-a02-r01','actionId',a3,'sourceNodeId','A02','targetNodeId','R01','order',2));
 v:=(adopt_personal_course_route(u,c,null,'initial','{}','{}',jsonb_build_object('valid',true,'executionSteps',steps),'test')->>'id')::uuid;
 perform pg_temp.expect_route_rejection(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,a2,v));
 -- Simulate an old future Run; both start and new submission must revalidate.
 insert into edge_action_runs(user_id,course_id,action_id,edge_id,binding_id,assignment_id,status,selection_key,execution_version,execution_snapshot) values(u,c,a2,'knowledge-prerequisite-a01-a02',b2,'task-2','in_progress',gen_random_uuid(),2,jsonb_build_object('action',(select to_jsonb(a) from knowledge_edge_actions a where id=a2),'binding',(select to_jsonb(b) from course_action_bindings b where id=b2))) returning id into future;
 perform pg_temp.expect_route_rejection(format('select transition_route_action_v3(%L,%L,''start'',%L)',u,future,v));
 perform pg_temp.expect_route_rejection(format('select record_action_assignment_attempt(%L,%L,''future-submit'',''{"kind":"answer","text":"Work"}'',''pending'',null,''{}'',''manual'')',u,future));
 delete from edge_action_runs where id=future;
 r:=select_route_action_v3(u,c,a1,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=a1),(select updated_at from course_action_bindings where id=b1),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 select * into saved from record_action_assignment_attempt(u,r.id,'first-submit','{"kind":"answer","text":"First real work"}','pending',null,'{}','manual');
 if saved.outcome<>'pending' or (select status from edge_action_runs where id=r.id)<>'completed' then raise exception 'Pending submission must complete Run';end if;
 if 'A02'=any(route_execution_reachable_nodes(u,c)) then raise exception 'Partial Edge group cannot reach target';end if;
 perform pg_temp.expect_route_rejection(format('select assert_route_action_choice(%L,%L,%L,%L,false)',u,c,a3,v));
 r:=select_route_action_v3(u,c,a2,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=a2),(select updated_at from course_action_bindings where id=b2),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 select * into saved from record_action_assignment_attempt(u,r.id,'second-submit','{"kind":"answer","text":"Second real work"}','failed',0,'{}','manual');
 if not('A02'=any(route_execution_reachable_nodes(u,c))) then raise exception 'Completed Edge group must reach target without UKS';end if;
 r:=select_route_action_v3(u,c,a3,gen_random_uuid(),(select updated_at from knowledge_edge_actions where id=a3),(select updated_at from course_action_bindings where id=b3),v);
 r:=transition_route_action_v3(u,r.id,'start',v);
 perform pg_temp.expect_route_rejection(format('select adopt_personal_course_route(%L,%L,%L,''adjustment'',''{}'',''{}'',%L::jsonb,''test'')',u,c,v,jsonb_build_object('valid',true,'executionSteps',steps-2)));
 select coalesce(jsonb_agg(to_jsonb(s) order by s.node_id),'[]') into after_uks from user_knowledge_states s where user_id=u;
 if after_uks is distinct from before_uks then raise exception 'UKS changed during Action execution';end if;
 raise notice 'PASS: current gate, legacy future start/submit rejection, pending/failed completion, all-actions reachability, active conflict, byte-equivalent UKS';
end $$;
rollback;
