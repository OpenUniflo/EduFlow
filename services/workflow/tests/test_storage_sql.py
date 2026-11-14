"""Local Postgres transaction tests: no resets, committed fixtures or restarts."""
import json
import os
import subprocess
import uuid
import pytest
from test_contracts import sample
from eduflow_workflow.contracts import digest

pytestmark=pytest.mark.skipif(os.environ.get("WORKFLOW_TEST_LOCAL_DB")!="1",reason="Explicit Local DB integration opt-in required")

def run_sql(sql):
    result=subprocess.run(["docker","exec","-i",os.environ.get("WORKFLOW_LOCAL_DB_CONTAINER","supabase_db_EduFlow"),"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],input=sql,text=True,capture_output=True)
    assert result.returncode==0,result.stderr

def test_delete_removes_only_target_threads_official_checkpoints_with_server_permissions():
    owner,other,thread,protected=[str(uuid.uuid4()) for _ in range(4)]
    workflow='sql-delete-'+str(uuid.uuid4())
    definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    quoted=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values
      ('{owner}','authenticated','authenticated','{owner}@integration.invalid'),
      ('{other}','authenticated','authenticated','{other}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{quoted(definition)},{quoted(editor)},'hash',null);
    select public.workflow_v2_save('{other}','{workflow}',null,null,{quoted(definition)},{quoted(editor)},'hash',null);
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status) values
      ('{thread}','{owner}','{workflow}',1,'{{}}','waiting'),('{protected}','{other}','{workflow}',1,'{{}}','closed');
    insert into workflow_checkpoints.checkpoints(thread_id,checkpoint_id,checkpoint) values ('{thread}','cp','{{}}'),('{protected}','cp','{{}}');
    insert into workflow_checkpoints.checkpoint_blobs(thread_id,channel,version,type,blob) values ('{thread}','channel','1','json',null),('{protected}','channel','1','json',null);
    insert into workflow_checkpoints.checkpoint_writes(thread_id,checkpoint_id,task_id,idx,channel,type,blob) values ('{thread}','cp','task',0,'channel','json','\\x00'),('{protected}','cp','task',0,'channel','json','\\x00');
    set local role service_role;
    do $$ begin
      begin perform public.workflow_v2_delete('{owner}','{workflow}',1);raise exception 'FAILED busy deletion';
      exception when others then if sqlerrm not like '%WORKFLOW_BUSY%' then raise;end if;end;
    end $$;
    reset role;
    update public.workflow_execution_threads set status='closed' where thread_id='{thread}';
    set local role service_role;
    select public.workflow_v2_delete('{owner}','{workflow}',1);
    reset role;
    do $$ declare name text; n integer; begin
      foreach name in array array['checkpoints','checkpoint_blobs','checkpoint_writes'] loop
        execute format('select count(*) from workflow_checkpoints.%I where thread_id=$1',name) into n using '{thread}';
        if n<>0 then raise exception 'FAILED target checkpoint cleanup';end if;
        execute format('select count(*) from workflow_checkpoints.%I where thread_id=$1',name) into n using '{protected}';
        if n<>1 then raise exception 'FAILED cross-owner checkpoint deletion';end if;
      end loop;
      if exists(select from public.workflow_execution_threads where thread_id='{thread}') then raise exception 'FAILED Thread cascade';end if;
      if not exists(select from public.workflow_v2_definitions where owner_user_id='{other}' and workflow_id='{workflow}') then raise exception 'FAILED protected definition';end if;
      if has_function_privilege('authenticated','public.workflow_v2_delete(uuid,text,integer)','execute') or has_table_privilege('authenticated','workflow_checkpoints.checkpoints','select') then raise exception 'FAILED browser authority';end if;
    end $$;
    rollback;
    """)

def test_atomic_revisions_fencing_and_completion():
    owner=str(uuid.uuid4());run_id=str(uuid.uuid4());step=str(uuid.uuid4());workflow="sql-check-"+str(uuid.uuid4())
    definition=sample();definition["workflowId"]=workflow
    editor={"schemaVersion":1,"workflowId":workflow,"definitionRevision":1,"editorRevision":1,"nodes":{},"edges":{}}
    quoted=lambda v: "'"+json.dumps(v).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{quoted(definition)},{quoted(editor)},'{digest(definition)}',null);
    do $$ begin
      begin perform public.workflow_v2_save('{owner}','{workflow}',0,0,{quoted(definition)},{quoted(editor)},'wrong',null);raise exception 'FAILED stale save';
      exception when others then if sqlerrm not like '%REVISION_CONFLICT%' then raise;end if;end;
    end $$;
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot)
    values('{run_id}','{owner}','{workflow}',1,'running','definition','semantic','compile','env','rev','{{}}','{{}}');
    insert into public.workflow_run_jobs(run_id,queue_msg_id,fencing_token,worker_id,lease_until) values('{run_id}',pgmq.send('workflow_v2','{{}}'),7,'test',now()+interval '30 seconds');
    select workflow_private.initialize('{run_id}',7,'{{"value":0}}');
    select workflow_private.step_start('{run_id}',7,'{step}','node',1,'{{}}',0);
    do $$ begin
      if not workflow_private.step_complete('{run_id}',7,'{step}','{{"value":1}}','{{"value":1}}','{{"value":1}}',0,null) then raise exception 'FAILED first completion';end if;
      if workflow_private.step_complete('{run_id}',7,'{step}','{{"value":2}}','{{"value":2}}','{{"value":2}}',0,null) then raise exception 'FAILED duplicate completion';end if;
      begin perform workflow_private.step_complete('{run_id}',6,'{step}','{{}}','{{}}','{{}}',0,null);raise exception 'FAILED old fencing';
      exception when others then if sqlerrm not like '%LEASE_LOST%' then raise;end if;end;
    end $$;
    do $$ begin
      if (select state_version from public.workflow_live_runs where run_id='{run_id}')<>1 then raise exception 'FAILED duplicate state update';end if;
      if (select count(*) from public.workflow_run_events where run_id='{run_id}' and type='step.completed')<>1 then raise exception 'FAILED duplicate event';end if;
    end $$;
    select public.workflow_v2_cancel('{owner}','{run_id}');
    select workflow_private.finish('{run_id}',7,'success','{{"value":1}}',null);
    do $$ begin if (select status from public.workflow_live_runs where run_id='{run_id}')<>'cancelled' then raise exception 'FAILED cancellation race';end if;end $$;
    rollback;
    """)

def test_runtime_authority_not_browser_callable():
    run_sql("""
    begin;
    do $$ declare t text; begin
      if has_function_privilege('authenticated','public.workflow_v2_enqueue(uuid,text,integer,jsonb,text,text,jsonb,text,text,text,text,jsonb,uuid)','execute') then raise exception 'FAILED browser enqueue authority';end if;
      if has_function_privilege('anon','workflow_private.claim(text)','execute') then raise exception 'FAILED anonymous claim authority';end if;
      if has_function_privilege('workflow_worker','public.workflow_v2_save(uuid,text,integer,integer,jsonb,jsonb,text,jsonb,text)','execute') then raise exception 'FAILED worker authoring authority';end if;
      foreach t in array array['workflow_live_runs','workflow_run_steps','workflow_run_events'] loop
        if has_table_privilege('authenticated','public.'||t,'insert') or has_table_privilege('anon','public.'||t,'select') then raise exception 'FAILED browser raw run authority';end if;
      end loop;
    end $$;
    rollback;
    """)

def test_queue_and_idempotency_are_transactional_and_quotas_atomic():
    owner=str(uuid.uuid4());workflow="sql-quota-"+str(uuid.uuid4());definition=sample();definition["workflowId"]=workflow
    editor={"schemaVersion":1,"workflowId":workflow,"definitionRevision":1,"editorRevision":1,"nodes":{},"edges":{}}
    quoted=lambda v: "'"+json.dumps(v).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{quoted(definition)},{quoted(editor)},'definition',null);
    do $$ declare first jsonb; repeated jsonb; n integer; begin
      first:=public.workflow_v2_enqueue('{owner}','{workflow}',1,'{{}}','env','1','{{}}','semantic','compile','request','key',null);
      repeated:=public.workflow_v2_enqueue('{owner}','{workflow}',1,'{{}}','changed-env','2','{{}}','semantic2','compile2','request','key',null);
      if first->>'runId'<>repeated->>'runId' then raise exception 'FAILED duplicate queue';end if;
      begin perform public.workflow_v2_enqueue('{owner}','{workflow}',1,'{{"other":1}}','env','1','{{}}','semantic','compile','different-request','key',null);raise exception 'FAILED duplicate key conflict';
      exception when others then if sqlerrm not like '%IDEMPOTENCY_CONFLICT%' then raise;end if;end;
      for n in 2..5 loop perform public.workflow_v2_enqueue('{owner}','{workflow}',1,'{{}}','env','1','{{}}','semantic','compile',n::text,'key-'||n::text,null);end loop;
      begin perform public.workflow_v2_enqueue('{owner}','{workflow}',1,'{{}}','env','1','{{}}','semantic','compile','6','key-6',null);raise exception 'FAILED queue quota';
      exception when others then if sqlerrm not like '%RUN_QUOTA_EXCEEDED%' then raise;end if;end;
      if (select count(*) from public.workflow_live_runs where owner_user_id='{owner}')<>5 then raise exception 'FAILED queue count';end if;
      if (select count(*) from public.workflow_run_jobs j join public.workflow_live_runs r using(run_id) where r.owner_user_id='{owner}')<>5 then raise exception 'FAILED orphan jobs';end if;
    end $$;
    rollback;
    """)

def test_unified_workspace_has_no_legacy_storage_or_migration_rpc():
    # Unified-workspace migration retired these protocols. Do not restore them
    # merely to satisfy an obsolete migration acceptance scenario.
    run_sql("""
    begin;
    do $$ begin
      if exists (
        select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in
          ('workflow_v2_preview_migration','workflow_v2_apply_migration','workflow_v2_read_migration_source')
      ) then raise exception 'FAILED retired migration RPC still exists'; end if;
      if to_regclass('public.workflow_migration_reports') is not null
        or to_regclass('public.workflow_runs') is not null
        or to_regclass('public.user_workflow_definitions') is not null
        or to_regclass('public.user_workflow_state') is not null
      then raise exception 'FAILED legacy workflow storage still exists'; end if;
      if to_regclass('public.workflow_live_runs') is null
        or to_regclass('public.workflow_revisions') is null
      then raise exception 'FAILED unified execution storage missing'; end if;
    end $$;
    rollback;
    """)


def test_native_task_identity_is_atomic_fenced_and_worker_only():
    owner, run_id, step = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    workflow = 'sql-native-task-' + str(uuid.uuid4())
    definition = sample(); definition['workflowId'] = workflow
    editor = {'schemaVersion': 1, 'workflowId': workflow, 'definitionRevision': 1,
              'editorRevision': 1, 'nodes': {}, 'edges': {}}
    quoted = lambda value: "'" + json.dumps(value).replace("'", "''") + "'::jsonb"
    identity = {'taskId': 'native-task', 'namespace': '', 'checkpointId': 'native-checkpoint', 'attempt': 1}
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{quoted(definition)},{quoted(editor)},'hash',null);
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot)
    values('{run_id}','{owner}','{workflow}',1,'running','definition','semantic','compile','env','rev','{{}}','{{}}');
    insert into public.workflow_run_jobs(run_id,queue_msg_id,fencing_token,worker_id,lease_until)
    values('{run_id}',pgmq.send('workflow_v2','{{}}'),7,'test',now()+interval '30 seconds');
    do $$ begin
      if has_function_privilege('anon','workflow_private.step_start(uuid,bigint,uuid,text,integer,jsonb,integer,jsonb)','EXECUTE')
        or has_function_privilege('authenticated','workflow_private.step_start(uuid,bigint,uuid,text,integer,jsonb,integer,jsonb)','EXECUTE')
      then raise exception 'FAILED public task write'; end if;
      begin perform workflow_private.step_start('{run_id}',6,'{step}','node',1,'{{}}',0,{quoted(identity)});
        raise exception 'FAILED stale fence';
      exception when others then if sqlerrm not like '%LEASE_LOST%' then raise; end if; end;
      if exists(select from public.workflow_run_steps where run_id='{run_id}') then raise exception 'FAILED partial identity write'; end if;
    end $$;
    select workflow_private.step_start('{run_id}',7,'{step}','node',1,'{{}}',0,{quoted(identity)});
    do $$ begin
      if not has_function_privilege('workflow_worker','workflow_private.step_start(uuid,bigint,uuid,text,integer,jsonb,integer,jsonb)','EXECUTE') then raise exception 'FAILED missing worker grant'; end if;
      if (select execution_identity from public.workflow_run_steps where run_id='{run_id}' and step_id='{step}') is distinct from {quoted(identity)} then raise exception 'FAILED task identity'; end if;
    end $$;
    rollback;
    """)


def test_wait_expiry_is_policy_termination_without_new_external_effect():
    owner, run_id, thread = [str(uuid.uuid4()) for _ in range(3)]
    workflow='sql-expiry-'+str(uuid.uuid4())
    definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    quoted=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{quoted(definition)},{quoted(editor)},'hash',null);
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,wait_expires_at)
      values('{thread}','{owner}','{workflow}',1,'{{}}','waiting',now()-interval '1 second');
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,thread_id)
      values('{run_id}','{owner}','{workflow}',1,'waiting','hash','hash','hash','env','1','{{}}','{{}}','{thread}');
    update public.workflow_execution_threads set current_run_id='{run_id}' where thread_id='{thread}';
    select workflow_private.watchdog();
    do $$ declare err jsonb; begin
      select error into err from public.workflow_live_runs where run_id='{run_id}';
      if err->>'code'<>'WAIT_EXPIRED' or err->>'category'<>'policy' or err->>'effect'<>'none' then raise exception 'FAILED expiry classification';end if;
      if (select status from public.workflow_execution_threads where thread_id='{thread}')<>'expired' then raise exception 'FAILED expiry lifecycle';end if;
    end $$;
    rollback;
    """)

def test_p5_next_and_branch_preserve_trusted_launch_identity_without_fabricating_standalone_context():
    owner,thread,branch,plain,plainbranch=[str(uuid.uuid4()) for _ in range(5)]
    workflow='p5-context-'+str(uuid.uuid4());definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    context={'courseId':'trusted-course','assignmentId':'trusted-assignment','workflowTemplateId':'trusted-template'}
    snapshot={'definition_hash':'h','semantic_hash':'s','compile_fingerprint':'f','environment_ref':'test','environment_revision':'1','registry_snapshot':{},'input':{}}
    run_sql(f"""
      begin;
      insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
      select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
      insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,checkpoint_id,launch_context,last_run_succeeded)
      values('{thread}','{owner}','{workflow}',1,{q(snapshot)},'closed','cp',{q(context)},true),
      ('{plain}','{owner}','{workflow}',1,{q(snapshot)},'closed','cp',null,true);
      select workflow_private.p5_branch('{owner}','{thread}','{branch}','cp','{{}}');
      select workflow_private.p5_branch('{owner}','{plain}','{plainbranch}','cp','{{}}');
      select workflow_private.p5_start('{owner}','{branch}','cp','{{}}','branch','branch-key','h');
      select workflow_private.p5_start('{owner}','{thread}','cp','{{}}','next','next-key','h');
      select workflow_private.p5_start('{owner}','{plainbranch}','cp','{{}}','branch','plain-key','h');
      reset role;
      do $$ begin
       if (select count(*) from public.workflow_live_runs where owner_user_id='{owner}' and launch_context={q(context)})<>2 then raise exception 'lost trusted launch provenance';end if;
       if (select launch_context from public.workflow_execution_threads where thread_id='{branch}') is distinct from {q(context)} then raise exception 'lost branch provenance';end if;
       if exists(select from public.workflow_live_runs where thread_id='{plainbranch}' and launch_context is not null) then raise exception 'fabricated independent provenance';end if;
      end $$;
      rollback;
    """)

def test_p5_missing_child_commit_never_falls_back_and_later_missing_child_does_not_block_older_history():
    owner,other,thread=[str(uuid.uuid4()) for _ in range(3)];workflow='p5-integrity-'+str(uuid.uuid4())
    definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
      begin;
      insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
      select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
      insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status) values('{thread}','{owner}','{workflow}',1,'{{}}','closed');
      insert into workflow_private.scope_commits values('{thread}','child','001',null,'first'),('{thread}','child','002','001','second');
      insert into workflow_checkpoints.checkpoints(thread_id,checkpoint_ns,checkpoint_id,checkpoint) values('{thread}','child','001','{{}}');
      do $$ begin
       if workflow_private.p5_scope_head('{owner}','{thread}','child','root','002')<>'001' then raise exception 'older valid history was blocked';end if;
       begin perform workflow_private.p5_scope_head('{owner}','{thread}','child','root',null);raise exception 'silently fell back';
       exception when others then if sqlerrm<>'CHECKPOINT_MISSING' then raise;end if;end;
       begin perform workflow_private.p5_scope_head('{other}','{thread}','child','root','002');raise exception 'owner bypass';
       exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
       if has_function_privilege('authenticated','workflow_private.p5_scope_head(uuid,uuid,text,text,text)','execute') then raise exception 'browser may access private commit identities';end if;
       if not has_function_privilege('workflow_worker','workflow_private.p5_scope_head(uuid,uuid,text,text,text)','execute') then raise exception 'worker cannot verify child identity';end if;
      end $$;
      insert into workflow_checkpoints.checkpoints(thread_id,checkpoint_ns,checkpoint_id,checkpoint) values('{thread}','child','002','{{}}');
      insert into workflow_private.p5_scope_history values('{thread}','root','','root'),('{thread}','root','child','001');
      do $$ begin
       if workflow_private.p5_scope_head('{owner}','{thread}','child','root',null)<>'001' then raise exception 'later child state leaked into frozen wait';end if;
      end $$;
      delete from workflow_checkpoints.checkpoints where thread_id='{thread}' and checkpoint_ns='child' and checkpoint_id='001';
      do $$ begin
       begin perform workflow_private.p5_scope_head('{owner}','{thread}','child','root',null);raise exception 'frozen missing child fell forward to later work';
       exception when others then if sqlerrm<>'CHECKPOINT_MISSING' then raise;end if;end;
      end $$;
      rollback;
    """)

def test_prepared_branch_revalidates_later_uncertain_writes_across_accessible_ancestry():
    owner,source,branch,nested=[str(uuid.uuid4()) for _ in range(4)];workflow='p5-lineage-'+str(uuid.uuid4())
    definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
      begin;
      insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
      select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
      insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status) values('{source}','{owner}','{workflow}',1,'{{}}','closed');
      select workflow_private.p5_branch('{owner}','{source}','{branch}','cp','{{}}');
      select workflow_private.p5_branch('{owner}','{branch}','{nested}','cp','{{}}');
      update public.workflow_execution_threads set checkpoint_id='cp',snapshot='{{"definition_hash":"h","semantic_hash":"s","compile_fingerprint":"f","environment_ref":"test","environment_revision":"1","registry_snapshot":{{}},"input":{{}}}}'::jsonb where owner_user_id='{owner}';
      select workflow_private.p5_start('{owner}','{branch}','cp','{{}}','branch','accepted-key','same-hash');
      insert into workflow_private.task_journal(thread_id,task_id,node_id,input,effect) values('{source}','unknown-write','write','{{}}','write');
      do $$ begin
       if not workflow_private.p5_unknown_effects('{owner}','{branch}') or not workflow_private.p5_unknown_effects('{owner}','{nested}') then raise exception 'prepared descendant bypassed later uncertain source write';end if;
      end $$;
      select workflow_private.p5_start('{owner}','{branch}','cp','{{}}','branch','accepted-key','same-hash');
      do $$ begin
       if (select count(*) from public.workflow_live_runs where owner_user_id='{owner}')<>1 then raise exception 'accepted retry created another Run';end if;
       begin perform workflow_private.p5_start('{owner}','{nested}','cp','{{}}','branch','new-key','new-hash');raise exception 'new descendant bypassed uncertain source';
       exception when others then if sqlerrm<>'EXTERNAL_EFFECT_UNCERTAIN' then raise;end if;end;
      end $$;
      delete from workflow_private.task_journal where thread_id='{source}';
      delete from public.workflow_execution_threads where thread_id='{source}';
      do $$ begin
       if workflow_private.p5_unknown_effects('{owner}','{nested}') then raise exception 'safe independent branch blocked after source deletion';end if;
      end $$;
      rollback;
    """)


def test_p6_cleanup_batches_preserve_live_rows_and_finish_on_later_ticks():
    owner,protected=[str(uuid.uuid4()) for _ in range(2)]
    workflow='p6-bounded-'+str(uuid.uuid4());definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    prefix='p6-'+str(uuid.uuid4())
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,updated_at)
      select gen_random_uuid(),'{owner}','{workflow}',1,'{{}}','closed',now()-interval '8 days' from generate_series(1,129);
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,updated_at)
      values('{protected}','{owner}','{workflow}',1,'{{}}','waiting',now());
    insert into workflow_memory.store(prefix,key,value,expires_at)
      select '{prefix}',i::text,'{{"version":1,"data":7}}',now()-interval '1 day' from generate_series(1,129) i;
    insert into workflow_memory.store(prefix,key,value,expires_at) values('{prefix}','live','{{"version":1,"data":9}}',now()+interval '1 day');
    select workflow_private.p5_sweep();
    select workflow_private.watchdog();
    do $$ declare n integer; begin
      select count(*) into n from workflow_memory.store where prefix='{prefix}' and key<>'live';
      if n<1 then raise exception 'FAILED unbounded Store cleanup';end if;
      select count(*) into n from public.workflow_execution_threads where workflow_id='{workflow}' and status='closed';
      if n<1 then raise exception 'FAILED unbounded Thread cleanup';end if;
      for tick in 1..20 loop perform workflow_private.p5_sweep();perform workflow_private.watchdog();end loop;
      if exists(select from workflow_memory.store where prefix='{prefix}' and key<>'live') then raise exception 'FAILED eventual Store cleanup';end if;
      if exists(select from public.workflow_execution_threads where workflow_id='{workflow}' and status='closed') then raise exception 'FAILED eventual Thread cleanup';end if;
      if not exists(select from workflow_memory.store where prefix='{prefix}' and key='live') or not exists(select from public.workflow_execution_threads where thread_id='{protected}') then raise exception 'FAILED active data protection';end if;
    end $$;
    rollback;
    """)


def test_queue_claim_run_is_scoped_to_one_run_and_never_reclaims_running_work():
    owner,run_a,run_b=[str(uuid.uuid4()) for _ in range(3)]
    workflow='queue-claim-'+str(uuid.uuid4());definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot)
    values('{run_a}','{owner}','{workflow}',1,'queued','d','s','c','env','1','{{}}','{{}}'),
          ('{run_b}','{owner}','{workflow}',1,'queued','d','s','c','env','1','{{}}','{{}}');
    insert into public.workflow_run_jobs(run_id,queue_msg_id) values('{run_a}',pgmq.send('workflow_v2','{{}}'));
    insert into public.workflow_run_jobs(run_id,queue_msg_id) values('{run_b}',pgmq.send('workflow_v2','{{}}'));
    do $$ declare result jsonb; begin
      result:=workflow_private.claim_run('{run_a}','queue-test');
      if result->>'kind'<>'claimed' then raise exception 'FAILED named claim %',result;end if;
      if result->>'token' is null then raise exception 'FAILED missing fence';end if;
    end $$;
    do $$ declare fenced bigint; begin
      select fencing_token into fenced from public.workflow_run_jobs where run_id='{run_a}';
      if fenced<>1 then raise exception 'FAILED first claim fence';end if;
      if (select status from public.workflow_live_runs where run_id='{run_a}')<>'running' then raise exception 'FAILED claimed status';end if;
      if (select status from public.workflow_live_runs where run_id='{run_b}')<>'queued' then raise exception 'FAILED unrelated run claimed';end if;
    end $$;
    do $$ declare result jsonb; begin
      result:=workflow_private.claim_run('{run_a}','queue-test-duplicate');
      if result->>'kind'<>'running' then raise exception 'FAILED duplicate claim %',result;end if;
    end $$;
    do $$ begin
      if (select fencing_token from public.workflow_run_jobs where run_id='{run_a}')<>1 then raise exception 'FAILED duplicate fence';end if;
      if (select count(*) from public.workflow_run_events where run_id='{run_a}' and type='run.started')<>1 then raise exception 'FAILED duplicate start event';end if;
    end $$;
    rollback;
    """)

def test_queue_claim_run_seals_stale_lease_and_expires_wait_without_reexecution():
    owner,stale,waiting=[str(uuid.uuid4()) for _ in range(3)]
    workflow='queue-stale-'+str(uuid.uuid4());definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,current_run_id)
      values('{stale}','{owner}','{workflow}',1,'{{}}','active','{stale}');
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,thread_id)
      values('{stale}','{owner}','{workflow}',1,'running','d','s','c','env','1','{{}}','{{}}','{stale}');
    insert into public.workflow_run_jobs(run_id,queue_msg_id,fencing_token,worker_id,lease_until)
      values('{stale}',pgmq.send('workflow_v2','{{}}'),7,'dead-worker',now()-interval '1 second');
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,current_run_id,wait_expires_at)
      values('{waiting}','{owner}','{workflow}',1,'{{}}','waiting','{waiting}',now()-interval '1 second');
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,thread_id)
      values('{waiting}','{owner}','{workflow}',1,'waiting','d','s','c','env','1','{{}}','{{}}','{waiting}');
    insert into public.workflow_run_jobs(run_id,queue_msg_id) values('{waiting}',pgmq.send('workflow_v2','{{}}'));
    do $$ declare result jsonb; begin
      result:=workflow_private.claim_run('{stale}','queue-test');
      if result->>'kind'<>'sealed' then raise exception 'FAILED stale seal %',result;end if;
      result:=workflow_private.claim_run('{waiting}','queue-test');
      if result->>'kind'<>'expired' then raise exception 'FAILED wait expiry %',result;end if;
    end $$;
    do $$ begin
      if (select status from public.workflow_live_runs where run_id='{stale}')<>'failed' or (select error->>'code' from public.workflow_live_runs where run_id='{stale}')<>'WORKER_LOST' then raise exception 'FAILED stale run outcome';end if;
      if (select status from public.workflow_execution_threads where thread_id='{stale}')<>'closed' then raise exception 'FAILED stale thread outcome';end if;
      if (select status from public.workflow_live_runs where run_id='{waiting}')<>'failed' or (select error->>'code' from public.workflow_live_runs where run_id='{waiting}')<>'WAIT_EXPIRED' then raise exception 'FAILED wait outcome';end if;
      if (select status from public.workflow_execution_threads where thread_id='{waiting}')<>'expired' then raise exception 'FAILED wait thread outcome';end if;
    end $$;
    do $$ declare result jsonb; begin
      result:=workflow_private.claim_run('{waiting}','queue-test');
      if result->>'kind'<>'terminal' then raise exception 'FAILED terminal replay %',result;end if;
    end $$;
    rollback;
    """)

def test_queue_timeout_watchdog_seals_old_queued_run_idempotently():
    owner,run=[str(uuid.uuid4()) for _ in range(2)]
    workflow='queue-timeout-'+str(uuid.uuid4());definition=sample();definition['workflowId']=workflow
    editor={'schemaVersion':1,'workflowId':workflow,'definitionRevision':1,'editorRevision':1,'nodes':{},'edges':{}}
    q=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select public.workflow_v2_save('{owner}','{workflow}',null,null,{q(definition)},{q(editor)},'hash',null);
    insert into public.workflow_execution_threads(thread_id,owner_user_id,workflow_id,revision,snapshot,status,current_run_id)
      values('{run}','{owner}','{workflow}',1,'{{}}','active','{run}');
    insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot,thread_id,created_at)
      values('{run}','{owner}','{workflow}',1,'queued','d','s','c','env','1','{{}}','{{}}','{run}',now()-interval '2 minutes');
    insert into public.workflow_run_jobs(run_id,queue_msg_id) values('{run}',pgmq.send('workflow_v2','{{}}'));
    select workflow_private.watchdog();
    do $$ begin
      if (select status from public.workflow_live_runs where run_id='{run}')<>'failed' then raise exception 'FAILED queue timeout status';end if;
      if (select error->>'code' from public.workflow_live_runs where run_id='{run}')<>'QUEUE_TIMEOUT' then raise exception 'FAILED queue timeout code';end if;
      if (select status from public.workflow_execution_threads where thread_id='{run}')<>'closed' then raise exception 'FAILED queue timeout thread';end if;
      if exists(select from public.workflow_run_steps where run_id='{run}' and status='running') then raise exception 'FAILED queue timeout step';end if;
    end $$;
    select workflow_private.watchdog();
    do $$ begin
      if (select status from public.workflow_live_runs where run_id='{run}')<>'failed' then raise exception 'FAILED repeated queue timeout';end if;
      if (select count(*) from public.workflow_run_events where run_id='{run}' and type='run.failed')<>1 then raise exception 'FAILED duplicate timeout event';end if;
    end $$;
    rollback;
    """)

def test_queue_claim_functions_are_worker_only_and_seal_is_private():
    run_sql("""
    begin;
    do $$ begin
      if has_function_privilege('authenticated','workflow_private.claim_run(uuid,text)','execute')
        or has_function_privilege('anon','workflow_private.claim_run(uuid,text)','execute')
        or has_function_privilege('authenticated','workflow_private.expire_wait(uuid)','execute')
        or has_function_privilege('anon','workflow_private.expire_wait(uuid)','execute') then raise exception 'FAILED browser queue authority';end if;
      if not has_function_privilege('workflow_worker','workflow_private.claim_run(uuid,text)','execute')
        or not has_function_privilege('workflow_worker','workflow_private.expire_wait(uuid)','execute') then raise exception 'FAILED worker queue authority';end if;
      if has_function_privilege('workflow_worker','workflow_private.seal_run(uuid,text,text,text,text,boolean)','execute') then raise exception 'FAILED seal authority';end if;
      if not has_function_privilege('workflow_worker','workflow_private.watchdog()','execute') or not has_function_privilege('workflow_worker','workflow_private.p5_sweep()','execute') then raise exception 'FAILED worker watchdog authority';end if;
    end $$;
    rollback;
    """)


def test_connection_delete_rechecks_all_versions_and_nested_references_in_one_transaction():
    owner = str(uuid.uuid4())
    workflow = "connection-refs-" + str(uuid.uuid4())
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select workflow_private.p4_connection_save('{owner}','local','probe',1,
      jsonb_build_object('type','openai-compatible','name','Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),
      'synthetic-key-one');
    select workflow_private.p4_connection_save('{owner}','local','probe',2,
      jsonb_build_object('type','openai-compatible','name','Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m2')),
      'synthetic-key-two');
    create temp table probe_secret_ids on commit drop as
      select substring(content->>'secretRef' from 7)::uuid id
      from workflow_private.p4_catalog
      where owner_user_id='{owner}' and ref='probe' and content ? 'secretRef';
    select workflow_v2_save('{owner}','{workflow}',null,null,
      jsonb_build_object(
        'name','Reference Check','revision',1,
        'nodes',jsonb_build_array(
          jsonb_build_object(
            'id','model','type','core.llm',
            'config',jsonb_build_object(
              'providerRef','p4:{owner}:probe:1','modelRef','m1',
              'allowedToolRefs',jsonb_build_array('p4:{owner}:probe:1'))),
          jsonb_build_object(
            'id','sub','type','core.subgraph',
            'config',jsonb_build_object(
              'graph',jsonb_build_object(
                'nodes',jsonb_build_array(
                  jsonb_build_object(
                    'id','tool','type','core.tool',
                    'config',jsonb_build_object('toolRef','p4:{owner}:probe:2'))))))),
        'transitions',jsonb_build_array()),
      jsonb_build_object(
        'schemaVersion',1,'workflowId','{workflow}','editorRevision',1,'definitionRevision',1,
        'nodes',jsonb_build_object(),'edges',jsonb_build_object()),
      'hash',null);
    do $$ declare n integer; begin
      select workflow_private.p4_connection_reference_count('{owner}','probe') into n;
      if n<>3 then raise exception 'FAILED nested reference count %',n; end if;
      begin perform workflow_private.p4_connection_delete('{owner}','local','probe',2);
        raise exception 'FAILED delete with nested references';
      exception when others then
        if sqlerrm not like '%CONNECTION_IN_USE%' then raise; end if;
      end;
    end $$;
    update workflow_revisions set definition=jsonb_set(definition,'{{nodes}}','[]'::jsonb)
      where owner_user_id='{owner}' and workflow_id='{workflow}' and revision=1;
    do $$ declare result jsonb; begin
      result:=workflow_private.p4_connection_delete('{owner}','local','probe',2);
      if (result->>'deleted')::integer<>2 then raise exception 'FAILED all-version delete'; end if;
      if (result->>'credentialsDeleted')::integer<>2 then raise exception 'FAILED credential cleanup'; end if;
      if exists(select from workflow_private.p4_catalog where owner_user_id='{owner}' and ref='probe') then
        raise exception 'FAILED catalog rows remain';
      end if;
      if exists(select from vault.secrets where id in (select id from probe_secret_ids)) then
        raise exception 'FAILED vault secrets remain';
      end if;
      if has_function_privilege('authenticated','workflow_private.p4_connection_delete(uuid,text,text,integer)','execute')
        or has_function_privilege('anon','workflow_private.p4_connection_delete(uuid,text,text,integer)','execute') then
        raise exception 'FAILED delete privilege exposed';
      end if;
    end $$;
    do $$ begin
      -- A browser that read a pre-delete version cannot append a stale v3 and
      -- resurrect the logical connection after all versions were removed.
      begin
        perform workflow_private.p4_catalog_save('{owner}','local','connection','probe',3,
          jsonb_build_object('type','openai-compatible','name','Resurrected','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),false);
        raise exception 'FAILED stale connection resurrected';
      exception when others then
        if sqlerrm not like '%CONNECTION_VERSION_CONFLICT%' then raise; end if;
      end;
    end $$;
    rollback;
    """)


def test_connection_delete_waits_for_an_inflight_workflow_save_and_then_rechecks():
    import time
    owner = str(uuid.uuid4())
    container = os.environ.get("WORKFLOW_LOCAL_DB_CONTAINER", "supabase_db_EduFlow")
    try:
        run_sql(f"""
        insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
        select workflow_private.p4_connection_save('{owner}','local','lock_probe',1,
          jsonb_build_object('type','openai-compatible','name','Lock Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),
          '');
        """)
        # Hold the shared side of the same lock a definition save takes. The
        # delete must wait instead of scanning before this transaction ends.
        holder = subprocess.Popen(
            ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        holder.stdin.write("begin; select pg_advisory_xact_lock_shared(hashtextextended('workflow:p4:connection-lifecycle',0)); select pg_sleep(2); rollback;\n")
        holder.stdin.close()
        time.sleep(0.4)
        blocked = subprocess.run(
            ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtc",
             f"set lock_timeout='300ms'; select workflow_private.p4_connection_delete('{owner}','local','lock_probe',1);"],
            text=True, capture_output=True, timeout=10,
        )
        assert blocked.returncode != 0
        assert "lock timeout" in (blocked.stderr + blocked.stdout).lower()
        assert holder.wait(timeout=10) == 0
        retried = subprocess.run(
            ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtc",
             f"select workflow_private.p4_connection_delete('{owner}','local','lock_probe',1);"],
            text=True, capture_output=True, timeout=10,
        )
        assert retried.returncode == 0, retried.stderr
        assert '"deleted": 1' in retried.stdout
    finally:
        run_sql(f"delete from auth.users where id='{owner}';")


def _provider_definition(owner, workflow, provider_ref, *, include_provider=True, revision=1):
    nodes = []
    if include_provider:
        nodes.append(f"""jsonb_build_object('id','model','type','core.llm','config',jsonb_build_object(
          'providerRef','p4:{owner}:{provider_ref}:1','modelRef','m1'))""")
    return f"""jsonb_build_object(
      'name','Reference Save','revision',{revision},
      'nodes',jsonb_build_array({','.join(nodes)}),'transitions',jsonb_build_array())"""


def _editor(workflow, revision=1):
    return f"""jsonb_build_object('schemaVersion',1,'workflowId','{workflow}',
      'editorRevision',{revision},'definitionRevision',{revision},
      'nodes',jsonb_build_object(),'edges',jsonb_build_object())"""


def test_workflow_save_rejects_connection_deleted_before_stale_save_commit():
    owner, workflow = str(uuid.uuid4()), "stale-save-" + str(uuid.uuid4())
    try:
        run_sql(f"""
        insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
        select workflow_private.p4_connection_save('{owner}','local','probe',1,
          jsonb_build_object('type','openai-compatible','name','Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),'');
        select workflow_private.p4_connection_delete('{owner}','local','probe',1);
        """)
        run_sql(f"""
        do $$ begin
          begin
            perform public.workflow_v2_save('{owner}','{workflow}',null,null,{_provider_definition(owner,workflow,'probe')},{_editor(workflow)},'hash',null,'local');
            raise exception 'FAILED stale save after delete';
          exception when others then
            if sqlerrm not like '%CONNECTION_UNAVAILABLE%' then raise; end if;
          end;
        end $$;
        """)
        rows = subprocess.run(
            ["docker", "exec", "-i", os.environ.get("WORKFLOW_LOCAL_DB_CONTAINER", "supabase_db_EduFlow"),
             "psql", "-U", "postgres", "-d", "postgres", "-qAtc",
             f"select count(*) from public.workflow_v2_definitions where owner_user_id='{owner}' and workflow_id='{workflow}';"],
            text=True, capture_output=True, check=True,
        ).stdout.strip()
        assert rows == "0"
    finally:
        run_sql(f"delete from auth.users where id='{owner}';")


def test_committed_workflow_save_reference_blocks_connection_delete():
    owner, workflow = str(uuid.uuid4()), "save-first-" + str(uuid.uuid4())
    try:
        run_sql(f"""
        insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
        select workflow_private.p4_connection_save('{owner}','local','probe',1,
          jsonb_build_object('type','openai-compatible','name','Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),'');
        select public.workflow_v2_save('{owner}','{workflow}',null,null,{_provider_definition(owner,workflow,'probe')},{_editor(workflow)},'hash',null,'local');
        """)
        run_sql(f"""
        do $$ begin
          begin perform workflow_private.p4_connection_delete('{owner}','local','probe',1);
            raise exception 'FAILED delete of committed reference';
          exception when others then
            if sqlerrm not like '%CONNECTION_IN_USE%' then raise; end if;
          end;
        end $$;
        """)
    finally:
        run_sql(f"""
        delete from public.workflow_editor_documents where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from public.workflow_revisions where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from public.workflow_v2_definitions where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from auth.users where id='{owner}';
        """)


def test_active_run_blocks_delete_and_run_insert_revalidates_after_delete():
    owner, workflow, run = str(uuid.uuid4()), "active-run-" + str(uuid.uuid4()), str(uuid.uuid4())
    try:
        run_sql(f"""
        insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
        select workflow_private.p4_connection_save('{owner}','local','probe',1,
          jsonb_build_object('type','openai-compatible','name','Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),'');
        select public.workflow_v2_save('{owner}','{workflow}',null,null,{_provider_definition(owner,workflow,'probe')},{_editor(workflow)},'hash',null,'local');
        insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot)
        values('{run}','{owner}','{workflow}',1,'running','d','s','c','local','1','{{}}','{{}}');
        select public.workflow_v2_save('{owner}','{workflow}',1,1,{_provider_definition(owner,workflow,'probe',include_provider=False,revision=2)},{_editor(workflow,2)},'hash2',null,'local');
        """)
        run_sql(f"""
        do $$ begin
          begin perform workflow_private.p4_connection_delete('{owner}','local','probe',1);
            raise exception 'FAILED delete with active run';
          exception when others then
            if sqlerrm not like '%CONNECTION_BUSY%' then raise; end if;
          end;
        end $$;
        """)
        run_sql(f"update public.workflow_live_runs set status='waiting' where run_id='{run}';")
        run_sql(f"""
        do $$ begin
          begin perform workflow_private.p4_connection_delete('{owner}','local','probe',1);
            raise exception 'FAILED delete with waiting run';
          exception when others then
            if sqlerrm not like '%CONNECTION_BUSY%' then raise; end if;
          end;
        end $$;
        """)
        run_sql(f"update public.workflow_live_runs set status='success',finished_at=now() where run_id='{run}';")
        run_sql(f"select workflow_private.p4_connection_delete('{owner}','local','probe',1);")
        run_sql(f"""
        do $$ begin
          begin
            insert into public.workflow_live_runs(run_id,owner_user_id,workflow_id,revision,status,definition_hash,semantic_hash,compile_fingerprint,environment_ref,environment_revision,input,registry_snapshot)
            values(gen_random_uuid(),'{owner}','{workflow}',1,'queued','d','s','c','local','1','{{}}','{{}}');
            raise exception 'FAILED run insert after connection delete';
          exception when others then
            if sqlerrm not like '%CONNECTION_UNAVAILABLE%' then raise; end if;
          end;
        end $$;
        """)
    finally:
        run_sql(f"""
        delete from public.workflow_run_steps where run_id='{run}';
        delete from public.workflow_run_events where run_id='{run}';
        delete from public.workflow_run_jobs where run_id='{run}';
        delete from public.workflow_live_runs where run_id='{run}';
        delete from public.workflow_editor_documents where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from public.workflow_revisions where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from public.workflow_v2_definitions where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from auth.users where id='{owner}';
        """)


def test_restoring_a_historical_revision_revalidates_the_deleted_connection():
    owner, workflow = str(uuid.uuid4()), "history-restore-" + str(uuid.uuid4())
    try:
        run_sql(f"""
        insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
        select workflow_private.p4_connection_save('{owner}','local','probe',1,
          jsonb_build_object('type','openai-compatible','name','Probe','baseUrl','https://models.example/v1','modelRefs',jsonb_build_array('m1')),'');
        select public.workflow_v2_save('{owner}','{workflow}',null,null,{_provider_definition(owner,workflow,'probe')},{_editor(workflow)},'hash1',null,'local');
        select public.workflow_v2_save('{owner}','{workflow}',1,1,{_provider_definition(owner,workflow,'probe',include_provider=False,revision=2)},{_editor(workflow,2)},'hash2',null,'local');
        select workflow_private.p4_connection_delete('{owner}','local','probe',1);
        """)
        run_sql(f"""
        do $$ begin
          begin
            -- Simulates restoring revision 1 as a new revision after the
            -- referenced connection was deleted.
            perform public.workflow_v2_save('{owner}','{workflow}',2,2,{_provider_definition(owner,workflow,'probe',revision=3)},{_editor(workflow,3)},'hash3',null,'local');
            raise exception 'FAILED historical restore revived deleted connection';
          exception when others then
            if sqlerrm not like '%CONNECTION_UNAVAILABLE%' then raise; end if;
          end;
        end $$;
        """)
    finally:
        run_sql(f"""
        delete from public.workflow_editor_documents where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from public.workflow_revisions where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from public.workflow_v2_definitions where owner_user_id='{owner}' and workflow_id='{workflow}';
        delete from auth.users where id='{owner}';
        """)


def test_save_connection_validation_distinguishes_functions_and_platform_refs():
    owner = str(uuid.uuid4())
    function_workflow = "function-ref-" + str(uuid.uuid4())
    platform_workflow = "platform-ref-" + str(uuid.uuid4())
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@integration.invalid');
    select workflow_private.p4_catalog_save('{owner}','local','function','probe',1,
      jsonb_build_object('name','Probe function','language','python','code','def process(input, context): return {{}}'),false);
    do $$ begin
      begin
        perform public.workflow_v2_save('{owner}','{function_workflow}',null,null,
          jsonb_build_object('name','Function Ref','revision',1,'nodes',jsonb_build_array(
            jsonb_build_object('id','model','type','core.llm','config',jsonb_build_object(
              'providerRef','p4:{owner}:probe:1','modelRef','m1'))),'transitions',jsonb_build_array()),
          jsonb_build_object('schemaVersion',1,'workflowId','{function_workflow}','editorRevision',1,'definitionRevision',1,
            'nodes',jsonb_build_object(),'edges',jsonb_build_object()),'hash',null,'local');
        raise exception 'FAILED function ref accepted as connection';
      exception when others then
        if sqlerrm not like '%CONNECTION_UNAVAILABLE%' then raise; end if;
      end;
    end $$;
    select public.workflow_v2_save('{owner}','{platform_workflow}',null,null,
      jsonb_build_object('name','Platform Refs','revision',1,'nodes',jsonb_build_array(
        jsonb_build_object('id','model','type','core.llm','config',jsonb_build_object(
          'providerRef','deepseek','modelRef','deepseek-chat','allowedToolRefs',jsonb_build_array('hn_search'))),
        jsonb_build_object('id','tool','type','core.tool','config',jsonb_build_object(
          'toolRef','hn_search','contractDigest','digest'))),'transitions',jsonb_build_array()),
      jsonb_build_object('schemaVersion',1,'workflowId','{platform_workflow}','editorRevision',1,'definitionRevision',1,
        'nodes',jsonb_build_object(),'edges',jsonb_build_object()),'hash',null,'local');
    rollback;
    """)


def test_platform_deepseek_does_not_block_same_named_user_connection_but_real_p4_refs_do():
    platform_owner = str(uuid.uuid4())
    platform_workflow = "platform-name-" + str(uuid.uuid4())
    user_owner = str(uuid.uuid4())
    user_workflow = "user-name-" + str(uuid.uuid4())
    run_sql(f"""
    begin;
    insert into auth.users(id,aud,role,email) values('{platform_owner}','authenticated','authenticated','{platform_owner}@integration.invalid');
    select workflow_private.p4_connection_save('{platform_owner}','local','deepseek',1,
      jsonb_build_object('type','deepseek','name','User DeepSeek','baseUrl','https://api.deepseek.com','modelRefs',jsonb_build_array('deepseek-chat')),'');
    select public.workflow_v2_save('{platform_owner}','{platform_workflow}',null,null,
      jsonb_build_object('name','Platform DeepSeek','revision',1,'nodes',jsonb_build_array(
        jsonb_build_object('id','model','type','core.llm','config',jsonb_build_object(
          'providerRef','deepseek','modelRef','deepseek-chat','allowedToolRefs',jsonb_build_array()))),'transitions',jsonb_build_array()),
      jsonb_build_object('schemaVersion',1,'workflowId','{platform_workflow}','editorRevision',1,'definitionRevision',1,
        'nodes',jsonb_build_object(),'edges',jsonb_build_object()),'hash',null,'local');
    do $$ begin
      if workflow_private.p4_connection_reference_count('{platform_owner}','deepseek')<>0 then
        raise exception 'FAILED platform deepseek counted as user connection';
      end if;
    end $$;
    select workflow_private.p4_connection_delete('{platform_owner}','local','deepseek',1);
    rollback;

    begin;
    insert into auth.users(id,aud,role,email) values('{user_owner}','authenticated','authenticated','{user_owner}@integration.invalid');
    select workflow_private.p4_connection_save('{user_owner}','local','deepseek',1,
      jsonb_build_object('type','deepseek','name','User DeepSeek','baseUrl','https://api.deepseek.com','modelRefs',jsonb_build_array('deepseek-chat')),'');
    select workflow_private.p4_connection_save('{user_owner}','local','deepseek',2,
      jsonb_build_object('type','deepseek','name','User DeepSeek','baseUrl','https://api.deepseek.com','modelRefs',jsonb_build_array('deepseek-reasoner')),'');
    select public.workflow_v2_save('{user_owner}','{user_workflow}',null,null,
      jsonb_build_object('name','User DeepSeek Refs','revision',1,'nodes',jsonb_build_array(
        jsonb_build_object('id','platform','type','core.llm','config',jsonb_build_object(
          'providerRef','deepseek','modelRef','deepseek-chat','allowedToolRefs',jsonb_build_array())),
        jsonb_build_object('id','model','type','core.llm','config',jsonb_build_object(
          'providerRef','p4:{user_owner}:deepseek:1','modelRef','deepseek-chat',
          'allowedToolRefs',jsonb_build_array('p4:{user_owner}:deepseek:1'))),
        jsonb_build_object('id','sub','type','core.subgraph','config',jsonb_build_object(
          'graph',jsonb_build_object('nodes',jsonb_build_array(
            jsonb_build_object('id','tool','type','core.tool','config',jsonb_build_object(
              'toolRef','p4:{user_owner}:deepseek:2'))))))),'transitions',jsonb_build_array()),
      jsonb_build_object('schemaVersion',1,'workflowId','{user_workflow}','editorRevision',1,'definitionRevision',1,
        'nodes',jsonb_build_object(),'edges',jsonb_build_object()),'hash',null,'local');
    do $$ begin
      if workflow_private.p4_connection_reference_count('{user_owner}','deepseek')<>3 then
        raise exception 'FAILED real p4 refs not counted';
      end if;
      begin perform workflow_private.p4_connection_delete('{user_owner}','local','deepseek',2);
        raise exception 'FAILED delete with real p4 refs';
      exception when others then
        if sqlerrm not like '%CONNECTION_IN_USE%' then raise; end if;
      end;
    end $$;
    rollback;
    """)
