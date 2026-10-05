-- Run inside a transaction; caller must ROLLBACK. Authorized test owner only.
do $$
declare
 actor uuid; course text:='enterprise-vietnam-supply-collaboration'; route uuid;
 item record; chosen edge_action_runs; submitted record; duplicated record;
 prior uuid; quality text; before_uks text; after_uks text; before_history integer;
 tested integer:=0; micro record; micro_step_row record; path_nodes text[];
begin
 select id into strict actor from auth.users where email='project-capability-a@eduflow.test';
 select active_version_id into strict route from personal_course_routes where user_id=actor and course_id=course;
 select md5(coalesce(jsonb_agg(s order by s.node_id)::text,'')) into before_uks from user_knowledge_states s where user_id=actor;
 select count(*) into before_history from personal_course_route_versions where user_id=actor;
 insert into user_course_states(user_id,course_id,is_active) values(actor,course,true) on conflict do nothing;
 -- Only existing adopted Actions, original factual Edges and genuine learned sources.
 for item in select a.id as action_id,a.updated_at as action_version,b.id as binding_id,b.updated_at as binding_version
   from personal_course_route_versions v cross join lateral jsonb_array_elements(v.snapshot->'executionSteps') step
   join knowledge_edge_actions a on a.id=(step->>'actionId')::uuid and a.type='practice_task' and a.status='active'
   join course_action_bindings b on b.action_id=a.id and b.course_id=course and b.available
   where v.id=route order by (step->>'order')::int
 loop
   begin
     perform require_action_execution_conditions(actor,course,item.action_id,item.binding_id);
     exit;
   exception when others then item.action_id:=null;
   end;
 end loop;
 if item.action_id is null then raise exception 'No ready real adopted Practice Action';end if;
 foreach quality in array array['failed','pending','passed'] loop
   select * into chosen from select_route_action_v3(actor,course,item.action_id,gen_random_uuid(),item.action_version,item.binding_version,route,null,prior);
   perform transition_route_action_v3(actor,chosen.id,'start',route);
   select * into submitted from record_conversation_action_assignment_attempt(actor,chosen.id,'practice-semantics-'||quality,jsonb_build_object('kind','trace','selectedStepId','decision','submissionMode','conversation'),quality,case when quality='passed' then 1 else 0 end,jsonb_build_object('code','test','message','Formal '||quality||' feedback'),'rule');
   select * into chosen from edge_action_runs where id=chosen.id;
   if chosen.status<>'completed' or chosen.completed_at is null or chosen.assignment_attempt_id<>submitted.attempt_id then raise exception 'Submission did not complete % Run',quality;end if;
   select * into duplicated from record_conversation_action_assignment_attempt(actor,chosen.id,'practice-semantics-'||quality,jsonb_build_object('kind','trace','selectedStepId','decision','submissionMode','conversation'),quality,0,'{}','rule');
   if not duplicated.duplicate or duplicated.attempt_id<>submitted.attempt_id then raise exception 'Submission not idempotent';end if;
   begin
     perform record_conversation_action_assignment_attempt(actor,chosen.id,'different-key-'||quality,jsonb_build_object('kind','trace','selectedStepId','input','submissionMode','conversation'),quality,0,'{}','rule');
     raise exception 'Completed Run reopened';
   exception when check_violation then null;
   end;
   if prior is not null and (select status from edge_action_runs where id=prior)<>'completed' then raise exception 'Old Run overwritten';end if;
   prior:=chosen.id;tested:=tested+1;
 end loop;
 select md5(coalesce(jsonb_agg(s order by s.node_id)::text,'')) into after_uks from user_knowledge_states s where user_id=actor;
 if before_uks<>after_uks then raise exception 'Practice wrote UKS';end if;
 if (select count(*) from personal_course_route_versions where user_id=actor)<>before_history then raise exception 'Practice wrote Route history';end if;
 -- Existing published Micro progress remains usable, but does not create capability state.
 select array_agg(value) into path_nodes from personal_course_route_versions v,jsonb_array_elements_text(v.snapshot->'selectedNodeIds') value where v.id=route;
 for micro in select p.id,p.course_id,p.knowledge_id from micro_learning_paths p where p.status='published' and p.knowledge_id=any(path_nodes) and (p.course_id=course or p.scope='global' and p.course_id is null) order by p.id loop
   begin
     perform assert_personal_route_micro_v2(actor,course,micro.knowledge_id,route,path_nodes);exit;
   exception when others then micro.id:=null;
   end;
 end loop;
 if micro.id is null then raise exception 'No eligible real Micro for authority regression';end if;
 perform start_micro_for_route_v2(actor,micro.id,course,route,path_nodes);
 for micro_step_row in select s.id,s.unit_id from micro_steps s join micro_units u on u.id=s.unit_id where u.path_id=micro.id order by u.position,s.position,s.id loop
   perform record_micro_step_completion_v2(actor,micro.id,micro_step_row.unit_id,micro_step_row.id,course,path_nodes,route);
 end loop;
 select md5(coalesce(jsonb_agg(s order by s.node_id)::text,'')) into after_uks from user_knowledge_states s where user_id=actor;
 if before_uks<>after_uks then raise exception 'Micro start/completion wrote UKS';end if;
 if not exists(select 1 from user_micro_path_progress where user_id=actor and path_id=micro.id and status='completed') then raise exception 'Micro progress broken';end if;
 raise notice 'PASS: % outcomes completed, duplicate stable, completed Run closed, repeat history, UKS and Route unchanged',tested;
end $$;
