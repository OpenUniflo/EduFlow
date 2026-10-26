"""Authenticated, internal-only compiler/catalog boundary."""
import copy
import hmac
import json
import os
from fastapi import FastAPI, Request, HTTPException
from .compiler import compile_definition, envelope, validate_structure
from .contracts import ExecutionError, VERSION, digest, validate_value, canonical, bind, DEPENDENCY_MANIFEST
from .registry import Registry, HARD_LIMITS, OPERATIONS, requested_variable_environment, restore_frozen_environment
from .tools import discover
from .credentials import assert_no_secrets
from .support import stategraph_support

registry=Registry()
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

def refresh():
    path=os.environ.get("WORKFLOW_ENVIRONMENTS_FILE")
    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') == 'hosted':
        import time
        if time.monotonic() - getattr(registry, '_refreshed_at', -100) >= 5:
            from .operations import assert_hosted_configuration
            assert_hosted_configuration()
            new=Registry(); registry.environments=new.environments
            registry._refreshed_at=time.monotonic()
        return
    if not path: return
    from pathlib import Path
    catalog=os.environ.get("WORKFLOW_CATALOG_FILE")
    stamp=(Path(path).stat().st_mtime_ns,Path(catalog).stat().st_mtime_ns if catalog and Path(catalog).exists() else 0)
    if getattr(registry,"_file_stamp",None)!=stamp:
        new=Registry(); registry.environments=new.environments
    registry._file_stamp=stamp


@app.middleware("http")
async def authenticate(request:Request,call_next):
    token=os.environ.get("WORKFLOW_INTERNAL_TOKEN")
    if not token or not hmac.compare_digest(request.headers.get("authorization",""),"Bearer "+token):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=401,content={"error":{"code":"UNAUTHORIZED","message":"Service identity required"}})
    if int(request.headers.get("content-length","0"))>2097152:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=413,content={"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request exceeds limit"}})
    refresh()
    return await call_next(request)

@app.exception_handler(ExecutionError)
async def execution_error(request,error):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=422,content={"error":error.dto()})

@app.exception_handler(404)
async def unknown_route(request, error):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=404,content={"error":{"code":"UNKNOWN_INTERNAL_ROUTE","message":"Internal service route is unavailable"},"path":request.scope.get('path'),"rootPath":request.scope.get('root_path')})

@app.get("/health")
async def health(): return {"status":"ok","protocolVersion":"1","compilerVersion":VERSION}

@app.get("/ready")
async def ready():
    from .operations import readiness
    from fastapi.responses import JSONResponse
    result = await readiness()
    return JSONResponse(status_code=200 if result["status"]=="ready" else 503,content=result)

@app.get("/v1/runner-status")
async def runner_status():
    # New Run admission only needs "any Worker recently signalled"; version skew
    # between a Preview compiler and the Production Worker must not block it.
    from .operations import runner_status as read_runner_status
    return await read_runner_status()

@app.get("/v1/cache-info")
async def worker_cache_info():
    from pathlib import Path
    path=os.environ.get("WORKFLOW_CACHE_INFO_FILE")
    if not path and os.environ.get("WORKFLOW_CATALOG_FILE"): path=os.environ["WORKFLOW_CATALOG_FILE"]+".cache-info.json"
    if not path: return {"available":False}
    try: payload=json.loads(Path(path).read_text())
    except (OSError,ValueError): return {"available":False}
    if payload.get("executorDigest")!=DEPENDENCY_MANIFEST["executorDigest"]: return {"available":False}
    counters=payload.get("cacheInfo",{})
    if any(not isinstance(counters.get(key),int) or isinstance(counters.get(key),bool) or counters[key]<0 for key in ("hits","misses","maxsize","currsize")): return {"available":False}
    return {"available":True,"source":"worker","cacheInfo":{key:counters[key] for key in ("hits","misses","maxsize","currsize")},"observedAt":payload.get("observedAt"),"processId":payload.get("processId"),"executorDigest":payload["executorDigest"]}

@app.get("/capabilities")
async def capabilities(): return {"protocolVersion":"1","nodes":registry.nodes,"operations":OPERATIONS,"features":["serial","bounded-loop","live","polling"],"limits":HARD_LIMITS,"dependencyManifest":DEPENDENCY_MANIFEST,"stategraph":stategraph_support()}

@app.post("/v1/catalog")
async def catalog(body:dict):
    owner=body["ownerId"]
    envs=[env for env in registry.environments if registry.environment_allowed(env,owner)]
    variable_environment_id=requested_variable_environment(body)
    if body.get("environmentRef"):
        env=registry.environment(body["environmentRef"],owner,variable_environment_id)
        return {"items":registry.public_tools(env),"nextCursor":None,"environment":registry.public_environment(env)}
    return {"items":[registry.public_environment(registry.environment(env["ref"],owner,variable_environment_id)) for env in envs]}

@app.post("/v1/discover")
async def discovery(body:dict):
    env=registry.environment(body["environmentRef"],body["ownerId"],requested_variable_environment(body))
    try:
        tools=await discover(registry,env,body["connectorRef"])
    except ExecutionError:
        raise
    except Exception:
        raise ExecutionError("CONNECTOR_UNAVAILABLE","MCP connector cannot be reached","infrastructure",effect="none") from None
    path=os.environ.get("WORKFLOW_CATALOG_FILE")
    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') == 'hosted':
        from .storage import Storage
        connector=next(c for c in env['connectors'] if c['ref']==body['connectorRef'])
        await Storage(os.environ['WORKFLOW_DATABASE_URL']).call('p6_catalog_put',
            env['ref']+':'+connector['ref'],digest(connector),tools)
        registry._refreshed_at=-100
        refresh();env=registry.environment(env['ref'],body['ownerId'])
    elif path:
        from pathlib import Path
        connector=next(c for c in env["connectors"] if c["ref"]==body["connectorRef"])
        catalog=json.loads(Path(path).read_text()) if Path(path).exists() else {}
        catalog[env["ref"]+":"+connector["ref"]]={"connectorDigest":digest(connector),"tools":tools}
        temporary=Path(path+".tmp");temporary.write_text(json.dumps(catalog));temporary.replace(path)
        # Reload so all process roles observe the same catalog revision.
        refresh();env=registry.environment(body["environmentRef"],body["ownerId"])
    return {"items":registry.public_tools(env),"nextCursor":None,"environment":registry.public_environment(env)}

@app.post("/v1/document")
async def document(body:dict):
    definition=body["definition"]; envelope(definition)
    result=validate_structure(definition,registry.nodes,OPERATIONS)
    return {"definitionHash":digest(definition),"structuralValidity":result["valid"],"diagnostics":result["diagnostics"]}

@app.post("/v1/hash")
async def hash_value(body:dict): return {"digest":digest(body["value"])}

@app.post("/v1/validate")
async def validation(body:dict):
    # Authorization is always fresh. This endpoint performs no save, enqueue,
    # provider construction, model invocation, discovery or tool execution.
    env=registry.environment(body["environmentRef"],body["ownerId"],requested_variable_environment(body))
    definition=body["definition"]
    assert_no_secrets(definition,env)
    snapshot=registry.snapshot(env)
    structure=validate_structure(definition,registry.nodes,OPERATIONS)
    diagnostics=[{**item,"scope":"definition"} for item in structure["diagnostics"]]
    result=structure
    environment_ready=False
    if structure["valid"]:
        result=compile_definition(definition,snapshot)
        # Authoring warnings are already reported by structure validation; only
        # blocking environment diagnostics decide readiness.
        diagnostics.extend({**item,"scope":"environment"} for item in result["diagnostics"] if item.get("severity","error")=="error")
        for node in definition["nodes"]:
            if node["type"]=="core.llm":
                config=node["config"]
                if not any(p["ref"]==config["providerRef"] and config["modelRef"] in p["modelRefs"] and (not p.get("secretRef") or p["secretRef"].startswith("vault:") or os.environ.get(p["secretRef"])) for p in env["providers"]):
                    diagnostics.append({"code":"MODEL_UNAVAILABLE","severity":"error","scope":"environment","nodeId":node["id"],"pointer":"/nodes/"+node["id"]+"/config/modelRef","message":"Model or credential reference unavailable"})
        for key,limit in env["limits"].items():
            if definition["policy"].get(key,0)>limit:
                diagnostics.append({"code":"POLICY_LIMIT_EXCEEDED","severity":"error","scope":"environment","pointer":"/policy/"+key,"message":"Environment limit exceeded"})
        environment_ready=not any(item["scope"]=="environment" and item.get("severity","error")=="error" for item in diagnostics)
    input_check="unchecked"
    if "input" in body and structure["valid"]:
        input_check=True
        try:
            assert_no_secrets(body["input"],env)
            validate_value(definition["inputSchema"],body["input"],"INVALID_RUN_INPUT")
            state={**copy.deepcopy(definition["state"]["initial"]),**bind(definition["state"]["inputBindings"],body["input"],{})}
            validate_value(definition["state"]["schema"],state,"INVALID_INITIAL_STATE")
            if len(canonical(body["input"]))>definition["policy"]["maxInputBytes"]: raise ExecutionError("INPUT_TOO_LARGE","Input exceeds budget","policy")
            if len(canonical(state))>definition["policy"]["maxStateBytes"]: raise ExecutionError("STATE_TOO_LARGE","Initial state exceeds budget","policy")
        except ExecutionError as error:
            input_check=False
            diagnostic={"code":error.code,"severity":"error","scope":"definition" if error.code=="INVALID_INITIAL_STATE" else "input","message":str(error)}
            if error.pointer is not None: diagnostic["pointer"]=("/state/initial" if error.code=="INVALID_INITIAL_STATE" else "")+error.pointer
            diagnostics.append(diagnostic)
    valid=structure["valid"] and environment_ready and input_check is not False
    return {**result,"valid":valid,"diagnostics":diagnostics,"checks":{"structure":structure["valid"],"environment":environment_ready,"input":input_check},"environmentReadiness":"ready" if environment_ready else "not_ready","environmentRevision":env["revision"],"variableEnvironment":env.get("variableEnvironment"),"variableEnvironmentId":env.get("variableEnvironmentId"),"registrySnapshot":snapshot,**({"definitionHash":digest(definition)} if structure["valid"] else {})}

_node_test_slots=None
@app.post("/v1/test-node")
async def node_test(body:dict):
    import asyncio
    from .node_test import test_node
    global _node_test_slots
    if _node_test_slots is None: _node_test_slots=asyncio.Semaphore(2)
    if _node_test_slots.locked(): raise HTTPException(429,"Node test capacity reached")
    async with _node_test_slots:
        return await test_node(body,registry)


@app.post('/v1/resume-validate')
async def resume_validation(body:dict):
    from .interrupts import validate_resume
    thread=body['thread']; snapshot=thread['snapshot']; definition=body['definition']
    env=registry.environment(snapshot['environment_ref'],body['ownerId'])
    # Ordinary workspace values and the variable environment selection are frozen;
    # authorization/catalog identity stays fresh.
    restore_frozen_environment(env,snapshot['registry_snapshot'])
    result=compile_definition(definition,registry.snapshot(env))
    if not result['valid'] or result['compileFingerprint']!=snapshot['compile_fingerprint'] or env['revision']!=snapshot['environment_revision']:
        raise ExecutionError('COMPILE_FINGERPRINT_CHANGED','Frozen checkpoint executor or authorization has changed')
    await assert_checkpoints(thread)
    validate_resume(definition,thread,body['responses'],env)
    return {'valid':True}


async def assert_checkpoints(thread):
    from psycopg import AsyncConnection
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg.rows import dict_row
    async with await AsyncConnection.connect(os.environ['WORKFLOW_DATABASE_URL'],connect_timeout=5, tcp_user_timeout=20000,autocommit=True,row_factory=dict_row,options='-c search_path=workflow_checkpoints -c statement_timeout=15000 -c lock_timeout=3000') as connection:
        saver=AsyncPostgresSaver(connection)
        root=await saver.aget_tuple({'configurable':{'thread_id':str(thread['thread_id']),'checkpoint_ns':'','checkpoint_id':thread['checkpoint_id']}})
        if root is None: raise ExecutionError('CHECKPOINT_MISSING','The persisted root checkpoint is missing; execution was not restarted')
        for item in thread.get('interrupts',[]):
            ns=item.get('namespace',''); ns=ns.rsplit('|',1)[0] if '|' in ns else ''
            if not ns or not item.get('checkpointId'): continue
            scoped=await saver.aget_tuple({'configurable':{'thread_id':str(thread['thread_id']),'checkpoint_ns':ns,'checkpoint_id':item['checkpointId']}})
            if scoped is None: raise ExecutionError('CHECKPOINT_MISSING','The persisted subgraph checkpoint is missing; execution was not restarted')


@app.post('/v1/extensions')
async def extensions(body:dict):
    from .extensions import catalog_operation
    return await catalog_operation(body,registry)

@app.post('/v1/p5')
async def p5_operation(body:dict):
    from .session_memory_history import operation
    try:return await operation(body,registry)
    except ExecutionError:raise
    except Exception as error:
        code=getattr(getattr(error,'diag',None),'message_primary','')
        allowed={'CHECKPOINT_MISSING','NOT_FOUND','THREAD_STATE_CONFLICT','IDEMPOTENCY_CONFLICT','WORKFLOW_ARCHIVED','THREAD_QUOTA_EXCEEDED','RUN_QUOTA_EXCEEDED','ROUND_BUDGET_EXCEEDED','LEASE_LOST','MEMORY_VERSION_CONFLICT'}
        raise ExecutionError(code if code in allowed else 'P5_OPERATION_FAILED','The operation could not be completed safely','validation' if code in allowed else 'infrastructure',effect='none') from None
