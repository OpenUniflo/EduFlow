-- Local-only rollback verification. These records are labelled acceptance fixtures.
begin;
do $$
declare learner uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); source uuid:=gen_random_uuid(); other_source uuid:=gen_random_uuid(); first record; repeated record; pending record; legacy record; failed boolean:=false;
begin
 insert into auth.users(id,email) values(learner,'acceptance-conversation-local-learner@eduflow.test'),(reviewer,'acceptance-conversation-local-reviewer@eduflow.test');
 insert into profiles(id,role,display_name) values(reviewer,'admin','Acceptance local conversation reviewer') on conflict(id) do update set role='admin';
 insert into user_course_states(user_id,course_id) values(learner,'agentic-ai-golden');
 if has_function_privilege('authenticated','record_conversation_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text)','execute') or has_function_privilege('anon','record_conversation_action_assignment_attempt(uuid,uuid,text,jsonb,text,numeric,jsonb,text)','execute') then raise exception 'Client RPC privilege leak';end if;
 if not has_function_privilege('service_role','record_conversation_assignment_attempt(uuid,text,text,text,jsonb,text,numeric,jsonb,text)','execute') then raise exception 'Missing server privilege';end if;
 update assignment_coverages set required=true where course_id='agentic-ai-golden' and node_id='P01' and assignment_id='golden-knowledge-assignment-P01';
 insert into micro_learning_paths(id,knowledge_id,course_id,scope,mode,title,estimated_minutes,required,status) values('acceptance-conversation-local-path','P01','agentic-ai-golden','course','learn','Acceptance local authority only',1,true,'published');
 insert into user_micro_path_progress(user_id,path_id,status,completed_at) select learner,id,'completed',now() from micro_learning_paths where knowledge_id='P01' and required and status='published' and (course_id='agentic-ai-golden' or course_id is null);
 insert into user_evidence_sources(id,user_id,title,storage_path,content_type,byte_size,parse_status,source_sha256) values(source,learner,'Acceptance local original.txt',learner||'/'||source,'text/plain',10,'ready','local-fixture-sha'),(other_source,reviewer,'Acceptance local other.txt',reviewer||'/'||other_source,'text/plain',10,'ready','local-fixture-sha');
 execute 'set local role service_role';
 select * into first from record_conversation_assignment_attempt(learner,'agentic-ai-golden','golden-knowledge-assignment-P01','acceptance-first',jsonb_build_object('kind','answer','text','本人计算与依据','attachmentSourceIds',jsonb_build_array(source),'submissionMode','conversation'),'passed',1,'{}','rule');
 if first.duplicate or exists(select 1 from user_knowledge_states where user_id=learner) then raise exception 'Conversation completion granted capability';end if;
 if recompute_knowledge_mastery(learner,'P01','agentic-ai-golden') then raise exception 'Conversation completion leaked through recompute';end if;
 update user_evidence_sources set archived_at=now() where id=source;
 select * into repeated from record_conversation_assignment_attempt(learner,'agentic-ai-golden','golden-knowledge-assignment-P01','acceptance-first',jsonb_build_object('kind','answer','text','本人计算与依据','attachmentSourceIds',jsonb_build_array(source),'submissionMode','conversation'),'passed',1,'{}','rule');
 if not repeated.duplicate or repeated.attempt_id<>first.attempt_id then raise exception 'Saved retry lost identity after archival';end if;
 begin perform record_conversation_assignment_attempt(learner,'agentic-ai-golden','golden-knowledge-assignment-P01','acceptance-other-source',jsonb_build_object('kind','answer','text','本人工作','attachmentSourceIds',jsonb_build_array(other_source),'submissionMode','conversation'),'passed',1,'{}','rule');exception when check_violation then failed:=true;end;
 if not failed then raise exception 'Other owner source was accepted';end if;
 select * into pending from record_conversation_assignment_attempt(learner,'agentic-ai-golden','golden-knowledge-assignment-P01','acceptance-pending',jsonb_build_object('kind','answer','text','本人工作待评审','submissionMode','conversation'),'pending',null,'{}','manual');
 perform record_manual_assignment_review(learner,'agentic-ai-golden','golden-knowledge-assignment-P01',reviewer,pending.attempt_id);
 if exists(select 1 from user_knowledge_states where user_id=learner) then raise exception 'Manual conversation review granted capability';end if;
 if (select count(*) from learning_attempts where user_id=learner)<>2 or (select count(*) from performance_results where user_id=learner)<>3 then raise exception 'Attempt or immutable result history lost';end if;
 select * into legacy from record_assignment_attempt(learner,'agentic-ai-golden','golden-knowledge-assignment-P01','acceptance-legacy',jsonb_build_object('kind','answer','text','Labelled legacy acceptance fixture'),'passed',1,'{}','rule');
 if not recompute_knowledge_mastery(learner,'P01','agentic-ai-golden') then raise exception 'Conversation permanently blocked legacy mastery';end if;
 if exists(select 1 from personal_course_route_versions where user_id=learner) then raise exception 'Completion created Route Version';end if;
 raise notice 'PASS: service-only RPC, owned files, no automatic mastery, exact retry, immutable history, manual isolation, legacy compatibility, no Route write';
end$$;
rollback;
