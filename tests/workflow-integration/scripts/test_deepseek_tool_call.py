#!/usr/bin/env python3
"""A non-production DeepSeek Tool Calling smoke test, using only Python stdlib.

The API key is read from DEEPSEEK_API_KEY. It is never logged.
No remote user text is sent to the mock server beyond a fixed test order ID.
"""
import json, os, sys, urllib.request, urllib.error
API_KEY = os.getenv('DEEPSEEK_API_KEY')
if not API_KEY:
    raise SystemExit('Missing DEEPSEEK_API_KEY. Export the key in your shell first.')
MODEL = os.getenv('DEEPSEEK_MODEL', 'deepseek-flash')
BASE = os.getenv('DEEPSEEK_API_BASE', 'https://api.deepseek.com').rstrip('/')
MOCK_API = os.getenv('MOCK_API_BASE', 'http://127.0.0.1:18080').rstrip('/')
TOOLS = [{
    'type':'function',
    'function':{
      'name':'get_order_status',
      'description':'Look up the status and total of a fictional order by order_id. Must use this to answer questions about order status.',
      'parameters':{'type':'object','properties':{'order_id':{'type':'string','description':'Order id, e.g. A1001'}},'required':['order_id']}
    }
}]

def call_llm(messages):
    payload={'model':MODEL,'messages':messages,'tools':TOOLS,'tool_choice':'auto','stream':False}
    req=urllib.request.Request(BASE+'/chat/completions', data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+API_KEY,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=80) as response:
            return json.load(response)['choices'][0]['message']
    except urllib.error.HTTPError as exc:
        msg=exc.read().decode(errors='replace')[:800]
        raise RuntimeError(f'DeepSeek API returned HTTP {exc.code}: {msg}') from exc

def get_order_status(order_id):
    if order_id not in ('A1001','A1002','NOT-FOUND'):
        raise ValueError('Unexpected test order ID')
    with urllib.request.urlopen(MOCK_API+'/orders/'+order_id, timeout=8) as response:
        return json.load(response)

messages=[{'role':'system','content':'For fictional order status questions, call get_order_status before answering. Never guess an order status.'},
          {'role':'user','content':'请使用工具查询测试订单 A1001 的发货状态和金额。'}]
first=call_llm(messages)
calls=first.get('tool_calls') or []
if not calls:
    print('MODEL DID NOT REQUEST A TOOL. Output:',first.get('content'));sys.exit(2)
messages.append(first)
for c in calls:
    fn=c.get('function',{})
    if fn.get('name')!='get_order_status':
        raise RuntimeError(f'Unexpected tool: {fn.get("name")}')
    args=json.loads(fn.get('arguments') or '{}')
    result=get_order_status(args['order_id'])
    print('TOOL INVOCATION:',fn.get('name'),json.dumps(args,ensure_ascii=False))
    print('REAL MOCK API RESULT:',json.dumps(result,ensure_ascii=False))
    messages.append({'role':'tool','tool_call_id':c['id'],'content':json.dumps(result,ensure_ascii=False)})
second=call_llm(messages)
print('MODEL FINAL RESPONSE:',second.get('content',''))
print('PASS: A real DeepSeek tool call was executed against the local mock service.')
