import argparse
import asyncio
import os
import uuid
from .contracts import ExecutionError
from .storage import Storage
from .interrupts import RunPaused

async def worker(stop=None):
    from .operations import signal, publish
    stop = stop or asyncio.Event()
    from .server import registry,refresh
    from .runtime import RunExecution
    from .telemetry import record_cache_info
    record_cache_info()
    storage=Storage(os.environ["WORKFLOW_DATABASE_URL"])
    worker_id=str(uuid.uuid4())
    async def heartbeat(run,token):
        while True:
            await asyncio.sleep(5)
            await storage.check(run,token,True)
            await publish("worker", "draining" if stop.is_set() else "ok")
    while not stop.is_set():
        try:
            refresh()
            claim=await storage.call("claim",worker_id)
            await publish("worker", "draining" if stop.is_set() else "ok")
            if not claim: await asyncio.sleep(3 if os.environ.get("WORKFLOW_DEPLOYMENT_MODE")=="hosted" else .5); continue
            run=claim["run"]["run_id"]; token=claim["token"]
            beat=asyncio.create_task(heartbeat(run,token))
            try:
                execution=RunExecution(claim,registry,storage)
                task=asyncio.create_task(execution.run_graph())
                done,_=await asyncio.wait([task,beat],return_when=asyncio.FIRST_COMPLETED)
                if beat in done:
                    task.cancel(); await asyncio.gather(task,return_exceptions=True); beat.result()
                output=await task
                await storage.call("finish",run,token,"success",output,None)
            except RunPaused as paused:
                await storage.call('pause_run',run,token,paused.interrupts,paused.wait_ms)
            except Exception as error:
                error=error if isinstance(error,ExecutionError) else ExecutionError("WORKER_EXECUTION_FAILED","Worker execution failed","infrastructure",effect="unknown")
                try: await storage.call("finish",run,token,"cancelled" if error.code=="RUN_CANCELLED" else "failed",None,error.dto())
                except Exception: signal("worker", "error", "STORAGE_UNAVAILABLE") # Watchdog seals lost-storage runs.
            finally:
                beat.cancel(); await asyncio.gather(beat,return_exceptions=True)
        except Exception:
            signal("worker", "error", "STORAGE_UNAVAILABLE")
            await asyncio.sleep(2)
    await publish("worker", "draining")

WATCHDOG_POLL_SECONDS = 5
REAP_TIMEOUT_SECONDS = 4

async def watchdog():
    from .operations import signal, publish, observe
    from .sandbox import reap
    storage=Storage(os.environ["WORKFLOW_DATABASE_URL"])
    cleanup={'ok':False}
    async def cleanup_loop():
        while True:
            cleanup['ok']=False
            try:
                await asyncio.wait_for(reap(),REAP_TIMEOUT_SECONDS)
                cleanup['ok']=True
            except Exception:
                cleanup['ok']=False
                signal("watchdog", "error", "SANDBOX_REAP_FAILED")
            await asyncio.sleep(WATCHDOG_POLL_SECONDS)
    cleanup_task=asyncio.create_task(cleanup_loop())
    try:
        while True:
            try:
                await storage.call("watchdog")
                await storage.call("p5_sweep")
                # Cleanup failure makes readiness stale, but cannot suspend fencing.
                if cleanup['ok']: await publish("watchdog")
                if os.environ.get('WORKFLOW_DEPLOYMENT_MODE') == 'hosted':
                    await observe(storage)
            except Exception: signal("watchdog", "error", "STORAGE_UNAVAILABLE")
            await asyncio.sleep(WATCHDOG_POLL_SECONDS)
    finally:
        cleanup_task.cancel()
        await asyncio.gather(cleanup_task,return_exceptions=True)

async def serve(port):
    import uvicorn
    from .server import app
    server=uvicorn.Server(uvicorn.Config(app,host="127.0.0.1",port=port,log_level="warning",access_log=False))
    await server.serve()

async def service(port):
    # Compiler/API and executor are independent tasks; watchdog is a separate process.
    await asyncio.gather(serve(port),worker())

def main():
    parser=argparse.ArgumentParser();parser.add_argument("command",choices=["service","worker","watchdog","compiler"]);parser.add_argument("--port",type=int,default=18110)
    args=parser.parse_args()
    from .operations import assert_hosted_configuration
    assert_hosted_configuration()
    async def run():
        if args.command == "worker":
            import signal
            stop = asyncio.Event()
            asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, stop.set)
            await worker(stop)
        else:
            await (service(args.port) if args.command=="service" else serve(args.port) if args.command=="compiler" else watchdog())
    asyncio.run(run())
