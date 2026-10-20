"""Server-registered HTTP/MCP/function adapters. Never accept destination or commands from a model."""
import asyncio
import ipaddress
import json
import os
import socket
from contextlib import asynccontextmanager
from urllib.parse import urlparse, quote
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

@asynccontextmanager
async def mcp_session(connector,env=None):
    if connector["transport"]=="stdio":
        # This command is exclusively from an admin-owned environment file.
        params=StdioServerParameters(command=connector["command"],args=connector.get("args",[]),env={key:os.environ[key] for key in connector.get("envRefs",[]) if key in os.environ},cwd=connector.get("cwd"))
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
        descriptor={"ref":connector_ref+":"+tool.name,"name":tool.name,"description":tool.description or "","version":1,"adapter":"mcp","connectorRef":connector_ref,"inputSchema":tool.inputSchema,"outputSchema":tool.outputSchema or {"type":"object","properties":{"content":{"type":"array"},"isError":{"type":"boolean"}},"required":["content","isError"],"additionalProperties":False},"rawSchemaDigest":__import__('hashlib').sha256(canonical(tool.model_dump(mode="json",by_alias=True,exclude_none=True))).hexdigest(),"sideEffect":connector.get("sideEffect","write"),"businessOutput":bool(tool.outputSchema)}
        discovered.append(descriptor)
    env["tools"]=[t for t in env["tools"] if t.get("connectorRef")!=connector_ref]+discovered
    registry.update(env)
    return discovered

async def safe_http_url(tool, env, arguments):
    base=tool["baseUrl"]; parsed=urlparse(base)
    if parsed.scheme not in ("http","https") or parsed.username or parsed.password or not parsed.hostname: raise ExecutionError("HTTP_DESTINATION_FORBIDDEN","Invalid registered HTTP destination","policy")
    path=tool["path"]
    for name,value in arguments.items(): path=path.replace("{"+name+"}",quote(str(value),safe=""))
    if "{" in path or not path.startswith("/") or path.startswith("//"): raise ExecutionError("INVALID_HTTP_PATH","HTTP path could not be bound","policy")
    addresses=await asyncio.get_running_loop().getaddrinfo(parsed.hostname,parsed.port or (443 if parsed.scheme=="https" else 80),type=socket.SOCK_STREAM)
    allow_private=env.get("localFixtures") is True and os.environ.get("WORKFLOW_ALLOW_LOCAL_FIXTURES")=="1"
    for address in addresses:
        ip=ipaddress.ip_address(address[4][0])
        if not ip.is_global and not allow_private: raise ExecutionError("HTTP_DESTINATION_FORBIDDEN","Private or metadata HTTP destination denied","policy")
        if ip==ipaddress.ip_address("169.254.169.254"): raise ExecutionError("HTTP_DESTINATION_FORBIDDEN","Metadata destination denied","policy")
    # Custom transport pins the checked IP to prevent DNS rebinding between check and connect.
    return base.rstrip("/")+path,addresses[0][4][0]

class PinnedTransport(httpx.AsyncHTTPTransport):
    def __init__(self,hostname,ip):
        super().__init__(retries=0)
        from httpcore import AsyncConnectionPool
        from httpcore._backends.auto import AutoBackend
        class Backend(AutoBackend):
            async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
                return await super().connect_tcp(ip if host==hostname else host,port,timeout,local_address,socket_options)
        self._pool=AsyncConnectionPool(network_backend=Backend(),retries=0)

async def invoke_tool(tool, env, arguments, timeout):
    assert_no_secrets(arguments,env)
    validate_value(tool["inputSchema"],arguments,"INVALID_TOOL_ARGUMENTS")
    try:
        if tool["adapter"]=="function": result=transform(tool["operationRef"],arguments)
        elif tool["adapter"]=="http":
            url,ip=await safe_http_url(tool,env,arguments)
            headers={name:secret(ref) for name,ref in tool.get("headerSecretRefs",{}).items()}
            hostname=urlparse(url).hostname
            async with httpx.AsyncClient(transport=PinnedTransport(hostname,ip),timeout=timeout,follow_redirects=False,trust_env=False) as client:
                async with client.stream(tool["method"],url,headers=headers,json=arguments if tool.get("bodyArguments") else None) as response:
                    content=bytearray()
                    async for chunk in response.aiter_bytes():
                        content.extend(chunk)
                        if len(content)>1048576: raise ExecutionError("TOOL_OUTPUT_TOO_LARGE","Tool response exceeds limit","policy")
                    status=response.status_code
            if 300<=status<400: raise ExecutionError("HTTP_REDIRECT_DENIED","Registered tool returned a redirect","policy",external_status=status,effect="unknown")
            if status>=400: raise ExecutionError("HTTP_TOOL_FAILED","HTTP tool returned status "+str(status),"auth" if status in (401,403) else "rate_limit" if status==429 else "tool",external_status=status,effect="unknown" if tool.get("sideEffect")=="write" else "none")
            result=json.loads(content)
        elif tool["adapter"]=="mcp":
            connector=next(c for c in env["connectors"] if c["ref"]==tool["connectorRef"])
            async with mcp_session(connector,env) as session:
                response=await session.call_tool(tool["name"],arguments)
            if response.isError: raise ExecutionError("MCP_TOOL_FAILED","MCP tool reported an error","tool",effect="unknown")
            result=response.structuredContent if tool.get("businessOutput") else {"content":[item.model_dump(mode="json",by_alias=True,exclude_none=True) for item in response.content],"isError":False}
        else: raise ExecutionError("UNKNOWN_TOOL_ADAPTER","Unregistered adapter")
        assert_no_secrets(result,env)
        validate_value(tool["outputSchema"],result,"INVALID_TOOL_OUTPUT")
        return result
    except ExecutionError: raise
    except (httpx.TimeoutException,asyncio.TimeoutError): raise ExecutionError("TOOL_TIMEOUT","Tool request timed out","timeout",effect="unknown" if tool.get("sideEffect")=="write" else "none") from None
    except Exception: raise ExecutionError("TOOL_FAILED","Tool request or output decoding failed","tool",effect="unknown" if tool.get("sideEffect")=="write" else "none") from None
