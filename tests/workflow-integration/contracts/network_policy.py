"""Actual production HTTP adapter and independently scoped receiver, no shared destinations changed."""
import asyncio,json,os,threading,sys,datetime
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from eduflow_workflow.tools import invoke_tool,safe_http_url,PinnedTransport
from eduflow_workflow.contracts import ExecutionError
import httpx
counts={};records=[]
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  counts[self.path]=counts.get(self.path,0)+1
  if self.path=='/redirect':self.send_response(302);self.send_header('Location','/target');self.end_headers();return
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"actualReceiver":true}')
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();port=server.server_port
basic={'adapter':'http','baseUrl':f'http://127.0.0.1:{port}','path':'/ok','method':'GET','inputSchema':{'type':'object','properties':{},'additionalProperties':False},'outputSchema':{'type':'object','properties':{'actualReceiver':{'const':True}},'required':['actualReceiver'],'additionalProperties':False},'sideEffect':'read'}
def env(local):return {'localFixtures':local,'providers':[],'tools':[],'connectors':[]}
async def main():
 for host in ['127.0.0.1','10.0.0.1','192.168.0.1','169.254.169.254']:
  t={**basic,'baseUrl':f'http://{host}:{port}'}
  try:await invoke_tool(t,env(False),{},1);raise AssertionError('Production private allowed')
  except ExecutionError as error:assert error.code=='HTTP_DESTINATION_FORBIDDEN';records.append({'case':'production-private','host':host,'error':error.dto(),'receiverRequests':sum(counts.values())})
 os.environ['WORKFLOW_ALLOW_LOCAL_FIXTURES']='0'
 try:await invoke_tool(basic,env(True),{},1);raise AssertionError('One flag insufficient')
 except ExecutionError as error:assert error.code=='HTTP_DESTINATION_FORBIDDEN';records.append({'case':'local-no-opt-in','denied':True})
 assert not counts
 os.environ['WORKFLOW_ALLOW_LOCAL_FIXTURES']='1';actual=await invoke_tool(basic,env(True),{},1);assert actual=={'actualReceiver':True} and counts['/ok']==1;records.append({'case':'explicit-local','actual':actual,'receiverRequests':1})
 try:await invoke_tool({**basic,'baseUrl':'http://169.254.169.254','path':'/latest/meta-data/'},env(True),{},1);raise AssertionError('Local metadata allowed')
 except ExecutionError as error:assert error.code=='HTTP_DESTINATION_FORBIDDEN';records.append({'case':'metadata-even-local','denied':True})
 try:await invoke_tool({**basic,'path':'/redirect'},env(True),{},1);raise AssertionError('Redirect followed')
 except ExecutionError as error:assert error.code=='HTTP_REDIRECT_DENIED' and error.external_status==302;assert counts['/redirect']==1 and not counts.get('/target');records.append({'case':'actual-redirect','error':error.dto(),'redirectRequests':1,'targetRequests':0})
 # The transport must connect to the previously checked IP even if hostname cannot resolve.
 host='independent-dns-pin.invalid'
 async with httpx.AsyncClient(transport=PinnedTransport(host,'127.0.0.1'),trust_env=False) as client:
  response=await client.get(f'http://{host}:{port}/pinned');assert response.status_code==200 and response.json()=={'actualReceiver':True}
 records.append({'case':'checked-ip-pinned','unresolvableHostname':host,'actualReceiverRequests':counts.get('/pinned')});assert counts.get('/pinned')==1
try:asyncio.run(main())
finally:server.shutdown();server.server_close()
root=Path(__file__).resolve().parents[3];out=root/'artifacts/workflow/checks/network-policy';out.mkdir(parents=True,exist_ok=True);result={'caseId':'M1-16/actual-adapter','records':records,'receiverCounts':counts,'testedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'Direct actual production HTTP adapter with independent Local receiver; public API rejects arbitrary destination/command separately'};(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
