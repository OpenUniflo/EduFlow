import json
import pytest
from eduflow_workflow import cloud_sandbox, operations
from eduflow_workflow.contracts import ExecutionError
from eduflow_workflow.contracts import schema_check, validate_value


def test_mcp_annotations_do_not_weaken_output_validation():
    schema={'type':'object','properties':{'result':{'type':'array','items':{'type':'string'}}},'required':['result'],'x-fastmcp-wrap-result':True}
    schema_check(schema)
    validate_value(schema,{'result':['Overview']})
    with pytest.raises(ExecutionError): validate_value(schema,{'result':42})
    with pytest.raises(ExecutionError): schema_check({'type':'string','pattern':'.*'})


async def test_sandbox_diagnostic_never_records_sdk_secret_message(monkeypatch, capsys):
    from vercel import sandbox
    monkeypatch.setenv('WORKFLOW_SANDBOX_IMAGE', 'image@sha256:'+'a'*64)
    def unavailable(**kwargs):
        raise RuntimeError('Authorization: private-provider-key')
    monkeypatch.setattr(sandbox, 'create_sandbox', unavailable)
    with pytest.raises(ExecutionError) as caught:
        await cloud_sandbox.run_code('python','private user code',{}, {})
    assert caught.value.code == 'SANDBOX_UNAVAILABLE'
    captured=capsys.readouterr().err
    assert json.loads(captured)['stage'] == 'create'
    assert 'private-provider-key' not in captured and 'private user code' not in captured


async def test_watchdog_alerts_are_bounded_and_do_not_include_metrics_rows(monkeypatch,capsys):
    class Storage:
        async def call(self, name, digest):
            assert name == 'p6_metrics'
            return {'worker':False,'oldestQueueSeconds':41,'queued':3}
    monkeypatch.setattr(operations,'_last_alerts',{})
    await operations.observe(Storage())
    await operations.observe(Storage())
    events=[json.loads(line) for line in capsys.readouterr().err.splitlines()]
    assert len(events)==2
    assert {e['code'] for e in events} == {'WORKER_SIGNAL_STALE','QUEUE_DELAY_EXCEEDED'}
    assert all(set(e)=={'event','code','executorDigest'} for e in events)


@pytest.mark.parametrize('cleanup_status,probe_status,safe',[(404,404,True),(404,200,False),(500,404,False)])
async def test_completed_sandbox_only_accepts_cleanup_race_after_confirmed_absence(monkeypatch,capsys,cleanup_status,probe_status,safe):
    from types import SimpleNamespace
    from vercel import sandbox
    import httpx2
    def failure(status):return sandbox.SandboxApiError(httpx2.Response(status,request=httpx2.Request('DELETE','https://example.invalid')),'private-cleanup-message')
    class Stream:
        def __init__(self,data):self.data=data
        async def read(self,n):data,self.data=self.data,'';return data
        async def aclose(self):pass
    class Process:
        stdout=Stream('{"output":{"value":7}}');stderr=Stream('')
        async def wait(self):return 0
    async def write(*args,**kwargs):pass
    async def process(*args,**kwargs):return Process()
    box=SimpleNamespace(name='eduflow-code-own-test',fs=SimpleNamespace(write_bytes=write),create_process=process)
    class Context:
        async def __aenter__(self):return box
        async def __aexit__(self,*args):raise sandbox.SandboxCleanupError('private-context-message',resource_type='sandbox',resource_id=box.name,cause=failure(cleanup_status))
    async def probe(**kwargs):
        if probe_status!=200:raise failure(probe_status)
        return SimpleNamespace(status='running')
    monkeypatch.setenv('WORKFLOW_SANDBOX_IMAGE','image@sha256:'+'a'*64)
    monkeypatch.setattr(sandbox,'create_sandbox',lambda **kwargs:Context())
    monkeypatch.setattr(sandbox,'get_sandbox',probe)
    if safe:assert await cloud_sandbox.run_code('python','private-code',{}, {})=={'value':7}
    else:
        with pytest.raises(ExecutionError) as caught:await cloud_sandbox.run_code('python','private-code',{}, {})
        assert caught.value.code=='SANDBOX_UNAVAILABLE'
    output=capsys.readouterr().err
    assert 'private-cleanup-message' not in output and 'private-context-message' not in output and 'private-code' not in output


async def test_reaper_preserves_context_cleanup_grace_and_other_owners(monkeypatch):
    from types import SimpleNamespace
    from vercel import sandbox
    import httpx2,time
    destroyed=[]
    async def remove(name,missing=False):
        destroyed.append(name)
        if missing:raise sandbox.SandboxApiError(httpx2.Response(404,request=httpx2.Request('DELETE','https://example.invalid')),'already removed')
    def box(name,age,purpose='eduflow-workflow-ephemeral',missing=False):
        async def destroy():await remove(name,missing)
        return SimpleNamespace(name=name,tags={'purpose':purpose},status='stopped',status_updated_at=int((time.time()-age)*1000),updated_at=None,created_at=None,destroy=destroy)
    async def boxes(**kwargs):
        for item in [box('eduflow-code-fresh',1),box('eduflow-code-stale',8),box('eduflow-code-gone',8,missing=True),box('other-user-code',8),box('eduflow-code-other-purpose',8,'other')]:yield item
    monkeypatch.setattr(sandbox,'query_sandboxes',boxes)
    await cloud_sandbox.reap()
    assert destroyed==['eduflow-code-stale','eduflow-code-gone']


async def test_slow_cloud_cleanup_cannot_suspend_database_watchdog(monkeypatch):
    import asyncio
    from eduflow_workflow import cli,sandbox as adapter
    third=asyncio.Event();timeout=asyncio.Event();calls=[];signals=[]
    class Storage:
        def __init__(self,url):pass
        async def call(self,name):
            calls.append(name)
            if calls.count('watchdog')>=3:third.set()
    async def slow_reap():
        try:await asyncio.Event().wait()
        finally:timeout.set()
    async def publish(*args):pass
    monkeypatch.setenv('WORKFLOW_DATABASE_URL','synthetic-not-used')
    monkeypatch.setenv('WORKFLOW_DEPLOYMENT_MODE','local')
    monkeypatch.setattr(cli,'Storage',Storage)
    monkeypatch.setattr(cli,'WATCHDOG_POLL_SECONDS',.01)
    monkeypatch.setattr(cli,'REAP_TIMEOUT_SECONDS',.2)
    monkeypatch.setattr(adapter,'reap',slow_reap)
    monkeypatch.setattr(operations,'publish',publish)
    monkeypatch.setattr(operations,'signal',lambda *args:signals.append(args))
    task=asyncio.create_task(cli.watchdog())
    try:
        await asyncio.wait_for(third.wait(),.15)
        assert not timeout.is_set() # DB fencing kept running during blocked SDK I/O.
        await asyncio.wait_for(timeout.wait(),.5)
        await asyncio.sleep(.01)
        assert any(s[2]=='SANDBOX_REAP_FAILED' for s in signals)
        assert calls.count('watchdog')>=3 and calls.count('p5_sweep')>=3
    finally:
        task.cancel();await asyncio.gather(task,return_exceptions=True)


@pytest.mark.parametrize('already_gone',[False,True])
async def test_cloud_reaper_caps_total_scan_and_delete_not_only_page_size(monkeypatch,already_gone):
    from types import SimpleNamespace
    from vercel import sandbox
    import time,httpx2
    seen=[];deleted=[]
    async def boxes(**kwargs):
        for i in range(100):
            seen.append(i)
            async def destroy(i=i):
                deleted.append(i)
                if already_gone:raise sandbox.SandboxApiError(httpx2.Response(404,request=httpx2.Request('DELETE','https://example.invalid')),'already deleted')
            yield SimpleNamespace(name='eduflow-code-'+str(i),tags={'purpose':'eduflow-workflow-ephemeral'},status='stopped',status_updated_at=int((time.time()-8)*1000),updated_at=None,created_at=None,destroy=destroy)
    monkeypatch.setattr(sandbox,'query_sandboxes',boxes)
    await cloud_sandbox.reap()
    assert len(deleted)==5 and len(seen)<=20
