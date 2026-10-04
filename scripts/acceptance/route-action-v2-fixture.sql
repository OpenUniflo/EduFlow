-- Explicit, private Acceptance course. Copies teaching content only, never learner state.
-- Existing Knowledge identities/edges remain unchanged. Keep resulting executions as evidence.
begin;
do $$
declare owner_id uuid; c constant text := 'acceptance-route-action-v2'; p constant text := 'acceptance-route-action-v2-ctx01'; a uuid;
begin
  select id into strict owner_id from auth.users where email='2967618185@qq.com';
  if exists(select 1 from courses where id=c) then raise exception 'Acceptance fixture already exists; inspect before reuse'; end if;
  insert into courses(id,title,description,revision,course_type,owner_user_id,lifecycle,target_outcome)
    values(c,'Acceptance · 路线行动统一验收','私有验收课程。引用真实 A02 → CTX01 关系，验证 Micro / Assignment 执行，不代表真实企业项目。','acceptance-v2-1','personal',owner_id,'published','能够还原模型实际收到的消息上下文，并定位漏传消息的环节。');
  insert into course_curricula(course_id,id,generation_mode) values(c,'acceptance-curriculum','manual');
  insert into curriculum_chapters(course_id,id,title,description,display_order,color,outcome) values(c,'context','消息上下文','真实消息进入模型的路径',1,'#3b82f6','定位上下文漏传');
  insert into curriculum_lessons(course_id,id,chapter_id,title,display_order) values(c,'context-lesson','context','还原消息上下文',1);
  insert into curriculum_coverages(course_id,id,lesson_id,node_id,role,display_order) values(c,'context-coverage','context-lesson','CTX01','introduce',1);
  insert into course_target_knowledge(course_id,knowledge_id) values(c,'CTX01');
  insert into course_assignments(course_id,id,display_order,title,description,requirements,expected_output,acceptance_criteria,mode,estimated_minutes,experience)
    values(c,'context-trace',1,'定位消息上下文遗漏','观察可重复的模拟轨迹，定位第一处遗漏 system 指令的环节。','["逐项检查消息组装与实际调用","选择第一处偏离要求的环节"]','定位结果及解释','["识别消息组装处漏传 system 指令"]','instruction',5,
      '{"type":"trace","knowledgeNodeId":"CTX01","faultyStepId":"assemble","traceSteps":[{"id":"request","label":"收到用户请求，并准备 system 约束：只引用给定资料"},{"id":"assemble","label":"组装 messages 时仅放入 user 消息，遗漏 system 约束"},{"id":"invoke","label":"将组装后的 messages 发送给模型"},{"id":"result","label":"模型未看到资料边界约束，回复超出给定资料"}]}');
  insert into assignment_coverages(course_id,id,assignment_id,node_id,role) values(c,'context-practice','context-trace','CTX01','practice');
  insert into micro_learning_paths select (jsonb_populate_record(null::micro_learning_paths,to_jsonb(x)||jsonb_build_object('id',p,'course_id',c,'title','Acceptance · '||x.title,'created_at',now(),'updated_at',now()))).* from micro_learning_paths x where id='aiad-ctx01-message-context';
  insert into micro_units select (jsonb_populate_record(null::micro_units,to_jsonb(x)||jsonb_build_object('id','acceptance-v2-'||x.id,'path_id',p,'created_at',now(),'updated_at',now()))).* from micro_units x where path_id='aiad-ctx01-message-context';
  insert into micro_steps select (jsonb_populate_record(null::micro_steps,to_jsonb(s)||jsonb_build_object('id','acceptance-v2-'||s.id,'unit_id','acceptance-v2-'||s.unit_id,'created_at',now(),'updated_at',now()))).* from micro_steps s join micro_units u on u.id=s.unit_id where u.path_id='aiad-ctx01-message-context';
  insert into knowledge_edge_actions(edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence,provenance)
    values('book-gold-v1-prerequisite-a02-ctx01','micro_learning','Acceptance · 理解消息上下文','使用明确绑定的七步教学内容理解模型可见上下文。',10,2,'本次 Micro 执行观察；正式能力仍以既有证据判定为准。',jsonb_build_object('kind','acceptance','courseId',c)) returning id into a;
  insert into course_action_bindings(course_id,action_id,micro_path_id,context,instructions,available) values(c,a,p,'私有验收资料','完成绑定的消息上下文教学内容。',true);
  insert into knowledge_edge_actions(edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence,provenance)
    values('book-gold-v1-prerequisite-a02-ctx01','practice_task','Acceptance · 定位上下文遗漏','复用 Assignment 轨迹定位与评价。',5,1,'本次 Assignment Attempt 与 Performance Result。',jsonb_build_object('kind','acceptance','courseId',c)) returning id into a;
  insert into course_action_bindings(course_id,action_id,assignment_id,context,instructions,available) values(c,a,'context-trace','可重复模拟轨迹','定位第一处遗漏消息的环节。',true);
end $$;
commit;
