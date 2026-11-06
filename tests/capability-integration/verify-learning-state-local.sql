-- Transaction-only Plan A regression. Run on Local Supabase after the committed
-- migrations; the caller must ROLLBACK. Never run against a shared Hosted database.
begin;
do $$
declare
  u uuid; c constant text:='TEST-learning-state-policy';
  n_req constant text:='TEST-LS-REQ'; n_opt constant text:='TEST-LS-OPT';
  n_shadow constant text:='TEST-LS-SHADOW'; n_backfill constant text:='TEST-LS-BACKFILL';
  n_up constant text:='TEST-LS-UP'; n_top constant text:='TEST-LS-TOP'; n_new constant text:='TEST-LS-NEW';
  p_req constant text:='TEST-LS-REQ-PATH'; p_opt constant text:='TEST-LS-OPT-PATH';
  p_shadow_course constant text:='TEST-LS-SHADOW-COURSE-PATH'; p_shadow_global constant text:='TEST-LS-SHADOW-GLOBAL-PATH';
  p_backfill constant text:='TEST-LS-BACKFILL-PATH';
  route_id uuid; v uuid; route_nodes text[];
  before_versions integer; after_versions integer;
  status_after text; backfill_first integer; backfill_second integer;
  updated_before timestamptz; updated_after timestamptz;
begin
  select id into strict u from auth.users order by id limit 1;
  route_nodes:=array[n_req,n_opt,n_shadow,n_backfill,n_new];
  insert into knowledge_nodes
  select (jsonb_populate_record(null::knowledge_nodes,to_jsonb(n)||jsonb_build_object(
    'id',fixture.id,'title','TEST '||fixture.id,'description','Transaction-only learning state fixture'))).*
  from knowledge_nodes n
  cross join unnest(array[n_req,n_opt,n_shadow,n_backfill,n_up,n_top,n_new]) fixture(id)
  where n.id='A01';
  insert into courses(id,title,description,revision,course_type,lifecycle,target_outcome)
  values(c,'TEST learning state policy','Transaction-only fixture','test','standard','published','Learner state policy');
  insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,mode,estimated_minutes,required,status) values
    (p_req,n_req,c,'course','TEST required Learn Path','learn',1,true,'published'),
    (p_opt,n_opt,c,'course','TEST optional Learn Path','learn',1,false,'published'),
    (p_shadow_course,n_shadow,c,'course','TEST shadowing course path','learn',1,true,'published'),
    (p_shadow_global,n_shadow,null,'global','TEST shadowed global path','learn',1,true,'published'),
    (p_backfill,n_backfill,c,'course','TEST backfill path','learn',1,true,'published');
  insert into micro_units(id,path_id,title,position,estimated_minutes)
  select path.id||'-unit',path.id,'TEST unit',0,1 from micro_learning_paths path where path.id like 'TEST-LS-%';
  insert into micro_steps(id,unit_id,position,kind,title,content)
  select unit.id||'-step',unit.id,0,'explanation','TEST step','Transaction-only step.' from micro_units unit where unit.id like 'TEST-LS-%';
  insert into personal_course_routes(user_id,course_id) values(u,c) returning id into route_id;
  insert into personal_course_route_versions(route_id,user_id,course_id,version_number,source,include_node_ids,exclude_node_ids,snapshot,structure_fingerprint)
  values(route_id,u,c,1,'initial','{}','{}',jsonb_build_object('valid',true,'orderedNodeIds',to_jsonb(route_nodes)),'test') returning id into v;
  update personal_course_routes set active_version_id=v where id=route_id;
  select count(*) into before_versions from personal_course_route_versions where user_id=u and course_id=c;

  -- A required Course Learn Path: start -> learning, completion -> learned + Evidence.
  perform start_micro_for_route_v2(u,p_req,c,v,route_nodes);
  select status into status_after from user_knowledge_states where user_id=u and node_id=n_req;
  if status_after<>'learning' then raise exception 'Required start wrote %, expected learning',status_after; end if;
  perform record_micro_step_completion_v2(u,p_req,p_req||'-unit',p_req||'-unit-step',c,route_nodes,v);
  select status into status_after from user_knowledge_states where user_id=u and node_id=n_req;
  if status_after<>'learned' then raise exception 'Required completion wrote %, expected learned',status_after; end if;
  if not exists(select 1 from knowledge_evidence where user_id=u and node_id=n_req and event_type='micro_path_completed' and source_entity_id=p_req) then
    raise exception 'Required completion did not write Evidence';
  end if;

  -- A non-required Learn Path: start and completion only raise learning.
  perform start_micro_for_route_v2(u,p_opt,c,v,route_nodes);
  perform record_micro_step_completion_v2(u,p_opt,p_opt||'-unit',p_opt||'-unit-step',c,route_nodes,v);
  select status into status_after from user_knowledge_states where user_id=u and node_id=n_opt;
  if status_after<>'learning' then raise exception 'Optional completion wrote %, expected learning',status_after; end if;

  -- A Course required path shadows the Global required fallback.
  perform start_micro_for_route_v2(u,p_shadow_global,c,v,route_nodes);
  perform record_micro_step_completion_v2(u,p_shadow_global,p_shadow_global||'-unit',p_shadow_global||'-unit-step',c,route_nodes,v);
  select status into status_after from user_knowledge_states where user_id=u and node_id=n_shadow;
  if status_after<>'learning' then raise exception 'Shadowed Global path wrote %, expected learning',status_after; end if;
  perform start_micro_for_route_v2(u,p_shadow_course,c,v,route_nodes);
  perform record_micro_step_completion_v2(u,p_shadow_course,p_shadow_course||'-unit',p_shadow_course||'-unit-step',c,route_nodes,v);
  select status into status_after from user_knowledge_states where user_id=u and node_id=n_shadow;
  if status_after<>'learned' then raise exception 'Course required path wrote %, expected learned',status_after; end if;

  -- The centralized policy is monotonic and never manufactures mastery.
  insert into user_knowledge_states(user_id,node_id,status,mastery_origin) values
    (u,n_up,'practicing','direct'),(u,n_top,'mastered','direct');
  select raise_user_knowledge_state(u,n_up,'learned') into status_after;
  if status_after<>'practicing' then raise exception 'learned downgraded practicing to %',status_after; end if;
  select raise_user_knowledge_state(u,n_up,'learning') into status_after;
  if status_after<>'practicing' then raise exception 'learning downgraded practicing to %',status_after; end if;
  select raise_user_knowledge_state(u,n_top,'learned') into status_after;
  if status_after<>'mastered' then raise exception 'learned downgraded mastered to %',status_after; end if;
  select raise_user_knowledge_state(u,n_new,'learned') into status_after;
  if status_after<>'learned' then raise exception 'Fresh node wrote %',status_after; end if;
  if exists(select 1 from user_knowledge_states where user_id=u and node_id=any(array[n_new,n_req,n_opt,n_shadow,n_backfill]) and status='mastered') then
    raise exception 'Micro policy manufactured mastery';
  end if;

  -- Backfill fills a missing learned state, is idempotent, and preserves timestamps.
  insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context)
  values(u,n_backfill,'micro_path_completed',p_backfill,'completed',jsonb_build_object('pathId',p_backfill,'courseId',c));
  backfill_first:=backfill_micro_learning_state();
  if backfill_first<1 then raise exception 'Backfill did not raise the missing required path'; end if;
  select status,updated_at into status_after,updated_before from user_knowledge_states where user_id=u and node_id=n_backfill;
  if status_after<>'learned' then raise exception 'Backfill wrote %, expected learned',status_after; end if;
  backfill_second:=backfill_micro_learning_state();
  if backfill_second<>0 then raise exception 'Second backfill changed % rows',backfill_second; end if;
  select updated_at into updated_after from user_knowledge_states where user_id=u and node_id=n_backfill;
  if updated_after is distinct from updated_before then raise exception 'Idempotent backfill rewrote updated_at'; end if;

  select count(*) into after_versions from personal_course_route_versions where user_id=u and course_id=c;
  if after_versions<>before_versions then raise exception 'Learning state writes created a Route Version'; end if;
  raise notice 'PASS: required->learned, optional->learning, global fallback shadowed, monotonic, no mastery, idempotent backfill, no route version';
end $$;
rollback;
