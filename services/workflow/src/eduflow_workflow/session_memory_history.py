"""Product policies around official streaming, saver and PostgreSQL Store APIs."""
import copy
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from langgraph.store.postgres.aio import AsyncPostgresStore
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.base import create_checkpoint, BaseCheckpointSaver
from .contracts import ExecutionError, canonical, digest, validate_value, bind

class HistorySaver(AsyncPostgresSaver):
    # ProductCoordinator uses the base integer version policy. Preserve that policy
    # when invoking official history updates; serializer and SQL remain SDK-owned.
    def get_next_version(self,current,channel):
        return BaseCheckpointSaver.get_next_version(self,current,channel)

LIMITS={'rounds':20,'threadDays':7,'streamEvents':2048,'streamBytes':1048576,'textBytes':65536,'itemBytes':16384,'storeItems':1000,'storeTtlMinutes':10080,'historyPage':20,'bulkUpdates':20}

def fail(code,message,category='validation'):
    raise ExecutionError(code,message,category,effect='none')

def integer(value,low,high):
    if isinstance(value,bool) or not isinstance(value,int) or not low<=value<=high: fail('INVALID_P5_REQUEST','Provide a bounded integer')
    return value

def name(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',value):fail('INVALID_MEMORY_KEY','Use 1–80 letters, numbers, underscores or hyphens')
    return value

def namespace(owner,environment,workflow,scope,collection):
    if scope not in ('workflow','shared'):fail('INVALID_MEMORY_SCOPE','Choose workflow-private or explicit shared memory')
    return (str(owner),'env-'+digest(environment)[:24],('w-'+digest(workflow)[:24]) if scope=='workflow' else 'shared',name(collection))

@asynccontextmanager
async def connection(url=None):
    async with await AsyncConnection.connect(url or os.environ['WORKFLOW_DATABASE_URL'],connect_timeout=5, tcp_user_timeout=20000,autocommit=True,row_factory=dict_row,options='-c search_path=workflow_checkpoints,workflow_memory -c statement_timeout=15000 -c lock_timeout=3000') as conn:
        yield conn

async def expire_memory(conn,ns):
    # The SDK sweeper is eventual; product TTL visibility must be immediate.
    await conn.execute('delete from workflow_memory.store where prefix=%s and expires_at<=now()',('.'.join(ns),))

async def memory_get(conn,ns,key):
    await expire_memory(conn,ns)
    item=await AsyncPostgresStore(conn).aget(ns,key,refresh_ttl=False)
    if not item:return {'found':False,'value':None,'version':0}
    v=item.value
    return {'found':not v.get('deleted',False),'value':v.get('data'),'version':v['version']}

async def memory_write(conn,ns,key,value,expected,operation,ttl):
    await conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))',('.'.join(ns[:2]),))
    old=await memory_get(conn,ns,key)
    if old['version']!=expected:fail('MEMORY_VERSION_CONFLICT','Memory changed; read the current version before writing')
    # Expired rows are removed only in the authorized namespace; no cross-owner sweep.
    await conn.execute('delete from workflow_memory.store where prefix=%s and expires_at<=now()',('.'.join(ns),))
    count=(await (await conn.execute('select count(*) as n from workflow_memory.store where prefix like %s and (expires_at is null or expires_at>now())',('.'.join(ns[:2])+'.%',))).fetchone())['n']
    if old['version']==0 and count>=LIMITS['storeItems']:fail('MEMORY_QUOTA_EXCEEDED','Memory collection has reached its item limit','policy')
    v={'version':old['version']+1,'data':value if operation=='put' else None,'deleted':operation=='delete'}
    await AsyncPostgresStore(conn).aput(ns,key,v,ttl=ttl)
    return {'found':operation=='put','value':v['data'],'version':v['version']}

async def memory_node(execution,node,resolved):
    cfg=node['config'];ns=namespace(execution.run['owner_user_id'],execution.run['environment_ref'],execution.run['workflow_id'],cfg['scope'],cfg['collection']);key=name(str(resolved.get('key',cfg.get('key','value'))))
    if not hasattr(execution.storage,'url'):fail('MEMORY_UNAVAILABLE','Persistent memory requires the database','infrastructure')
    async with connection(execution.storage.url) as conn:
        found=await memory_get(conn,ns,key)
        execution.assert_no_secrets(found)
        if cfg['operation']=='get':return found
        expected=integer(resolved.get('expectedVersion',found['version']),0,2147483647)
        if found['version']!=expected:fail('MEMORY_VERSION_CONFLICT','Memory changed before this task')
        value=resolved.get('value');execution.assert_no_secrets(value)
        if len(canonical(value))>LIMITS['itemBytes']:fail('MEMORY_TOO_LARGE','Memory item exceeds 16 KiB','policy')
        ttl=integer(cfg.get('ttlMinutes',1440),1,LIMITS['storeTtlMinutes'])
        ident=execution._invocation.get().sdk_execution or {}
        if (execution.definition is not execution.root_definition and (execution.definition is None or __import__('eduflow_workflow.compiler',fromlist=['SDK_SCOPE']).SDK_SCOPE.get().get('stateless'))):fail('MEMORY_STATELESS_WRITE','Memory writes require a durable task')
        async with conn.transaction():
            await conn.execute('select workflow_private.check_lease(%s,%s)',(execution.run['run_id'],execution.token))
            intent=(execution.run['thread_id'],ident['taskId'],Jsonb(list(ns)),key,cfg['operation'],Jsonb(value),expected,ttl)
            await conn.execute('insert into workflow_private.p5_intents(thread_id,task_id,namespace,key,operation,value,expected,ttl) values(%s,%s,%s,%s,%s,%s,%s,%s) on conflict(thread_id,task_id) do nothing',intent)
        return {'found':cfg['operation']=='put','value':value if cfg['operation']=='put' else None,'version':expected+1}

async def commit_intents(conn,execution,parent,scope):
    rows=(await (await conn.execute('select workflow_private.p5_pending(%s,%s,%s,%s) as items',(execution.run['run_id'],execution.token,parent,scope))).fetchone())['items']
    for i in rows:
        await memory_write(conn,tuple(i['namespace']),i['key'],i['value'],i['expected'],i['operation'],i['ttl'])
        await conn.execute('update workflow_private.p5_intents set applied=true where thread_id=%s and task_id=%s',(i['thread_id'],i['task_id']))

async def emit(execution,kind,payload):
    ctx=execution._invocation.get();identity=ctx.sdk_execution if ctx else None
    payload={**payload,'execution':identity,'attempt':getattr(execution,'_stream_attempts',{}).get(execution.step_id,1),'transient':True}
    execution.assert_no_secrets(payload)
    if hasattr(execution.storage,'url'):
        await execution.storage.call('p5_stream',execution.run['run_id'],execution.token,kind,payload,execution.step_id,execution.node_id)
    else:await execution.event(kind,payload)

async def stream_model(execution,model,messages):
    from .credentials import secret_values
    keep=max([0,*[len(s) for s in secret_values(execution.env)]])
    response=None;text='';sent=0;sequence=0;last=time.monotonic();stream=str(uuid.uuid4())
    try:
        from langchain_core.messages import message_chunk_to_message
        # Reasoning providers can emit thousands of chunks per response. Revalidate the
        # lease/environment at a bounded cadence instead of once per chunk so provider
        # streaming stays within the node budget; revocation still dominates each chunk.
        last_guard=0.0
        async for chunk in model.astream(messages,stream_usage=True):
            now=time.monotonic()
            if now-last_guard>=0.5:
                await execution.guard()
                last_guard=now
            response=chunk if response is None else response+chunk
            # Text blocks only: reasoning/private provider fields are never streamed.
            value=chunk.content
            piece=value if isinstance(value,str) else ''.join(v.get('text','') for v in value if isinstance(v,dict) and v.get('type')=='text')
            text+=piece
            execution.assert_no_secrets(text)
            if len(text.encode())>LIMITS['textBytes']:fail('MODEL_OUTPUT_TOO_LARGE','Model text exceeds 64 KiB','policy')
            upto=max(sent,len(text)-keep)
            if upto>sent and (upto-sent>=512 or time.monotonic()-last>=.2):
                for start in range(sent,upto,2048):
                    await emit(execution,'node.output.delta',{'streamId':stream,'index':sequence,'text':text[start:min(start+2048,upto)]});sequence+=1
                sent=upto;last=time.monotonic()
        if response is None:fail('EMPTY_MODEL_RESPONSE','Model returned no response','provider')
        message=message_chunk_to_message(response)
        reason=(message.response_metadata or {}).get('finish_reason')
        if reason=='length':fail('MODEL_OUTPUT_TRUNCATED','Model reached its output limit before completing the response','provider')
        if reason not in ('stop','tool_calls','function_call'):
            fail('MODEL_RESPONSE_INCOMPLETE','Model did not complete an accepted response','provider')
        if message.invalid_tool_calls:fail('INVALID_MODEL_TOOL_CALL','Provider returned an invalid structured tool call','provider')
        if not text.strip() and not message.tool_calls:
            fail('EMPTY_MODEL_RESPONSE','Model returned no visible response or valid tool call','provider')
        if len(text)>sent:
            for start in range(sent,len(text),2048):
                await emit(execution,'node.output.delta',{'streamId':stream,'index':sequence,'text':text[start:start+2048]});sequence+=1
        await emit(execution,'node.output.end',{'streamId':stream,'status':'computed',**({'text':text} if len(text.encode())<=8192 else {'finalFromStep':True,'characters':len(text)})})
        return message
    except BaseException:
        try:await emit(execution,'node.output.end',{'streamId':stream,'status':'interrupted'})
        except Exception:pass
        raise

async def load(owner,thread,registry):
    from .storage import Storage
    data=await Storage(os.environ['WORKFLOW_DATABASE_URL']).call('p5_read',owner,'thread',thread)
    t=data['thread'];definition=data['definition'];env=registry.environment(t['snapshot']['environment_ref'],owner)
    # Variables and the variable environment selection are frozen with the thread;
    # restore them before recompiling so the stored compile fingerprint still matches.
    from .registry import restore_frozen_environment
    restore_frozen_environment(env,t.get('snapshot',{}).get('registry_snapshot') or {})
    if data['archived']:fail('WORKFLOW_ARCHIVED','Workflow is archived')
    from .compiler import compile_definition
    accepted=compile_definition(definition,registry.snapshot(env))
    if not accepted['valid'] or accepted['compileFingerprint']!=t['snapshot']['compile_fingerprint']:fail('COMPILE_FINGERPRINT_CHANGED','Execution version or authorization changed','auth')
    if datetime.now(timezone.utc)-datetime.fromisoformat(t['updated_at'])>__import__('datetime').timedelta(days=7):fail('THREAD_EXPIRED','Thread retention has expired')
    return data,env

def config(t,namespace='',checkpoint=None):
    return {'configurable':{'thread_id':str(t),'checkpoint_ns':namespace,**({'checkpoint_id':checkpoint} if checkpoint else {})}}

def scoped_definition(definition,graph_path):
    for ident in graph_path:
        n=next((n for n in definition['nodes'] if n['id']==ident and n['type']=='core.subgraph'),None)
        if n is None:fail('INVALID_GRAPH_PATH','Choose a real child graph')
        definition=n['config']['graph']
    return definition

def scope_definition(root,ns):
    current=root;path=[]
    for part in ns.split('|') if ns else []:
        label=part.split(':')[0]
        names={'eduflow_node_'+str(i):n for i,n in enumerate(sorted(current['nodes'],key=lambda n:n['id']))}
        node=names.get(label)
        if not node or node['type']!='core.subgraph':fail('INVALID_GRAPH_PATH','Namespace is not an owned child graph')
        path.append(node['id']);current=node['config']['graph']
    return current,path

async def clone_scopes(definition,saver,source,target,conn,fingerprint,upper=None,parents=None,scope_map=None,owner=None,root_checkpoint=None):
    from .compiler import graph_for
    parents=parents or {}
    scope_map=scope_map if scope_map is not None else []
    item=await saver.aget_tuple(source)
    if item is None:fail('CHECKPOINT_MISSING','Nested checkpoint is missing')
    async def forbidden(*_):fail('HISTORY_EXECUTION_FORBIDDEN','History inspection cannot execute nodes')
    graph=graph_for(definition,forbidden,fingerprint,checkpointer=saver)
    old_cfg={**item.config,'configurable':{**item.config['configurable'],'__pregel_checkpointer':saver}}
    original=await graph.aget_state(old_cfg)
    cp=create_checkpoint(copy.deepcopy(item.checkpoint),None,item.metadata.get('step',0))
    saved=await saver.aput(target,cp,{**item.metadata,'source':'fork','parents':parents},cp['channel_versions'])
    scope_map.append({'source':source['configurable'].get('checkpoint_ns',''),'target':target['configurable'].get('checkpoint_ns',''),'config':saved,'definition':definition})
    new_cfg={**saved,'configurable':{**saved['configurable'],'__pregel_checkpointer':saver}}
    copied=await graph.aget_state(new_cfg)
    mapped={**parents,target['configurable'].get('checkpoint_ns',''):cp['id']}
    olds=sorted(original.tasks,key=lambda t:repr((t.name,t.path)));news=sorted(copied.tasks,key=lambda t:repr((t.name,t.path)))
    if len(olds)!=len(news):fail('BRANCH_TASK_MISMATCH','Source tasks could not be safely mapped')
    nodes={'eduflow_node_'+str(i):n for i,n in enumerate(sorted(definition['nodes'],key=lambda n:n['id']))}
    child_heads={}
    for old,new in zip(olds,news):
        if old.name!=new.name or old.path!=new.path:fail('BRANCH_TASK_MISMATCH','Source tasks could not be safely mapped')
        node=nodes.get(old.name)
        if not node or node['type']!='core.subgraph' or node['config'].get('persistence')=='stateless':continue
        old_ns='|'.join(filter(None,[source['configurable'].get('checkpoint_ns',''),old.name+':'+old.id]))
        new_ns='|'.join(filter(None,[target['configurable'].get('checkpoint_ns',''),new.name+':'+new.id]))
        if node['config'].get('persistence')=='per-thread':
            old_ns='|'.join(x.split(':')[0] for x in old_ns.split('|'));new_ns='|'.join(x.split(':')[0] for x in new_ns.split('|'))
        row=await (await conn.execute('select workflow_private.p5_scope_head(%s,%s,%s,%s,%s) as checkpoint_id',(owner,source['configurable']['thread_id'],old_ns,root_checkpoint,upper['checkpoint_id'] if upper else None))).fetchone()
        expected=row['checkpoint_id'] or item.metadata.get('eduflowChildCheckpoints',{}).get(old_ns)
        if expected:
            child_config=await clone_scopes(node['config']['graph'],saver,config(source['configurable']['thread_id'],old_ns,expected),config(target['configurable']['thread_id'],new_ns),conn,fingerprint,upper,mapped,scope_map,owner,root_checkpoint)
            child_heads[new_ns]=child_config['configurable']['checkpoint_id']
        elif old.interrupts:
            fail('CHECKPOINT_MISSING','Pending child checkpoint is missing')
    # SDK metadata freezes exact child references for this new immutable copy.
    # Re-save the same new ID using its original parent config, never a self-parent.
    await saver.aput(target,cp,{**item.metadata,'source':'fork','parents':parents,'eduflowChildCheckpoints':child_heads},{})
    return saved

def validate_request(body):
    common={'ownerId','action'}
    specs={
      'threads':({'workflowId'},set()),
      'history':({'threadId'},{'namespace','graphPath','before'}),
      'next':({'threadId','checkpointId','input','idempotencyKey'},set()),
      'prepare':({'threadId','checkpointId','idempotencyKey'},{'updates'}),
      'branch.start':({'threadId','checkpointId','confirmExternalEffects','idempotencyKey'},set()),
      'memory.list':({'workflowId','environmentRef'},{'scope','collection','offset','key'}),
      'memory.put':({'workflowId','environmentRef','key','value','expectedVersion','idempotencyKey'},{'scope','collection','ttlMinutes'}),
      'memory.delete':({'workflowId','environmentRef','key','expectedVersion','idempotencyKey'},{'scope','collection','ttlMinutes'})}
    if not isinstance(body,dict) or body.get('action') not in specs:fail('INVALID_P5_REQUEST','Choose a supported operation')
    required,optional=specs[body['action']]
    if not (required|common)<=set(body) or set(body)-(required|optional|common):fail('INVALID_P5_REQUEST','Unexpected or missing request fields')
    for k in ('workflowId','environmentRef','namespace','before','checkpointId'):
        if k in body and (not isinstance(body[k],str) or len(body[k])>2048):fail('INVALID_P5_REQUEST','Invalid identity field')
    if 'threadId' in body:
        try:uuid.UUID(body['threadId'])
        except (ValueError,TypeError,AttributeError):fail('INVALID_P5_REQUEST','Invalid Thread identity')
    if 'idempotencyKey' in body:name(body['idempotencyKey'])
    if 'graphPath' in body and (not isinstance(body['graphPath'],list) or len(body['graphPath'])>20 or any(not isinstance(x,str) for x in body['graphPath'])):fail('INVALID_GRAPH_PATH','Invalid child path')

async def operation(body,registry):
    validate_request(body)
    from .storage import Storage
    from .credentials import assert_no_secrets
    from .compiler import graph_for,encode_patch,decode_state
    owner=body['ownerId'];action=body.get('action');storage=Storage(os.environ['WORKFLOW_DATABASE_URL'])
    if action=='threads':
        items=await storage.call('p5_read',owner,'threads',body['workflowId'])
        return {'items':items,'limits':LIMITS}
    if action in ('memory.list','memory.put','memory.delete'):
        from .registry import requested_variable_environment
        env=registry.environment(body['environmentRef'],owner,requested_variable_environment(body))
        workflow=body['workflowId']
        # Even shared memory management requires an owner-visible workflow identity.
        allowed=await storage.call('p5_workflow',owner,workflow)
        if not allowed:fail('NOT_FOUND','Workflow not found','auth')
        ns=namespace(owner,body['environmentRef'],workflow,body.get('scope','workflow'),body.get('collection','default'))
        async with connection() as conn:
            if action=='memory.list':
                offset=integer(body.get('offset',0),0,10000)
                await expire_memory(conn,ns)
                items=await AsyncPostgresStore(conn).asearch(ns,limit=51,offset=offset,refresh_ttl=False)
                # Official prefix search is filtered to exact authorized collection.
                items=[i for i in items if tuple(i.namespace)==ns]
                return {'items':[{'key':i.key,**{'found':not i.value.get('deleted',False),'value':i.value.get('data'),'version':i.value['version']},'updatedAt':i.updated_at.isoformat()} for i in items[:50]],'nextOffset':offset+50 if len(items)>50 else None}
            key=name(body.get('key'));integer(body.get('expectedVersion'),0,2147483647);ttl=integer(body.get('ttlMinutes',1440),1,LIMITS['storeTtlMinutes'])
            assert_no_secrets(body.get('value'),env)
            if len(canonical(body.get('value')))>LIMITS['itemBytes']:fail('MEMORY_TOO_LARGE','Memory item exceeds 16 KiB')
            request_key=body.get('idempotencyKey');name(request_key);hash_=digest(body)
            async with conn.transaction():
                await conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))',(owner,))
                prior=await (await conn.execute('select hash,result from workflow_private.p5_requests where owner_user_id=%s and key=%s',(owner,request_key))).fetchone()
                if prior:
                    if prior['hash']!=hash_:fail('IDEMPOTENCY_CONFLICT','Request payload changed')
                    return prior['result']
                result=await memory_write(conn,ns,key,body.get('value'),body['expectedVersion'],'put' if action=='memory.put' else 'delete',ttl)
                await conn.execute('insert into workflow_private.p5_requests(owner_user_id,key,hash,result) values(%s,%s,%s,%s)',(owner,request_key,hash_,Jsonb(result)))
                return result
    data,env=await load(owner,body['threadId'],registry);t=data['thread'];d=data['definition']
    if action=='next':
        value=body['input'];assert_no_secrets(value,env);validate_value(d['inputSchema'],value,'INVALID_RUN_INPUT')
        if len(canonical(value))>d['policy']['maxInputBytes']:fail('INPUT_TOO_LARGE','Input exceeds budget')
        return await storage.call('p5_start',owner,t['thread_id'],body['checkpointId'],value,'next',body['idempotencyKey'],digest(body))
    async with connection() as conn:
        saver=HistorySaver(conn)
        if action=='history':
            records=[]
            sd,path=scope_definition(d,body.get('namespace',''))
            if body.get('graphPath') is not None and body['graphPath']!=path:fail('INVALID_GRAPH_PATH','Namespace and graph path do not match')
            before=config(t['thread_id'],body.get('namespace',''),body['before']) if body.get('before') else None
            async for cp in saver.alist(config(t['thread_id'],body.get('namespace','')),before=before,limit=21):
                state=decode_state(sd,cp.checkpoint['channel_values']);assert_no_secrets(state,env)
                records.append({'checkpointId':cp.config['configurable']['checkpoint_id'],'namespace':cp.config['configurable'].get('checkpoint_ns',''),'createdAt':cp.checkpoint['ts'],'step':cp.metadata.get('step'),'source':cp.metadata.get('source'),'state':state,'parentCheckpointId':cp.parent_config['configurable'].get('checkpoint_id') if cp.parent_config else None})
            scopes=await (await conn.execute("select distinct checkpoint_ns from workflow_checkpoints.checkpoints where thread_id=%s order by checkpoint_ns limit 100",(t['thread_id'],))).fetchall()
            scope_items=[]
            for row in scopes:
                _,path=scope_definition(d,row['checkpoint_ns']);scope_items.append({'namespace':row['checkpoint_ns'],'graphPath':path})
            return {'interface':{'inputSchema':d['inputSchema'],'stateSchema':sd['state']['schema'],'nodes':[{'id':n['id'],'label':n['label']} for n in sd['nodes']]},'scopes':scope_items,'items':records[:20],'nextCursor':records[19]['checkpointId'] if len(records)>20 else None,'thread':{k:v for k,v in t.items() if k not in ('snapshot','launch_context')}}
        if action=='prepare':
            # An already accepted preview remains idempotent when new-start
            # preconditions (active source or uncertain effects) later change.
            async with conn.transaction():
                await conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))',(owner,))
                prior=await (await conn.execute('select hash,result from workflow_private.p5_requests where owner_user_id=%s and key=%s',(owner,body['idempotencyKey']))).fetchone()
                if prior:
                    if prior['hash']!=digest(body):fail('IDEMPOTENCY_CONFLICT','Request payload changed')
                    return prior['result']
            if await storage.call('p5_unknown_effects',owner,t['thread_id']):fail('EXTERNAL_EFFECT_UNCERTAIN','Source has an uncertain external write; replay is blocked','policy')
            source_id=body['checkpointId'];cp=await saver.aget_tuple(config(t['thread_id'],'',source_id))
            if not cp:fail('CHECKPOINT_MISSING','Source checkpoint is missing')
            if t['status']=='active':fail('THREAD_STATE_CONFLICT','Wait until the active execution has stopped')
            updates=body.get('updates',[])
            if not isinstance(updates,list) or len(updates)>LIMITS['bulkUpdates']:fail('INVALID_HISTORY_UPDATE','At most 20 explicit updates')
            assert_no_secrets(updates,env);target=str(uuid.uuid4())
            key=body['idempotencyKey'];name(key);hash_=digest(body)
            async with conn.transaction():
                await conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))',(owner,))
                prior=await (await conn.execute('select hash,result from workflow_private.p5_requests where owner_user_id=%s and key=%s',(owner,key))).fetchone()
                if prior:
                    if prior['hash']!=hash_:fail('IDEMPOTENCY_CONFLICT','Request payload changed')
                    return prior['result']
                clone=create_checkpoint(cp.checkpoint,None,cp.metadata.get('step',0))
                source_input=cp.checkpoint['channel_values'].get('eduflow_graph_input',cp.checkpoint['channel_values'].get('__start__',{}).get('eduflow_graph_input'))
                if source_input is None:fail('CHECKPOINT_INPUT_MISSING','Source round input is not available; do not substitute the latest input')
                assert_no_secrets(source_input,env);validate_value(d['inputSchema'],source_input,'INVALID_RUN_INPUT')
                # Pending writes/receipts are deliberately not copied; pending tasks are re-executed with new identity.
                values=copy.deepcopy(clone['channel_values']);clone['channel_values']=values
                await conn.execute('select workflow_private.p5_branch(%s,%s,%s,%s,%s)',(owner,t['thread_id'],target,source_id,Jsonb(decode_state(d,values))))
                await conn.execute('select workflow_private.p5_branch_input(%s,%s,%s)',(owner,target,Jsonb(source_input)))
                async def forbidden(*_):fail('HISTORY_EXECUTION_FORBIDDEN','History updates never execute nodes')
                graph=graph_for(d,forbidden,t['snapshot']['compile_fingerprint'],checkpointer=saver)
                upper_row=await (await conn.execute("select checkpoint_id from workflow_checkpoints.checkpoints where thread_id=%s and checkpoint_ns='' and checkpoint_id>%s order by checkpoint_id limit 1",(t['thread_id'],source_id))).fetchone()
                scope_map=[]
                cfg=await clone_scopes(d,saver,config(t['thread_id'],'',source_id),config(target),conn,t['snapshot']['compile_fingerprint'],upper_row,scope_map=scope_map,owner=owner,root_checkpoint=source_id)
                selected_scopes={u.get('namespace','') for u in updates if isinstance(u,dict)}
                if len(selected_scopes)>1:fail('MIXED_UPDATE_SCOPES','One atomic batch updates one graph scope; prepare a separate branch for another scope')
                ns=next(iter(selected_scopes),'')
                mapping=next((m for m in scope_map if m['source']==ns),None)
                if mapping is None:fail('HISTORY_SCOPE_UNAVAILABLE','The selected child is not pending at this root checkpoint')
                sd=mapping['definition'];_,path=scope_definition(d,ns)
                names={n['id']:'eduflow_node_'+str(i) for i,n in enumerate(sorted(sd['nodes'],key=lambda n:n['id']))}
                bulk=[]
                for update in updates:
                    if not isinstance(update,dict) or set(update)-{'values','afterNodeId','overwrite','namespace','graphPath'}:fail('INVALID_HISTORY_UPDATE','Provide State patch and a real preceding node')
                    if update.get('graphPath',path)!=path:fail('INVALID_GRAPH_PATH','Namespace and graph path do not match')
                    patch=update.get('values');after=update.get('afterNodeId')
                    if not isinstance(patch,dict) or set(patch)-set(sd['state']['schema'].get('properties',{})) or after not in names:fail('INVALID_HISTORY_UPDATE','Choose declared State fields and node')
                    for field,value in patch.items():validate_value(sd['state']['schema']['properties'][field],value,'INVALID_STATE_UPDATE')
                    over=update.get('overwrite',[])
                    if not isinstance(over,list) or set(over)-set(patch):fail('INVALID_HISTORY_UPDATE','Overwrite only declared updated fields')
                    if path and over:
                        parent=scoped_definition(d,path[:-1]);child=next(n for n in parent['nodes'] if n['id']==path[-1])
                        if child['config'].get('stateMode')=='shared':fail('INVALID_OVERWRITE','Shared child overwrite remains unsupported')
                    bulk.append([(encode_patch(sd,{'config':{'authoring':{'overwrite':over}}},patch),names[after],None)])
                changed_scope=None
                if bulk:
                    target_graph=graph_for(sd,forbidden,t['snapshot']['compile_fingerprint'],checkpointer=saver)
                    target_cfg={**mapping['config'],'configurable':{**mapping['config']['configurable'],'__pregel_checkpointer':saver}}
                    prior_scope=await saver.aget_tuple(mapping['config'])
                    for superstep in bulk:
                        updated_cfg=await target_graph.abulk_update_state(target_cfg,[superstep])
                        updated_scope=await saver.aget_tuple(updated_cfg)
                        intermediate=decode_state(sd,updated_scope.checkpoint['channel_values'])
                        validate_value(sd['state']['schema'],intermediate,'INVALID_STATE_UPDATE');assert_no_secrets(intermediate,env)
                        if len(canonical(intermediate))>d['policy']['maxStateBytes']:fail('STATE_TOO_LARGE','Intermediate State exceeds limit')
                        # Each readable checkpoint must remain valid and retain child references.
                        updated_meta={**updated_scope.metadata,'eduflowChildCheckpoints':prior_scope.metadata.get('eduflowChildCheckpoints',{})}
                        await saver.aput(updated_scope.parent_config or config(target,mapping['target']),updated_scope.checkpoint,updated_meta,{})
                        target_cfg={**updated_cfg,'configurable':{**updated_cfg['configurable'],'__pregel_checkpointer':saver}}
                    if ns:
                        parent_ns=mapping['target'].rpartition('|')[0]
                        parent_mapping=next(m for m in scope_map if m['target']==parent_ns)
                        parent_scope=await saver.aget_tuple(parent_mapping['config'])
                        heads={**parent_scope.metadata.get('eduflowChildCheckpoints',{}),mapping['target']:updated_cfg['configurable']['checkpoint_id']}
                        await saver.aput(parent_scope.parent_config or config(target,parent_ns),parent_scope.checkpoint,{**parent_scope.metadata,'eduflowChildCheckpoints':heads},{})
                    changed=await target_graph.aget_state({**updated_cfg,'configurable':{**updated_cfg['configurable'],'__pregel_checkpointer':saver}})
                    changed_state=decode_state(sd,changed.values);validate_value(sd['state']['schema'],changed_state,'INVALID_STATE_UPDATE');assert_no_secrets(changed_state,env)
                    if len(canonical(changed_state))>d['policy']['maxStateBytes']:fail('STATE_TOO_LARGE','Child State exceeds limit')
                    changed_scope={'graphPath':path,'namespace':mapping['target'],'state':changed_state}
                    if not ns:cfg=updated_cfg
                names={n['id']:'eduflow_node_'+str(i) for i,n in enumerate(sorted(d['nodes'],key=lambda n:n['id']))}
                snap=await graph.aget_state(cfg);state=decode_state(d,snap.values);assert_no_secrets(state,env);validate_value(d['state']['schema'],state,'INVALID_STATE_UPDATE')
                if len(canonical(state))>d['policy']['maxStateBytes']:fail('STATE_TOO_LARGE','Derived State exceeds limit')
                await conn.execute('select workflow_private.p5_head(%s,%s,%s,%s)',(owner,target,cfg['configurable']['checkpoint_id'],Jsonb(state)))
                result={'threadId':target,'checkpointId':cfg['configurable']['checkpoint_id'],'sourceThreadId':t['thread_id'],'sourceCheckpointId':source_id,'before':decode_state(d,cp.checkpoint['channel_values']),'after':state,'next':[next((n['id'] for n in d['nodes'] if names[n['id']]==x),x) for x in snap.next],'status':'prepared','changedScope':changed_scope,'scopes':[{'namespace':m['source'],'graphPath':scope_definition(d,m['source'])[1]} for m in scope_map],'externalEffectWarning':True}
                await conn.execute('insert into workflow_private.p5_requests(owner_user_id,key,hash,result) values(%s,%s,%s,%s)',(owner,key,hash_,Jsonb(result)))
                await conn.execute('insert into workflow_private.p5_audit(owner_user_id,thread_id,operation,details) values(%s,%s,%s,%s)',(owner,target,'prepare',Jsonb(result)))
                return result
        if action=='branch.start':
            if body.get('confirmExternalEffects') is not True:fail('EXTERNAL_EFFECT_CONFIRMATION_REQUIRED','Confirm the displayed replay and memory effects','policy')
            return await storage.call('p5_start',owner,t['thread_id'],body['checkpointId'],t['snapshot']['input'],'branch',body['idempotencyKey'],digest(body))
    fail('INVALID_P5_OPERATION','Unknown operation')
