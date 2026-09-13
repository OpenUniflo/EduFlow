-- Operationalize existing authored criteria against actual published Lesson 1 checks.
-- No learner state or historical performance is backfilled. Optional Course input:
-- a deployment without these definitions inserts nothing, never fabricated assets.
insert into public.mastery_criteria(id,version,knowledge_id,knowledge_revision_id,title,description,cognitive_level,criterion_type,required,display_order)
select v.id,1,n.id,n.current_revision_id,v.title,v.description,'understand','conceptual',false,0
from (values
  ('criterion-agent-component-roles','A02','区分 Agent 的组成角色','在已有任务情境中区分模型、上下文、工具、状态与运行时的职责；落实现有 Knowledge 文字标准的角色识别部分。'),
  ('criterion-agent-action-space','AGC01','识别任务所需的动作接口','判断已观察到航班的 Agent 是否拥有实际提交预订的动作接口；落实现有动作空间标准。'),
  ('criterion-react-termination','R10','区分停止查询与任务成功','依据观察与授权边界判断循环停止后的合法结论；落实可终止 ReAct 循环标准。')
) v(id,knowledge_id,title,description) join public.knowledge_nodes n on n.id=v.knowledge_id and n.status='active'
where exists(select 1 from public.micro_learning_paths p where p.knowledge_id=n.id and p.course_id='ai-agents-in-depth' and p.status='published')
on conflict do nothing;

insert into public.micro_step_criteria(step_id,criterion_id,criterion_version,purpose)
select s.id,v.criterion_id,1,v.purpose
from (values
  ('aiad-l1-a02-s3','criterion-agent-component-roles','instruction'),
  ('aiad-l1-a02-s4','criterion-agent-component-roles','instruction'),
  ('aiad-l1-a02-s4-bridge','criterion-agent-component-roles','evidence'),
  ('aiad-l1-agc01-s3','criterion-agent-action-space','instruction'),
  ('aiad-l1-agc01-s4','criterion-agent-action-space','evidence'),
  ('aiad-l1-r10-s2','criterion-react-termination','instruction'),
  ('aiad-l1-r10-s4','criterion-react-termination','evidence')
) v(step_id,criterion_id,purpose)
join public.micro_steps s on s.id=v.step_id
join public.mastery_criteria c on c.id=v.criterion_id and c.version=1
on conflict do nothing;
