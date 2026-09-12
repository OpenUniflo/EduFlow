-- Definitions are versioned; no historical completion is backfilled as performance.
create table public.mastery_criteria (
  id text not null,
  version integer not null default 1 check (version > 0),
  knowledge_id text not null references public.knowledge_nodes(id),
  knowledge_revision_id text not null references public.knowledge_node_revisions(id),
  title text not null check (length(title) > 0),
  description text not null,
  cognitive_level text not null check (cognitive_level in ('remember','understand','apply','analyze','evaluate','create')),
  criterion_type text not null check (criterion_type in ('conceptual','procedural')),
  required boolean not null default false,
  display_order integer not null check (display_order >= 0),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id,version)
);
create unique index mastery_criteria_active_identity on public.mastery_criteria(id) where status='active';
create index mastery_criteria_knowledge_idx on public.mastery_criteria(knowledge_id,status,display_order);

create table public.micro_step_criteria (
  step_id text not null references public.micro_steps(id) on delete cascade,
  criterion_id text not null,
  criterion_version integer not null,
  purpose text not null check (purpose in ('instruction','evidence')),
  primary key (step_id,criterion_id,criterion_version),
  foreign key (criterion_id,criterion_version) references public.mastery_criteria(id,version)
);
create index micro_step_criteria_criterion_idx on public.micro_step_criteria(criterion_id,criterion_version);

-- Kept outside authoring Course definitions so publishing a draft cannot reset policy.
create table public.course_recommendation_policies (
  course_id text primary key references public.courses(id) on delete cascade,
  policy_key text not null check (policy_key in ('fixed','rule_v1')),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.navigation_decisions
  add column recommendation_policy text,
  add column recommendation_version text,
  add column candidate_set jsonb check (jsonb_typeof(candidate_set)='array'),
  add column selected_action jsonb check (jsonb_typeof(selected_action)='object'),
  add column state_snapshot jsonb check (jsonb_typeof(state_snapshot)='array'),
  add column state_hash text check (length(state_hash)=64),
  add column evidence_cutoff bigint,
  add column estimator_version text;
-- Null foundation fields on old decisions mean unavailable, not an empty historical state.

create table public.micro_step_attempts (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text,
  knowledge_id text not null,
  path_id text not null,
  unit_id text not null,
  step_id text not null,
  path_revision integer not null,
  step_hash text not null check (length(step_hash)=64),
  criterion_refs jsonb not null check (jsonb_typeof(criterion_refs)='array'),
  interaction_type text not null,
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  response jsonb,
  outcome text not null check (outcome in ('correct','incorrect','observed','reported_completion')),
  completion_accepted boolean not null,
  -- Optional browser-measured elapsed time; not a trusted ability signal.
  client_duration_ms integer check (client_duration_ms between 0 and 86400000),
  decision_id uuid references public.navigation_decisions(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (user_id,idempotency_key),
  unique (user_id,path_id,step_id,attempt_number)
);
-- Source identities deliberately survive content replacement. RPC validates their live
-- ownership before insertion; historical evidence is not cascade-deleted by authoring.
create index micro_step_attempts_user_knowledge_idx on public.micro_step_attempts(user_id,knowledge_id,sequence);
create index micro_step_attempts_decision_idx on public.micro_step_attempts(decision_id);
create index micro_step_attempts_user_course_idx on public.micro_step_attempts(user_id,course_id,sequence);

alter table public.mastery_criteria enable row level security;
alter table public.micro_step_criteria enable row level security;
alter table public.course_recommendation_policies enable row level security;
alter table public.micro_step_attempts enable row level security;
revoke all on public.mastery_criteria,public.micro_step_criteria,public.course_recommendation_policies,public.micro_step_attempts from anon,authenticated;
grant select on public.mastery_criteria,public.micro_step_criteria,public.micro_step_attempts to authenticated;
grant all on public.mastery_criteria,public.micro_step_criteria,public.course_recommendation_policies,public.micro_step_attempts to service_role;
grant usage,select on sequence public.micro_step_attempts_sequence_seq to service_role;
create policy mastery_criteria_visible_read on public.mastery_criteria for select to authenticated
  using (exists(select 1 from public.knowledge_nodes n where n.id=knowledge_id and n.status='active'));
create policy micro_step_criteria_visible_read on public.micro_step_criteria for select to authenticated
  using (exists(select 1 from public.micro_steps s where s.id=step_id)
    and exists(select 1 from public.mastery_criteria c where c.id=criterion_id and c.version=criterion_version));
create policy micro_step_attempts_own_read on public.micro_step_attempts for select to authenticated using(user_id=(select auth.uid()));

create function public.record_micro_step_attempt(
  p_user_id uuid,p_path_id text,p_unit_id text,p_step_id text,p_context_course_id text,
  p_key text,p_response jsonb,p_correct boolean,p_outcome text,p_step_hash text,
  p_duration integer,p_decision_id uuid,p_expected_step jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  p micro_learning_paths%rowtype; s micro_steps%rowtype; previous micro_step_attempts%rowtype;
  attempt micro_step_attempts%rowtype; effective_course text; refs jsonb; next_number integer;
  completion jsonb; progress user_micro_path_progress%rowtype;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'learner_not_found'; end if;
  -- Serialize per learner, including evidence sequence allocation, so historical cutoffs
  -- never acquire a late-committing observation with an earlier sequence.
  perform pg_advisory_xact_lock(hashtextextended('criterion-evidence:'||p_user_id::text,0));
  select * into previous from micro_step_attempts where user_id=p_user_id and idempotency_key=p_key;
  if previous.id is not null then
    if previous.path_id<>p_path_id or previous.unit_id<>p_unit_id or previous.step_id<>p_step_id
      or previous.response is distinct from p_response
      or previous.course_id is distinct from p_context_course_id
      or previous.decision_id is distinct from p_decision_id then raise exception 'micro_idempotency_conflict' using errcode='23505'; end if;
    select to_jsonb(x) into completion from user_micro_path_progress x where x.user_id=p_user_id and x.path_id=p_path_id;
    return jsonb_build_object('attempt',to_jsonb(previous),'progress',completion,'duplicate',true);
  end if;
  select * into p from micro_learning_paths where id=p_path_id and status='published';
  select * into s from micro_steps where id=p_step_id and unit_id=p_unit_id;
  if p.id is null or s.id is null or not exists(select 1 from micro_units where id=p_unit_id and path_id=p_path_id) then raise exception 'micro_step_not_found'; end if;
  if p_expected_step is distinct from jsonb_build_object('interaction',s.interaction,'kind',s.kind,'revision',p.revision) then
    raise exception 'micro_content_changed' using errcode='40001';
  end if;
  if not exists(select 1 from knowledge_nodes where id=p.knowledge_id and status='active') then raise exception 'knowledge_unavailable'; end if;
  effective_course:=coalesce(p_context_course_id,p.course_id);
  if p.course_id is not null and p.course_id is distinct from effective_course then raise exception 'micro_context_mismatch'; end if;
  if effective_course is not null then
    if not exists(select 1 from courses c where c.id=effective_course and c.lifecycle='published'
      and (c.course_type='standard' or c.owner_user_id=p_user_id)) then raise exception 'course_unavailable'; end if;
    if not exists(select 1 from curriculum_coverages where course_id=effective_course and node_id=p.knowledge_id) then raise exception 'knowledge_not_in_course'; end if;
    if exists(select 1 from knowledge_edges e where e.target_node_id=p.knowledge_id and e.relation='prerequisite' and e.lifecycle_status='active'
      and exists(select 1 from curriculum_coverages cc where cc.course_id=effective_course and cc.node_id=e.source_node_id)
      and not exists(select 1 from user_knowledge_states st where st.user_id=p_user_id and st.node_id=e.source_node_id and st.status in ('learned','practicing','mastered'))) then
      raise exception 'teaching_prerequisite_required' using errcode='42501';
    end if;
  elsif p.scope<>'global' then raise exception 'standalone_path_unavailable'; end if;
  if p_decision_id is not null and not exists(select 1 from navigation_decisions d where d.id=p_decision_id
    and d.user_id=p_user_id and d.course_id=effective_course and d.selected_action->>'kind'='micro'
    and d.selected_action->>'resourceId'=p_path_id and d.selected_action->>'knowledgeId'=p.knowledge_id) then
    raise exception 'recommendation_action_mismatch' using errcode='42501';
  end if;
  -- An old/completed step is review, not a new formal observation.
  if exists(select 1 from user_micro_unit_progress u where u.user_id=p_user_id and u.unit_id=p_unit_id and u.completed_step_ids ? p_step_id) then
    select * into progress from user_micro_path_progress where user_id=p_user_id and path_id=p_path_id;
    return jsonb_build_object('attempt',null,'progress',to_jsonb(progress),'duplicate',true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('criterionId',c.id,'version',c.version) order by c.id),'[]'::jsonb) into refs
    from micro_step_criteria m join mastery_criteria c on c.id=m.criterion_id and c.version=m.criterion_version
    where m.step_id=p_step_id and m.purpose='evidence' and c.status='active' and c.knowledge_id=p.knowledge_id
      and p_outcome in ('correct','incorrect');
  select coalesce(max(a.attempt_number),0)+1 into next_number from micro_step_attempts a where a.user_id=p_user_id and a.path_id=p_path_id and a.step_id=p_step_id;
  insert into micro_step_attempts(user_id,course_id,knowledge_id,path_id,unit_id,step_id,path_revision,step_hash,criterion_refs,
    interaction_type,attempt_number,idempotency_key,response,outcome,completion_accepted,client_duration_ms,decision_id)
  values(p_user_id,effective_course,p.knowledge_id,p_path_id,p_unit_id,p_step_id,p.revision,p_step_hash,refs,
    coalesce(s.interaction->>'type','instruction'),next_number,p_key,p_response,p_outcome,p_correct,p_duration,p_decision_id) returning * into attempt;
  if effective_course is not null then
    insert into user_course_states(user_id,course_id,is_active,updated_at) values(p_user_id,effective_course,true,now())
      on conflict(user_id,course_id) do update set is_active=true,updated_at=excluded.updated_at;
  end if;
  if p_correct then
    perform * from record_micro_step_completion(p_user_id,p_path_id,p_unit_id,p_step_id,effective_course);
  end if;
  select to_jsonb(x) into completion from user_micro_path_progress x where x.user_id=p_user_id and x.path_id=p_path_id;
  return jsonb_build_object('attempt',to_jsonb(attempt),'progress',completion,'duplicate',false);
end $$;
revoke all on function public.record_micro_step_attempt(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_micro_step_attempt(uuid,text,text,text,text,text,jsonb,boolean,text,text,integer,uuid,jsonb) to service_role;

-- Reject accidental cross-Knowledge mapping even from authorized content tooling.
create function public.validate_micro_criterion_mapping() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from micro_steps s join micro_units u on u.id=s.unit_id
    join micro_learning_paths p on p.id=u.path_id join mastery_criteria c on c.knowledge_id=p.knowledge_id
    where s.id=new.step_id and c.id=new.criterion_id and c.version=new.criterion_version) then
    raise exception 'criterion_knowledge_mismatch' using errcode='23514';
  end if;
  return new;
end $$;
create trigger micro_criterion_mapping_identity before insert or update on public.micro_step_criteria
  for each row execute function public.validate_micro_criterion_mapping();
revoke all on function public.validate_micro_criterion_mapping() from public,anon,authenticated;

-- Extend the existing publishing transaction without copying its evolving implementation.
-- Retain mapping only when stable Knowledge, Step kind and evaluated interaction survive.
do $patch$
declare definition text; original text;
begin
  select pg_get_functiondef('public.publish_course_authoring_draft(text,integer)'::regprocedure) into definition;
  original:=definition;
  definition:=replace(definition,'saved_course_states jsonb;', 'saved_criterion_mappings jsonb; saved_course_states jsonb;');
  definition:=replace(definition,'  update user_course_states set recent_lesson_id', $insert$
  select coalesce(jsonb_agg(jsonb_build_object('mapping',to_jsonb(m),'knowledge',p.knowledge_id,'interaction',s.interaction,'kind',s.kind)),'[]'::jsonb)
    into saved_criterion_mappings from micro_step_criteria m join micro_steps s on s.id=m.step_id
    join micro_units u on u.id=s.unit_id join micro_learning_paths p on p.id=u.path_id where p.course_id=p_course_id;
  update user_course_states set recent_lesson_id$insert$);
  definition:=replace(definition,'  return next;', $insert$
  insert into micro_step_criteria(step_id,criterion_id,criterion_version,purpose)
    select item->'mapping'->>'step_id',item->'mapping'->>'criterion_id',(item->'mapping'->>'criterion_version')::integer,item->'mapping'->>'purpose'
    from jsonb_array_elements(saved_criterion_mappings) item
    join micro_steps s on s.id=item->'mapping'->>'step_id'
    join micro_units u on u.id=s.unit_id join micro_learning_paths p on p.id=u.path_id
    where p.course_id=p_course_id and p.knowledge_id=item->>'knowledge' and s.kind=item->>'kind'
      and s.interaction is not distinct from nullif(item->'interaction','null'::jsonb)
    on conflict do nothing;
  return next;$insert$);
  if definition=original or position('into saved_criterion_mappings' in definition)=0 then raise exception 'publish_function_shape_changed'; end if;
  execute definition;
end $patch$;
