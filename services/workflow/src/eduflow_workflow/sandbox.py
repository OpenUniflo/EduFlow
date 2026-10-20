"""Local OCI execution. Docker's Linux VM owns isolation; no host eval or mounts."""
import asyncio
import json
import uuid
import time
from .contracts import ExecutionError, canonical

IMAGES = {
    'python': 'python@sha256:f6a589d43c42b9e7f7dc67a12d37132491f362859a5d750607710cc56da3bc72',
    'javascript': 'node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402',
}
LIMITS = {'memoryMb':256,'cpus':0.5,'pids':32,'tmpMb':16,'outputBytes':65536,'maxSeconds':30}
PYTHON = """import sys,json,contextlib,io,traceback
p=json.loads(sys.stdin.read())
scope={}
try:
 with contextlib.redirect_stdout(io.StringIO()):
  exec(compile(p['code'],'<workflow>','exec'),scope)
  result=scope['process'](p['input'],p['context'])
 print(json.dumps({'output':result},allow_nan=False))
except Exception as e:
 line=getattr(e,'lineno',None) or next((f.lineno for f in reversed(traceback.extract_tb(e.__traceback__)) if f.filename=='<workflow>'),None)
 print(json.dumps({'error':type(e).__name__,'detail':str(e)[:200],'line':line}))
 sys.exit(2)
"""
JAVASCRIPT = """const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{try {const fn=new Function(p.code+';return process;')();
 const output=await fn(p.input,p.context);fs.writeSync(1,JSON.stringify({output}));
}catch(e){fs.writeSync(1,JSON.stringify({error:e.name,detail:String(e.message).slice(0,200)}));process.exitCode=2;}})();"""

async def command(*args, timeout=10):
    try:
        p=await asyncio.create_subprocess_exec('docker',*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        out,err=await asyncio.wait_for(p.communicate(),timeout)
    except (OSError,asyncio.TimeoutError):
        if 'p' in locals() and p.returncode is None:
            p.kill(); await p.wait()
        raise ExecutionError('SANDBOX_UNAVAILABLE','The isolated execution environment is unavailable','infrastructure',effect='none') from None
    return p.returncode,out,err

async def available():
    import os
    if os.environ.get("WORKFLOW_SANDBOX_BACKEND") == "vercel":
        from .cloud_sandbox import available as cloud_available
        return await cloud_available()
    result={}
    for language,image in IMAGES.items():
        code,_,_=await command('image','inspect',image)
        result[language]=code==0
    return result

async def run_code(language,code,arguments,context,timeout=30,guard=None):
    import os
    if os.environ.get("WORKFLOW_SANDBOX_BACKEND") == "vercel":
        from .cloud_sandbox import run_code as cloud_run
        return await cloud_run(language,code,arguments,context,timeout,guard)
    if language not in IMAGES: raise ExecutionError('UNSUPPORTED_LANGUAGE','Choose Python or JavaScript')
    payload=canonical({'code':code,'input':arguments,'context':context})
    if len(payload)>131072: raise ExecutionError('CODE_INPUT_TOO_LARGE','Code and input exceed 128 KiB','policy')
    name='eduflow-p4-'+uuid.uuid4().hex
    seconds=max(1,min(30,int(timeout+0.999)))
    # The in-container timeout survives a caller/Worker crash. --rm removes it on exit.
    args=['run','--rm','--name',name,'--label','eduflow.p4=ephemeral','--label','eduflow.p4.deadline='+str(time.time()+seconds+10),'--pull=never','--network=none','--read-only',
          '--user','65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges',
          '--memory=256m','--memory-swap=256m','--cpus=0.5','--pids-limit=32',
          '--tmpfs','/tmp:rw,noexec,nosuid,size=16m,mode=1777','--ulimit','nofile=64:64',
          '--ulimit','fsize=16384:16384','--log-driver=none','--workdir','/tmp','-i',IMAGES[language],
          'timeout','-s','KILL',str(seconds),'python3' if language=='python' else 'node',
          '-I' if language=='python' else '--max-old-space-size=128',
          '-c' if language=='python' else '-e',PYTHON if language=='python' else JAVASCRIPT]
    process=None
    try:
        process=await asyncio.create_subprocess_exec('docker',*args,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        process.stdin.write(payload);await process.stdin.drain();process.stdin.close()
        async def bounded(stream):
            data=bytearray()
            while chunk:=await stream.read(8192):
                data.extend(chunk)
                if len(data)>LIMITS['outputBytes']: raise ExecutionError('SANDBOX_OUTPUT_LIMIT','Isolated output exceeds 64 KiB','policy',effect='none')
            return bytes(data)
        async def watch():
            while True:
                if guard: await guard()
                await asyncio.sleep(.2)
        read_tasks=[asyncio.create_task(bounded(process.stdout)),asyncio.create_task(bounded(process.stderr))]
        reads=asyncio.gather(*read_tasks)
        watcher=asyncio.create_task(watch())
        try:
            done,_=await asyncio.wait([reads,watcher],timeout=seconds+5,return_when=asyncio.FIRST_COMPLETED)
            if watcher in done: await watcher
            if reads not in done: raise ExecutionError('NODE_TIMEOUT','Isolated execution exceeded its deadline','timeout',effect='none')
            out,_=await reads
            status=await asyncio.wait_for(process.wait(),5)
        finally:
            watcher.cancel()
            for reader in read_tasks: reader.cancel()
            await asyncio.gather(watcher,*read_tasks,return_exceptions=True)
            await asyncio.gather(reads,return_exceptions=True)
        if status in (124,137): raise ExecutionError('SANDBOX_RESOURCE_LIMIT','Isolated time or memory limit reached','policy',effect='none')
        if status==125: raise ExecutionError('SANDBOX_UNAVAILABLE','Pinned isolated runtime is unavailable','infrastructure',effect='none')
        try: response=json.loads(out)
        except (ValueError,UnicodeDecodeError): raise ExecutionError('INVALID_CODE_OUTPUT','Return a JSON object from process(input, context)','validation',effect='none') from None
        if status or 'error' in response:
            title='Isolated code failed: '+str(response.get('error','execution error'))
            if response.get('line'): title+=' at line '+str(response['line'])
            if response.get('detail'): title+=' · '+str(response['detail'])[:200]
            raise ExecutionError('CODE_SYNTAX_ERROR' if response.get('error')=='SyntaxError' else 'CODE_EXECUTION_FAILED',title,'validation' if response.get('error')=='SyntaxError' else 'code',effect='none')
        if not isinstance(response.get('output'),dict): raise ExecutionError('INVALID_CODE_OUTPUT','Function must return a JSON object','validation',effect='none')
        return response['output']
    except OSError: raise ExecutionError('SANDBOX_UNAVAILABLE','Docker execution is unavailable','infrastructure',effect='none') from None
    finally:
        # Stop the attach client and drain before waiting for daemon removal:
        # a full pipe must not keep cleanup waiting on the client it is closing.
        if process and process.returncode is None: process.kill()
        async def drain(stream):
            while await stream.read(8192): pass
        drains=[asyncio.create_task(drain(process.stdout)),asyncio.create_task(drain(process.stderr))] if process else []
        try: await asyncio.shield(command('rm','-f',name))
        finally:
            if process:
                try: await asyncio.wait_for(asyncio.gather(*drains,process.wait()),5)
                except asyncio.TimeoutError:
                    for task in drains: task.cancel()
                    await asyncio.gather(*drains,return_exceptions=True)


async def reap():
    import os
    if os.environ.get("WORKFLOW_SANDBOX_BACKEND") == "vercel":
        from .cloud_sandbox import reap as cloud_reap
        return await cloud_reap()
    status,out,_=await command('ps','-a','--filter','label=eduflow.p4=ephemeral','--format','{{.ID}}')
    if status:return
    for identity in out.decode().splitlines():
        status,value,_=await command('inspect','--format','{{ index .Config.Labels "eduflow.p4.deadline" }}',identity)
        try: expired=float(value)<time.time()
        except ValueError: expired=False
        if not status and expired: await command('rm','-f',identity)
