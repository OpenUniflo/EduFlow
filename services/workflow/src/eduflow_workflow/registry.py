"""Trusted operations and versioned descriptor catalog; configuration is server-only."""
import copy
import json
import os
from pathlib import Path
from .contracts import digest, schema_check, ExecutionError, HARD_LIMITS, DEPENDENCY_MANIFEST

OBJ = {"type":"object", "properties":{}, "additionalProperties":False}
ANY_OBJ = {"type":"object"}
STRING = {"type":"string"}
MESSAGE_SCHEMA = {"type":"object", "properties":{"id":STRING, "role":{"enum":["system","user","assistant","tool","remove"]}, "content":{"type":"array","items":{"type":"object","properties":{"type":{"const":"text"},"text":STRING},"required":["type","text"],"additionalProperties":False}}, "toolCalls":{"type":"array","items":{"type":"object","properties":{"id":STRING,"name":STRING,"arguments":ANY_OBJ},"required":["id","name","arguments"],"additionalProperties":False}},"toolCallId":STRING},"required":["id","role","content"],"additionalProperties":False}
MESSAGES = {"type":"array", "items":MESSAGE_SCHEMA}
CALLS = {"type":"array","items":{"type":"object","properties":{"id":STRING,"name":STRING,"arguments":ANY_OBJ},"required":["id","name","arguments"],"additionalProperties":False}}

def obj(properties, required=None): return {"type":"object","properties":properties,"required":required if required is not None else list(properties),"additionalProperties":False}

def descriptor(kind, config, inputs=OBJ, output=OBJ, side_effect="none", outlets=None):
    return {"type":kind,"version":1,"configSchema":config,"inputSchema":inputs,"outputSchema":output,"outlets":["next"] if outlets is None else outlets,"sideEffect":side_effect,"requiredCapabilities":[]}

NODE_DESCRIPTORS = [
    descriptor("core.progress",obj({"message":{"type":"string","maxLength":500},"percent":{"type":"number","minimum":0,"maximum":100}},["message"]),ANY_OBJ,obj({"message":{"type":"string"},"percent":{"type":"number"}})),
    descriptor("core.memory",obj({"operation":{"enum":["get","put","delete"]},"scope":{"enum":["workflow","shared"]},"collection":STRING,"key":STRING,"ttlMinutes":{"type":"integer","minimum":1,"maximum":10080}},["operation","scope","collection"]),ANY_OBJ,obj({"found":{"type":"boolean"},"value":{},"version":{"type":"integer"}}),"write"),
    descriptor("control.fork",obj({"branches":{"type":"array","items":STRING,"minItems":1}})),
    descriptor("control.join",obj({"waitFor":{"type":"array","items":STRING,"minItems":1},"strategy":{"enum":["all","any"]}})),
    descriptor("control.send",obj({"items":STRING,"target":STRING,"itemKey":STRING,"concurrency":{"type":"integer","minimum":1,"maximum":20}})),
    descriptor("core.subgraph",obj({"graph":ANY_OBJ,"stateMode":{"enum":["independent","shared"]},"persistence":{"enum":["per-invocation","stateless","per-thread"]}},["graph"]),ANY_OBJ,ANY_OBJ),
    descriptor("core.function", obj({"implementation":{"enum":["registered","code"]},"functionRef":STRING,"functionVersion":{"type":"integer","minimum":1},"language":{"enum":["python","javascript"]},"code":STRING,"inputSchema":ANY_OBJ,"outputSchema":ANY_OBJ},["implementation"]),ANY_OBJ,ANY_OBJ),
    descriptor("core.start", OBJ), descriptor("core.end", OBJ, outlets=[]),
    descriptor("core.router", obj({"cases":{"type":"array","items":{"type":"object"}},"defaultOutlet":STRING,"mode":{"enum":["first","all"]}}, ["cases","defaultOutlet"]), output=obj({"outlet":{"type":["string","array"],"items":STRING}})),
    descriptor("core.transform", obj({"operationRef":STRING,"operationVersion":{"const":1}}), ANY_OBJ, ANY_OBJ),
    descriptor("core.llm", obj({"providerRef":STRING,"modelRef":STRING,"modelParameters":ANY_OBJ,"allowedToolRefs":{"type":"array","items":STRING}}),obj({"messages":MESSAGES}),obj({"messages":MESSAGES,"toolCalls":CALLS}), "read"),
    descriptor("core.tool", obj({"toolRef":STRING,"contractDigest":STRING}),obj({"arguments":ANY_OBJ}),obj({"result":{}}),"write"),
    descriptor("core.tool_dispatch", obj({"allowedToolRefs":{"type":"array","items":STRING}}),obj({"toolCalls":CALLS}),obj({"toolMessages":MESSAGES}),"write"),
]
OPERATIONS = {
    "core.identity": {"inputSchema":obj({"value":{}}),"outputSchema":obj({"value":{}})},
    "core.add": {"inputSchema":obj({"left":{"type":"number"},"right":{"type":"number"}}),"outputSchema":obj({"value":{"type":"number"}})},
    "core.concat": {"inputSchema":obj({"values":{"type":"array","items":STRING},"separator":STRING},["values"]),"outputSchema":obj({"value":STRING})},
    "core.message": {"inputSchema":obj({"text":STRING,"role":{"enum":["system","user"]}},["text"]),"outputSchema":obj({"messages":MESSAGES})},
}

def transform(ref, arguments):
    import uuid
    if ref == "core.identity": return {"value":arguments["value"]}
    if ref == "core.add": return {"value":arguments["left"]+arguments["right"]}
    if ref == "core.concat": return {"value":arguments.get("separator","").join(arguments["values"])}
    if ref == "core.message": return {"messages":[{"id":str(uuid.uuid4()),"role":arguments.get("role","user"),"content":[{"type":"text","text":arguments["text"]}]}]}
    raise ExecutionError("UNKNOWN_OPERATION","Unregistered operation")

class Registry:
    def __init__(self, configuration=None):
        if configuration is None:
            file = os.environ.get("WORKFLOW_ENVIRONMENTS_FILE")
            configuration = json.loads(Path(file).read_text()) if file else json.loads(os.environ.get("WORKFLOW_ENVIRONMENTS_JSON", '{"environments":[]}'))
        self.environments = copy.deepcopy(configuration["environments"])
        catalog_file = os.environ.get("WORKFLOW_CATALOG_FILE")
        hosted = os.environ.get('WORKFLOW_DEPLOYMENT_MODE') == 'hosted'
        if hosted or catalog_file and Path(catalog_file).exists():
            if hosted:
                import psycopg
                with psycopg.connect(os.environ['WORKFLOW_DATABASE_URL'],connect_timeout=5,tcp_user_timeout=20000,options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
                    catalog = connection.execute('select workflow_private.p6_catalog_list()').fetchone()[0]
            else:
                catalog = json.loads(Path(catalog_file).read_text())
            for env in self.environments:
                for connector in env.get("connectors",[]):
                    saved = catalog.get(env["ref"]+":"+connector["ref"])
                    if saved and saved["connectorDigest"]==digest(connector):
                        env["tools"]=[tool for tool in env.get("tools",[]) if tool.get("connectorRef")!=connector["ref"]]+saved["tools"]
        self.nodes = copy.deepcopy(NODE_DESCRIPTORS)
        self.operations = copy.deepcopy(OPERATIONS)
        for env in self.environments:
            env.setdefault("ownerIds",[])
            env.setdefault("tools",[])
            env.setdefault("providers",[])
            env.setdefault("connectors",[])
            env.setdefault("limits",HARD_LIMITS)
            env.setdefault("capabilities",["serial","bounded-loop","llm","http","mcp","function"])
            env["capabilities"]=list(dict.fromkeys([*env["capabilities"],"checkpoint","interrupt","parallel","join","send","command","subgraph","node-retry","node-cache","node-error-handler","custom-reducer","runtime-context","store","model-token-stream","thread-continuation","replay-fork","state-update","bulk-state-update"]))
            env.setdefault("revocationEpoch",0)
            access=env.get("access","owners")
            if access not in ("owners","authenticated"): raise ExecutionError("INVALID_ENVIRONMENT","Unsupported environment access","policy")
            if access=="authenticated":
                if env.get("ownerIds"): raise ExecutionError("INVALID_ENVIRONMENT","Authenticated environments must not declare ownerIds","policy")
                if any(env.get(field) for field in ("providers","connectors","tools","variables","functions")): raise ExecutionError("INVALID_ENVIRONMENT","Authenticated environments must not carry capabilities or secrets","policy")
            self.update(env)
    def update(self, env):
        for tool in env["tools"]:
            try:
                schema_check(tool["inputSchema"]); schema_check(tool.get("outputSchema",{})); tool["available"]=True;tool.pop("diagnostics",None)
            except Exception as error:
                tool["available"]=False;tool["diagnostics"]=[{"code":getattr(error,"code","INVALID_TOOL_SCHEMA"),"severity":"error","message":"Tool Schema is unsupported or invalid in M1"}]
            tool["contractDigest"]=digest({key:value for key,value in tool.items() if key not in ("contractDigest","available","diagnostics")})
        env["revision"] = digest({key:value for key,value in env.items() if key not in ("revision","functions","variables","configurationRevision","capabilityOrigins")})
    def environment_allowed(self, env, owner):
        if not owner or env.get("disabled"): return False
        return env.get("access","owners")=="authenticated" or owner in env.get("ownerIds",[]) or "*" in env.get("ownerIds",[])
    def environment(self, ref, owner):
        matches = [env for env in self.environments if env["ref"]==ref and self.environment_allowed(env,owner)]
        if not matches: raise ExecutionError("ENVIRONMENT_FORBIDDEN","Environment is not authorized", "auth")
        env=copy.deepcopy(matches[0])
        env["variables"]={};env["configurationRevision"]=0
        database=os.environ.get("WORKFLOW_DATABASE_URL")
        if database:
            import psycopg
            with psycopg.connect(database,connect_timeout=5,tcp_user_timeout=20000,options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
                row=connection.execute("select workflow_private.environment_variables(%s::uuid)",(owner,)).fetchone()
                if row and row[0]:
                    env["configurationRevision"]=row[0]["revision"]
                    env["variables"]={v["key"]:v.get("overrides",{}).get(ref,v["value"]) for v in row[0]["variables"]}
        env['functions']=[]
        if database:
            with psycopg.connect(database,connect_timeout=5,tcp_user_timeout=20000,options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
                rows=connection.execute('select workflow_private.p4_catalog_read(%s::uuid,%s)',(owner,ref)).fetchone()[0]
                for row in rows:
                    if row['kind']=='function': env['functions'].append({**row['content'],'ref':row['ref'],'version':row['version'],'disabled':row['disabled']})
                from .extensions import hydrate_connections
                hydrate_connections(env,owner,rows)
                catalog_file=os.environ.get('WORKFLOW_CATALOG_FILE')
                if os.environ.get('WORKFLOW_DEPLOYMENT_MODE')=='hosted' or catalog_file and Path(catalog_file).exists():
                    if os.environ.get('WORKFLOW_DEPLOYMENT_MODE')=='hosted':
                        with psycopg.connect(database,connect_timeout=5,tcp_user_timeout=20000,options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
                            discovered=connection.execute('select workflow_private.p6_catalog_list()').fetchone()[0]
                    else:
                        discovered=json.loads(Path(catalog_file).read_text())
                    for connector in env['connectors']:
                        saved=discovered.get(ref+':'+connector['ref'])
                        if saved and saved['connectorDigest']==digest(connector):
                            env['tools']=[t for t in env['tools'] if t.get('connectorRef')!=connector['ref']]+saved['tools']
                self.update(env)
        return env
    def snapshot(self, env):
        content = {"id":env["ref"],"nodes":self.nodes,"tools":env["tools"],"operations":self.operations,"capabilities":env["capabilities"],"environmentRevision":env["revision"],"variables":env.get("variables",{}),"configurationRevision":env.get("configurationRevision",0),"dependencyManifest":DEPENDENCY_MANIFEST}
        if os.environ.get('WORKFLOW_SANDBOX_BACKEND')=='vercel':
            content['executionBackend']={'type':'vercel','image':os.environ.get('WORKFLOW_SANDBOX_IMAGE','')}
        return {**content,"digest":digest(content),"functions":env.get("functions",[])}
    def public_environment(self, env):
        origins=env.get("capabilityOrigins",{})
        def meta(ref):
            value=origins.get(ref,{})
            return {"origin":value.get("origin","environment"), **({"connectionRef":value["connectionRef"],"version":value["version"]} if "connectionRef" in value else {})}
        return {"environmentRef":env["ref"],"environmentRevision":env["revision"],"name":env.get("name",env["ref"]),"access":env.get("access","owners"),"capabilities":env["capabilities"],"providers":[{"ref":p["ref"],"modelRefs":p["modelRefs"],"name":p.get("name",p["ref"]),**meta(p["ref"])} for p in env["providers"]],"connectors":[{"ref":c["ref"],"name":c.get("name",c["ref"]),"transport":c.get("transport","streamable-http"),**meta(c["ref"])} for c in env["connectors"]],"limits":env["limits"],"variables":env.get("variables",{}),"configurationRevision":env.get("configurationRevision",0)}
    def public_tools(self, env):
        origins=env.get("capabilityOrigins",{})
        def meta(ref):
            value=origins.get(ref,{})
            return {"origin":value.get("origin","environment"), **({"connectionRef":value["connectionRef"]} if "connectionRef" in value else {})}
        return [{**{k:v for k,v in tool.items() if k in ("ref","name","description","version","inputSchema","outputSchema","contractDigest","sideEffect","available","adapter","connectorRef","diagnostics") or k=="group" and v in ("test","general")},**meta(tool["ref"])} for tool in env["tools"]]
