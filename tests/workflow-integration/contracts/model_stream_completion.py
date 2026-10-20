"""Real locked ChatDeepSeek/OpenAI SDK over httpx MockTransport; no network/model fee."""
from pathlib import Path as ArtifactPath
ArtifactPath("artifacts/workflow/checks").mkdir(parents=True,exist_ok=True)
ArtifactPath("artifacts/workflow/acceptance/reports").mkdir(parents=True,exist_ok=True)
import asyncio,json,sys,copy
from pathlib import Path
from datetime import datetime,timezone
import httpx
from langchain_deepseek import ChatDeepSeek
from langchain_core.messages import HumanMessage
from eduflow_workflow.session_memory_history import stream_model
from eduflow_workflow.contracts import ExecutionError,DEPENDENCY_MANIFEST
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'services/workflow/tests'))
from test_runtime import execution

def frame(delta,reason=None):return 'data: '+json.dumps({'id':'synthetic-sdk-finish','object':'chat.completion.chunk','created':1,'model':'deepseek-flash','choices':[{'index':0,'delta':delta,'finish_reason':reason}]})+'\n\n'
cases=[('partial-eof-no-finish','partial',None,False,'MODEL_RESPONSE_INCOMPLETE'),('partial-length','partial','length',False,'MODEL_OUTPUT_TRUNCATED'),('empty-length','','length',False,'MODEL_OUTPUT_TRUNCATED'),('empty-stop','','stop',False,'EMPTY_MODEL_RESPONSE'),('content-filter','blocked','content_filter',False,'MODEL_RESPONSE_INCOMPLETE'),('normal-stop','complete.','stop',False,None),('valid-empty-text-tool-call','','tool_calls',True,None)]
async def main():
 results=[]
 for name,text,reason,tool,expected in cases:
  captured=[]
  def response(request):
   captured.append(json.loads(request.content))
   delta={'role':'assistant','content':text}
   if tool:delta['tool_calls']=[{'index':0,'id':'call1','type':'function','function':{'name':'lookup','arguments':'{"value":1}'}}]
   body=frame(delta)
   if reason is not None:body+=frame({},reason)+'data: [DONE]\n\n'
   return httpx.Response(200,headers={'content-type':'text/event-stream'},content=body.encode())
  client=httpx.AsyncClient(transport=httpx.MockTransport(response))
  model=ChatDeepSeek(model='deepseek-flash',api_key='synthetic-nonsecret-offline-key',api_base='https://sdk-fixture.invalid',http_async_client=client,max_retries=0,max_tokens=512,extra_body={'thinking':{'type':'disabled'}})
  sdk=None;run=execution();error=None
  try:
   # First directly observe what the mature SDK does at a clean HTTP EOF.
   async for chunk in model.astream([HumanMessage(content='synthetic probe')]):sdk=chunk if sdk is None else sdk+chunk
   try:await stream_model(run,model,[HumanMessage(content='synthetic probe')])
   except ExecutionError as failure:error=failure.code
   end=[payload for kind,payload in run.storage.events if kind=='node.output.end']
   good=error==expected and bool(end) and end[-1]['status']==('interrupted'if expected else'computed') and (not expected or not any(e['status']=='computed'for e in end)) and not run.storage.completed
   results.append({'id':name,'passed':good,'sdkReturnedChunk':sdk is not None,'sdkFinishReason':(sdk.response_metadata or {}).get('finish_reason')if sdk else None,'productErrorCode':error,'lastStreamStatus':end[-1]['status']if end else None,'computedEndCount':sum(e['status']=='computed'for e in end),'stepCommits':len(run.storage.completed),'requestsInterceptedLocally':len(captured),'officialExtraBodyActuallySent':all(p.get('thinking')=={'type':'disabled'}for p in captured),'zeroExternalNetwork':True})
  finally:await client.aclose();model.root_client.close()
 report={'recordedAt':datetime.now(timezone.utc).isoformat(),'executorDigest':DEPENDENCY_MANIFEST['executorDigest'],'scope':'Real locked ChatDeepSeek/OpenAI HTTP streaming parser fed standard SSE via httpx MockTransport only; direct SDK aggregation and actual product stream_model, no model/provider network and no SQL mutation. Storage is in-memory unit layer, not Hosted or transaction proof.','results':results,'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results)}
 Path('artifacts/workflow/checks/model-stream-completion.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
 if report['failed']:raise SystemExit(1)
asyncio.run(main())
