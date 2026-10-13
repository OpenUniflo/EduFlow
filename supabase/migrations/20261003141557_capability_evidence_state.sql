-- Personal evidence is independent of curriculum. All mutations are server-owned.
create table public.user_evidence_sources (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 title text not null check(length(title) between 1 and 240),
 storage_path text not null unique, content_type text not null,
 byte_size integer not null check(byte_size between 1 and 1048576),
 parse_status text not null default 'pending' check(parse_status in ('pending','ready','failed')),
 parsed_lines jsonb not null default '[]' check(jsonb_typeof(parsed_lines)='array'),
 source_sha256 text, parse_error text, provenance jsonb not null default '{}',
 created_at timestamptz not null default now(), archived_at timestamptz,
 unique(id,user_id), check(storage_path like user_id::text || '/%')
);
create table public.capability_diagnosis_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 source_ids uuid[] not null check(cardinality(source_ids) between 1 and 5),
 status text not null default 'running' check(status in ('running','completed','failed')),
 model text not null, prompt_version text not null, diagnostics jsonb not null default '{}',
 error text, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(id,user_id)
);
create table public.evidence_units (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 source_id uuid not null, run_id uuid not null, source_line integer not null check(source_line>0),
 quote text not null, observation text not null, capability text not null,
 extraction_version text not null, created_at timestamptz not null default now(),
 unique(id,user_id),
 foreign key(source_id,user_id) references public.user_evidence_sources(id,user_id),
 foreign key(run_id,user_id) references public.capability_diagnosis_runs(id,user_id)
);
create table public.capability_state_proposals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 run_id uuid not null, unit_ids uuid[] not null check(cardinality(unit_ids)>0),
 node_id text references public.knowledge_nodes(id), revision_id text references public.knowledge_node_revisions(id),
 proposed_status text check(proposed_status in ('learning','learned')),
 sufficiency text not null check(sufficiency in ('supported','partial','insufficient','unmatched')),
 confidence numeric not null check(confidence between 0 and 1), reason text not null,
 confirmation_state text not null default 'pending' check(confirmation_state in ('pending','confirmed','rejected')),
 knowledge_evidence_id uuid references public.knowledge_evidence(id),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 foreign key(run_id,user_id) references public.capability_diagnosis_runs(id,user_id),
 check((node_id is null)=(revision_id is null)),
 check(proposed_status is null or (node_id is not null and ((sufficiency='supported' and proposed_status='learned') or (sufficiency='partial' and proposed_status='learning'))))
);
create index evidence_sources_owner on public.user_evidence_sources(user_id,created_at);
create index evidence_runs_owner on public.capability_diagnosis_runs(user_id,created_at);
create index evidence_units_source on public.evidence_units(source_id,user_id);
create index evidence_units_run on public.evidence_units(run_id,user_id);
create index evidence_proposals_run on public.capability_state_proposals(run_id,user_id);
create index evidence_proposals_node on public.capability_state_proposals(node_id);
create index evidence_proposals_revision on public.capability_state_proposals(revision_id);
create index evidence_proposals_formal on public.capability_state_proposals(knowledge_evidence_id);

do $$ declare t text; begin
 foreach t in array array['user_evidence_sources','capability_diagnosis_runs','evidence_units','capability_state_proposals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('user-evidence','user-evidence',false,1048576,array['text/plain','text/markdown','text/csv'])
on conflict(id) do nothing;
-- Uploads use one-use server-issued signed tokens. Clients cannot replace/delete provenance.
create policy user_evidence_owner_read on storage.objects for select to authenticated
 using(bucket_id='user-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);

create table public.knowledge_node_revision_embeddings (
 revision_id text not null references public.knowledge_node_revisions(id),
 model text not null check(model='text-embedding-3-small'),
 dimensions integer not null check(dimensions=1024),
 embedding extensions.vector(1024) not null, created_at timestamptz not null default now(),
 primary key(revision_id,model)
);
alter table public.knowledge_node_revision_embeddings enable row level security;
revoke all on public.knowledge_node_revision_embeddings from anon,authenticated;
grant all on public.knowledge_node_revision_embeddings to service_role;
create index knowledge_revision_embedding_cosine on public.knowledge_node_revision_embeddings
 using hnsw(embedding extensions.vector_cosine_ops);
create function public.retrieve_evidence_knowledge(p_embedding extensions.vector(1024),p_model text,p_limit integer default 5)
returns table(node_id text,revision_id text,title text,description text,mastery_criteria jsonb,similarity double precision)
language sql stable security invoker set search_path=public,extensions as $$
 select n.id,r.id,r.title,r.description,r.mastery_criteria,1-(e.embedding <=> p_embedding)
 from knowledge_node_revision_embeddings e join knowledge_node_revisions r on r.id=e.revision_id
 join knowledge_nodes n on n.id=r.node_id and n.current_revision_id=r.id
 where n.scope='global' and n.status='active' and e.model=p_model
 order by e.embedding <=> p_embedding,n.id limit least(greatest(p_limit,1),8)
$$;
revoke all on function public.retrieve_evidence_knowledge(extensions.vector,text,integer) from public,anon,authenticated;
grant execute on function public.retrieve_evidence_knowledge(extensions.vector,text,integer) to service_role;

alter table public.knowledge_evidence drop constraint knowledge_evidence_event_type_check;
alter table public.knowledge_evidence add constraint knowledge_evidence_event_type_check
 check(event_type in ('micro_path_completed','assignment_accepted','workflow_passed','capability_confirmed'));

-- Explicit confirmation is an additional input into the existing learner-state authority,
-- not a new mastery estimator. Never claims mastered or weakens Micro/Assignment policy.
create function public.confirm_capability_proposals(p_user_id uuid,p_ids uuid[],p_decision text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p capability_state_proposals%rowtype; u evidence_units%rowtype; eid uuid; result jsonb:='[]';
begin
 if p_user_id is null or p_decision not in ('confirm','reject') or cardinality(p_ids) not between 1 and 50 then
 raise exception 'invalid_confirmation' using errcode='22023'; end if;
 -- Serialize this user's confirmation batches (including overlapping node proposals).
 perform pg_advisory_xact_lock(hashtextextended('capability-confirm:'||p_user_id::text,0));
 if (select count(*) from capability_state_proposals where id=any(p_ids) and user_id=p_user_id) <> cardinality(p_ids) then
 raise exception 'proposal_not_found' using errcode='P0002'; end if;
 for p in select * from capability_state_proposals where id=any(p_ids) and user_id=p_user_id order by id for update loop
 eid:=null;
 if p.confirmation_state <> 'pending' then
 if p.confirmation_state <> (case when p_decision='confirm' then 'confirmed' else 'rejected' end) then raise exception 'proposal_already_resolved' using errcode='23514'; end if;
 result:=result||jsonb_build_object('id',p.id,'state',p.confirmation_state); continue;
 end if;
 if p_decision='confirm' then
 if p.proposed_status is null or not exists(select 1 from capability_diagnosis_runs where id=p.run_id and user_id=p_user_id and status='completed') then
 raise exception 'proposal_not_confirmable' using errcode='23514'; end if;
 perform 1 from knowledge_nodes where id=p.node_id and status='active' and scope='global' and current_revision_id=p.revision_id for share;
 if not found then raise exception 'knowledge_revision_changed' using errcode='23514'; end if;
 if (select count(*) from evidence_units where id=any(p.unit_ids) and user_id=p_user_id and run_id=p.run_id)<>cardinality(p.unit_ids) then
 raise exception 'invalid_evidence_lineage' using errcode='23514'; end if;
 for u in select * from evidence_units where id=any(p.unit_ids) and user_id=p_user_id loop
 perform 1 from user_evidence_sources where id=u.source_id and user_id=p_user_id and parse_status='ready' and archived_at is null for share;
 if not found then raise exception 'evidence_source_unavailable' using errcode='23514'; end if;
 end loop;
 insert into knowledge_evidence(user_id,node_id,event_type,source_entity_id,outcome,context)
 values(p_user_id,p.node_id,'capability_confirmed',p.id::text,'accepted',jsonb_build_object('proposalId',p.id,'diagnosisId',p.run_id,'unitIds',p.unit_ids,'revisionId',p.revision_id,'confirmation','explicit-user','proposedStatus',p.proposed_status))
 returning id into eid;
 insert into user_knowledge_states(user_id,node_id,status,mastery_origin,updated_at)
 values(p_user_id,p.node_id,p.proposed_status,'direct',now())
 on conflict(user_id,node_id) do update set
 status=case when array_position(array['explore','learning','learned','practicing','mastered'],user_knowledge_states.status) >= array_position(array['explore','learning','learned','practicing','mastered'],excluded.status) then user_knowledge_states.status else excluded.status end,
 updated_at=excluded.updated_at;
 end if;
 update capability_state_proposals set confirmation_state=case when p_decision='confirm' then 'confirmed' else 'rejected' end,knowledge_evidence_id=eid,resolved_at=now() where id=p.id;
 result:=result||jsonb_build_object('id',p.id,'state',case when p_decision='confirm' then 'confirmed' else 'rejected' end);
 end loop;
 return result;
end $$;
revoke all on function public.confirm_capability_proposals(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.confirm_capability_proposals(uuid,uuid[],text) to service_role;

create function public.evidence_index_missing(p_model text) returns bigint
language sql stable security invoker set search_path=public as $$
 select count(*) from knowledge_nodes n where n.scope='global' and n.status='active'
 and not exists(select 1 from knowledge_node_revision_embeddings e where e.revision_id=n.current_revision_id and e.model=p_model)
$$;
revoke all on function public.evidence_index_missing(text) from public,anon,authenticated;
grant execute on function public.evidence_index_missing(text) to service_role;
