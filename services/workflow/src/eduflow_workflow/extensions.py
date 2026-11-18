"""Authenticated owner catalogs and managed connection configuration, backed by SQL/Vault."""
import asyncio
import json
import os
import re
import time
import uuid
from urllib.parse import urlparse
import httpx
from .contracts import ExecutionError,validate_value,schema_check,digest
from .storage import Storage
from .execution_policies import catalog,REDUCERS
from .sandbox import IMAGES,LIMITS,available
from .model_transport import DEEPSEEK_BASE_URL, JSON_RESPONSE_FORMAT, create_model_client, model_request_headers, normalize_model_headers, parse_structured_output, structured_instruction

CONNECTION_TYPES=('http','deepseek','mcp-http','openai-compatible')
CONNECTION_FIELDS={'type','name','baseUrl','path','method','sideEffect','inputSchema','outputSchema','modelRefs','url','transport','authType','allowedToolNames','credentialHeader','description','secretRef','oauth','registryServerId','serverTitle',
                   'params','headers','body','auth','settings','outputMap','sessionAffinityHeader'}
MCP_CONNECTION_FIELDS={'type','name','url','transport','authType','allowedToolNames','credentialHeader','description','oauth','registryServerId','serverTitle'}
MCP_AUTH_TYPES=('none','bearer','api-key','oauth','legacy')
MCP_TOOL_NAME=re.compile(r'^[A-Za-z0-9_.:/-]{1,200}$')
MAX_MCP_TOOLS=200
OPENAI_COMPATIBLE_FIELDS={'type','name','baseUrl','modelRefs','credentialHeader','description','secretRef','headers','sessionAffinityHeader'}
MODEL_CONNECTION_TYPES=('deepseek','openai-compatible')
MODEL_REF_PATTERN=re.compile(r'^[\w.:/-]+$',re.ASCII)
MAX_MODEL_REFS=50
PREVIEW_BYTES=4096
LOCAL_LOOPBACK_HOSTS=('localhost','127.0.0.1')

def connector_cache_digest(connector):
    # Discovery names are display metadata, not connection identity. Keeping them
    # out prevents a loaded cache from invalidating itself on the next refresh.
    return digest({key:value for key,value in connector.items() if key!='discoveredToolNames'})

CATALOG_PLACEHOLDER='discoveryPlaceholder'

def is_catalog_placeholder(tool):
    """True only for the name-only cache entry written by the compact fallback."""
    return isinstance(tool,dict) and tool.get(CATALOG_PLACEHOLDER) is True

def compact_catalog_tools(tools,allowed_names):
    """Keep allowed descriptors complete and every other discovered name only.

    The database bounds one discovery row to 256 KiB. A large tools/list result
    (for example Notion) can exceed that bound even though only a small allowed
    subset can ever execute. Placeholders keep the complete catalog browsable
    for the UI without fabricating a schema or granting an executable tool.
    """
    allowed=set(allowed_names or [])
    compact=[]
    for tool in tools if isinstance(tools,list) else []:
        if not isinstance(tool,dict): continue
        name=tool.get('name')
        if isinstance(name,str) and name in allowed:
            compact.append(tool)
        elif isinstance(name,str) and name:
            compact.append({'name':name,CATALOG_PLACEHOLDER:True})
    return compact

async def save_discovered_catalog(store,key,connector,tools):
    """Persist one discovery result, retrying once with placeholders on row overflow.

    Only the explicit row-size classification triggers the compact retry. Quota
    exhaustion is never masked, and if the allowed descriptors alone still
    exceed the row bound the second error reaches the caller unchanged.
    """
    cache_digest=connector_cache_digest(connector)
    try:
        return await store.call('p6_catalog_put',key,cache_digest,tools)
    except ExecutionError as error:
        if error.code!='CATALOG_PAYLOAD_TOO_LARGE': raise
        compact=compact_catalog_tools(tools,connector.get('allowedToolNames') or [])
        return await store.call('p6_catalog_put',key,cache_digest,compact)

HTTP_METHODS=('GET','POST','PUT','PATCH','DELETE')
HTTP_BODY_MODES=('none','json','form-data','x-www-form-urlencoded','raw')
HTTP_AUTH_TYPES=('none','api-key-header','api-key-query','bearer','basic')
HTTP_RESPONSE_FORMATS=('json','text')
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
    response_format=value.get('responseFormat')
    if response_format is not None:
        if response_format not in HTTP_RESPONSE_FORMATS: raise ExecutionError('INVALID_CONNECTION','Response format must be json or text')
        # JSON is the existing default and remains absent from the immutable
        # content so older connection digests and fingerprints stay identical.
        if response_format=='text': settings['responseFormat']='text'
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

def reusable_secret_ref(rows,ref,content):
    """Reuse the latest saved credential only when the provider target is unchanged.

    The browser never sees this reference; the publish request may omit the
    credential when an owner edits only the enabled model list of an existing
    provider.
    """
    previous=max((row for row in rows if row.get('kind')=='connection' and row.get('ref')==ref and not row.get('disabled')),key=lambda row:int(row.get('version') or 0),default=None)
    if previous is None: return None
    saved=previous.get('content') or {}
    secret=saved.get('secretRef')
    if not isinstance(secret,str) or not secret: return None
    if saved.get('type')!=content.get('type'): return None
    if content.get('type') not in ('deepseek','openai-compatible','mcp-http'): return None
    if content.get('type')=='openai-compatible' and str(saved.get('baseUrl','')).rstrip('/')!=str(content.get('baseUrl','')).rstrip('/'): return None
    if content.get('type')=='mcp-http':
        if str(saved.get('url','')).rstrip('/')!=str(content.get('url','')).rstrip('/'): return None
        if (saved.get('authType') or 'legacy')!=(content.get('authType') or 'legacy'): return None
        saved_header=saved.get('credentialHeader') or ('X-API-Key' if (saved.get('authType') or '')=='api-key' else 'Authorization')
        content_header=content.get('credentialHeader') or ('X-API-Key' if (content.get('authType') or '')=='api-key' else 'Authorization')
        if saved_header!=content_header: return None
    return secret

def mcp_tool_names(value,required=False):
    """Bounded, de-duplicated MCP allowlist. An empty list means connected but not yet allowed."""
    if value is None:
        if required: raise ExecutionError('INVALID_CONNECTION','Select at least one MCP tool')
        return []
    if not isinstance(value,list) or len(value)>MAX_MCP_TOOLS: raise ExecutionError('INVALID_CONNECTION','Choose at most 200 MCP tools')
    names=[]
    for item in value:
        if not isinstance(item,str) or not MCP_TOOL_NAME.fullmatch(item): raise ExecutionError('INVALID_CONNECTION','MCP tool names are invalid')
        if item not in names: names.append(item)
    return names

def mcp_oauth_metadata(value):
    if not isinstance(value,dict): raise ExecutionError('INVALID_CONNECTION','Provide OAuth authorization metadata')
    allowed={'issuer','authorizationEndpoint','tokenEndpoint','clientId','resource','scope','tokenEndpointAuthMethod','redirectUri'}
    if set(value)-allowed: raise ExecutionError('INVALID_CONNECTION','Unsupported OAuth metadata field')
    for key in ('tokenEndpoint','clientId'):
        item=value.get(key)
        if not isinstance(item,str) or not 1<=len(item)<=2048: raise ExecutionError('INVALID_CONNECTION','OAuth metadata is invalid')
    for key in ('issuer','authorizationEndpoint','resource','redirectUri'):
        item=value.get(key)
        if item is not None and (not isinstance(item,str) or not 1<=len(item)<=2048): raise ExecutionError('INVALID_CONNECTION','OAuth metadata is invalid')
    for key in ('scope','tokenEndpointAuthMethod'):
        item=value.get(key)
        if item is not None and (not isinstance(item,str) or len(item)>500): raise ExecutionError('INVALID_CONNECTION','OAuth metadata is invalid')
    return value

async def validate_mcp_connection(c,credential,env,credential_reused=False):
    if set(c)-MCP_CONNECTION_FIELDS: raise ExecutionError('INVALID_CONNECTION','Unsupported MCP connection field')
    raw=c.get('url','');parsed=urlparse(raw)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.fragment: raise ExecutionError('INVALID_CONNECTION','Provide a valid MCP endpoint without credentials')
    local_http=parsed.scheme=='http' and parsed.hostname in LOCAL_LOOPBACK_HOSTS and local_fixtures_allowed(env)
    if parsed.scheme=='http' and not local_http: raise ExecutionError('INVALID_CONNECTION','Plain HTTP is only allowed for local fixture environments')
    transport=c.get('transport','streamable-http')
    if transport not in ('streamable-http','sse'): raise ExecutionError('INVALID_CONNECTION','Choose a supported remote MCP transport')
    auth_type=c.get('authType') or ('legacy' if credential or credential_reused else 'none')
    if auth_type not in MCP_AUTH_TYPES: raise ExecutionError('INVALID_CONNECTION','Choose a supported MCP authentication type')
    credential_header=c.get('credentialHeader','X-API-Key' if auth_type=='api-key' else 'Authorization')
    if auth_type=='api-key':
        if not isinstance(credential_header,str) or not HTTP_HEADER_NAME.fullmatch(credential_header.strip()) or credential_header.lower() in ('host','content-length','connection','cookie','set-cookie'): raise ExecutionError('INVALID_CONNECTION','Provide a valid API key header')
        credential_header=credential_header.strip()
    elif auth_type=='legacy':
        credential_header=c.get('credentialHeader','Authorization')
        if credential_header not in ('Authorization','X-API-Key'): raise ExecutionError('INVALID_CONNECTION','Unsupported credential header')
    elif auth_type in ('bearer','oauth'):
        credential_header='Authorization'
    else:
        credential_header=None
    if auth_type=='none' and credential: raise ExecutionError('INVALID_CONNECTION','This MCP service does not take a credential')
    if auth_type in ('bearer','api-key','legacy') and not credential and not credential_reused: raise ExecutionError('INVALID_CONNECTION','Provide the MCP credential')
    if auth_type=='oauth':
        c['oauth']=mcp_oauth_metadata(c.get('oauth'))
        token_endpoint=c['oauth']['tokenEndpoint']
        token_url=urlparse(token_endpoint)
        if token_url.scheme not in ('http','https') or not token_url.hostname or token_url.username or token_url.password: raise ExecutionError('INVALID_CONNECTION','OAuth token endpoint is invalid')
        await assert_destination(token_url.scheme+'://'+token_url.netloc,env,token_url.path or '/')
        if not credential and not credential_reused: raise ExecutionError('INVALID_CONNECTION','OAuth authorization must be completed before saving')
        if credential:
            try: bundle=json.loads(credential)
            except ValueError: raise ExecutionError('INVALID_CONNECTION','OAuth token bundle is invalid') from None
            if not isinstance(bundle,dict) or not isinstance(bundle.get('access_token'),str) or not bundle['access_token']: raise ExecutionError('INVALID_CONNECTION','OAuth token bundle is invalid')
    c['url']=raw; c['transport']=transport; c['authType']=auth_type; c['allowedToolNames']=mcp_tool_names(c.get('allowedToolNames'))
    if credential_header: c['credentialHeader']=credential_header
    else: c.pop('credentialHeader',None)
    await assert_destination(parsed.scheme+'://'+parsed.netloc,env,parsed.path or '/')
    return c

def mcp_connector(content,ref,owner,version=1,credential=None):
    """One MCP connection descriptor. A preflight credential lives only in this request object."""
    auth_type=content.get('authType') or ('legacy' if content.get('secretRef') else 'none')
    connector={'ref':ref,'name':content.get('name',ref),'transport':content.get('transport','streamable-http'),
               'url':content['url'],'allowedToolNames':content.get('allowedToolNames') or [],'sideEffect':'write',
               'authType':auth_type,'credentialHeader':content.get('credentialHeader','Authorization'),
               **({'secretRef':content['secretRef']} if content.get('secretRef') else {}),
               **({'oauth':content['oauth']} if content.get('oauth') else {}),
               **({'ephemeralCredential':credential} if isinstance(credential,str) and credential else {}),
               # Discovery cache identity includes the per-tool effect policy so
               # tools cached under the old blanket-write model are rediscovered.
               'toolEffectPolicy':5}
    return connector

def _scrub_ephemeral(value,credential):
    """Fields a remote server returns must never echo the request-time credential."""
    if not credential: return value
    if isinstance(value,str): return value.replace(credential,'[REDACTED]')
    if isinstance(value,list): return [_scrub_ephemeral(item,credential) for item in value]
    if isinstance(value,dict): return {key:_scrub_ephemeral(item,credential) for key,item in value.items()}
    return value

async def validate_connection(content,credential,env,credential_reused=False):
    """Validate and normalize a connection publish payload; credentials never enter content."""
    c=dict(content)
    if set(c)-CONNECTION_FIELDS or c.get('type') not in CONNECTION_TYPES: raise ExecutionError('INVALID_CONNECTION','Supported types: HTTP, DeepSeek, MCP HTTP, OpenAI-compatible')
    if 'name' in c and (not isinstance(c['name'],str) or not 1<=len(c['name'])<=120): raise ExecutionError('INVALID_CONNECTION','Name must be 1–120 characters')
    if 'description' in c and (not isinstance(c['description'],str) or len(c['description'])>500): raise ExecutionError('INVALID_CONNECTION','Description must be at most 500 characters')
    # The managed secret reference is injected by the database; callers supply only the credential field.
    if 'secretRef' in c: raise ExecutionError('INVALID_CONNECTION','Credentials must be supplied separately; secretRef is managed by the platform')
    ctype=c['type']
    if ctype in MODEL_CONNECTION_TYPES:
        c.update(normalize_model_headers(c))
        if not c.get('headers'): c.pop('headers',None)
        if not c.get('sessionAffinityHeader'): c.pop('sessionAffinityHeader',None)
    if ctype=='deepseek':
        if c.get('credentialHeader','Authorization')!='Authorization': raise ExecutionError('INVALID_CONNECTION','Only the Authorization header is supported for model connections')
        if c.get('baseUrl',DEEPSEEK_BASE_URL)!=DEEPSEEK_BASE_URL: raise ExecutionError('INVALID_CONNECTION','Use the official DeepSeek base URL')
        if not credential and not credential_reused: raise ExecutionError('INVALID_CONNECTION','Provide a DeepSeek credential')
        c['modelRefs']=model_refs(c.get('modelRefs'))
        return c
    if ctype=='openai-compatible':
        return await validate_model_connection(c,credential,env,credential_reused)
    if 'sessionAffinityHeader' in c: raise ExecutionError('INVALID_CONNECTION','Session Headers are only available for model connections')
    if ctype=='mcp-http':
        return await validate_mcp_connection(c,credential,env,credential_reused)
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
        if c['settings'].get('responseFormat')=='text' and c['settings'].get('resultPath'):
            raise ExecutionError('INVALID_CONNECTION','Text responses cannot use a result path; map the whole text with a response field')
        if c['settings'].get('responseFormat')=='text' and any(row.get('path') for row in c['outputMap']):
            raise ExecutionError('INVALID_CONNECTION','Text response fields must map the whole text with an empty path')
        if c['body']['mode']!='none' and method=='GET': raise ExecutionError('INVALID_CONNECTION','GET requests cannot carry a body')
    return c

async def validate_model_connection(c,credential,env,credential_reused=False):
    """OpenAI-compatible gateways: one provider, many explicitly enabled models (R8)."""
    if set(c)-OPENAI_COMPATIBLE_FIELDS: raise ExecutionError('INVALID_CONNECTION','Unsupported OpenAI-compatible connection field')
    raw=c.get('baseUrl')
    if not isinstance(raw,str) or not 1<=len(raw)<=2000: raise ExecutionError('INVALID_CONNECTION','Provide an OpenAI-compatible base URL')
    parsed=urlparse(raw)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment: raise ExecutionError('INVALID_CONNECTION','Provide a valid OpenAI-compatible base URL without credentials')
    local_http=parsed.scheme=='http' and parsed.hostname in LOCAL_LOOPBACK_HOSTS and local_fixtures_allowed(env)
    if parsed.scheme=='http' and not local_http: raise ExecutionError('INVALID_CONNECTION','Plain HTTP is only allowed for local fixture environments')
    if c.get('credentialHeader','Authorization')!='Authorization': raise ExecutionError('INVALID_CONNECTION','Only the Authorization header is supported for model connections')
    if not credential and not credential_reused and not local_http: raise ExecutionError('INVALID_CONNECTION','Provide a credential for the model provider')
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

async def fetch_model_ids(base_url,secret_ref,env,timeout=10,*,provider=None):
    """GET {baseUrl}/models through the same pinned outbound policy used for tools."""
    from .tools import PinnedTransport,safe_http_url,secret
    url,ip=await safe_http_url({'baseUrl':base_url.rstrip('/'),'path':'/models'},env,{})
    headers=model_request_headers(provider or {},str(uuid.uuid4()))
    if secret_ref: headers['Authorization']='Bearer '+secret(secret_ref)
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

async def fetch_model_reply(provider,model,message,env,*,credential=None,structured=False,timeout=30):
    """Exercise the same SDK, request profile and JSON mode as a Workflow node."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from .tools import model_http_client, secret

    if not isinstance(message,str) or not 1<=len(message)<=2000:
        raise ExecutionError('CONNECTION_TEST_FAILED','Provide a bounded test message')
    fields=[{'name':'summary','type':'string'}]
    messages=[HumanMessage(content=message)]
    if structured: messages.insert(0,SystemMessage(content=structured_instruction(fields)))
    if not credential and provider.get('secretRef'): credential=secret(provider['secretRef'])
    try:
        async with asyncio.timeout(timeout), model_http_client(provider['baseUrl'],env) as client:
            sdk=create_model_client(provider,model,env,str(uuid.uuid4()),512 if structured else 256,timeout,
                                    credential=credential,http_client=client)
            if structured:
                text=''
                finish_reason=None
                async for chunk in sdk.astream(messages,response_format=JSON_RESPONSE_FORMAT,stream_usage=True):
                    text+=chunk.text
                    finish_reason=chunk.response_metadata.get('finish_reason') or finish_reason
                    if len(text)>8192: raise ExecutionError('CONNECTION_TEST_FAILED','Model reply exceeded the test limit')
                if finish_reason!='stop': raise ExecutionError('CONNECTION_TEST_FAILED','Model did not complete the structured response')
                summary=parse_structured_output(text,fields)['summary']
                return json.dumps({'summary':_scrub_ephemeral(summary,credential)[:400]},ensure_ascii=False)
            else:
                reply=(await sdk.ainvoke(messages)).text
        if not reply.strip(): raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint did not return reply text')
    except ExecutionError: raise
    except Exception as error:
        from openai import APITimeoutError
        if isinstance(error,(TimeoutError,httpx.TimeoutException,APITimeoutError)):
            raise ExecutionError('CONNECTION_TEST_TIMEOUT','Model endpoint timed out') from None
        status=getattr(error,'status_code',None)
        if isinstance(status,int): raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint returned HTTP '+str(status)) from None
        raise ExecutionError('CONNECTION_TEST_FAILED','Model endpoint did not return a usable reply') from None
    return _scrub_ephemeral(reply,credential)[:500]

def model_connection_provider(content,key):
    """Project the same immutable connection fields for testing and execution."""
    deepseek=content['type']=='deepseek'
    return {'ref':key,'name':content.get('name',key),'modelRefs':content['modelRefs'],
            'baseUrl':DEEPSEEK_BASE_URL if deepseek else content['baseUrl'],
            'adapter':'deepseek' if deepseek else 'openai',
            **{name:content[name] for name in ('headers','sessionAffinityHeader','secretRef') if name in content}}

async def test_model_connection(content,key,body,env,started,credential=None):
    provider=model_connection_provider(content,key)
    message=body.get('testMessage')
    if not isinstance(message,str):
        models=await fetch_model_ids(provider['baseUrl'],provider.get('secretRef'),env,provider=provider)
        return {'ok':True,'elapsedMs':elapsed_ms(started),'models':models}
    model=body.get('testModel')
    mode=body.get('testMode','text')
    if not isinstance(model,str) or not model.strip(): raise ExecutionError('CONNECTION_TEST_FAILED','Choose a model to test')
    if mode not in ('text','stream-json'): raise ExecutionError('CONNECTION_TEST_FAILED','Unsupported model test mode')
    reply=await fetch_model_reply(provider,model.strip(),message,env,credential=credential,structured=mode=='stream-json')
    return {'ok':True,'elapsedMs':elapsed_ms(started),'reply':reply,'models':[model.strip()]}

def preview_text(content):
    return content.encode('utf-8')[:PREVIEW_BYTES].decode('utf-8','ignore')

async def http_test_preview(tool,env,arguments,timeout=10):
    """Registered HTTP test: raw bounded body, credentials redacted before the preview is returned.

    Text mode applies the same strict content-type/UTF-8 checks as execution so a
    successful test cannot hide a format the actual tool will reject.
    """
    from .credentials import assert_no_secrets
    from .tools import PinnedTransport,safe_http_url,_http_auth,_http_body,_http_headers,decode_text_response,response_format
    assert_no_secrets(arguments,env)
    validate_value(tool['inputSchema'],arguments,'INVALID_TOOL_ARGUMENTS')
    format=response_format(tool)
    url,ip=await safe_http_url(tool,env,arguments)
    headers=_http_headers(tool,env)
    kwargs=_http_body(tool,arguments)
    _,secret_query=_http_auth(tool,env)
    if secret_query:
        from urllib.parse import urlencode,parse_qsl,urlunparse
        parts=urlparse(url); query=dict(parse_qsl(parts.query)); query.update(secret_query)
        url=urlunparse(parts._replace(query=urlencode(query)))
    content=bytearray();status=None;content_type=None
    try:
        async with httpx.AsyncClient(transport=PinnedTransport(urlparse(url).hostname,ip),timeout=timeout,follow_redirects=False,trust_env=False) as client:
            async with client.stream(tool['method'],url,headers=headers,**kwargs) as response:
                status=response.status_code
                content_type=response.headers.get('content-type')
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if format=='text':
                        if len(content)>1048576: raise ExecutionError('TOOL_OUTPUT_TOO_LARGE','Tool response exceeds limit','policy',reason='provider_error')
                    elif len(content)>=PREVIEW_BYTES*4: break
    except httpx.TimeoutException: raise ExecutionError('CONNECTION_TEST_TIMEOUT','HTTP endpoint timed out') from None
    except ExecutionError: raise
    except Exception: raise ExecutionError('CONNECTION_TEST_FAILED','HTTP endpoint is unreachable') from None
    if format=='text' and 200<=status<300:
        text=decode_text_response(bytes(content),content_type)
    else:
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
                'environment':registry.public_environment(env),
                'connections':[{'connectionKey':'p4:'+owner+':'+r['ref']+':'+str(r['version']),'ref':r['ref'],'version':r['version'],'disabled':r['disabled'],'content':{k:v for k,v in r['content'].items() if k!='secretRef'},'hasCredential':bool(r['content'].get('secretRef'))} for r in rows if r['kind']=='connection']}
    if action=='inspect':
        draft=body.get('content')
        if not isinstance(draft,dict) or draft.get('type')!='mcp-http': raise ExecutionError('INVALID_EXTENSION','Provide an MCP connection draft')
        credential=body.get('credential','')
        if not isinstance(credential,str) or len(credential)>16000: raise ExecutionError('INVALID_CREDENTIAL','Credential must be bounded text')
        draft=await validate_connection(draft,credential,env,False)
        connector=mcp_connector(draft,'inspect',owner,credential=credential)
        started=time.monotonic()
        try:
            from .tools import inspect_tools
            tools=await inspect_tools(connector,env)
            return {'ok':True,'elapsedMs':elapsed_ms(started),'tools':_scrub_ephemeral([{'name':t['name'],'description':t.get('description',''),'inputSchema':t.get('inputSchema',{'type':'object'})} for t in tools],credential)}
        except ExecutionError as error:
            return {'ok':False,'elapsedMs':elapsed_ms(started),'error':{'code':error.code,'message':_scrub_ephemeral(str(error),credential)}}
    if kind not in ('function','connection') or not isinstance(name,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,79}',name) or isinstance(version,bool) or not isinstance(version,int) or not 1<=version<=100000:
        raise ExecutionError('INVALID_EXTENSION','Provide a kind, stable reference and positive immutable version')
    if name.startswith(('edu.','core.')): raise ExecutionError('RESERVED_REFERENCE','Built-in references cannot be changed','auth')
    if action in ('rename','restore','delete'):
        # Display identity lives in the mutable content; the stable ref never changes.
        # These operations only target the newest immutable version so a stale browser
        # cannot revive or delete a newer owner-visible state.
        rows=await store.call('p4_catalog_read',owner,ref)
        if kind=='function':
            if action!='delete': raise ExecutionError('INVALID_EXTENSION','Only managed connections support this operation')
            versions=[row for row in rows if row.get('kind')=='function' and row.get('ref')==name]
            if not versions: raise ExecutionError('FUNCTION_UNAVAILABLE','Function unavailable','auth')
            latest_version=max(int(row.get('version') or 0) for row in versions)
            if version!=latest_version: raise ExecutionError('FUNCTION_VERSION_CONFLICT','Function changed; refresh before deleting','validation')
            return await store.call('p4_function_delete',owner,ref,name,version)
        if kind!='connection': raise ExecutionError('INVALID_EXTENSION','Only managed connections support this operation')
        versions=[row for row in rows if row.get('kind')=='connection' and row.get('ref')==name]
        if not versions: raise ExecutionError('CONNECTION_UNAVAILABLE','Connection unavailable','auth')
        latest=max(versions,key=lambda row:int(row.get('version') or 0))
        latest_version=int(latest.get('version') or 0)
        if action=='delete':
            if version!=latest_version: raise ExecutionError('CONNECTION_VERSION_CONFLICT','Connection changed; refresh before deleting','validation')
            return await store.call('p4_connection_delete',owner,ref,name,version)
        if version!=latest_version+1: raise ExecutionError('CONNECTION_VERSION_CONFLICT','Connection changed; refresh before saving','validation')
        if action=='restore':
            if not latest.get('disabled'): raise ExecutionError('CONNECTION_NOT_DISABLED','Connection is already active','validation')
            return await store.call('p4_catalog_save',owner,ref,kind,name,version,latest.get('content') or {},False)
        draft=body.get('content')
        if not isinstance(draft,dict) or set(draft)!={'name'}: raise ExecutionError('INVALID_CONNECTION','Provide only the display name')
        new_name=draft.get('name')
        if not isinstance(new_name,str) or not 1<=len(new_name.strip())<=120: raise ExecutionError('INVALID_CONNECTION','Name must be 1–120 characters')
        if latest.get('disabled'): raise ExecutionError('CONNECTION_DISABLED','Restore the connection before renaming it','auth')
        content={**(latest.get('content') or {}),'name':new_name.strip()}
        return await store.call('p4_catalog_save',owner,ref,kind,name,version,content,False)
    if action=='disable':
        if kind=='connection':
            # Disconnect is a logical-connection operation: every immutable version
            # is revoked, so an old Workflow cannot keep calling the removed service.
            rows=await store.call('p4_catalog_read',owner,ref)
            versions=sorted(int(row['version']) for row in rows if row['kind']=='connection' and row['ref']==name)
            if not versions: raise ExecutionError('CONNECTION_UNAVAILABLE','Connection unavailable','auth')
            for item in versions:
                await store.call('p4_catalog_save',owner,ref,kind,name,item,{},True)
            return {'ref':name,'disabled':True,'versions':versions}
        return await store.call('p4_catalog_save',owner,ref,kind,name,version,{},True)
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
        draft=body.get('content')
        if isinstance(draft,dict) and draft.get('type') in MODEL_CONNECTION_TYPES:
            credential=body.get('credential','')
            if not isinstance(credential,str) or len(credential)>8000: raise ExecutionError('INVALID_CREDENTIAL','Credential must be bounded text')
            if not isinstance(body.get('testMessage'),str): raise ExecutionError('INVALID_CONNECTION','Provide a model test message for the draft')
            reused=reusable_secret_ref([saved] if saved else [],name,draft) if not credential else None
            try:
                c=await validate_connection(draft,credential,env,credential_reused=bool(reused))
                if reused: c['secretRef']=reused
                if credential and credential in json.dumps(c): raise ExecutionError('CREDENTIAL_IN_CONFIGURATION','Place credentials only in the protected credential field','policy')
                return await test_model_connection(c,key,body,env,started,credential)
            except ExecutionError as error:
                return {'ok':False,'elapsedMs':elapsed_ms(started),'error':{'code':error.code,'message':str(error)}}
        if not saved: raise ExecutionError('CONNECTION_UNAVAILABLE','Connection unavailable','auth')
        c=saved['content']
        if c['type']=='http':
            tool=next((t for t in env['tools'] if t['ref']==key),None)
            if tool is None: raise ExecutionError('CONNECTION_UNAVAILABLE','Connection unavailable','auth')
            if tool.get('sideEffect') in ('write','unknown') and body.get('confirmExternalEffect') is not True: raise ExecutionError('EXTERNAL_EFFECT_CONFIRMATION_REQUIRED','Confirm the external effect','policy')
        started=time.monotonic()
        try:
            if c['type'] in MODEL_CONNECTION_TYPES:
                return await test_model_connection(c,key,body,env,started)
            if c['type']=='http':
                result=await http_test_preview(tool,env,body.get('arguments',{}))
                return {**result,'elapsedMs':elapsed_ms(started)}
            from .tools import discover
            tools=await discover(registry,env,key,include_all=True)
            connector=next(c for c in env['connectors'] if c['ref']==key)
            allowed=[t for t in tools if t['name'] in connector.get('allowedToolNames',[])]
            path=os.environ.get('WORKFLOW_CATALOG_FILE')
            if path:
                from pathlib import Path
                saved=json.loads(Path(path).read_text()) if Path(path).exists() else {}
                # Cache the complete tools/list result; execution still uses
                # only the explicitly allowed subset.
                saved[ref+':'+key]={'connectorDigest':connector_cache_digest(connector),'tools':tools}
                temporary=Path(path+'.tmp');temporary.write_text(json.dumps(saved));temporary.replace(path)
            elif os.environ.get('WORKFLOW_DEPLOYMENT_MODE')=='hosted':
                await save_discovered_catalog(Storage(os.environ['WORKFLOW_DATABASE_URL']),env['ref']+':'+key,connector,tools)
            allowed_names={t['name'] for t in allowed}
            return {'ok':True,'elapsedMs':elapsed_ms(started),'tools':[{'name':t['name'],'description':t.get('description',''),'allowed':t['name'] in allowed_names,**({'inputSchema':t['inputSchema']} if isinstance(t.get('inputSchema'),dict) else {})} for t in tools]}
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
    rows=await store.call('p4_catalog_read',owner,ref)
    reused_secret=reusable_secret_ref(rows,name,c) if not credential else None
    c=await validate_connection(c,credential,env,credential_reused=bool(reused_secret))
    if reused_secret: c={**c,'secretRef':reused_secret}
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
    # The current active version defines the owner's live permission for every
    # immutable version of the same logical connection. Disabling all versions
    # (the disconnect operation) therefore revokes old Workflow bindings too.
    latest={}
    for row in rows:
        if row['kind']=='connection' and not row['disabled']:
            if row['ref'] not in latest or int(row['version'])>int(latest[row['ref']]['version']): latest[row['ref']]=row
    for r in rows:
        if r['kind']!='connection' or r['disabled']: continue
        c=r['content'];key='p4:'+owner+':'+r['ref']+':'+str(r['version']);headers={c.get('credentialHeader','Authorization'):c['secretRef']} if c.get('secretRef') else {}
        env['capabilityOrigins'][key]={'origin':'user','connectionRef':r['ref'],'version':r['version']}
        live=latest.get(r['ref'])
        current_allowed=(live['content'].get('allowedToolNames') or []) if live else []
        if c['type'] in MODEL_CONNECTION_TYPES:
            env['providers'].append(model_connection_provider({'name':r['ref'],**c},key))
        elif c['type']=='http': env['tools'].append(http_connection_tool(c,r,key,headers,env))
        else:
            connector=mcp_connector(c,key,owner,r['version'])
            # Old schemas remain immutable; execution uses the current owner
            # permission and cannot gain a tool that this binding never allowed.
            connector['allowedToolNames']=[name for name in connector.get('allowedToolNames',[]) if name in current_allowed]
            if live: connector['policyVersion']=live['version']
            env['connectors'].append(connector)
    return env
