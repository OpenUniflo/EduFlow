"""Server-registered HTTP/MCP/function adapters. Never accept destination or commands from a model."""
import asyncio
import base64
import ipaddress
import json
import math
import os
import socket
import time
from contextlib import asynccontextmanager
from urllib.parse import urlparse, quote, urlencode, parse_qsl, urlunparse
import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.sse import sse_client
from .contracts import ExecutionError, validate_value, canonical
from .registry import transform
from .credentials import assert_no_secrets


def declared_effect(node, tools):
    """Conservative effect authority shared by journaling and timeout policies.

    Unknown MCP effects are treated as write risk for journaling, but that risk
    is not proof that a write happened. Tool completion events keep the real
    per-tool effect instead.
    """
    refs=node['config'].get('allowedToolRefs',[]) if node['type'] in ('core.llm','core.tool_dispatch') else [node['config'].get('toolRef')] if node['type']=='core.tool' else []
    if node['type']=='core.subgraph' and node['config'].get('persistence')=='stateless' and isinstance(node['config'].get('graph'),dict):
        effects=[declared_effect(child,tools) for child in node['config']['graph'].get('nodes',[])]
        return 'write' if 'write' in effects else 'read' if 'read' in effects else 'none'
    return 'write' if any(t.get('sideEffect') in ('write','unknown') for t in tools if t['ref'] in refs) else 'read' if refs else 'none'

def mcp_tool_effect(tool):
    """Conservative MCP effect: declarations never become a trusted read permission.

    A destructive declaration raises the risk to `write`; every other MCP tool
    stays `unknown` until execution evidence exists. Neither a name prefix nor a
    read-only hint can lower confirmation or turn an MCP call into a proven read.
    """
    annotations=getattr(tool,'annotations',None)
    destructive=getattr(annotations,'destructiveHint',None) if annotations is not None else None
    return 'write' if destructive is True else 'unknown'

def mcp_tool_declarations(tool):
    """Service declarations are presentation evidence, never permission authority."""
    annotations=getattr(tool,'annotations',None)
    return {
        'declaredReadOnly': getattr(annotations,'readOnlyHint',None) is True if annotations is not None else False,
        'declaredDestructive': getattr(annotations,'destructiveHint',None) is True if annotations is not None else False,
    }

def _host(url):
    try:
        return urlparse(str(url or "")).hostname or None
    except ValueError:
        return None

def _status_reason(status):
    if status in (401,403): return "auth_failed"
    if status == 429: return "rate_limited"
    if status in (400,422): return "bad_request"
    if status in (408,504): return "timeout"
    if isinstance(status,int) and status >= 500: return "provider_error"
    return "provider_error"

def _tool_context(tool):
    return {"provider": tool.get("name") or tool.get("ref"), "tool": tool.get("name") or tool.get("ref"), "host": _host(tool.get("baseUrl"))}

def _header_value(value):
    if not isinstance(value,str) or not value or len(value)>16000 or "\n" in value or "\r" in value:
        raise ExecutionError("SECRET_REVOKED","Managed credential is unavailable","auth")
    return value

def _oauth_bundle(ref):
    raw=secret(ref)
    try: bundle=json.loads(raw)
    except ValueError: raise ExecutionError("SECRET_REVOKED","Managed credential is unavailable","auth") from None
    if not isinstance(bundle,dict) or not isinstance(bundle.get("access_token"),str) or not bundle["access_token"]:
        raise ExecutionError("SECRET_REVOKED","Managed credential is unavailable","auth")
    return bundle

async def _refresh_oauth(connector,env,bundle):
    """Refresh under a cross-process DB lock, re-reading the vault inside the lock.

    Refresh-token rotation is destructive: two Workers refreshing the same
    credential with the old token would revoke it. The advisory transaction
    lock serializes refreshes and the second process reuses the fresh token.
    """
    ref=connector.get("secretRef")
    if not isinstance(ref,str) or not ref:
        raise ExecutionError("MCP_AUTH_REQUIRED","MCP authorization expired; reconnect the service","auth")
    endpoint=bundle.get("token_endpoint") or (connector.get("oauth") or {}).get("tokenEndpoint")
    if not isinstance(endpoint,str):
        raise ExecutionError("MCP_AUTH_REQUIRED","MCP authorization expired; reconnect the service","auth")
    destination=urlparse(endpoint)
    if destination.scheme not in ("http","https") or not destination.hostname or destination.username or destination.password:
        raise ExecutionError("MCP_AUTH_REQUIRED","MCP authorization endpoint is unavailable","auth")
    try:
        import psycopg
        # AsyncConnection must be used here: the transaction holds a PostgreSQL
        # advisory lock across the token HTTP call. A synchronous connection
        # would block the event loop while waiting for that lock, so the task
        # holding it could never resume to commit and release it.
        connection=await psycopg.AsyncConnection.connect(os.environ["WORKFLOW_DATABASE_URL"],connect_timeout=5,tcp_user_timeout=20000,options="-c statement_timeout=15000 -c lock_timeout=10000")
        async with connection:
            async with connection.cursor() as cursor:
                await cursor.execute("select pg_advisory_xact_lock(hashtext(%s))",("mcp_oauth:"+ref,))
                await cursor.execute("select workflow_private.p4_secret(%s)",(ref,))
                row=await cursor.fetchone()
                current=json.loads(row[0]) if row and row[0] else bundle
                # Another Worker may have refreshed while this request waited.
                expires=current.get("expires_at")
                if isinstance(expires,(int,float)) and expires>time.time()*1000+60000 and current.get("access_token"):
                    return current["access_token"]
                refresh=current.get("refresh_token")
                if not isinstance(refresh,str) or not refresh:
                    raise ExecutionError("MCP_AUTH_REQUIRED","MCP authorization expired; reconnect the service","auth")
                token_url,ip=await safe_http_url({"baseUrl":destination.scheme+"://"+destination.netloc,"path":destination.path or "/"},env or {},{})
                form={"grant_type":"refresh_token","refresh_token":refresh,"client_id":current.get("client_id","")}
                if current.get("resource"): form["resource"]=current["resource"]
                # Official SDK model + client-auth helper, not a second protocol state machine.
                from mcp.shared.auth import OAuthClientInformationFull,OAuthClientMetadata,OAuthToken
                from mcp.client.auth.oauth2 import OAuthContext
                class _Storage:
                    async def get_tokens(self): return None
                    async def set_tokens(self,tokens): return None
                    async def get_client_info(self): return None
                    async def set_client_info(self,info): return None
                context=OAuthContext(server_url=str(connector.get("url","")),client_metadata=OAuthClientMetadata(redirect_uris=None),storage=_Storage(),redirect_handler=None,callback_handler=None)
                context.client_info=OAuthClientInformationFull(redirect_uris=None,client_id=str(current.get("client_id","")),client_secret=current.get("client_secret"),token_endpoint_auth_method=current.get("token_endpoint_auth_method") or "none")
                form,headers=context.prepare_token_auth({key:value for key,value in form.items() if value is not None},{"Accept":"application/json"})
                try:
                    async with httpx.AsyncClient(transport=PinnedTransport(destination.hostname,ip),timeout=20,follow_redirects=False,trust_env=False) as client:
                        response=await client.post(token_url,data=form,headers=headers)
                except Exception:
                    raise ExecutionError("MCP_AUTH_REQUIRED","MCP token refresh failed; reconnect the service","auth") from None
                if response.status_code!=200:
                    raise ExecutionError("MCP_AUTH_REQUIRED","MCP token refresh failed; reconnect the service","auth")
                try: payload=response.json()
                except ValueError: raise ExecutionError("MCP_AUTH_REQUIRED","MCP token refresh failed; reconnect the service","auth") from None
                if not isinstance(payload,dict): raise ExecutionError("MCP_AUTH_REQUIRED","MCP token refresh failed; reconnect the service","auth")
                try: token=OAuthToken.model_validate({**payload,"token_type":"Bearer"})
                except Exception: raise ExecutionError("MCP_AUTH_REQUIRED","MCP token refresh failed; reconnect the service","auth") from None
                updated={**current,"access_token":token.access_token}
                if token.refresh_token: updated["refresh_token"]=token.refresh_token
                if token.expires_in: updated["expires_at"]=int(time.time()*1000+token.expires_in*1000)
                if token.scope: updated["scope"]=token.scope
                await cursor.execute("select workflow_private.mcp_oauth_secret_update(%s,%s)",(ref,json.dumps(updated)))
                return token.access_token
    except ExecutionError: raise
    except Exception:
        raise ExecutionError("MCP_AUTH_REQUIRED","MCP token refresh failed; reconnect the service","auth") from None

async def mcp_headers(connector,env):
    """Resolve only during the request; preflight credentials are never persisted or logged."""
    auth_type=connector.get("authType") or ("legacy" if connector.get("secretRef") else "none")
    legacy=connector.get("headerSecretRefs") or {}
    if legacy:
        # Older environment connectors declared header->secret mappings directly.
        # They remain valid and take precedence over the newer authType fields.
        headers={}
        for name,ref in legacy.items():
            if not isinstance(name,str) or not name or "\n" in name or "\r" in name: raise ExecutionError("INVALID_CONNECTION","Unsupported credential header","policy")
            headers[name]=_header_value(secret(ref))
        return headers
    if auth_type=="none": return {}
    ephemeral=connector.get("ephemeralCredential")
    value=_header_value(ephemeral) if ephemeral else None
    ref=connector.get("secretRef")
    if value is None and not ref: raise ExecutionError("SECRET_REVOKED","Managed credential is unavailable","auth")
    if auth_type=="oauth":
        if value is not None: return {"Authorization":"Bearer "+value}
        bundle=_oauth_bundle(ref)
        access=bundle.get("access_token")
        expires=bundle.get("expires_at")
        if isinstance(expires,(int,float)) and expires <= time.time()*1000+60000:
            access=await _refresh_oauth(connector,env,bundle)
        return {"Authorization":"Bearer "+_header_value(access)}
    value=value if value is not None else secret(ref)
    if auth_type=="bearer": return {"Authorization":"Bearer "+_header_value(value)}
    if auth_type=="api-key":
        name=connector.get("credentialHeader") or "X-API-Key"
        if not name or "\n" in name or "\r" in name: raise ExecutionError("INVALID_CONNECTION","Unsupported credential header","policy")
        return {name:_header_value(value)}
    name=connector.get("credentialHeader") or "Authorization"
    return {name:_header_value(value)}

@asynccontextmanager
async def mcp_session(connector,env=None):
    if connector["transport"]=="stdio":
        # This command is exclusively from an admin-owned environment file.
        child_env={key:os.environ[key] for key in ("PATH","HOME","XDG_CACHE_HOME","PNPM_HOME","TMPDIR") if key in os.environ}
        child_env.update({key:os.environ[key] for key in connector.get("envRefs",[]) if key in os.environ})
        params=StdioServerParameters(command=connector["command"],args=connector.get("args",[]),env=child_env,cwd=connector.get("cwd"))
        async with stdio_client(params,errlog=open(os.devnull,"w")) as (read,write):
            async with ClientSession(read,write) as session:
                await session.initialize(); yield session
    elif connector["transport"] in ("streamable-http","sse"):
        headers=await mcp_headers(connector,env or {})
        destination=urlparse(connector["url"])
        path=destination.path or "/"
        if destination.query: path+="?"+destination.query
        url,ip=await safe_http_url({"baseUrl":destination.scheme+"://"+destination.netloc,"path":path},env or {},{})
        def client_factory(headers=None, timeout=None, auth=None):
            return httpx.AsyncClient(headers=headers,timeout=timeout or 30,auth=auth,transport=PinnedTransport(destination.hostname,ip),follow_redirects=False,trust_env=False)
        if connector["transport"]=="sse":
            async with sse_client(url,headers=headers,httpx_client_factory=client_factory,timeout=30) as (read,write):
                async with ClientSession(read,write) as session:
                    await session.initialize(); yield session
        else:
            async with streamablehttp_client(url,headers=headers,httpx_client_factory=client_factory) as (read,write,_):
                async with ClientSession(read,write) as session:
                    await session.initialize(); yield session
    else: raise ExecutionError("UNSUPPORTED_CAPABILITY","Unsupported MCP transport")

def secret(ref):
    if ref.startswith('vault:'):
        import psycopg
        try:
            with psycopg.connect(os.environ['WORKFLOW_DATABASE_URL'],connect_timeout=5,tcp_user_timeout=20000,options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
                return connection.execute('select workflow_private.p4_secret(%s)',(ref,)).fetchone()[0]
        except Exception: raise ExecutionError('SECRET_REVOKED','Managed credential is unavailable','auth') from None
    value=os.environ.get(ref)
    if not value: raise ExecutionError("SECRET_REVOKED","Secret reference is unavailable","auth")
    return value

def _tool_descriptor(connector, connector_ref, tool):
    import hashlib
    return {"ref":connector_ref+":"+tool.name,"name":tool.name,"description":tool.description or "","version":1,"adapter":"mcp","connectorRef":connector_ref,"inputSchema":tool.inputSchema,"outputSchema":tool.outputSchema or {"type":"object","properties":{"content":{"type":"array"},"isError":{"type":"boolean"}},"required":["content","isError"],"additionalProperties":False},"rawSchemaDigest":hashlib.sha256(canonical(tool.model_dump(mode="json",by_alias=True,exclude_none=True))).hexdigest(),"sideEffect":mcp_tool_effect(tool),**mcp_tool_declarations(tool),"businessOutput":bool(tool.outputSchema),**({"fixture":True} if connector.get("fixture") is True else {})}

def _mcp_status(error):
    seen=set()
    def walk(value):
        if id(value) in seen: return None
        seen.add(id(value))
        response=getattr(value,"response",None)
        status=getattr(response,"status_code",None)
        if isinstance(status,int): return status
        code=getattr(value,"code",None)
        if code in (401,403): return code
        for child in (getattr(value,"exceptions",None) or []):
            found=walk(child)
            if found: return found
        for child in (getattr(value,"args",None) or []):
            if isinstance(child,BaseException):
                found=walk(child)
                if found: return found
        return None
    return walk(error)

async def inspect_tools(connector,env=None):
    try:
        async with mcp_session(connector,env or {}) as session:
            result=await session.list_tools()
    except ExecutionError: raise
    except Exception as error:
        status=_mcp_status(error)
        if status in (401,403): raise ExecutionError("MCP_AUTH_REQUIRED","MCP service rejected the credential","auth") from None
        if isinstance(error,(httpx.TimeoutException,asyncio.TimeoutError)):
            raise ExecutionError("MCP_CONNECTION_TIMEOUT","MCP service timed out","tool",effect="none") from None
        raise ExecutionError("MCP_CONNECTION_FAILED","MCP service is unreachable","tool",effect="none") from None
    return [_tool_descriptor(connector,connector["ref"],tool) for tool in result.tools]

async def discover(registry, env, connector_ref, include_all=False):
    connectors=[c for c in env["connectors"] if c["ref"]==connector_ref and not c.get("disabled")]
    if not connectors: raise ExecutionError("CONNECTOR_FORBIDDEN","Connector not registered","auth")
    connector=connectors[0]
    discovered=await inspect_tools(connector,env)
    allowed=set(connector.get("allowedToolNames",[]))
    visible=[item for item in discovered if item["name"] in allowed]
    env["tools"]=[t for t in env["tools"] if t.get("connectorRef")!=connector_ref]+visible
    registry.update(env)
    return discovered if include_all else visible

async def safe_http_url(tool, env, arguments):
    base=tool["baseUrl"]; parsed=urlparse(base)
    if parsed.scheme not in ("http","https") or parsed.username or parsed.password or not parsed.hostname: raise ExecutionError("HTTP_DESTINATION_FORBIDDEN","Invalid registered HTTP destination","policy")
    path=tool["path"]
    for name,value in arguments.items():
        # Double-brace placeholders are the generic API editor form; single braces are legacy connections.
        path=path.replace("{{"+name+"}}",quote(str(value),safe="")).replace("{"+name+"}",quote(str(value),safe=""))
    if "{{" in path or "{" in path or not path.startswith("/") or path.startswith("//"): raise ExecutionError("INVALID_HTTP_PATH","HTTP path could not be bound","policy")
    addresses=await asyncio.get_running_loop().getaddrinfo(parsed.hostname,parsed.port or (443 if parsed.scheme=="https" else 80),type=socket.SOCK_STREAM)
    allow_private=env.get("localFixtures") is True and os.environ.get("WORKFLOW_ALLOW_LOCAL_FIXTURES")=="1"
    for address in addresses:
        ip=ipaddress.ip_address(address[4][0])
        if not ip.is_global and not allow_private: raise ExecutionError("HTTP_DESTINATION_FORBIDDEN","Private or metadata HTTP destination denied","policy")
        if ip==ipaddress.ip_address("169.254.169.254"): raise ExecutionError("HTTP_DESTINATION_FORBIDDEN","Metadata destination denied","policy")
    # Custom transport pins the checked IP to prevent DNS rebinding between check and connect.
    url=base.rstrip("/")+path
    fixed=tool.get("queryParams") or {}
    argument_names=tool.get("queryArgumentNames") or []
    query=dict(parse_qsl(parsed.query))
    query.update({name:str(value) for name,value in fixed.items()})
    query.update({name:str(arguments[name]) for name in argument_names if name in arguments and arguments[name] is not None})
    if query:
        parts=urlparse(url); url=urlunparse(parts._replace(query=urlencode(query)))
    return url,addresses[0][4][0]

def _render_text(text,arguments,json_mode=False):
    for name,value in arguments.items():
        token="{{"+name+"}}"
        if token not in text: continue
        serialized=json.dumps(value) if json_mode else str(value)
        if json_mode: text=text.replace('"'+token+'"',serialized)
        text=text.replace(token,serialized if json_mode else str(value))
    return text

def _form_pairs(text,arguments):
    pairs={}
    for line in text.splitlines():
        if not line.strip() or "=" not in line: continue
        name,value=line.split("=",1)
        pairs[name.strip()]=_render_text(value,arguments)
    return pairs

def _http_body(tool,arguments):
    body=tool.get("body") or {}
    mode=body.get("mode","none");text=body.get("text","") or ""
    if mode=="json":
        if text.strip():
            try: return {"json":json.loads(_render_text(text,arguments,json_mode=True))}
            except json.JSONDecodeError: raise ExecutionError("INVALID_HTTP_BODY","Request body is not valid JSON","policy") from None
        names=tool.get("bodyArgumentNames") or []
        return {"json":{name:arguments[name] for name in names if name in arguments}}
    if mode in ("form-data","x-www-form-urlencoded"): return {"data":_form_pairs(text,arguments)}
    if mode=="raw": return {"content":_render_text(text,arguments).encode("utf-8")}
    return {"json":arguments} if tool.get("bodyArguments") else {}

def _http_auth(tool,env):
    auth=tool.get("auth") or {"type":"none"};kind=auth.get("type","none")
    if kind=="none": return {},{}
    ref=tool.get("authSecretRef")
    if not ref: raise ExecutionError("SECRET_REVOKED","Managed credential is unavailable","auth")
    value=secret(ref)
    if not value: raise ExecutionError("SECRET_REVOKED","Secret reference is unavailable","auth")
    if kind=="bearer": return {"Authorization":"Bearer "+value},{}
    if kind=="api-key-header": return {auth.get("name","X-API-Key"):value},{}
    if kind=="api-key-query": return {},{auth.get("name","api_key"):value}
    if kind=="basic":
        if ":" not in value: raise ExecutionError("INVALID_CREDENTIAL","Basic auth credential must be username:password","auth")
        encoded=base64.b64encode(value.encode("utf-8")).decode("ascii")
        return {"Authorization":"Basic "+encoded},{}
    raise ExecutionError("INVALID_CONNECTION","Unsupported authentication type","policy")

def _http_headers(tool,env):
    headers={name:str(value) for name,value in (tool.get("requestHeaders") or {}).items()}
    for name,ref in (tool.get("headerSecretRefs") or {}).items():
        value=secret(ref)
        if not value: raise ExecutionError("SECRET_REVOKED","Secret reference is unavailable","auth")
        headers[name]=value
    auth_headers,_=_http_auth(tool,env)
    headers.update(auth_headers)
    return headers

def _deep_value(value,path):
    if not path: return value
    tokens=[token for token in path.replace("[",".").replace("]","").split(".") if token]
    current=value
    for token in tokens:
        if isinstance(current,dict) and token in current: current=current[token]
        elif isinstance(current,list) and token.isdigit() and int(token)<len(current): current=current[int(token)]
        else: raise ExecutionError("TOOL_OUTPUT_PATH_MISSING","Configured response field was not found","tool")
    return current

def http_result(tool,payload,text_mode=False):
    """Apply the optional result path and declared response field mapping."""
    settings=tool.get("settings") or {}
    if text_mode:
        if settings.get("resultPath"): raise ExecutionError("INVALID_CONNECTION","Text responses cannot use a result path","policy")
        result=payload
    else:
        result=_deep_value(payload,settings.get("resultPath",""))
    output_map=tool.get("outputMap") or []
    if not output_map: return result
    return {row["name"]:(_deep_value(result,row.get("path","")) if row.get("path") else result) for row in output_map}

def response_format(tool):
    value=(tool.get("settings") or {}).get("responseFormat","json")
    if value not in ("json","text"): raise ExecutionError("INVALID_CONNECTION","Unsupported HTTP response format","policy")
    return value

def _text_charset(content_type):
    charsets=[]
    for parameter in str(content_type or "").split(";")[1:]:
        name,separator,value=parameter.strip().partition("=")
        if separator and name.strip().lower()=="charset":
            charsets.append(value.strip().strip('"').strip("'").lower())
    return charsets

def decode_text_response(content,content_type):
    """Strict text/* UTF-8 decoding shared by execution and connection tests."""
    media_type=str(content_type or "").split(";",1)[0].strip().lower()
    if not media_type.startswith("text/"):
        raise ExecutionError("TOOL_RESPONSE_NOT_TEXT","HTTP response is not text/*","tool",reason="provider_error")
    charsets=_text_charset(content_type)
    if any(value not in ("utf-8","utf8") for value in charsets):
        raise ExecutionError("TOOL_RESPONSE_CHARSET_UNSUPPORTED","HTTP text response is not UTF-8","tool",reason="provider_error")
    try:
        return bytes(content).decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ExecutionError("TOOL_RESPONSE_ENCODING_INVALID","HTTP text response is not valid UTF-8","tool",reason="provider_error") from None

class PinnedTransport(httpx.AsyncHTTPTransport):
    def __init__(self,hostname,ip):
        super().__init__(retries=0)
        from httpcore import AsyncConnectionPool
        from httpcore._backends.auto import AutoBackend
        class Backend(AutoBackend):
            async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
                return await super().connect_tcp(ip if host==hostname else host,port,timeout,local_address,socket_options)
        self._pool=AsyncConnectionPool(network_backend=Backend(),retries=0)

class LazyPinnedTransport(httpx.AsyncBaseTransport):
    """Resolve and pin a registered model base URL on first use, under the tool SSRF policy."""
    def __init__(self,base_url,env):
        self.base_url=base_url;self.environment=env;self.transport=None
    async def handle_async_request(self,request):
        if self.transport is None:
            url,ip=await safe_http_url({'baseUrl':self.base_url,'path':'/'},self.environment,{})
            self.transport=PinnedTransport(urlparse(url).hostname,ip)
        return await self.transport.handle_async_request(request)
    async def aclose(self):
        if self.transport is not None: await self.transport.aclose()

def model_http_client(base_url,env):
    """Model traffic shares the tool outbound limits: pinned destination, no proxy, no redirects."""
    return httpx.AsyncClient(transport=LazyPinnedTransport(base_url,env),timeout=30,follow_redirects=False,trust_env=False)


async def invoke_tool(tool, env, arguments, timeout):
    assert_no_secrets(arguments,env)
    # Tools execute exactly the arguments resolved by the flow. Query translation
    # belongs to a model node, never to a prose regex in the tool adapter.
    validate_value(tool["inputSchema"],arguments,"INVALID_TOOL_ARGUMENTS")
    try:
        if tool["adapter"]=="function": result=transform(tool["operationRef"],arguments)
        elif tool["adapter"]=="http":
            url,ip=await safe_http_url(tool,env,arguments)
            headers=_http_headers(tool,env)
            kwargs=_http_body(tool,arguments)
            _,secret_query=_http_auth(tool,env)
            if secret_query:
                parts=urlparse(url); query=dict(parse_qsl(parts.query)); query.update(secret_query)
                url=urlunparse(parts._replace(query=urlencode(query)))
            hostname=urlparse(url).hostname
            format=response_format(tool)
            timeout_ms=(tool.get("settings") or {}).get("timeoutMs")
            request_timeout=min(timeout,max(1,math.ceil(timeout_ms/1000))) if isinstance(timeout_ms,int) and timeout_ms>0 else timeout
            retries=(tool.get("settings") or {}).get("retries",0) if tool.get("sideEffect")=="read" else 0
            attempts=max(0,min(3,retries))+1
            content_type=None
            async with httpx.AsyncClient(transport=PinnedTransport(hostname,ip),timeout=request_timeout,follow_redirects=False,trust_env=False) as client:
                for attempt in range(attempts):
                    try:
                        async with client.stream(tool["method"],url,headers=headers,**kwargs) as response:
                            content=bytearray()
                            async for chunk in response.aiter_bytes():
                                content.extend(chunk)
                                if len(content)>1048576: raise ExecutionError("TOOL_OUTPUT_TOO_LARGE","Tool response exceeds limit","policy",reason="provider_error",**_tool_context(tool))
                            status=response.status_code
                            content_type=response.headers.get("content-type")
                        if status>=500 and attempt+1<attempts: continue
                        break
                    except (httpx.ConnectError,httpx.ReadError,httpx.RemoteProtocolError):
                        if attempt+1>=attempts: raise
            if 300<=status<400: raise ExecutionError("HTTP_REDIRECT_DENIED","Registered tool returned a redirect","policy",external_status=status,effect="unknown",reason="provider_error",http_status=status,**_tool_context(tool))
            if status>=400: raise ExecutionError("HTTP_TOOL_FAILED","HTTP tool returned status "+str(status),"auth" if status in (401,403) else "rate_limit" if status==429 else "tool",external_status=status,effect="unknown" if tool.get("sideEffect")=="write" else "none",reason=_status_reason(status),http_status=status,**_tool_context(tool))
            if format=="text":
                try:
                    result=http_result(tool,decode_text_response(content,content_type),text_mode=True)
                except ExecutionError as error:
                    if error.effect is None: error.effect="unknown" if tool.get("sideEffect")=="write" else "none"
                    raise
            else:
                try: payload=json.loads(content)
                except json.JSONDecodeError: raise ExecutionError("TOOL_FAILED","Tool response could not be decoded","tool",effect="unknown" if tool.get("sideEffect")=="write" else "none",reason="provider_error",**_tool_context(tool)) from None
                result=http_result(tool,payload)
        elif tool["adapter"]=="mcp":
            connector=next((c for c in env["connectors"] if c["ref"]==tool["connectorRef"] and not c.get("disabled")),None)
            if connector is None: raise ExecutionError("MCP_CONNECTION_DISABLED","MCP connection has been disconnected","auth")
            # Current owner permission is authoritative for every immutable version:
            # narrowing or removing a tool must also stop old Workflow bindings.
            if "allowedToolNames" in connector and tool["name"] not in (connector.get("allowedToolNames") or []):
                raise ExecutionError("MCP_TOOL_NOT_ALLOWED","This MCP tool is not in the current allowed scope","auth")
            try:
                async with mcp_session(connector,env) as session:
                    response=await asyncio.wait_for(session.call_tool(tool["name"],arguments),timeout=max(1,timeout))
            except ExecutionError: raise
            except Exception as error:
                if _mcp_status(error) in (401,403): raise ExecutionError("MCP_AUTH_REQUIRED","MCP service rejected the credential","auth",reason="auth_failed") from None
                raise
            if response.isError: raise ExecutionError("MCP_TOOL_FAILED","MCP tool reported an error","tool",effect="unknown",reason="provider_error",**({"host":_host(connector.get("url"))} if connector.get("url") else {}))
            result=response.structuredContent if tool.get("businessOutput") else {"content":[item.model_dump(mode="json",by_alias=True,exclude_none=True) for item in response.content],"isError":False}
        else: raise ExecutionError("UNKNOWN_TOOL_ADAPTER","Unregistered adapter")
        assert_no_secrets(result,env)
        validate_value(tool["outputSchema"],result,"INVALID_TOOL_OUTPUT")
        return result
    except ExecutionError as error:
        if not error.tool:
            error.tool=tool.get("name") or tool.get("ref")
        if not error.provider:
            error.provider=error.tool
        if not error.host:
            error.host=_host(tool.get("baseUrl"))
        raise
    except (httpx.TimeoutException,asyncio.TimeoutError): raise ExecutionError("TOOL_TIMEOUT","Tool request timed out","timeout",effect="unknown" if tool.get("sideEffect")=="write" else "none",reason="timeout",**_tool_context(tool)) from None
    except httpx.ConnectError: raise ExecutionError("TOOL_FAILED","Tool request could not connect","tool",effect="unknown" if tool.get("sideEffect")=="write" else "none",reason="connection_refused",**_tool_context(tool)) from None
    except Exception: raise ExecutionError("TOOL_FAILED","Tool request or output decoding failed","tool",effect="unknown" if tool.get("sideEffect")=="write" else "none",reason="provider_error",**_tool_context(tool)) from None
