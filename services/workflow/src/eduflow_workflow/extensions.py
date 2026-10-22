"""Authenticated owner catalogs and managed connection configuration, backed by SQL/Vault."""
import os
import re
from urllib.parse import urlparse
from .contracts import ExecutionError,validate_value,schema_check,digest
from .storage import Storage
from .execution_policies import catalog,REDUCERS
from .sandbox import IMAGES,LIMITS,available

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
            from .tools import invoke_tool
            tool=next(t for t in env['tools'] if t['ref']==key)
            if tool['sideEffect']=='write' and body.get('confirmExternalEffect') is not True: raise ExecutionError('EXTERNAL_EFFECT_CONFIRMATION_REQUIRED','Confirm the external effect','policy')
            await invoke_tool(tool,env,body.get('arguments',{}),10)
        elif c['type']=='deepseek':
            import httpx
            from .tools import secret
            async with httpx.AsyncClient(timeout=10,trust_env=False) as client:
                response=await client.get('https://api.deepseek.com/models',headers={'Authorization':'Bearer '+secret(c['secretRef'])})
            if response.status_code!=200: raise ExecutionError('CONNECTION_TEST_FAILED','Model credential check failed','auth')
        else:
            from .tools import discover
            tools=await discover(registry,env,key)
            path=os.environ.get('WORKFLOW_CATALOG_FILE')
            if path:
                import json
                from pathlib import Path
                from .contracts import digest
                connector=next(c for c in env['connectors'] if c['ref']==key)
                saved=json.loads(Path(path).read_text()) if Path(path).exists() else {}
                saved[ref+':'+key]={'connectorDigest':digest(connector),'tools':tools}
                temporary=Path(path+'.tmp');temporary.write_text(json.dumps(saved));temporary.replace(path)
        return {'ok':True,'ref':name,'version':version}
    if action!='publish': raise ExecutionError('INVALID_EXTENSION','Unknown extension operation')
    c=body.get('content')
    if not isinstance(c,dict): raise ExecutionError('INVALID_EXTENSION','Provide an object configuration')
    if 'name' in c and (not isinstance(c['name'],str) or not 1<=len(c['name'])<=120): raise ExecutionError('INVALID_EXTENSION','Name must be 1–120 characters')
    credential=body.get('credential','')
    if not isinstance(credential,str) or len(credential)>8000: raise ExecutionError('INVALID_CREDENTIAL','Credential must be bounded text')
    if credential and credential in __import__('json').dumps(c): raise ExecutionError('CREDENTIAL_IN_CONFIGURATION','Place credentials only in the protected credential field','policy')
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
    allowed={'type','name','baseUrl','path','method','sideEffect','inputSchema','outputSchema','modelRefs','url','allowedToolNames','credentialHeader'}
    if set(c)-allowed or c.get('type') not in ('http','deepseek','mcp-http'): raise ExecutionError('INVALID_CONNECTION','Supported types: HTTP, DeepSeek, MCP HTTP')
    if c['type']=='deepseek':
        if c.get('baseUrl','https://api.deepseek.com')!='https://api.deepseek.com' or not credential or not isinstance(c.get('modelRefs'),list) or not c['modelRefs'] or any(v not in ('deepseek-chat','deepseek-reasoner') for v in c['modelRefs']): raise ExecutionError('INVALID_CONNECTION','Choose official DeepSeek models and provide a credential')
    else:
        raw=c.get('baseUrl' if c['type']=='http' else 'url','');parsed=urlparse(raw)
        if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment: raise ExecutionError('INVALID_CONNECTION','Provide a valid HTTP endpoint without credentials')
        if c['type']=='http' and (not isinstance(c.get('path','/'),str) or len(c.get('path','/'))>2000): raise ExecutionError('INVALID_CONNECTION','Provide a bounded HTTP path')
        from .tools import safe_http_url
        await safe_http_url({'baseUrl':parsed.scheme+'://'+parsed.netloc,'path':c.get('path','/') if c['type']=='http' else parsed.path or '/'},env,{})
        if c.get('credentialHeader','Authorization') not in ('Authorization','X-API-Key'): raise ExecutionError('INVALID_CONNECTION','Unsupported credential header')
        if c['type']=='http':
            if c.get('method','GET') not in ('GET','POST') or c.get('sideEffect') not in ('read','write') or c.get('method','GET')=='POST' and c['sideEffect']!='write': raise ExecutionError('INVALID_CONNECTION','HTTP POST is treated as an external write')
            for key in ('inputSchema','outputSchema'): schema_check(c.get(key,{'type':'object'}))
        elif not isinstance(c.get('allowedToolNames'),list) or not c['allowedToolNames'] or any(not isinstance(v,str) for v in c['allowedToolNames']): raise ExecutionError('INVALID_CONNECTION','Select allowed MCP tool names')
    return await store.call('p4_connection_save',owner,ref,name,version,c,credential)

def hydrate_connections(env,owner,rows):
    env.setdefault('capabilityOrigins',{})
    for r in rows:
        if r['kind']!='connection' or r['disabled']: continue
        c=r['content'];key='p4:'+owner+':'+r['ref']+':'+str(r['version']);headers={c.get('credentialHeader','Authorization'):c['secretRef']} if c.get('secretRef') else {}
        env['capabilityOrigins'][key]={'origin':'user','connectionRef':r['ref'],'version':r['version']}
        if c['type']=='deepseek': env['providers'].append({'ref':key,'name':c.get('name',r['ref']),'modelRefs':c['modelRefs'],'baseUrl':'https://api.deepseek.com','secretRef':c['secretRef']})
        elif c['type']=='http': env['tools'].append({'ref':key,'name':r['ref'],'description':c.get('name',r['ref']),'version':r['version'],'adapter':'http','baseUrl':c['baseUrl'],'path':c.get('path','/'),'method':c.get('method','GET'),'bodyArguments':c.get('method')=='POST','headerSecretRefs':headers,'sideEffect':c['sideEffect'],'inputSchema':c.get('inputSchema',{'type':'object'}),'outputSchema':c.get('outputSchema',{'type':'object'})})
        else: env['connectors'].append({'ref':key,'name':c.get('name',r['ref']),'transport':'streamable-http','url':c['url'],'headerSecretRefs':headers,'allowedToolNames':c['allowedToolNames'],'sideEffect':'write'})
    return env
