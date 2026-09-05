-- V2 content is still JSONB. No new progress or learning-state authority.
create or replace function public.validate_micro_interaction(candidate jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare item jsonb; event jsonb; previous_event jsonb; link jsonb; p jsonb; m jsonb;
begin
  if candidate->>'type' not in ('flow-execution','simulation','data-transform') or candidate is null then return public.validate_micro_interaction_v1(candidate); end if;
  for item in select value from jsonb_path_query(candidate,'strict $.**') as extracted(value) loop
    if jsonb_typeof(item)='string' and (length(item#>>'{}')>2000 or length(trim(item#>>'{}'))=0) then return false; end if;
    if jsonb_typeof(item)='number' and (abs((item#>>'{}')::numeric)>1.7976931348623157e308 or ((item#>>'{}')::numeric<>0 and abs((item#>>'{}')::numeric)<4.9406564584124654e-324)) then return false; end if;
  end loop;
  if coalesce(candidate->>'mode','') not in ('explore','challenge') then return false; end if;
  if candidate->>'type'='flow-execution' then
    if not(candidate ?& array['nodes','edges','events','initialEdgeIds','correctEdgeIds']) or jsonb_typeof(candidate->'nodes')<>'array' or jsonb_array_length(candidate->'nodes') not between 2 and 16
      or jsonb_typeof(candidate->'edges')<>'array' or jsonb_array_length(candidate->'edges') not between 1 and 40
      or jsonb_typeof(candidate->'events')<>'array' or jsonb_array_length(candidate->'events') not between 2 and 40
      or jsonb_typeof(candidate->'initialEdgeIds')<>'array' or jsonb_typeof(candidate->'correctEdgeIds')<>'array' or jsonb_array_length(candidate->'correctEdgeIds')<1 then return false; end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(candidate->'nodes'))<>jsonb_array_length(candidate->'nodes')
      or (select count(distinct value->>'id') from jsonb_array_elements(candidate->'edges'))<>jsonb_array_length(candidate->'edges') then return false; end if;
    for item in select value from jsonb_array_elements(candidate->'nodes') loop
      if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'label') is distinct from 'string' or coalesce(length(trim(item->>'id')),0)=0 or coalesce(length(trim(item->>'label')),0)=0 or jsonb_typeof(item->'x') is distinct from 'number' or jsonb_typeof(item->'y') is distinct from 'number' then return false; end if;
    end loop;
    for item in select value from jsonb_array_elements(candidate->'edges') loop
      if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'label') is distinct from 'string' or coalesce(length(trim(item->>'id')),0)=0 or coalesce(length(trim(item->>'label')),0)=0
        or jsonb_typeof(item->'from') is distinct from 'string' or jsonb_typeof(item->'to') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(candidate->'nodes') n where n->>'id'=item->>'from')
        or not exists(select 1 from jsonb_array_elements(candidate->'nodes') n where n->>'id'=item->>'to') then return false; end if;
    end loop;
    for p in select candidate->'initialEdgeIds' union all select candidate->'correctEdgeIds' loop
      if (select count(distinct value) from jsonb_array_elements(p))<>jsonb_array_length(p) then return false; end if;
      for item in select value from jsonb_array_elements(p) loop
        if jsonb_typeof(item)<>'string' or not exists(select 1 from jsonb_array_elements(candidate->'edges') e where e->>'id'=item#>>'{}') then return false; end if;
      end loop;
    end loop;
    for event in select value from jsonb_array_elements(candidate->'events') loop
      if jsonb_typeof(event->'nodeId') is distinct from 'string' or jsonb_typeof(event->'title') is distinct from 'string' or jsonb_typeof(event->'message') is distinct from 'string' or jsonb_typeof(event->'explanation') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(candidate->'nodes') n where n->>'id'=event->>'nodeId')
        or coalesce(length(trim(event->>'title')),0)=0 or coalesce(length(trim(event->>'message')),0)=0 or coalesce(length(trim(event->>'explanation')),0)=0 then return false; end if;
      if previous_event is null then
        if event ? 'edgeId' then return false; end if;
      else
        if jsonb_typeof(event->'edgeId') is distinct from 'string' then return false; end if;
        select value into link from jsonb_array_elements(candidate->'edges') e where e->>'id'=event->>'edgeId';
        if link is null or link->>'from'<>previous_event->>'nodeId' or link->>'to'<>event->>'nodeId' or not(candidate->'correctEdgeIds' ? (link->>'id')) then return false; end if;
      end if;
      previous_event:=event;
    end loop;
    return true;
  elsif candidate->>'type'='simulation' then
    if not(candidate ?& array['parameter','model','target']) then return false; end if;
    p:=candidate->'parameter';m:=candidate->'model';
    if jsonb_typeof(p->'label') is distinct from 'string' or m->>'kind' is distinct from 'quadratic-descent' or coalesce(length(trim(p->>'label')),0)=0 then return false; end if;
    for item in select p->'min' union all select p->'max' union all select p->'step' union all select p->'initial' union all select m->'curvature' union all select m->'optimum' union all select m->'initial' union all select m->'steps' union all select candidate#>'{target,maxLoss}' union all select candidate#>'{target,maxGrowth}' loop
      if jsonb_typeof(item) is distinct from 'number' then return false; end if;
    end loop;
    return (p->>'min')::numeric>=0 and (p->>'max')::numeric>(p->>'min')::numeric and (p->>'max')::numeric<=10 and (p->>'step')::numeric>0
      and (p->>'initial')::numeric between (p->>'min')::numeric and (p->>'max')::numeric
      and (m->>'curvature')::numeric>0 and (m->>'curvature')::numeric<=100
      and (m->>'initial')::numeric between -100 and 100 and (m->>'optimum')::numeric between -100 and 100
      and (m->>'initial')::numeric<>(m->>'optimum')::numeric
      and (m->>'steps')::numeric=trunc((m->>'steps')::numeric) and (m->>'steps')::numeric between 2 and 60
      and ln(greatest(1,abs(1-(p->>'max')::numeric*(m->>'curvature')::numeric)))*(m->>'steps')::numeric<=300
      and (candidate#>>'{target,maxLoss}')::numeric>0 and (candidate#>>'{target,maxGrowth}')::numeric>=1;
  else
    if jsonb_typeof(candidate->'vocabulary') is distinct from 'array' or jsonb_array_length(candidate->'vocabulary') not between 2 and 8
      or jsonb_typeof(candidate->'corpus') is distinct from 'array' or jsonb_array_length(candidate->'corpus') not between 1 and 8
      or jsonb_typeof(candidate->'window') is distinct from 'number' or (candidate->>'window')::numeric<>trunc((candidate->>'window')::numeric) or (candidate->>'window')::integer not between 1 and 3 then return false; end if;
    if (select count(distinct value) from jsonb_array_elements(candidate->'vocabulary'))<>jsonb_array_length(candidate->'vocabulary') then return false; end if;
    for item in select value from jsonb_array_elements(candidate->'vocabulary') loop
      if jsonb_typeof(item)<>'string' or length(trim(item#>>'{}'))=0 then return false; end if;
    end loop;
    for p in select value from jsonb_array_elements(candidate->'corpus') loop
      if jsonb_typeof(p)<>'array' or jsonb_array_length(p) not between 2 and 20 then return false; end if;
      for item in select value from jsonb_array_elements(p) loop
        if jsonb_typeof(item)<>'string' or not(candidate->'vocabulary' ? (item#>>'{}')) then return false; end if;
      end loop;
    end loop;
    return true;
  end if;
exception when others then return false;
end $$;
