"""Authenticated owner catalogs and managed connection configuration, backed by SQL/Vault."""
import json
import os
import re
import time
from urllib.parse import urlparse
import httpx
from .contracts import ExecutionError,validate_value,schema_check,digest
from .storage import Storage
from .execution_policies import catalog,REDUCERS
from .sandbox import IMAGES,LIMITS,available

CONNECTION_TYPES=('http','deepseek','mcp-http','openai-compatible')
CONNECTION_FIELDS={'type','name','baseUrl','path','method','sideEffect','inputSchema','outputSchema','modelRefs','url','allowedToolNames','credentialHeader','description','secretRef',
                   'params','headers','body','auth','settings','outputMap'}
OPENAI_COMPATIBLE_FIELDS={'type','name','baseUrl','modelRefs','credentialHeader','description','secretRef'}
MODEL_CONNECTION_TYPES=('deepseek','openai-compatible')
MODEL_REF_PATTERN=re.compile(r'^[\w.:/-]+$',re.ASCII)
MAX_MODEL_REFS=50
PREVIEW_BYTES=4096
LOCAL_LOOPBACK_HOSTS=('localhost','127.0.0.1')
DEEPSEEK_BASE_URL='https://api.deepseek.com'
HTTP_METHODS=('GET','POST','PUT','PATCH','DELETE')
HTTP_BODY_MODES=('none','json','form-data','x-www-form-urlencoded','raw')
HTTP_AUTH_TYPES=('none','api-key-header','api-key-query','bearer','basic')
HTTP_PARAM_SOURCES=('node','fixed','variable')
HTTP_PARAM_NAME=re.compile(r'^[A-Za-z_][A-Za-z0-9_.-]{0,79}$')
HTTP_HEADER_NAME=re.compile(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}$")

def _bounded_text(value,max_length,label):
    if not isinstance(value,str) or len(value)>max_length or len(value.strip())==0: raise ExecutionError('INVALID_CONNECTION',f'{label} must be 1–{max_length} characters')
    return value.strip()

def http_params(value):
    """Ordered, user-visible request parameters. Node parameters become required tool inputs."""
    if value is None: return []
    if not isinstance(value,list) or len(value)>50: raise ExecutionError('INVALID_CONNECTION','Request parameters must be a list of at most 50 rows')
    rows=[]
    for row in value:
        if not isinstance(row,dict): raise ExecutionError('INVALID_CONNECTION','Each request parameter must be an object')
        name=row.get('name');source=row.get('source','node');text=row.get('value','');description=row.get('description','')
        if not isinstance(name,str) or not HTTP_PARAM_NAME.fullmatch(name): raise ExecutionError('INVALID_CONNECTION','Request parameter names must be 1–80 letters, digits, "_", "." or "-"')
        if source not in HTTP_PARAM_SOURCES: raise ExecutionError('INVALID_CONNECTION','Choose a supported request parameter source')
        if not isinstance(text,str) or len(text)>2000: raise ExecutionError('INVALID_CONNECTION','Request parameter values must be at most 2000 characters')
        if not isinstance(description,str) or len(description)>200: raise ExecutionError('INVALID_CONNECTION','Request parameter descriptions must be at most 200 characters')
        if source!='node' and len(text.strip())==0: raise ExecutionError('INVALID_CONNECTION',f'Request parameter {name} needs a value')
        rows.append({'name':name,'source':source,'value':text,'required':row.get('required') is not False,'description':description})
    if len({row['name'] for row in rows})!=len(rows): raise ExecutionError('INVALID_CONNECTION','Request parameter names must be unique')
    return rows

def http_headers(value):
    if value is None: return []
    if not isinstance(value,list) or len(value)>50: raise ExecutionError('INVALID_CONNECTION','Headers must be a list of at most 50 rows')
    rows=[]
    for row in value:
        if not isinstance(row,dict) or not isinstance(row.get('name'),str) or not HTTP_HEADER_NAME.fullmatch(row['name'].strip()):
            raise ExecutionError('INVALID_CONNECTION','Provide a valid header name')
        text=row.get('value','')
        if not isinstance(text,str) or len(text)>2000 or '\n' in text or '\r' in text: raise ExecutionError('INVALID_CONNECTION','Header values must be single-line text')
        rows.append({'name':row['name'].strip(),'value':text})
    if len({row['name'].lower() for row in rows})!=len(rows): raise ExecutionError('INVALID_CONNECTION','Header names must be unique')
    return rows

def http_body(value):
    if value is None: return {'mode':'none'}
    if not isinstance(value,dict) or value.get('mode','none') not in HTTP_BODY_MODES: raise ExecutionError('INVALID_CONNECTION','Choose a supported request body mode')
    text=value.get('text','')
    if not isinstance(text,str) or len(text)>16384: raise ExecutionError('INVALID_CONNECTION','Request body text must be at most 16384 characters')
    return {'mode':value.get('mode','none'),'text':text}

def http_auth(value):
    if value is None: return {'type':'none'}
    if not isinstance(value,dict) or value.get('type','none') not in HTTP_AUTH_TYPES: raise ExecutionError('INVALID_CONNECTION','Choose a supported authentication type')
    auth={'type':value.get('type','none')}
    if auth['type'] in ('api-key-header','api-key-query'):
        name=value.get('name')
        if not isinstance(name,str) or not HTTP_HEADER_NAME.fullmatch(name.strip()): raise ExecutionError('INVALID_CONNECTION','Provide a credential header or query name')
        auth['name']=name.strip()
    return auth

def http_settings(value):
    if value is None: return {}
    if not isinstance(value,dict): raise ExecutionError('INVALID_CONNECTION','Settings must be an object')
    settings={}
    timeout_ms=value.get('timeoutMs')
    if timeout_ms is not None:
        if isinstance(timeout_ms,bool) or not isinstance(timeout_ms,int) or not 1000<=timeout_ms<=120000: raise ExecutionError('INVALID_CONNECTION','Timeout must be 1000–120000 milliseconds')
        settings['timeoutMs']=timeout_ms
    retries=value.get('retries')
    if retries is not None:
        if isinstance(retries,bool) or not isinstance(retries,int) or not 0<=retries<=3: raise ExecutionError('INVALID_CONNECTION','Retries must be 0–3')
        settings['retries']=retries
    result_path=value.get('resultPath')
    if result_path is not None:
        if not isinstance(result_path,str) or len(result_path)>300: raise ExecutionError('INVALID_CONNECTION','Result path must be at most 300 characters')
        settings['resultPath']=result_path.strip()
    return settings

def http_output_map(value):
    if value is None: return []
    if not isinstance(value,list) or len(value)>50: raise ExecutionError('INVALID_CONNECTION','Response fields must be a list of at most 50 rows')
    rows=[]
    for row in value:
        if not isinstance(row,dict): raise ExecutionError('INVALID_CONNECTION','Each response field must be an object')
        name=row.get('name');path=row.get('path','');kind=row.get('type','')
        if not isinstance(name,str) or not HTTP_PARAM_NAME.fullmatch(name): raise ExecutionError('INVALID_CONNECTION','Response field names must be 1–80 letters, digits, "_", "." or "-"')
        if not isinstance(path,str) or len(path)>300 or not isinstance(kind,str) or len(kind)>40: raise ExecutionError('INVALID_CONNECTION','Response field paths and types must be bounded text')
        rows.append({'name':name,'path':path.strip(),'type':kind})
    if len({row['name'] for row in rows})!=len(rows): raise ExecutionError('INVALID_CONNECTION','Response field names must be unique')
    return rows

def local_fixtures_allowed(env):
    """Plain-HTTP localhost destinations require both the fixture environment and the process opt-in."""
    return env.get('localFixtures') is True and os.environ.get('WORKFLOW_ALLOW_LOCAL_FIXTURES')=='1'

def model_refs(value):
    """Validate and de-duplicate the explicitly enabled model list of one provider."""
    if not isinstance(value,list) or not 1<=len(value)<=MAX_MODEL_REFS: raise ExecutionError('INVALID_CONNECTION','Enable 1–50 model references')
    refs=[]
    for item in value:
        if not isinstance(item,str) or not 1<=len(item)<=200 or not MODEL_REF_PATTERN.fullmatch(item): raise ExecutionError('INVALID_CONNECTION','Model references must be 1–200 characters matching ^[\\w.:/-]+$')
        if item not in refs: refs.append(item)
    return refs

async def assert_destination(base_url,env,path='/'):
    """Reuse the tool outbound policy: destination resolved and private/metadata ranges denied."""
    from .tools import safe_http_url
    await safe_http_url({'baseUrl':base_url,'path':path},env,{})

async def validate_connection(content,credential,env):
    """Validate and normalize a connection publish payload; credentials never enter content."""
    c=dict(content)
    if set(c)-CONNECTION_FIELDS or c.get('type') not in CONNECTION_TYPES: raise ExecutionError('INVALID_CONNECTION','Supported types: HTTP, DeepSeek, MCP HTTP, OpenAI-compatible')
    if 'name' in c and (not isinstance(c['name'],str) or not 1<=len(c['name'])<=120): raise ExecutionError('INVALID_CONNECTION','Name must be 1–120 characters')
    if 'description' in c and (not isinstance(c['description'],str) or len(c['description'])>500): raise ExecutionError('INVALID_CONNECTION','Description must be at most 500 characters')
    # The managed secret reference is injected by the database; callers supply only the credential field.
    if 'secretRef' in c: raise ExecutionError('INVALID_CONNECTION','Credentials must be supplied separately; secretRef is managed by the platform')
    ctype=c['type']
    if ctype=='deepseek':
        if c.get('baseUrl',DEEPSEEK_BASE_URL)!=DEEPSEEK_BASE_URL: raise ExecutionError('INVALID_CONNECTION','Use the official DeepSeek base URL')
        if not credential: raise ExecutionError('INVALID_CONNECTION','Provide a DeepSeek credential')
        c['modelRefs']=model_refs(c.get('modelRefs'))
        return c
    if ctype=='openai-compatible':
        return await validate_model_connection(c,credential,env)
    raw=c.get('baseUrl' if ctype=='http' else 'url','');parsed=urlparse(raw)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment: raise ExecutionError('INVALID_CONNECTION','Provide a valid HTTP endpoint without credentials')
    if ctype=='http' and (not isinstance(c.get('path','/'),str) or len(c.get('path','/'))>2000): raise ExecutionError('INVALID_CONNECTION','Provide a bounded HTTP path')
    await assert_destination(parsed.scheme+'://'+parsed.netloc,env,('/' if ctype=='http' else parsed.path or '/'))
    if c.get('credentialHeader','Authorization') not in ('Authorization','X-API-Key'): raise ExecutionError('INVALID_CONNECTION','Unsupported credential header')
    if ctype=='http':
        method=c.get('method','GET')
        if method not in HTTP_METHODS or c.get('sideEffect') not in ('read','write') or method!='GET' and c['sideEffect']!='write': raise ExecutionError('INVALID_CONNECTION','HTTP methods other than GET are treated as external writes')
        for key in ('inputSchema','outputSchema'): schema_check(c.get(key,{'type':'object'}))
        c['method']=method
        c['params']=http_params(c.get('params'))
        c['headers']=http_headers(c.get('headers'))
        c['body']=http_body(c.get('body'))
        c['auth']=http_auth(c.get('auth'))
        c['settings']=http_settings(c.get('settings'))
        c['outputMap']=http_output_map(c.get('outputMap'))
        if c['body']['mode']!='none' and method=='GET': raise ExecutionError('INVALID_CONNECTION','GET requests cannot carry a body')
    elif not isinstance(c.get('allowedToolNames'),list) or not c['allowedToolNames'] or any(not isinstance(v,str) for v in c['allowedToolNames']): raise ExecutionError('INVALID_CONNECTION','Select allowed MCP tool names')
    return c

async def validate_model_connection(c,credential,env):
    """OpenAI-compatible gateways: one provider, many explicitly enabled models (R8)."""
    if set(c)-OPENAI_COMPATIBLE_FIELDS: raise ExecutionError('INVALID_CONNECTION','Unsupported OpenAI-compatible connection field')
    raw=c.get('baseUrl')
    if not isinstance(raw,str) or not 1<=len(raw)<=2000: raise ExecutionError('INVALID_CONNECTION','Provide an OpenAI-compatible base URL')
    parsed=urlparse(raw)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment: raise ExecutionError('INVALID_CONNECTION','Provide a valid OpenAI-compatible base URL without credentials')
    local_http=parsed.scheme=='http' and parsed.hostname in LOCAL_LOOPBACK_HOSTS and local_fixtures_allowed(env)
    if parsed.scheme=='http' and not local_http: raise ExecutionError('INVALID_CONNECTION','Plain HTTP is only allowed for local fixture environments')
    if c.get('credentialHeader','Authorization')!='Authorization': raise ExecutionError('INVALID_CONNECTION','Only the Authorization header is supported for model connections')
    if not credential and not local_http: raise ExecutionError('INVALID_CONNECTION','Provide a credential for the model provider')
    c['baseUrl']=raw.rstrip('/')
    if not c['baseUrl'] or urlparse(c['baseUrl']).hostname!=parsed.hostname: raise ExecutionError('INVALID_CONNECTION','Provide a valid OpenAI-compatible base URL')
    c['modelRefs']=model_refs(c.get('modelRefs'))
    await assert_destination(c['baseUrl'],env)
    return c

def elapsed_ms(started):
    return max(0,int(round((time.monotonic()-started)*1000)))

def parse_model_ids(payload):
    """Accept only the documented OpenAI model-list envelope; never echo the raw response."""
    if not isinstance(payload,dict) or not isinstance(payload.get('data'),list): raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint did not return a model list')
    identifiers={item['id'] for item in payload['data'] if isinstance(item,dict) and isinstance(item.get('id'),str) and item['id']}
    return sorted(identifiers)[:200]

async def fetch_model_ids(base_url,secret_ref,env,timeout=10):
    """GET {baseUrl}/models through the same pinned outbound policy used for tools."""
    from .tools import PinnedTransport,safe_http_url,secret
    url,ip=await safe_http_url({'baseUrl':base_url.rstrip('/'),'path':'/models'},env,{})
    headers={'Authorization':'Bearer '+secret(secret_ref)} if secret_ref else {}
    try:
        async with httpx.AsyncClient(transport=PinnedTransport(urlparse(url).hostname,ip),timeout=timeout,follow_redirects=False,trust_env=False) as client:
            response=await client.get(url,headers=headers)
    except httpx.TimeoutException: raise ExecutionError('CONNECTION_TEST_TIMEOUT','Model endpoint timed out') from None
    except ExecutionError: raise
    except Exception: raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint is unreachable') from None
    if response.status_code!=200: raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint returned HTTP '+str(response.status_code))
    try: payload=response.json()
    except Exception: raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint returned invalid JSON') from None
    return parse_model_ids(payload)

async def fetch_model_reply(base_url,secret_ref,model,message,env,timeout=30):
    """Send one short chat message through the same pinned destination policy.

    This is an explicit connection test: it returns only the first reply text and
    never persists a run, message, State value or provider payload.
    """
    from .tools import model_http_client,secret
    if not isinstance(message,str) or not 1<=len(message)<=2000: raise ExecutionError('CONNECTION_TEST_FAILED','Provide a bounded test message')
    base=base_url.rstrip('/')
    headers={'Authorization':'Bearer '+secret(secret_ref)} if secret_ref else {}
    payload={'model':model,'messages':[{'role':'user','content':message}],'max_tokens':64,'stream':False}
    try:
        async with model_http_client(base,env) as client:
            response=await client.post(base+'/chat/completions',headers=headers,json=payload)
    except httpx.TimeoutException: raise ExecutionError('CONNECTION_TEST_TIMEOUT','Model endpoint timed out') from None
    except ExecutionError: raise
    except Exception: raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint is unreachable') from None
    if response.status_code!=200: raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint returned HTTP '+str(response.status_code))
    try: body=response.json()
    except Exception: raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint returned invalid JSON') from None
    choices=body.get('choices') if isinstance(body,dict) else None
    message_body=choices[0].get('message') if isinstance(choices,list) and choices and isinstance(choices[0],dict) else None
    reply=message_body.get('content') if isinstance(message_body,dict) else None
    if not isinstance(reply,str): raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint did not return reply text')
    return reply[:500]

def preview_text(content):
    return content.encode('utf-8')[:PREVIEW_BYTES].decode('utf-8','ignore')

async def http_test_preview(tool,env,arguments,timeout=10):
    """Registered HTTP test: raw bounded body, credentials redacted before the preview is returned."""
    from .credentials import assert_no_secrets
    from .tools import PinnedTransport,safe_http_url,_http_auth,_http_body,_http_headers
    assert_no_secrets(arguments,env)
    validate_value(tool['inputSchema'],arguments,'INVALID_TOOL_ARGUMENTS')
    url,ip=await safe_http_url(tool,env,arguments)
    headers=_http_headers(tool,env)
    kwargs=_http_body(tool,arguments)
    _,secret_query=_http_auth(tool,env)
    if secret_query:
        from urllib.parse import urlencode,parse_qsl,urlunparse
        parts=urlparse(url); query=dict(parse_qsl(parts.query)); query.update(secret_query)
        url=urlunparse(parts._replace(query=urlencode(query)))
    content=bytearray();status=None
    try:
        async with httpx.AsyncClient(transport=PinnedTransport(urlparse(url).hostname,ip),timeout=timeout,follow_redirects=False,trust_env=False) as client:
            async with client.stream(tool['method'],url,headers=headers,**kwargs) as response:
                status=response.status_code
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content)>=PREVIEW_BYTES*4: break
    except httpx.TimeoutException: raise ExecutionError('CONNECTION_TEST_TIMEOUT','HTTP endpoint timed out') from None
    except ExecutionError: raise
    except Exception: raise ExecutionError('CONNECTION_TEST_FAILED','HTTP endpoint is unreachable') from None
    text=bytes(content).decode('utf-8','replace')
    assert_no_secrets(text,env)
    return {'ok':200<=status<300,'status':status,'preview':preview_text(text)}

async def catalog_operation(body,registry):
    from .registry import requested_variable_environment
    owner=body['ownerId'];ref=body['environmentRef'];env=registry.environment(ref,owner,requested_variable_environment(body))
    store=Storage(os.environ['WORKFLOW_DATABASE_URL'])
    action=body.get('action','list');kind=body.get('kind');name=body.get('ref');version=body.get('version')
    if action=='list':
        rows=await store.call('p4_catalog_read',owner,ref)
        return {'functions':catalog(env),'reducers':[{'name':k,'version':v} for k,v in REDUCERS.items()],
                'runtime':{'images':({'hosted':os.environ.get('WORKFLOW_SANDBOX_IMAGE')} if os.environ.get('WORKFLOW_SANDBOX_BACKEND')=='vercel' else IMAGES),'limits':LIMITS,'available':await available(),'dependencies':'Pinned standard libraries only'},
                'connections':[{'connectionKey':'p4:'+owner+':'+r['ref']+':'+str(r['version']),'ref':r['ref'],'version':r['version'],'disabled':r['disabled'],'content':{k:v for k,v in r['content'].items() if k!='secretRef'},'hasCredential':bool(r['content'].get('secretRef'))} for r in rows if r['kind']=='connection']}
    if kind not in ('function','connection') or not isinstance(name,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,79}',name) or isinstance(version,bool) or not isinstance(version,int) or not 1<=version<=100000:
        raise ExecutionError('INVALID_EXTENSION','Provide a kind, stable reference and positive immutable version')
    if name.startswith(('edu.','core.')): raise ExecutionError('RESERVED_REFERENCE','Built-in references cannot be changed','auth')
    if action=='disable': return await store.call('p4_catalog_save',owner,ref,kind,name,version,{},True)
    if action=='test':
        key='p4:'+owner+':'+name+':'+str(version)
        started=time.monotonic()
        if kind=='function':
            rows=await store.call('p4_catalog_read',owner,ref)
            saved=next((r for r in rows if r['kind']=='function' and r['ref']==name and r['version']==version and not r['disabled']),None)
            draft=body.get('content')
            if isinstance(draft,dict) and isinstance(draft.get('code'),str) and draft.get('language') in IMAGES:
                schema_check(draft.get('inputSchema',{'type':'object'}))
                schema_check(draft.get('outputSchema',{'type':'object'}))
                f={**draft,'inputSchema':draft.get('inputSchema',{'type':'object'}),'outputSchema':draft.get('outputSchema',{'type':'object'})}
            elif saved:
                f=saved['content']
            else:
                raise ExecutionError('FUNCTION_UNAVAILABLE','Function version is missing or disabled','auth')
            from .execution_policies import invoke_function
            try:
                output=await invoke_function(f,body.get('arguments',{}),{'phase':'extension-test','runId':'extension-test','stepId':'extension-test'},10,None)
            except ExecutionError as error:
                return {'ok':False,'elapsedMs':elapsed_ms(started),'error':{'code':error.code,'message':str(error)}}
            return {'ok':True,'elapsedMs':elapsed_ms(started),'output':output}
        rows=await store.call('p4_catalog_read',owner,ref)
        saved=next((r for r in rows if r['kind']=='connection' and r['ref']==name and r['version']==version and not r['disabled']),None)
        if not saved: raise ExecutionError('CONNECTION_UNAVAILABLE','Connection unavailable','auth')
        c=saved['content']
        if c['type']=='http':
            tool=next((t for t in env['tools'] if t['ref']==key),None)
            if tool is None: raise ExecutionError('CONNECTION_UNAVAILABLE','Connection unavailable','auth')
            if tool['sideEffect']=='write' and body.get('confirmExternalEffect') is not True: raise ExecutionError('EXTERNAL_EFFECT_CONFIRMATION_REQUIRED','Confirm the external effect','policy')
        started=time.monotonic()
        try:
            if c['type'] in MODEL_CONNECTION_TYPES:
                base_url=c.get('baseUrl',DEEPSEEK_BASE_URL) if c['type']=='openai-compatible' else DEEPSEEK_BASE_URL
                message=body.get('testMessage')
                model=body.get('testModel')
                if isinstance(message,str):
                    if not isinstance(model,str) or not model.strip(): raise ExecutionError('CONNECTION_TEST_FAILED','Choose a model to test')
                    reply=await fetch_model_reply(base_url,c.get('secretRef'),model.strip(),message,env)
                    return {'ok':True,'elapsedMs':elapsed_ms(started),'reply':reply,'models':[model.strip()]}
                models=await fetch_model_ids(base_url,c.get('secretRef'),env)
                return {'ok':True,'elapsedMs':elapsed_ms(started),'models':models}
            if c['type']=='http':
                result=await http_test_preview(tool,env,body.get('arguments',{}))
                return {**result,'elapsedMs':elapsed_ms(started)}
            from .tools import discover
            tools=await discover(registry,env,key)
            path=os.environ.get('WORKFLOW_CATALOG_FILE')
            if path:
                from pathlib import Path
                connector=next(c for c in env['connectors'] if c['ref']==key)
                saved=json.loads(Path(path).read_text()) if Path(path).exists() else {}
                saved[ref+':'+key]={'connectorDigest':digest(connector),'tools':tools}
                temporary=Path(path+'.tmp');temporary.write_text(json.dumps(saved));temporary.replace(path)
            return {'ok':True,'elapsedMs':elapsed_ms(started),'tools':[{'name':t['name'],'description':t.get('description','')} for t in tools]}
        except ExecutionError as error:
            return {'ok':False,'error':{'code':error.code,'message':str(error)}}
        except Exception:
            return {'ok':False,'error':{'code':'CONNECTION_TEST_FAILED','message':'Connection test failed'}}
    if action!='publish': raise ExecutionError('INVALID_EXTENSION','Unknown extension operation')
    c=body.get('content')
    if not isinstance(c,dict): raise ExecutionError('INVALID_EXTENSION','Provide an object configuration')
    credential=body.get('credential','')
    if not isinstance(credential,str) or len(credential)>8000: raise ExecutionError('INVALID_CREDENTIAL','Credential must be bounded text')
    if credential and credential in json.dumps(c): raise ExecutionError('CREDENTIAL_IN_CONFIGURATION','Place credentials only in the protected credential field','policy')
    if kind=='function':
        if set(c)-{'name','language','code','inputSchema','outputSchema','purpose','description'} or c.get('language') not in IMAGES or not isinstance(c.get('code'),str) or not 1<=len(c['code'])<=32768: raise ExecutionError('INVALID_FUNCTION','Provide supported code and schemas')
        if 'description' in c and (not isinstance(c['description'],str) or len(c['description'])>500): raise ExecutionError('INVALID_FUNCTION','Description must be at most 500 characters')
        if c.get('purpose','node') not in ('node','handler'): raise ExecutionError('INVALID_FUNCTION_PURPOSE','Choose node or handler purpose')
        from .credentials import assert_no_secrets
        assert_no_secrets(c,env)
        for key in ('inputSchema','outputSchema'):
            schema_check(c.get(key,{'type':'object'}))
            if c.get(key,{}).get('type','object')!='object': raise ExecutionError('INVALID_FUNCTION_SCHEMA','Function interfaces must be objects')
        c={**c,'inputSchema':c.get('inputSchema',{'type':'object'}),'outputSchema':c.get('outputSchema',{'type':'object'})}
        return await store.call('p4_catalog_save',owner,ref,kind,name,version,c,False)
    c=await validate_connection(c,credential,env)
    return await store.call('p4_connection_save',owner,ref,name,version,c,credential)

def http_connection_tool(c,r,key,headers,env):
    """Project one immutable HTTP connection version into the Worker tool descriptor.

    Node-sourced parameters become required inputs. Fixed and variable parameters
    are resolved here so the runtime never receives ordinary variable authority.
    """
    params=c.get('params') or []
    path=c.get('path','/') or '/'
    base_schema=c.get('inputSchema') if isinstance(c.get('inputSchema'),dict) else {'type':'object'}
    properties=dict(base_schema.get('properties') or {})
    required=[name for name in (base_schema.get('required') or []) if isinstance(name,str)]
    body=c.get('body') or {'mode':'none'}
    body_mode=body.get('mode','none')
    query_params={}
    query_argument_names=[]
    body_argument_names=[]
    for row in params:
        name=row['name']
        if row['source']=='node':
            properties[name]={'type':'string','title':name,'description':row.get('description','')}
            if row.get('required') and name not in required: required.append(name)
            if '{{'+name+'}}' in path or '{'+name+'}' in path:
                continue
            if body_mode!='none' and c.get('method')!='GET': body_argument_names.append(name)
            else: query_argument_names.append(name)
        else:
            value=row.get('value','')
            if row['source']=='variable':
                variables=env.get('variables') or {}
                if row['value'] not in variables: raise ExecutionError('INVALID_CONNECTION','Variable '+row['value']+' is unavailable','policy')
                value=variables[row['value']]
            query_params[name]=str(value)
    input_schema={**base_schema,'type':'object','properties':properties}
    if required: input_schema['required']=required
    tool={'ref':key,'name':c.get('name') or r['ref'],'description':c.get('description') or c.get('name',r['ref']),'version':r['version'],'adapter':'http',
          'baseUrl':c['baseUrl'],'path':path,'method':c.get('method','GET'),'bodyArguments':c.get('method')!='GET' and body_mode=='none',
          'headerSecretRefs':headers,'sideEffect':c['sideEffect'],'inputSchema':input_schema,
          'outputSchema':c.get('outputSchema',{'type':'object'}),
          'requestHeaders':{row['name']:row['value'] for row in (c.get('headers') or [])},
          'queryParams':query_params,'queryArgumentNames':query_argument_names,'bodyArgumentNames':body_argument_names,
          'body':body if body_mode!='none' else None,'auth':c.get('auth') or {'type':'none'},
          'settings':c.get('settings') or {},'outputMap':c.get('outputMap') or [],
          **({'fixture':True} if c.get('fixture') is True else {})}
    if c.get('secretRef'): tool['authSecretRef']=c['secretRef']
    return tool

def hydrate_connections(env,owner,rows):
    env.setdefault('capabilityOrigins',{})
    for r in rows:
        if r['kind']!='connection' or r['disabled']: continue
        c=r['content'];key='p4:'+owner+':'+r['ref']+':'+str(r['version']);headers={c.get('credentialHeader','Authorization'):c['secretRef']} if c.get('secretRef') else {}
        env['capabilityOrigins'][key]={'origin':'user','connectionRef':r['ref'],'version':r['version']}
        if c['type'] in MODEL_CONNECTION_TYPES:
            provider={'ref':key,'name':c.get('name',r['ref']),'modelRefs':c['modelRefs'],'baseUrl':DEEPSEEK_BASE_URL if c['type']=='deepseek' else c['baseUrl'],'adapter':'deepseek' if c['type']=='deepseek' else 'openai'}
            if c.get('secretRef'): provider['secretRef']=c['secretRef']
            env['providers'].append(provider)
        elif c['type']=='http': env['tools'].append(http_connection_tool(c,r,key,headers,env))
        else: env['connectors'].append({'ref':key,'name':c.get('name',r['ref']),'transport':'streamable-http','url':c['url'],'headerSecretRefs':headers,'allowedToolNames':c['allowedToolNames'],'sideEffect':'write',**({'fixture':True} if c.get('fixture') is True else {})})
    return env
