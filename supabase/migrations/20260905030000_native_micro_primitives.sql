-- Shared Native Micro contract: content stays data-driven while one renderer and
-- one server evaluator own behavior. H5P remains a supported compatibility type.
create or replace function public.validate_micro_interaction(candidate jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case
    when candidate is null then true
    when jsonb_typeof(candidate) <> 'object' then false
    when candidate->>'type' = 'choice' then
      jsonb_typeof(candidate->'options') = 'array' and jsonb_array_length(candidate->'options') >= 2
      and jsonb_array_length(candidate->'options') = (select count(distinct value) from jsonb_array_elements_text(candidate->'options') value)
      and (candidate->>'correctIndex') ~ '^[0-9]+$' and (candidate->>'correctIndex')::integer < jsonb_array_length(candidate->'options')
    when candidate->>'type' = 'multiple-choice' then
      jsonb_typeof(candidate->'options') = 'array' and jsonb_array_length(candidate->'options') >= 2
      and jsonb_array_length(candidate->'options') = (select count(distinct value) from jsonb_array_elements_text(candidate->'options') value)
      and jsonb_typeof(candidate->'correctIndexes') = 'array' and jsonb_array_length(candidate->'correctIndexes') > 0
      and not exists (select 1 from jsonb_array_elements(candidate->'correctIndexes') value where jsonb_typeof(value) <> 'number' or (value #>> '{}')::integer < 0 or (value #>> '{}')::integer >= jsonb_array_length(candidate->'options'))
      and jsonb_array_length(candidate->'correctIndexes') = (select count(distinct value #>> '{}') from jsonb_array_elements(candidate->'correctIndexes') value)
    when candidate->>'type' = 'fill-blank' then
      jsonb_typeof(candidate->'answers') = 'array' and jsonb_array_length(candidate->'answers') > 0
      and not exists (select 1 from jsonb_array_elements_text(candidate->'answers') answer where length(trim(answer)) = 0)
    when candidate->>'type' = 'ordering' then
      jsonb_typeof(candidate->'items') = 'array' and jsonb_typeof(candidate->'correctOrder') = 'array'
      and jsonb_array_length(candidate->'items') >= 2 and jsonb_array_length(candidate->'items') = jsonb_array_length(candidate->'correctOrder')
      and jsonb_array_length(candidate->'items') = (select count(distinct value) from jsonb_array_elements_text(candidate->'items') value)
      and not exists ((select value from jsonb_array_elements_text(candidate->'items') value except select value from jsonb_array_elements_text(candidate->'correctOrder') value)
        union all (select value from jsonb_array_elements_text(candidate->'correctOrder') value except select value from jsonb_array_elements_text(candidate->'items') value))
    when candidate->>'type' = 'trace' then
      jsonb_typeof(candidate->'steps') = 'array' and jsonb_array_length(candidate->'steps') >= 2
      and jsonb_array_length(candidate->'steps') = (select count(distinct step->>'id') from jsonb_array_elements(candidate->'steps') step)
      and not exists (select 1 from jsonb_array_elements(candidate->'steps') step where jsonb_typeof(step) <> 'object' or length(trim(coalesce(step->>'id',''))) = 0 or length(trim(coalesce(step->>'label',''))) = 0)
      and exists (select 1 from jsonb_array_elements(candidate->'steps') step where step->>'id' = candidate->>'correctStepId')
    when candidate->>'type' = 'mini-workflow' then
      jsonb_typeof(candidate->'nodes') = 'array' and jsonb_typeof(candidate->'correctOrder') = 'array'
      and jsonb_array_length(candidate->'nodes') >= 2 and jsonb_array_length(candidate->'nodes') = jsonb_array_length(candidate->'correctOrder')
      and jsonb_array_length(candidate->'nodes') = (select count(distinct value) from jsonb_array_elements_text(candidate->'nodes') value)
      and not exists ((select value from jsonb_array_elements_text(candidate->'nodes') value except select value from jsonb_array_elements_text(candidate->'correctOrder') value)
        union all (select value from jsonb_array_elements_text(candidate->'correctOrder') value except select value from jsonb_array_elements_text(candidate->'nodes') value))
    when candidate->>'type' = 'categorize' then
      jsonb_typeof(candidate->'items') = 'array' and jsonb_array_length(candidate->'items') >= 2
      and jsonb_array_length(candidate->'items') = (select count(distinct item->>'id') from jsonb_array_elements(candidate->'items') item)
      and not exists (select 1 from jsonb_array_elements(candidate->'items') item where jsonb_typeof(item) <> 'object' or length(trim(coalesce(item->>'id',''))) = 0 or length(trim(coalesce(item->>'label',''))) = 0)
      and jsonb_typeof(candidate->'categories') = 'array' and jsonb_array_length(candidate->'categories') >= 2
      and jsonb_array_length(candidate->'categories') = (select count(distinct value) from jsonb_array_elements_text(candidate->'categories') value)
      and jsonb_typeof(candidate->'correctCategories') = 'array'
      and jsonb_array_length(candidate->'correctCategories') = jsonb_array_length(candidate->'items')
      and not exists (select 1 from jsonb_array_elements_text(candidate->'correctCategories') value where value not in (select jsonb_array_elements_text(candidate->'categories')))
    when candidate->>'type' = 'structure-builder' then
      candidate->>'mode' in ('explore','challenge') and jsonb_typeof(candidate->'nodes') = 'array' and jsonb_array_length(candidate->'nodes') >= 2
      and jsonb_array_length(candidate->'nodes') = (select count(distinct value) from jsonb_array_elements_text(candidate->'nodes') value)
      and jsonb_typeof(candidate->'edges') = 'array'
      and jsonb_array_length(candidate->'edges') = (select count(distinct edge->>'id') from jsonb_array_elements(candidate->'edges') edge)
      and not exists (select 1 from jsonb_array_elements(candidate->'edges') edge where jsonb_typeof(edge) <> 'object' or length(trim(coalesce(edge->>'id',''))) = 0 or edge->>'from' = edge->>'to' or not (candidate->'nodes' ? (edge->>'from')) or not (candidate->'nodes' ? (edge->>'to')))
      and (candidate->>'mode' = 'explore' or (jsonb_typeof(candidate->'correctEdgeIds') = 'array' and jsonb_array_length(candidate->'correctEdgeIds') > 0
        and jsonb_array_length(candidate->'correctEdgeIds') = (select count(distinct value) from jsonb_array_elements_text(candidate->'correctEdgeIds') value)
        and not exists (select 1 from jsonb_array_elements_text(candidate->'correctEdgeIds') value where value not in (select edge->>'id' from jsonb_array_elements(candidate->'edges') edge))))
    when candidate->>'type' = 'parameter-lab' then
      candidate->>'mode' in ('explore','challenge') and jsonb_typeof(candidate->'parameter') = 'object'
      and jsonb_typeof(candidate#>'{parameter,min}') = 'number' and jsonb_typeof(candidate#>'{parameter,max}') = 'number'
      and jsonb_typeof(candidate#>'{parameter,step}') = 'number' and jsonb_typeof(candidate#>'{parameter,initial}') = 'number'
      and (candidate#>>'{parameter,min}')::numeric < (candidate#>>'{parameter,max}')::numeric
      and (candidate#>>'{parameter,step}')::numeric > 0
      and (candidate#>>'{parameter,initial}')::numeric between (candidate#>>'{parameter,min}')::numeric and (candidate#>>'{parameter,max}')::numeric
      and (candidate->>'mode' = 'explore' or (jsonb_typeof(candidate->'target') = 'object'
        and jsonb_typeof(candidate#>'{target,min}') = 'number' and jsonb_typeof(candidate#>'{target,max}') = 'number'
        and (candidate#>>'{target,min}')::numeric <= (candidate#>>'{target,max}')::numeric
        and (candidate#>>'{target,min}')::numeric >= (candidate#>>'{parameter,min}')::numeric
        and (candidate#>>'{target,max}')::numeric <= (candidate#>>'{parameter,max}')::numeric))
    when candidate->>'type' = 'matrix-tensor' then
      candidate->>'mode' in ('explore','challenge') and (candidate->>'rows') ~ '^[1-9][0-9]*$' and (candidate->>'columns') ~ '^[1-9][0-9]*$'
      and (candidate->>'rows')::integer * (candidate->>'columns')::integer <= 36
      and jsonb_typeof(candidate->'initialValues') = 'array' and jsonb_array_length(candidate->'initialValues') = (candidate->>'rows')::integer * (candidate->>'columns')::integer
      and not exists (select 1 from jsonb_array_elements(candidate->'initialValues') value where jsonb_typeof(value) <> 'number')
      and (candidate->>'mode' = 'explore' or (jsonb_typeof(candidate->'targetValues') = 'array' and jsonb_array_length(candidate->'targetValues') = jsonb_array_length(candidate->'initialValues')
        and not exists (select 1 from jsonb_array_elements(candidate->'targetValues') value where jsonb_typeof(value) <> 'number')))
    when candidate->>'type' = 'h5p' then
      length(trim(coalesce(candidate->>'contentRef', ''))) > 0 and coalesce(candidate->>'adapter', 'h5p-standalone') = 'h5p-standalone'
      and coalesce(candidate->>'completionPolicy', 'passed') in ('completed', 'passed')
    else false
  end
$$;

do $$
begin
if not exists(select 1 from public.courses where id='ai-agents-in-depth')
   or not exists(select 1 from public.courses where id='cds525-deep-learning') then return; end if;

-- Replace the unavailable CDS H5P package with the equivalent native
-- Categorize step. H5P support and its published data remain untouched.
update public.micro_steps set
  title = 'Classify Rule and Learning Problems',
  content = 'Assign each problem to an explicit rule or a learned model.',
  interaction = '{"type":"categorize","items":[{"id":"tax","label":"Calculate sales tax from a fixed rate"},{"id":"spam","label":"Detect spam from labeled examples"},{"id":"format","label":"Reject a missing required field"},{"id":"image","label":"Recognize objects in images"}],"categories":["Explicit rule","Learned from data"],"correctCategories":["Explicit rule","Learned from data","Explicit rule","Learned from data"]}'::jsonb,
  success_feedback = 'Correct: complete procedures use rules; pattern recognition is learned from examples.',
  retry_feedback = 'Ask whether a complete deterministic procedure is known or patterns must be learned.',
  updated_at = now()
where id = 'cds525-k001-rule-vs-learning-step-h5p'
  and (title,content,interaction,success_feedback,retry_feedback) is distinct from
      ('Classify Rule and Learning Problems','Assign each problem to an explicit rule or a learned model.','{"type":"categorize","items":[{"id":"tax","label":"Calculate sales tax from a fixed rate"},{"id":"spam","label":"Detect spam from labeled examples"},{"id":"format","label":"Reject a missing required field"},{"id":"image","label":"Recognize objects in images"}],"categories":["Explicit rule","Learned from data"],"correctCategories":["Explicit rule","Learned from data","Explicit rule","Learned from data"]}'::jsonb,'Correct: complete procedures use rules; pattern recognition is learned from examples.','Ask whether a complete deterministic procedure is known or patterns must be learned.');

insert into public.micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values
  ('aiad-rt01-agent-loop','RT01','ai-agents-in-depth','course','Agent Loop: observe, act, verify','Trace a failed loop and assemble the reliable control structure.','learn',8,true,'published',1),
  ('cds525-k012-learning-rate','CDS525-K012','cds525-deep-learning','course','Learning Rate Lab','Explore and then stabilize a gradient-descent update.','learn',6,true,'published',1),
  ('cds525-k021-cooccurrence-matrix','CDS525-K021','cds525-deep-learning','course','Co-occurrence Matrix Explorer','Edit a tiny symmetric word co-occurrence matrix.','learn',6,true,'published',1)
on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,status=excluded.status,revision=excluded.revision,updated_at=now()
where (micro_learning_paths.title,micro_learning_paths.description,micro_learning_paths.estimated_minutes,micro_learning_paths.status,micro_learning_paths.revision) is distinct from (excluded.title,excluded.description,excluded.estimated_minutes,excluded.status,excluded.revision);

insert into public.micro_units(id,path_id,title,description,position,estimated_minutes,required) values
  ('aiad-rt01-agent-loop-unit','aiad-rt01-agent-loop','Reliable execution loop','Find the broken transition, then restore the control edges.',0,8,true),
  ('cds525-k012-learning-rate-unit','cds525-k012-learning-rate','Learning-rate behavior','Connect step size to stable optimization.',0,6,true),
  ('cds525-k021-cooccurrence-matrix-unit','cds525-k021-cooccurrence-matrix','Matrix structure','Observe and reproduce symmetric co-occurrence counts.',0,6,true)
on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,required=excluded.required,updated_at=now()
where (micro_units.title,micro_units.description,micro_units.estimated_minutes,micro_units.required) is distinct from (excluded.title,excluded.description,excluded.estimated_minutes,excluded.required);

insert into public.micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values
  ('aiad-rt01-trace','aiad-rt01-agent-loop-unit',0,'interaction','Find the first broken step','The Agent acts but produces a final answer before reading the tool result. Select the earliest root cause.','{"type":"trace","steps":[{"id":"observe","label":"1 · Observe the request"},{"id":"decide","label":"2 · Decide to call a tool"},{"id":"skip","label":"3 · Skip the tool result"},{"id":"answer","label":"4 · Produce an unsupported answer"}],"correctStepId":"skip"}'::jsonb,'Correct: the loop broke when it skipped the observation produced by the tool.','Choose the earliest step that invalidates everything after it.'),
  ('aiad-rt01-structure','aiad-rt01-agent-loop-unit',1,'interaction','Build a verifiable Agent loop','Select the edges required to return tool output to the model before verification.','{"type":"structure-builder","mode":"challenge","nodes":["OBSERVE","MODEL","TOOL","VERIFY","END"],"edges":[{"id":"observe-model","from":"OBSERVE","to":"MODEL"},{"id":"model-tool","from":"MODEL","to":"TOOL"},{"id":"tool-model","from":"TOOL","to":"MODEL"},{"id":"model-verify","from":"MODEL","to":"VERIFY"},{"id":"verify-end","from":"VERIFY","to":"END"},{"id":"tool-end","from":"TOOL","to":"END"}],"correctEdgeIds":["observe-model","model-tool","tool-model","model-verify","verify-end"]}'::jsonb,'The loop now observes tool output and verifies before ending.','Do not connect TOOL directly to END; the model must read the result and verification must pass.'),
  ('cds525-k012-explore','cds525-k012-learning-rate-unit',0,'interaction','Explore the step size','Move the learning rate and submit one in-range observation.','{"type":"parameter-lab","mode":"explore","parameter":{"label":"Learning rate","min":0.001,"max":1,"step":0.001,"initial":0.1}}'::jsonb,'Exploration captured. Small and large steps imply different convergence behavior.','Choose a value inside the available range.'),
  ('cds525-k012-challenge','cds525-k012-learning-rate-unit',1,'interaction','Stabilize the update','For this normalized example, choose a learning rate in the stable target interval.','{"type":"parameter-lab","mode":"challenge","parameter":{"label":"Learning rate","min":0.01,"max":1,"step":0.01,"initial":0.5},"target":{"min":0.05,"max":0.2}}'::jsonb,'Stable interval reached without making the step vanish.','Reduce the step enough to avoid oscillation, but keep it above 0.05.'),
  ('cds525-k021-explore','cds525-k021-cooccurrence-matrix-unit',0,'interaction','Explore a 2 × 2 count matrix','Edit the four counts and observe the matrix shape.','{"type":"matrix-tensor","mode":"explore","rows":2,"columns":2,"initialValues":[2,1,1,3]}'::jsonb,'You edited a valid 2 × 2 tensor.','Enter four finite numeric values.'),
  ('cds525-k021-challenge','cds525-k021-cooccurrence-matrix-unit',1,'interaction','Restore symmetric co-occurrence','Reproduce the target where off-diagonal word-pair counts agree in both directions.','{"type":"matrix-tensor","mode":"challenge","rows":2,"columns":2,"initialValues":[2,0,1,3],"targetValues":[2,1,1,3]}'::jsonb,'Correct: the off-diagonal co-occurrence counts are symmetric.','The two off-diagonal cells should both equal 1.')
on conflict(id) do update set unit_id=excluded.unit_id,position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback,updated_at=now()
where (micro_steps.unit_id,micro_steps.position,micro_steps.kind,micro_steps.title,micro_steps.content,micro_steps.interaction,micro_steps.success_feedback,micro_steps.retry_feedback) is distinct from (excluded.unit_id,excluded.position,excluded.kind,excluded.title,excluded.content,excluded.interaction,excluded.success_feedback,excluded.retry_feedback);

end $$;
