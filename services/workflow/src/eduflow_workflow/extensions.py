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
CONNECTION_FIELDS={'type','name','baseUrl','path','method','sideEffect','inputSchema','outputSchema','modelRefs','url','allowedToolNames','credentialHeader','description','secretRef'}
OPENAI_COMPATIBLE_FIELDS={'type','name','baseUrl','modelRefs','credentialHeader','description','secretRef'}
MODEL_CONNECTION_TYPES=('deepseek','openai-compatible')
MODEL_REF_PATTERN=re.compile(r'^[\w.:/-]+$',re.ASCII)
MAX_MODEL_REFS=50
PREVIEW_BYTES=4096
LOCAL_LOOPBACK_HOSTS=('localhost','127.0.0.1')
DEEPSEEK_BASE_URL='https://api.deepseek.com'

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
    await assert_destination(parsed.scheme+'://'+parsed.netloc,env,(c.get('path','/') if ctype=='http' else parsed.path or '/'))
    if c.get('credentialHeader','Authorization') not in ('Authorization','X-API-Key'): raise ExecutionError('INVALID_CONNECTION','Unsupported credential header')
    if ctype=='http':
        if c.get('method','GET') not in ('GET','POST') or c.get('sideEffect') not in ('read','write') or c.get('method','GET')=='POST' and c['sideEffect']!='write': raise ExecutionError('INVALID_CONNECTION','HTTP POST is treated as an external write')
        for key in ('inputSchema','outputSchema'): schema_check(c.get(key,{'type':'object'}))
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

def preview_text(content):
    return content.encode('utf-8')[:PREVIEW_BYTES].decode('utf-8','ignore')

async def http_test_preview(tool,env,arguments,timeout=10):
    """Registered HTTP test: raw bounded body, credentials redacted before the preview is returned."""
    from .credentials import assert_no_secrets
    from .tools import PinnedTransport,safe_http_url,secret
    assert_no_secrets(arguments,env)
    validate_value(tool['inputSchema'],arguments,'INVALID_TOOL_ARGUMENTS')
    url,ip=await safe_http_url(tool,env,arguments)
    headers={name:secret(ref) for name,ref in tool.get('headerSecretRefs',{}).items()}
    content=bytearray();status=None
    try:
        async with httpx.AsyncClient(transport=PinnedTransport(urlparse(url).hostname,ip),timeout=timeout,follow_redirects=False,trust_env=False) as client:
            async with client.stream(tool['method'],url,headers=headers,json=arguments if tool.get('bodyArguments') else None) as response:
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
    owner=body['ownerId'];ref=body['environmentRef'];env=registry.environment(ref,owner)
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
        if kind!='connection': raise ExecutionError('INVALID_EXTENSION','Test functions through the node test')
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
                models=await fetch_model_ids(c.get('baseUrl',DEEPSEEK_BASE_URL) if c['type']=='openai-compatible' else DEEPSEEK_BASE_URL,c.get('secretRef'),env)
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
        if set(c)-{'name','language','code','inputSchema','outputSchema','purpose'} or c.get('language') not in IMAGES or not isinstance(c.get('code'),str) or not 1<=len(c['code'])<=32768: raise ExecutionError('INVALID_FUNCTION','Provide supported code and schemas')
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
        elif c['type']=='http': env['tools'].append({'ref':key,'name':r['ref'],'description':c.get('name',r['ref']),'version':r['version'],'adapter':'http','baseUrl':c['baseUrl'],'path':c.get('path','/'),'method':c.get('method','GET'),'bodyArguments':c.get('method')=='POST','headerSecretRefs':headers,'sideEffect':c['sideEffect'],'inputSchema':c.get('inputSchema',{'type':'object'}),'outputSchema':c.get('outputSchema',{'type':'object'})})
        else: env['connectors'].append({'ref':key,'name':c.get('name',r['ref']),'transport':'streamable-http','url':c['url'],'headerSecretRefs':headers,'allowedToolNames':c['allowedToolNames'],'sideEffect':'write'})
    return env
