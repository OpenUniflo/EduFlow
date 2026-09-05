-- Shared Native Micro contract: content stays data-driven while one renderer and
-- one server evaluator own behavior. H5P remains a supported compatibility type.
create or replace function public.validate_micro_interaction_v1(candidate jsonb)
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


do $$ begin

if not exists(select 1 from courses where id='ai-agents-in-depth') or not exists(select 1 from courses where id='cds525-deep-learning') then return; end if;

insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values('aiad-rt01-agent-loop','RT01','ai-agents-in-depth','course','Agent Loop：从调用意图到可靠回复','从最小解释到机制观察、动手实践与迁移。','learn',10,true,'published',2) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,revision=excluded.revision;

insert into micro_units(id,path_id,title,position,estimated_minutes,required) values('aiad-rt01-agent-loop-unit','aiad-rt01-agent-loop','Agent Loop：从调用意图到可靠回复',0,10,true) on conflict(id) do update set title=excluded.title,estimated_minutes=excluded.estimated_minutes;

update micro_steps set position=position+1000 where unit_id='aiad-rt01-agent-loop-unit' and id in ('aiad-rt01-trace','aiad-rt01-explain','aiad-rt01-demo','aiad-rt01-insight','aiad-rt01-structure','aiad-rt01-summary');

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-rt01-trace','aiad-rt01-agent-loop-unit',0,'explanation','为什么一次模型回复还不够？','用户问实时天气时，模型需要外部观测。Agent Loop 把模型的一次调用变成可继续的循环：请求 → 模型决定 → 框架执行工具 → 结果回传 → 模型再决定。目标：分清谁决定、谁执行、什么时候结束。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-rt01-explain','aiad-rt01-agent-loop-unit',1,'explanation','先分清模型与框架','模型返回 tool_calls 表示‘请调用这个工具’，不等于工具已执行。框架执行后，把 assistant 的调用消息和带 tool_call_id 的 tool 结果加入历史，再调用模型。只有模型不再返回 tool_calls 时，本例才结束。下面使用一个工具和示意天气数据。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-rt01-demo','aiad-rt01-agent-loop-unit',2,'interaction','亲眼走一遍调用与回传','先单步看每条消息，再播放完整过程。试着断开‘tool 结果回传’，观察为什么模型无法继续；恢复后重新运行。','{
  "type": "flow-execution",
  "mode": "explore",
  "nodes": [
    {
      "id": "user",
      "label": "用户请求",
      "x": 0,
      "y": 30
    },
    {
      "id": "model",
      "label": "模型",
      "x": 230,
      "y": 30
    },
    {
      "id": "tool",
      "label": "框架执行工具",
      "x": 470,
      "y": 170
    },
    {
      "id": "final",
      "label": "最终回复",
      "x": 470,
      "y": -90
    }
  ],
  "edges": [
    {
      "id": "request",
      "from": "user",
      "to": "model",
      "label": "发送请求"
    },
    {
      "id": "call",
      "from": "model",
      "to": "tool",
      "label": "tool_calls"
    },
    {
      "id": "result",
      "from": "tool",
      "to": "model",
      "label": "tool 结果回传"
    },
    {
      "id": "answer",
      "from": "model",
      "to": "final",
      "label": "无 tool_calls，返回文本"
    },
    {
      "id": "shortcut",
      "from": "tool",
      "to": "final",
      "label": "工具直接结束"
    }
  ],
  "initialEdgeIds": [
    "request",
    "call",
    "result",
    "answer"
  ],
  "correctEdgeIds": [
    "request",
    "call",
    "result",
    "answer"
  ],
  "events": [
    {
      "nodeId": "user",
      "title": "1 · 用户提问",
      "message": "user: 北京现在适合出门吗？",
      "explanation": "本例需要实时天气。模型仅凭已有知识无法知道当前观测。"
    },
    {
      "nodeId": "model",
      "edgeId": "request",
      "title": "2 · 模型决定调用工具",
      "message": "assistant.tool_calls: weather({city: \"北京\"}), id=call_1",
      "explanation": "模型生成调用意图与参数；它还没有执行天气服务。"
    },
    {
      "nodeId": "tool",
      "edgeId": "call",
      "title": "3 · 框架执行",
      "message": "框架读取 tool_calls，调用 weather；收到：晴，22°C。",
      "explanation": "实际代码由框架执行。工具返回数据，不替模型撰写最终回答。"
    },
    {
      "nodeId": "model",
      "edgeId": "result",
      "title": "4 · 携带工具结果再次调用模型",
      "message": "追加 assistant 的调用消息，以及 tool: 晴，22°C，tool_call_id=call_1；连同历史再次发送。",
      "explanation": "模型必须看到调用和结果，才能依据观测继续推理；漏掉回传边会在这里停止。"
    },
    {
      "nodeId": "final",
      "edgeId": "answer",
      "title": "5 · 返回最终文字",
      "message": "assistant: 当前晴，22°C，适合出门。无 tool_calls。",
      "explanation": "这次模型没有再请求工具，框架退出循环并把回复交给用户。这是示意数据，并非实时天气查询。"
    }
  ]
}'::jsonb,'你看到了意图、执行、结果回传和再次决策的不同阶段。','检查数据是否回到了模型，并执行到最终回复。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-rt01-insight','aiad-rt01-agent-loop-unit',3,'feedback','工具输出为什么不能直接结束？','工具输出只是观测。模型还要结合用户问题与历史解释观测；它也可能继续请求工具。调用消息与结果缺一不可，结果用调用 ID 对应回原请求。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-rt01-structure','aiad-rt01-agent-loop-unit',4,'application','修复一个库存查询循环','换成查询库存：模型请求 stock，框架拿到‘剩余 3 件’，但错误连接把工具直接当成最终回复。断开错误连接，补回模型能读取观测的连接，再执行验证。','{
  "type": "flow-execution",
  "mode": "challenge",
  "nodes": [
    {
      "id": "user",
      "label": "用户请求",
      "x": 0,
      "y": 30
    },
    {
      "id": "model",
      "label": "模型",
      "x": 230,
      "y": 30
    },
    {
      "id": "tool",
      "label": "框架执行工具",
      "x": 470,
      "y": 170
    },
    {
      "id": "final",
      "label": "最终回复",
      "x": 470,
      "y": -90
    }
  ],
  "edges": [
    {
      "id": "request",
      "from": "user",
      "to": "model",
      "label": "发送请求"
    },
    {
      "id": "call",
      "from": "model",
      "to": "tool",
      "label": "tool_calls"
    },
    {
      "id": "result",
      "from": "tool",
      "to": "model",
      "label": "tool 结果回传"
    },
    {
      "id": "answer",
      "from": "model",
      "to": "final",
      "label": "无 tool_calls，返回文本"
    },
    {
      "id": "shortcut",
      "from": "tool",
      "to": "final",
      "label": "工具直接结束"
    }
  ],
  "initialEdgeIds": [
    "request",
    "call",
    "shortcut",
    "answer"
  ],
  "correctEdgeIds": [
    "request",
    "call",
    "result",
    "answer"
  ],
  "events": [
    {
      "nodeId": "user",
      "title": "1 · 用户提问",
      "message": "user: 商品 A 还有库存吗？",
      "explanation": "本例需要库存查询。模型仅凭已有知识无法知道当前观测。"
    },
    {
      "nodeId": "model",
      "edgeId": "request",
      "title": "2 · 模型决定调用工具",
      "message": "assistant.tool_calls: stock({sku: \"A\"}), id=call_1",
      "explanation": "模型生成调用意图与参数；它还没有执行库存服务。"
    },
    {
      "nodeId": "tool",
      "edgeId": "call",
      "title": "3 · 框架执行",
      "message": "框架读取 tool_calls，调用 stock；收到：剩余 3 件。",
      "explanation": "实际代码由框架执行。工具返回数据，不替模型撰写最终回答。"
    },
    {
      "nodeId": "model",
      "edgeId": "result",
      "title": "4 · 携带工具结果再次调用模型",
      "message": "追加 assistant 的调用消息，以及 tool: 剩余 3 件，tool_call_id=call_1；连同历史再次发送。",
      "explanation": "模型必须看到调用和结果，才能依据观测继续推理；漏掉回传边会在这里停止。"
    },
    {
      "nodeId": "final",
      "edgeId": "answer",
      "title": "5 · 返回最终文字",
      "message": "assistant: 当前剩余 3 件，可以下单。无 tool_calls。",
      "explanation": "这次模型没有再请求工具，框架退出循环并把回复交给用户。这是示意数据，并非库存查询查询。"
    }
  ]
}'::jsonb,'你把工具观测交回模型，并等到了不含 tool_calls 的最终回复。','工具提供数据；最终回答需要模型结合用户问题。缺少结果回传，就缺少再次决策的依据。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-rt01-summary','aiad-rt01-agent-loop-unit',5,'summary','你现在能解释 Agent Loop','你能区分：模型产生调用意图，框架执行工具，tool 消息回传结果，模型再决定，最后无 tool_calls 时结束。换成搜索、库存或数据库查询时，仍应检查这条信息链是否完整。来源：课程原书第 2 章，PDF 第 40–47 页。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values('aiad-ctx01-message-context','CTX01','ai-agents-in-depth','course','Message Context：谁说了什么，模型看到了什么','从最小解释到机制观察、动手实践与迁移。','learn',10,true,'published',2) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,revision=excluded.revision;

insert into micro_units(id,path_id,title,position,estimated_minutes,required) values('aiad-ctx01-message-context-unit','aiad-ctx01-message-context','Message Context：谁说了什么，模型看到了什么',0,10,true) on conflict(id) do update set title=excluded.title,estimated_minutes=excluded.estimated_minutes;

update micro_steps set position=position+1000 where unit_id='aiad-ctx01-message-context-unit' and id in ('aiad-ctx01-hook','aiad-ctx01-explain','aiad-ctx01-demo','aiad-ctx01-categorize','aiad-ctx01-insight','aiad-ctx01-order','aiad-ctx01-summary');

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-hook','aiad-ctx01-message-context-unit',0,'explanation','模型为什么会漏掉刚查到的信息？','框架已经查询到库存，模型却说‘不知道’。先检查请求里是否带了正确角色的消息。目标：区分 system、user、assistant、tool 与独立的 tools 字段，并组织一次单工具请求的完整上下文。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-explain','aiad-ctx01-message-context-unit',1,'explanation','角色表示来源，tools 描述能力','system 是行为约束；user 是用户请求；assistant 是模型的文字或 tool_calls；tool 是框架执行后返回的数据。tools 是独立字段，描述可调用工具及参数，并非聊天消息。下一次调用需要携带历史：模型不会自动知道框架刚刚做了什么。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-demo','aiad-ctx01-message-context-unit',2,'interaction','观察上下文如何随着调用增长','tools 字段先描述 weather 能力。随后观察 user 请求、assistant 调用、框架执行、tool 结果与再次模型请求：模型只能使用实际发送给它的消息。单步检查调用 ID 与结果 ID 的对应关系。','{
  "type": "flow-execution",
  "mode": "explore",
  "nodes": [
    {
      "id": "user",
      "label": "用户请求",
      "x": 0,
      "y": 30
    },
    {
      "id": "model",
      "label": "模型",
      "x": 230,
      "y": 30
    },
    {
      "id": "tool",
      "label": "框架执行工具",
      "x": 470,
      "y": 170
    },
    {
      "id": "final",
      "label": "最终回复",
      "x": 470,
      "y": -90
    }
  ],
  "edges": [
    {
      "id": "request",
      "from": "user",
      "to": "model",
      "label": "发送请求"
    },
    {
      "id": "call",
      "from": "model",
      "to": "tool",
      "label": "tool_calls"
    },
    {
      "id": "result",
      "from": "tool",
      "to": "model",
      "label": "tool 结果回传"
    },
    {
      "id": "answer",
      "from": "model",
      "to": "final",
      "label": "无 tool_calls，返回文本"
    },
    {
      "id": "shortcut",
      "from": "tool",
      "to": "final",
      "label": "工具直接结束"
    }
  ],
  "initialEdgeIds": [
    "request",
    "call",
    "result",
    "answer"
  ],
  "correctEdgeIds": [
    "request",
    "call",
    "result",
    "answer"
  ],
  "events": [
    {
      "nodeId": "user",
      "title": "1 · 用户提问",
      "message": "user: 北京现在适合出门吗？",
      "explanation": "本例需要实时天气。模型仅凭已有知识无法知道当前观测。"
    },
    {
      "nodeId": "model",
      "edgeId": "request",
      "title": "2 · 模型决定调用工具",
      "message": "assistant.tool_calls: weather({city: \"北京\"}), id=call_1",
      "explanation": "模型生成调用意图与参数；它还没有执行天气服务。"
    },
    {
      "nodeId": "tool",
      "edgeId": "call",
      "title": "3 · 框架执行",
      "message": "框架读取 tool_calls，调用 weather；收到：晴，22°C。",
      "explanation": "实际代码由框架执行。工具返回数据，不替模型撰写最终回答。"
    },
    {
      "nodeId": "model",
      "edgeId": "result",
      "title": "4 · 携带工具结果再次调用模型",
      "message": "追加 assistant 的调用消息，以及 tool: 晴，22°C，tool_call_id=call_1；连同历史再次发送。",
      "explanation": "模型必须看到调用和结果，才能依据观测继续推理；漏掉回传边会在这里停止。"
    },
    {
      "nodeId": "final",
      "edgeId": "answer",
      "title": "5 · 返回最终文字",
      "message": "assistant: 当前晴，22°C，适合出门。无 tool_calls。",
      "explanation": "这次模型没有再请求工具，框架退出循环并把回复交给用户。这是示意数据，并非实时天气查询。"
    }
  ]
}'::jsonb,'再次请求携带先前的请求、assistant 调用和 tool 结果，模型才能依据新观测回答。','请完整执行，并检查工具结果是否回到模型上下文。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-categorize','aiad-ctx01-message-context-unit',3,'interaction','把信息放回正确位置','拖动卡片按来源与作用分组。注意‘想调用工具’来自模型，‘工具查到的数据’来自框架。','{
  "type": "categorize",
  "items": [
    {
      "id": "policy",
      "label": "你是库存助手；不要编造库存"
    },
    {
      "id": "question",
      "label": "商品 A 还有几件？"
    },
    {
      "id": "decision",
      "label": "tool_calls: stock(A), id=call_1"
    },
    {
      "id": "observation",
      "label": "剩余 3 件；tool_call_id=call_1"
    },
    {
      "id": "capability",
      "label": "stock 工具描述：参数 sku 为字符串"
    }
  ],
  "categories": [
    "system",
    "user",
    "assistant",
    "tool",
    "tools 字段"
  ],
  "correctCategories": [
    "system",
    "user",
    "assistant",
    "tool",
    "tools 字段"
  ]
}'::jsonb,'来源分清了：assistant 生成意图，tool 保存观测；tools 描述可调用能力。','约束属于 system，请求属于 user，模型的调用决定属于 assistant，执行结果属于 tool，函数描述属于独立 tools 字段。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-insight','aiad-ctx01-message-context-unit',4,'feedback','调用 ID 连接意图与结果','assistant 中的 tool_calls 给出 call_1；tool 消息用 tool_call_id=call_1 对应它。发送给模型的上下文必须保留这个关系。工具定义不会替代工具结果；一段结果文字也不会替代先前的调用消息。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-order','aiad-ctx01-message-context-unit',5,'application','换成天气查询：整理单工具请求过程','把五张卡片拖成正确时序。这是只有一个工具调用的例子；它不要求独立并行工具结果之间存在固定先后。','{
  "type": "ordering",
  "items": [
    "发送 system 约束、user 天气问题与 tools 定义",
    "模型返回 assistant.tool_calls，ID 为 call_7",
    "框架执行天气工具",
    "追加 assistant 调用及 tool 结果，结果引用 call_7",
    "把完整历史再次发给模型，获得解释天气的回复"
  ],
  "correctOrder": [
    "发送 system 约束、user 天气问题与 tools 定义",
    "模型返回 assistant.tool_calls，ID 为 call_7",
    "框架执行天气工具",
    "追加 assistant 调用及 tool 结果，结果引用 call_7",
    "把完整历史再次发给模型，获得解释天气的回复"
  ]
}'::jsonb,'结果是在真实执行之后产生的；再次请求让模型真正看到新观测。','先有模型调用意图，再由框架执行；先执行获得结果，再把调用与结果一同加入历史发送。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('aiad-ctx01-summary','aiad-ctx01-message-context-unit',6,'summary','你能检查一次模型请求了','先按来源判断角色，再检查 tools 是否是能力定义、tool 是否是真实结果，最后用调用 ID 核对意图与结果。换一个工具时，这些规则不变。模型需要收到完整相关上下文。来源：原书第 2 章，PDF 第 39–47 页。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values('cds525-k012-learning-rate','CDS525-K012','cds525-deep-learning','course','Learning Rate：看见更新如何收敛','从最小解释到机制观察、动手实践与迁移。','learn',10,true,'published',2) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,revision=excluded.revision;

insert into micro_units(id,path_id,title,position,estimated_minutes,required) values('cds525-k012-learning-rate-unit','cds525-k012-learning-rate','Learning Rate：看见更新如何收敛',0,10,true) on conflict(id) do update set title=excluded.title,estimated_minutes=excluded.estimated_minutes;

update micro_steps set position=position+1000 where unit_id='cds525-k012-learning-rate-unit' and id in ('cds525-k012-hook','cds525-k012-explain','cds525-k012-explore','cds525-k012-insight','cds525-k012-challenge','cds525-k012-summary');

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k012-hook','cds525-k012-learning-rate-unit',0,'explanation','步子越大，学得越快吗？','训练通过降低 Loss 调整参数。小步可能很慢，大步可能跨过最小值并越来越远。目标：从真实更新轨迹解释学习率的影响，而不是记住一个固定的‘正确区间’。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k012-explain','cds525-k012-learning-rate-unit',1,'explanation','每一步都由同一个公式计算','θ下一步 = θ − η × ∇C(θ)。η 是学习率，梯度指出 Loss 上升方向，所以我们减去它。用简单的 C(θ)=θ²：梯度是 2θ，最小值 θ=0。θ=4、η=0.1 时，梯度 8，更新 −0.8，下一步 θ=3.2，Loss 从 16 降到 10.24。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k012-explore','cds525-k012-learning-rate-unit',2,'interaction','比较慢、收敛、摆动与发散','依次试 η=0.02、0.3、0.8、1.2；每次先单步，再播放。看参数是否跨过 0，以及跨过后距离是缩小还是放大。改学习率会重置轨迹，避免把两次实验混在一起。','{
  "type": "simulation",
  "mode": "explore",
  "parameter": {
    "label": "学习率",
    "min": 0.02,
    "max": 1.4,
    "step": 0.02,
    "initial": 0.1
  },
  "model": {
    "kind": "quadratic-descent",
    "curvature": 2,
    "optimum": 0,
    "initial": 4,
    "steps": 12
  },
  "target": {
    "maxLoss": 0.02,
    "maxGrowth": 1
  }
}'::jsonb,'你观察了真实梯度更新；跨过最小值不一定失败，关键是摆动是否衰减。','先执行完整轨迹，再解释 Loss 与步长的关系。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k012-insight','cds525-k012-learning-rate-unit',3,'feedback','决定稳定性的还有曲率','这个模型里，误差每一步乘上 (1 − η×曲率)。绝对值小于 1 时误差衰减；负号表示来回跨过最小值；绝对值大于 1 时误差放大。曲率变大，同样的 η 会带来更大的更新，因此没有所有任务通用的学习率区间。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k012-challenge','cds525-k012-learning-rate-unit',4,'application','换一个更陡的 Loss','现在 C(θ)=2(θ−1)²，曲率从 2 变成 4，最小值移到 θ=1。当前 η=0.8 会怎样？先观察，再调整，让 12 次更新后的 Loss 达标且不超过初始 Loss。','{
  "type": "simulation",
  "mode": "challenge",
  "parameter": {
    "label": "学习率",
    "min": 0.02,
    "max": 1.4,
    "step": 0.02,
    "initial": 0.8
  },
  "model": {
    "kind": "quadratic-descent",
    "curvature": 4,
    "optimum": 1,
    "initial": 5,
    "steps": 12
  },
  "target": {
    "maxLoss": 0.02,
    "maxGrowth": 1
  }
}'::jsonb,'你根据曲率变化调整了步长，并用计算后的 Loss 验证结果。','曲率更大时，相同学习率会产生更大更新；根据轨迹与误差衰减调整。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k012-summary','cds525-k012-learning-rate-unit',5,'summary','你能用轨迹判断学习率','学习率控制沿负梯度方向移动多少。太小会慢；合适时误差缩小；太大可能摆动甚至发散。换 Loss 时要重新观察曲率、轨迹和 Loss，不能照搬固定区间。本例是可解释的二次函数，不代表所有深度模型的完整行为。来源：Lecture 2，第 50 页的参数更新公式。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values('cds525-k021-cooccurrence-matrix','CDS525-K021','cds525-deep-learning','course','Co-occurrence：词的邻居如何变成向量','从最小解释到机制观察、动手实践与迁移。','learn',12,true,'published',2) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,revision=excluded.revision;

insert into micro_units(id,path_id,title,position,estimated_minutes,required) values('cds525-k021-cooccurrence-matrix-unit','cds525-k021-cooccurrence-matrix','Co-occurrence：词的邻居如何变成向量',0,12,true) on conflict(id) do update set title=excluded.title,estimated_minutes=excluded.estimated_minutes;

update micro_steps set position=position+1000 where unit_id='cds525-k021-cooccurrence-matrix-unit' and id in ('cds525-k021-hook','cds525-k021-explain','cds525-k021-explore','cds525-k021-insight','cds525-k021-challenge','cds525-k021-summary');

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k021-hook','cds525-k021-cooccurrence-matrix-unit',0,'explanation','一段文字如何变成数字表示？','‘一个词经常和谁一起出现’可以描述它的上下文。共现矩阵把邻居事件变成计数；一行就是一个词的上下文向量。目标：能说出每个 cell 的数字来自哪些文本事件，而不只是修改数字。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k021-explain','cds525-k021-cooccurrence-matrix-unit',1,'explanation','一次事件只增加一个 cell','固定窗口为左、右各 1 个词，不跨句。句子 I love AI 中，以 love 为中心，会遇到左边 I、右边 AI：分别给 love 行的 I 列、AI 列加 1。换 I 为中心时，再给 I 行的 love 列加 1。行是中心词，列是上下文词。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k021-explore','cds525-k021-cooccurrence-matrix-unit',2,'interaction','从原课例句逐个生成矩阵','先自己点几个 cell，看数字从哪里来，再用单步或播放观察全部事件。橙色中心词与紫色上下文词对应唯一的行列交叉点；错误位置不会改变数据。','{
  "type": "data-transform",
  "mode": "explore",
  "corpus": [
    [
      "I",
      "love",
      "AI"
    ],
    [
      "I",
      "love",
      "deep",
      "learning"
    ],
    [
      "I",
      "enjoy",
      "learning"
    ]
  ],
  "vocabulary": [
    "I",
    "love",
    "AI",
    "deep",
    "learning",
    "enjoy"
  ],
  "window": 1
}'::jsonb,'课件中的三句话已经转成窗口计数；每行是一个词的邻居分布。','用中心词找行，用它当前窗口内的上下文词找列。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k021-insight','cds525-k021-cooccurrence-matrix-unit',3,'feedback','为什么出现对称计数？','本例使用左右对称窗口，所以 love→AI 和 AI→love 各有独立事件。对称是这个统计定义的结果，并非手工补齐的目标。不同窗口或按整篇文档计共现，会改变事件集合。数字描述上下文关系，不自动证明两个词同义。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k021-challenge','cds525-k021-cooccurrence-matrix-unit',4,'application','换一句话，自己构造计数','对 I enjoy AI 逐事件点击 cell；这里没有自动填数。仍使用左右各 1 的窗口：I 与 AI 中间隔着 enjoy，不能直接计为邻居。','{
  "type": "data-transform",
  "mode": "challenge",
  "corpus": [
    [
      "I",
      "enjoy",
      "AI"
    ]
  ],
  "vocabulary": [
    "I",
    "enjoy",
    "AI"
  ],
  "window": 1
}'::jsonb,'你从新句子重建了四个有方向的邻居事件，并正确映射到矩阵。','检查中心/上下文方向与词间距离；只统计当前窗口内的真实事件。') on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values('cds525-k021-summary','cds525-k021-cooccurrence-matrix-unit',5,'summary','你知道这些数字从哪里来','共现矩阵 = 文本 + 明确窗口规则 + 逐事件计数。行是中心词，列是上下文词，一行给出上下文向量。换语料或窗口要重新计算事件，不能沿用原矩阵。来源：Lecture 3，第 25–26 页；探索使用第 26 页原始三句语料，练习是更小的迁移例句。',null,null,null) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;

update micro_steps set title='规则还是学习：动手分类',content='把卡片拖到明确规则或从数据学习区域，完成后检查。',interaction='{"type":"h5p","contentRef":"cds525-h5p-k001-rule-vs-learning","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb where id='cds525-k001-rule-vs-learning-step-h5p';

end $$;
