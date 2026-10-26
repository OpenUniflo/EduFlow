"""Server-registered HTTP/MCP/function adapters. Never accept destination or commands from a model."""
import asyncio
import base64
import ipaddress
import json
import math
import os
import socket
from contextlib import asynccontextmanager
from urllib.parse import urlparse, quote, urlencode, parse_qsl, urlunparse
import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
from .contracts import ExecutionError, validate_value, canonical
from .registry import transform
from .credentials import assert_no_secrets


def declared_effect(node, tools):
    """Conservative effect authority shared by journaling and timeout policies."""
    refs=node['config'].get('allowedToolRefs',[]) if node['type'] in ('core.llm','core.tool_dispatch') else [node['config'].get('toolRef')] if node['type']=='core.tool' else []
    if node['type']=='core.subgraph' and node['config'].get('persistence')=='stateless':
        effects=[declared_effect(child,tools) for child in node['config']['graph']['nodes']]
        return 'write' if 'write' in effects else 'read' if 'read' in effects else 'none'
    return 'write' if any(t.get('sideEffect')=='write' for t in tools if t['ref'] in refs) else 'read' if refs else 'none'

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
    elif connector["transport"]=="streamable-http":
        headers={name:secret(env_ref) for name,env_ref in connector.get("headerSecretRefs",{}).items()}
        destination=urlparse(connector["url"])
        url,ip=await safe_http_url({"baseUrl":destination.scheme+"://"+destination.netloc,"path":destination.path or "/"},env or {},{})
        def client_factory(headers=None, timeout=None, auth=None):
            return httpx.AsyncClient(headers=headers,timeout=timeout or 30,auth=auth,transport=PinnedTransport(destination.hostname,ip),follow_redirects=False,trust_env=False)
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

async def discover(registry, env, connector_ref):
    connectors=[c for c in env["connectors"] if c["ref"]==connector_ref and not c.get("disabled")]
    if not connectors: raise ExecutionError("CONNECTOR_FORBIDDEN","Connector not registered","auth")
    connector=connectors[0]
    async with mcp_session(connector,env) as session:
        result=await session.list_tools()
    discovered=[]
    for tool in result.tools:
        if tool.name not in connector.get("allowedToolNames",[]): continue
        descriptor={"ref":connector_ref+":"+tool.name,"name":tool.name,"description":tool.description or "","version":1,"adapter":"mcp","connectorRef":connector_ref,"inputSchema":tool.inputSchema,"outputSchema":tool.outputSchema or {"type":"object","properties":{"content":{"type":"array"},"isError":{"type":"boolean"}},"required":["content","isError"],"additionalProperties":False},"rawSchemaDigest":__import__('hashlib').sha256(canonical(tool.model_dump(mode="json",by_alias=True,exclude_none=True))).hexdigest(),"sideEffect":connector.get("sideEffect","write"),"businessOutput":bool(tool.outputSchema),**({"fixture":True} if connector.get("fixture") is True else {})}
        discovered.append(descriptor)
    env["tools"]=[t for t in env["tools"] if t.get("connectorRef")!=connector_ref]+discovered
    registry.update(env)
    return discovered

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

def http_result(tool,payload):
    """Apply the optional result path and declared response field mapping."""
    result=_deep_value(payload,(tool.get("settings") or {}).get("resultPath",""))
    output_map=tool.get("outputMap") or []
    if not output_map: return result
    return {row["name"]:(_deep_value(result,row.get("path","")) if row.get("path") else result) for row in output_map}

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
            timeout_ms=(tool.get("settings") or {}).get("timeoutMs")
            request_timeout=min(timeout,max(1,math.ceil(timeout_ms/1000))) if isinstance(timeout_ms,int) and timeout_ms>0 else timeout
            retries=(tool.get("settings") or {}).get("retries",0) if tool.get("sideEffect")=="read" else 0
            attempts=max(0,min(3,retries))+1
            async with httpx.AsyncClient(transport=PinnedTransport(hostname,ip),timeout=request_timeout,follow_redirects=False,trust_env=False) as client:
                for attempt in range(attempts):
                    try:
                        async with client.stream(tool["method"],url,headers=headers,**kwargs) as response:
                            content=bytearray()
                            async for chunk in response.aiter_bytes():
                                content.extend(chunk)
                                if len(content)>1048576: raise ExecutionError("TOOL_OUTPUT_TOO_LARGE","Tool response exceeds limit","policy",reason="provider_error",**_tool_context(tool))
                            status=response.status_code
                        if status>=500 and attempt+1<attempts: continue
                        break
                    except (httpx.ConnectError,httpx.ReadError,httpx.RemoteProtocolError):
                        if attempt+1>=attempts: raise
            if 300<=status<400: raise ExecutionError("HTTP_REDIRECT_DENIED","Registered tool returned a redirect","policy",external_status=status,effect="unknown",reason="provider_error",http_status=status,**_tool_context(tool))
            if status>=400: raise ExecutionError("HTTP_TOOL_FAILED","HTTP tool returned status "+str(status),"auth" if status in (401,403) else "rate_limit" if status==429 else "tool",external_status=status,effect="unknown" if tool.get("sideEffect")=="write" else "none",reason=_status_reason(status),http_status=status,**_tool_context(tool))
            try: payload=json.loads(content)
            except json.JSONDecodeError: raise ExecutionError("TOOL_FAILED","Tool response could not be decoded","tool",effect="unknown" if tool.get("sideEffect")=="write" else "none",reason="provider_error",**_tool_context(tool)) from None
            result=http_result(tool,payload)
        elif tool["adapter"]=="mcp":
            connector=next(c for c in env["connectors"] if c["ref"]==tool["connectorRef"])
            async with mcp_session(connector,env) as session:
                response=await session.call_tool(tool["name"],arguments)
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
