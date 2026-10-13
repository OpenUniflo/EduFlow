-- Companion to route-action-v2-fixture.sql: real A02 teaching content for Bridge detail.
-- No curriculum coverage, Knowledge facts or learner state is manufactured.
begin;
do $$
declare c constant text := 'acceptance-route-action-v2'; p constant text := 'acceptance-route-action-v2-a02';
begin
  if not exists(select 1 from courses where id=c and course_type='personal') then raise exception 'Private Acceptance course required'; end if;
  if exists(select 1 from micro_learning_paths where id=p) then raise exception 'Bridge fixture already exists; inspect before reuse'; end if;
  if not exists(select 1 from micro_learning_paths where id='aiad-l1-a02' and status='published' and knowledge_id='A02') then raise exception 'Published source teaching content required'; end if;
  insert into micro_learning_paths select (jsonb_populate_record(null::micro_learning_paths,to_jsonb(x)||jsonb_build_object('id',p,'course_id',c,'title','Acceptance · '||x.title,'created_at',now(),'updated_at',now()))).* from micro_learning_paths x where id='aiad-l1-a02';
  insert into micro_units select (jsonb_populate_record(null::micro_units,to_jsonb(x)||jsonb_build_object('id','acceptance-bridge-'||x.id,'path_id',p,'created_at',now(),'updated_at',now()))).* from micro_units x where path_id='aiad-l1-a02';
  insert into micro_steps select (jsonb_populate_record(null::micro_steps,to_jsonb(s)||jsonb_build_object('id','acceptance-bridge-'||s.id,'unit_id','acceptance-bridge-'||s.unit_id,'created_at',now(),'updated_at',now()))).* from micro_steps s join micro_units u on u.id=s.unit_id where u.path_id='aiad-l1-a02';
end $$;
commit;
