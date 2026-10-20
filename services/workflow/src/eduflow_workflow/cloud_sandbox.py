"""Thin Vercel Sandbox SDK adapter, retaining the Local OCI execution contract."""
import asyncio
import json
import os
import sys
from pathlib import Path
import time
import uuid
from contextlib import aclosing
from .contracts import ExecutionError, canonical


async def available():
    from vercel import sandbox
    image = os.environ.get('WORKFLOW_SANDBOX_IMAGE', '')
    if '@sha256:' not in image: return {'python': False, 'javascript': False}
    # API-only readiness probe; never creates a billable VM to answer /ready.
    async with aclosing(sandbox.query_sandboxes(page_size=1)) as boxes:
        async for box in boxes: break
    return {'python': True, 'javascript': True}


async def run_code(language, code, arguments, context, timeout=30, guard=None):
    from vercel import sandbox
    from .sandbox import PYTHON, JAVASCRIPT, LIMITS
    if language not in {'python','javascript'}: raise ExecutionError('UNSUPPORTED_LANGUAGE','Choose Python or JavaScript')
    payload = canonical({'code':code,'input':arguments,'context':context,
                         'language':language,'wrapper':PYTHON if language=='python' else JAVASCRIPT})
    if len(canonical({'code':code,'input':arguments,'context':context}))>131072:
        raise ExecutionError('CODE_INPUT_TOO_LARGE','Code and input exceed 128 KiB','policy')
    image = os.environ.get('WORKFLOW_SANDBOX_IMAGE','')
    if '@sha256:' not in image: raise ExecutionError('SANDBOX_UNAVAILABLE','Pinned isolated runtime is unavailable','infrastructure',effect='none')
    seconds=max(1,min(30,int(timeout+0.999)))
    stage = 'create'
    diagnostic_id = uuid.uuid4().hex
    completed_output = None
    sandbox_name = None
    try:
        async with sandbox.create_sandbox(image=image, resources=sandbox.SandboxResources(vcpus=1),
                execution_time_limit=seconds+10, persistent=False, network_policy=sandbox.NetworkPolicy.deny_all(),
                region='sin1', name='eduflow-code-'+uuid.uuid4().hex,
                tags={'purpose':'eduflow-workflow-ephemeral'}) as box:
            sandbox_name = box.name
            stage = 'payload'
            base='/home/sandbox'
            await box.fs.write_bytes(base+'/input.json',payload,mode=0o600)
            await box.fs.write_bytes(base+'/launcher.py',Path(__file__).with_name('cloud_launcher.py').read_bytes(),mode=0o600)
            stage = 'launch'
            process=await box.create_process('/usr/local/bin/python3',['-I',base+'/launcher.py',base+'/input.json'],
                sudo=True,kill_after=seconds+5)
            async def bounded(stream):
                chunks=[];size=0
                while chunk:=await stream.read(8192):
                    size+=len(chunk.encode('utf-8'))
                    if size>LIMITS['outputBytes']: raise ExecutionError('SANDBOX_OUTPUT_LIMIT','Isolated output exceeds 64 KiB','policy',effect='none')
                    chunks.append(chunk)
                return ''.join(chunks)
            stage = 'execution'
            readers=[asyncio.create_task(bounded(process.stdout)),asyncio.create_task(bounded(process.stderr))]
            async def collect():
                out,err=await asyncio.gather(*readers)
                status=await process.wait()
                return out,err,status
            task=asyncio.create_task(collect())
            started=time.monotonic()
            try:
                while not task.done():
                    if guard: await guard()
                    if time.monotonic()-started>seconds+5: raise ExecutionError('NODE_TIMEOUT','Isolated execution exceeded its deadline','timeout',effect='none')
                    await asyncio.wait({task},timeout=.2)
                out,err,status=await task
            finally:
                task.cancel()
                for reader in readers: reader.cancel()
                await asyncio.gather(task,*readers,return_exceptions=True)
                await process.stdout.aclose()
                await process.stderr.aclose()
            if status in (124,137,-9): raise ExecutionError('SANDBOX_RESOURCE_LIMIT','Isolated time or memory limit reached','policy',effect='none')
            stage = 'result'
            try: response=json.loads(out)
            except ValueError:
                print(json.dumps({'event':'workflow.sandbox.invalid_result','diagnosticId':diagnostic_id,'stage':stage,'exitCode':status}),file=sys.stderr,flush=True)
                raise ExecutionError('SANDBOX_UNAVAILABLE' if status else 'INVALID_CODE_OUTPUT','Isolated execution could not produce a valid result','infrastructure' if status else 'validation',effect='none') from None
            if status or 'error' in response:
                raise ExecutionError('CODE_SYNTAX_ERROR' if response.get('error')=='SyntaxError' else 'CODE_EXECUTION_FAILED',
                    'Isolated code failed: '+str(response.get('error','execution error')),'code',effect='none')
            if not isinstance(response.get('output'),dict): raise ExecutionError('INVALID_CODE_OUTPUT','Function must return a JSON object','validation',effect='none')
            completed_output = response['output']
            return completed_output
    except ExecutionError as error:
        if error.code == 'SANDBOX_UNAVAILABLE': error.diagnostic_id = diagnostic_id
        raise
    except asyncio.CancelledError: raise
    except Exception as error:
        # A second independent cleanup may win after a valid pure-code result.
        # Only an exact SDK cleanup 404/410 plus confirmed absence is idempotent.
        cause = getattr(error, 'cause', None)
        if (completed_output is not None and sandbox_name
                and isinstance(error, sandbox.SandboxCleanupError)
                and isinstance(cause, sandbox.SandboxApiError)
                and cause.status_code in (404,410)):
            try:
                remaining = await sandbox.get_sandbox(name=sandbox_name)
                absent = str(remaining.status) == 'deleted'
            except sandbox.SandboxApiError as probe:
                absent = probe.status_code in (404,410)
            except Exception:
                absent = False
            if absent: return completed_output
        # SDK exception messages/headers may contain credentials. Only a class and
        # trusted execution stage enter operator logs; user code/input never does.
        kind = ''.join(c for c in type(error).__name__ if c.isalnum() or c=='_')[:64]
        print(json.dumps({'event':'workflow.sandbox.unavailable','diagnosticId':diagnostic_id,'stage':stage,'errorType':kind,'causeType':''.join(c for c in type(cause).__name__ if c.isalnum() or c=='_')[:64], 'httpStatus':getattr(cause,'status_code',None) if isinstance(cause,sandbox.SandboxApiError) else None}),file=sys.stderr,flush=True)
        failure=ExecutionError('SANDBOX_UNAVAILABLE','The hosted isolated execution environment is unavailable','infrastructure',effect='none')
        failure.diagnostic_id=diagnostic_id
        raise failure from None


async def reap():
    from vercel import sandbox
    deleted=0
    async with aclosing(sandbox.query_sandboxes(page_size=20)) as boxes:
        for _ in range(20):
            if deleted>=5: break
            try: box=await anext(boxes)
            except StopAsyncIteration: break
            if not ((box.name or '').startswith('eduflow-code-') and (box.tags or {}).get('purpose')=='eduflow-workflow-ephemeral' and str(box.status) in {'stopped','failed'}): continue
            changed = box.status_updated_at or box.updated_at or box.created_at
            if changed is None: continue
            changed = changed/1000 if changed>100000000000 else changed
            # Let the official context manager finish its stop/destroy sequence.
            if time.time()-changed < 5: continue
            deleted+=1
            try:
                await box.destroy()
            except sandbox.SandboxApiError as error:
                if error.status_code not in (404,410): raise
