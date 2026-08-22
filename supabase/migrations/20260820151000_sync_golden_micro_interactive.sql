-- Hosted-safe Golden Micro upgrade. The stable Path, Unit, and existing Step
-- identities are preserved so existing progress and Evidence remain attached.
-- On a clean local reset, fixture prerequisites are seeded after migrations;
-- supabase/seed.sql inserts the same canonical rows instead.
do $$
begin
  if exists (select 1 from public.knowledge_nodes where id = 'AG01')
     and exists (select 1 from public.courses where id = 'agentic-ai-golden') then
    insert into public.micro_learning_paths (id, knowledge_id, course_id, scope, title, description, mode, estimated_minutes, required, status)
    values
      ('golden-micro-AG01','AG01',null,'global','Agent · 互动微学习','区分 Model、Tool、State 与 Action Loop，并建立可验证的 Agent 判断。','learn',10,true,'published'),
      ('golden-micro-H02','H02','agentic-ai-golden','course','Workflow · 互动微学习','从边界、执行顺序到可运行的最小 Agent Workflow。','learn',12,true,'published'),
      ('golden-micro-RT14','RT14','agentic-ai-golden','course','Failure Recovery · 互动微学习','定位失败点，区分 retry、fallback 与终止，并搭建恢复链路。','learn',10,true,'published')
    on conflict (id) do update set
      knowledge_id=excluded.knowledge_id,course_id=excluded.course_id,scope=excluded.scope,title=excluded.title,
      description=excluded.description,mode=excluded.mode,estimated_minutes=excluded.estimated_minutes,
      required=excluded.required,status=excluded.status,updated_at=now();

    insert into public.micro_units (id,path_id,title,description,position,estimated_minutes,required)
    values
      ('golden-micro-AG01-unit-1','golden-micro-AG01','概念与角色','先建立清晰的组成与边界。',0,5,true),
      ('golden-micro-AG01-unit-2','golden-micro-AG01','执行与验证','通过互动完成结构化判断。',1,5,true),
      ('golden-micro-H02-unit-1','golden-micro-H02','概念与角色','先建立清晰的组成与边界。',0,5,true),
      ('golden-micro-H02-unit-2','golden-micro-H02','执行与验证','通过互动完成结构化判断。',1,7,true),
      ('golden-micro-RT14-unit-1','golden-micro-RT14','定位失败点','从执行轨迹找到真正根因。',0,4,true),
      ('golden-micro-RT14-unit-2','golden-micro-RT14','设计恢复链路','把恢复原则落实成可检查的结构。',1,6,true)
    on conflict (id) do update set
      path_id=excluded.path_id,title=excluded.title,description=excluded.description,position=excluded.position,
      estimated_minutes=excluded.estimated_minutes,required=excluded.required,updated_at=now();

    -- Vacate old positions before moving stable Step IDs between Units.
    update public.micro_steps set position=position+100,updated_at=now()
    where id in ('golden-micro-AG01-s1','golden-micro-AG01-s2','golden-micro-H02-s1','golden-micro-H02-s2','golden-micro-RT14-s1','golden-micro-RT14-s2');

    insert into public.micro_steps (id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback)
    values
      ('golden-micro-H02-s1','golden-micro-H02-unit-1',0,'explanation','Workflow 是可检查的执行结构','Workflow 用 Step 表示工作，用 Transition 表示流转；State 保存跨步骤信息。边界清晰，才可能可靠重试。',null,null,null),
      ('golden-micro-H02-s2','golden-micro-H02-unit-1',1,'interaction','识别 Workflow 的三种角色','选出直接描述 Workflow 结构的全部概念。','{"type":"multiple-choice","options":["Step：一次明确工作","Transition：步骤间的流转","State：执行中需要保留的信息","Theme：界面配色"],"correctIndexes":[0,1,2]}'::jsonb,'正确：Step、Transition 与 State 共同定义可检查的执行结构。','检查是否把界面表现误当成执行结构，或漏掉跨步骤状态。'),
      ('golden-micro-H02-s3','golden-micro-H02-unit-1',2,'interaction','把组件放到正确角色','完成 H5P 拖放：区分负责推理、外部动作与跨步骤记忆的组件。','{"type":"h5p","contentRef":"golden-h5p-workflow-drag-drop","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb,'角色定位正确，可以进入执行链路。','继续调整；仅打开互动不会完成本步骤。'),
      ('golden-micro-H02-s4','golden-micro-H02-unit-2',0,'interaction','重排一次 Tool 调用','拖动卡片，组成从输入到响应的可靠执行顺序。','{"type":"ordering","items":["User Input","LLM 选择动作","Tool 执行","LLM 读取结果","Response"],"correctOrder":["User Input","LLM 选择动作","Tool 执行","LLM 读取结果","Response"]}'::jsonb,'顺序正确：Tool 结果会回到 Model，再形成最终响应。','这里的关键是：Model 必须先决定动作，也必须读取 Tool 结果后才能响应。'),
      ('golden-micro-H02-s5','golden-micro-H02-unit-2',1,'interaction','定位执行轨迹的根因','一次请求在 Tool 尚未返回时就生成了最终响应。请选择真正的根因步骤。','{"type":"trace","steps":[{"id":"receive","label":"1 · 收到 User Input"},{"id":"decide","label":"2 · LLM 选择 Tool"},{"id":"skip-result","label":"3 · 未等待 Tool Result 就继续"},{"id":"respond","label":"4 · 输出不完整 Response"}],"correctStepId":"skip-result"}'::jsonb,'定位正确：第 3 步破坏了数据依赖。','这里不是根因。寻找最早破坏执行依赖的步骤。'),
      ('golden-micro-H02-s6','golden-micro-H02-unit-2',2,'interaction','搭建最小 Agent Workflow','拖动节点形成连接。需要时用键盘移动按钮完成同样操作。','{"type":"mini-workflow","nodes":["START","LLM","TOOL","LLM RESULT","END"],"correctOrder":["START","LLM","TOOL","LLM RESULT","END"]}'::jsonb,'结构正确：推理、动作、结果读取与结束边界完整。','检查连接是否从 START 出发，并让 Tool 结果回到 LLM 后再 END。'),
      ('golden-micro-H02-s7','golden-micro-H02-unit-2',3,'summary','Workflow 检查清单','先固定输入输出，再明确 Step、Transition 与 State；任何外部动作都要把结果送回决策步骤。',null,null,null),
      ('golden-micro-AG01-s1','golden-micro-AG01-unit-1',0,'explanation','Agent 不只是一次模型调用','Agent 围绕目标循环执行：Model 判断，Tool 影响外部世界，State 保存上下文，验证决定继续或停止。',null,null,null),
      ('golden-micro-AG01-s-fill','golden-micro-AG01-unit-1',1,'interaction','写出保存上下文的组件','填写 Agent 行动循环中负责保存跨步骤上下文的组件名称。','{"type":"fill-blank","answers":["State","状态"],"caseSensitive":false}'::jsonb,'正确：State 让后续步骤可以读取已经发生的观察与动作。','请填写负责保存上下文的组件英文名或中文名。'),
      ('golden-micro-AG01-s2','golden-micro-AG01-unit-1',2,'interaction','区分 Agent 组件','哪些陈述正确？','{"type":"multiple-choice","options":["Model 负责生成判断或动作建议","Tool 负责执行受控外部动作","State 保存循环所需上下文","Agent 等同于一段固定 Prompt"],"correctIndexes":[0,1,2]}'::jsonb,'正确：Agent 是 Model、Tool、State 与控制循环的组合。','Agent 不是固定 Prompt；检查是否漏选了支撑行动循环的组件。'),
      ('golden-micro-AG01-s3','golden-micro-AG01-unit-1',3,'interaction','补全行动循环','在 H5P 中补全 Agent 从观察到行动再验证的关键词。','{"type":"h5p","contentRef":"golden-h5p-agent-fill-blanks","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb,'行动循环补全正确。','继续填写并通过检查；完成事件和通过结果缺一不可。'),
      ('golden-micro-AG01-s4','golden-micro-AG01-unit-2',0,'interaction','把 Agent 组件归位','将 Model、Tool 与 State 放入对应职责。','{"type":"h5p","contentRef":"golden-h5p-agent-drag-words","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb,'组件职责匹配正确。','检查谁负责判断、谁执行动作、谁保存上下文。'),
      ('golden-micro-AG01-s5','golden-micro-AG01-unit-2',1,'interaction','搭建一次可验证行动','形成最小 Agent 行动链路。','{"type":"mini-workflow","nodes":["GOAL","MODEL","TOOL","VERIFY","END"],"correctOrder":["GOAL","MODEL","TOOL","VERIFY","END"]}'::jsonb,'正确：执行之后必须验证，再决定结束。','检查是否跳过目标、执行结果验证或结束边界。'),
      ('golden-micro-AG01-s6','golden-micro-AG01-unit-2',2,'summary','Agent 的最小判断框架','目标决定边界，Model 提议动作，Tool 执行动作，State 保留上下文，Verifier 决定循环是否结束。',null,null,null),
      ('golden-micro-RT14-s1','golden-micro-RT14-unit-1',0,'explanation','恢复先保留证据','失败恢复不是立即重跑。先定位失败点并保留可复核状态，再选择 retry、fallback 或终止。',null,null,null),
      ('golden-micro-RT14-s2','golden-micro-RT14-unit-1',1,'interaction','定位恢复链路的根因','观察执行轨迹，选择最早让验证失效的步骤。','{"type":"trace","steps":[{"id":"candidate","label":"1 · Candidate emitted"},{"id":"cancel","label":"2 · Cancel remaining workers"},{"id":"verify","label":"3 · Verifier cannot inspect evidence"},{"id":"fail","label":"4 · Recovery marked failed"}],"correctStepId":"cancel"}'::jsonb,'定位正确：验证前取消使证据链断裂。','这里不是根因。找最早导致后续验证无法发生的步骤。'),
      ('golden-micro-RT14-s3','golden-micro-RT14-unit-1',2,'interaction','选择合适的恢复动作','哪些策略符合可靠恢复？','{"type":"multiple-choice","options":["瞬时网络错误可做有界 retry","主服务不可用可切换已验证 fallback","输入永久无效时应终止并报告","所有错误都无限重试"],"correctIndexes":[0,1,2]}'::jsonb,'正确：恢复动作取决于错误是否短暂、是否有安全替代以及是否可修复。','无限重试会放大故障；同时检查是否漏选 retry、fallback 或明确终止。'),
      ('golden-micro-RT14-s4','golden-micro-RT14-unit-2',0,'interaction','完成恢复综合检查','在 H5P Question Set 中判断失败类型、恢复动作和验证边界。','{"type":"h5p","contentRef":"golden-h5p-recovery-question-set","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb,'综合检查通过。','完成所有问题并达到通过条件后，本步骤才会保存。'),
      ('golden-micro-RT14-s5','golden-micro-RT14-unit-2',1,'interaction','排列恢复顺序','拖动卡片，形成不会丢失证据的恢复链路。','{"type":"ordering","items":["Capture failure state","Classify failure","Choose retry or fallback","Execute recovery","Verify outcome"],"correctOrder":["Capture failure state","Classify failure","Choose retry or fallback","Execute recovery","Verify outcome"]}'::jsonb,'顺序正确：恢复以证据开始，以验证结束。','先保存失败状态，再分类和执行；恢复动作之后仍需验证。'),
      ('golden-micro-RT14-s6','golden-micro-RT14-unit-2',2,'summary','Failure Recovery 决策','保留证据 → 分类失败 → 选择有界 retry、已验证 fallback 或终止 → 验证恢复结果。',null,null,null)
    on conflict (id) do update set
      unit_id=excluded.unit_id,position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,
      interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback,updated_at=now();
  end if;
end $$;
