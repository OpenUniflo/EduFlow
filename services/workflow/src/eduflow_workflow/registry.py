"""Trusted operations and versioned descriptor catalog; configuration is server-only."""
import copy
import json
import os
from pathlib import Path
from .contracts import digest, schema_check, ExecutionError, HARD_LIMITS, DEPENDENCY_MANIFEST

OBJ = {"type":"object", "properties":{}, "additionalProperties":False}
ANY_OBJ = {"type":"object"}
STRING = {"type":"string"}
def obj(properties, required=None): return {"type":"object","properties":properties,"required":required if required is not None else list(properties),"additionalProperties":False}
MESSAGE_SCHEMA = {"type":"object", "properties":{"id":STRING, "role":{"enum":["system","user","assistant","tool","remove"]}, "content":{"type":"array","items":{"type":"object","properties":{"type":{"const":"text"},"text":STRING},"required":["type","text"],"additionalProperties":False}}, "toolCalls":{"type":"array","items":{"type":"object","properties":{"id":STRING,"name":STRING,"arguments":ANY_OBJ},"required":["id","name","arguments"],"additionalProperties":False}},"toolCallId":STRING},"required":["id","role","content"],"additionalProperties":False}
MESSAGES = {"type":"array", "items":MESSAGE_SCHEMA}
CALLS = {"type":"array","items":{"type":"object","properties":{"id":STRING,"name":STRING,"arguments":ANY_OBJ},"required":["id","name","arguments"],"additionalProperties":False}}
PROMPT_SEGMENT = {"oneOf":[
    {"type":"object","properties":{"type":{"const":"text"},"text":STRING},"required":["type","text"],"additionalProperties":False},
    {"type":"object","properties":{"type":{"const":"param"},"name":STRING,"format":{"enum":["text","json"]}},"required":["type","name"],"additionalProperties":False},
]}
PROMPT_MESSAGE = {"type":"object","properties":{"role":{"enum":["user","assistant"]},"content":{"type":"array","items":PROMPT_SEGMENT}},"required":["role","content"],"additionalProperties":False}
PROMPT = {"type":"object","properties":{"system":{"type":"array","items":PROMPT_SEGMENT},"messages":{"type":"array","minItems":1,"items":PROMPT_MESSAGE}},"required":["messages"],"additionalProperties":False}
LLM_CONFIG = obj({"providerRef":STRING,"modelRef":STRING,"modelParameters":ANY_OBJ,"allowedToolRefs":{"type":"array","items":STRING},"prompt":PROMPT})
STRUCTURED_OUTPUT = {"type":"object","properties":{"fields":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"name":STRING,"type":{"enum":["string","number","boolean","array","object"]},"description":STRING},"required":["name","type"],"additionalProperties":False}}},"required":["fields"],"additionalProperties":False}
LLM_CONFIG["properties"]["structuredOutput"] = STRUCTURED_OUTPUT
# Declared parameters plus the optional reserved history binding; open object keeps both dynamic.
LLM_INPUTS = {"type":"object","properties":{"history":MESSAGES},"additionalProperties":True}
# Structured fields are returned as top-level output items (`/<field>`), so the
# shape stays open while the base items remain fixed.
LLM_OUTPUT = {**obj({"messages":MESSAGES,"toolCalls":CALLS,"text":STRING}),"additionalProperties":True}

def descriptor(kind, config, inputs=OBJ, output=OBJ, side_effect="none", outlets=None, version=1):
    return {"type":kind,"version":version,"configSchema":config,"inputSchema":inputs,"outputSchema":output,"outlets":["next"] if outlets is None else outlets,"sideEffect":side_effect,"requiredCapabilities":[]}

NODE_DESCRIPTORS = [
    descriptor("core.progress",obj({"message":{"type":"string","maxLength":500},"percent":{"type":"number","minimum":0,"maximum":100}},["message"]),ANY_OBJ,obj({"message":{"type":"string"},"percent":{"type":"number"}})),
    descriptor("core.memory",obj({"operation":{"enum":["get","put","delete"]},"scope":{"enum":["workflow","shared"]},"collection":STRING,"key":STRING,"ttlMinutes":{"type":"integer","minimum":1,"maximum":10080}},["operation","scope","collection"]),ANY_OBJ,obj({"found":{"type":"boolean"},"value":{},"version":{"type":"integer"}}),"write"),
    descriptor("control.fork",obj({"branches":{"type":"array","items":STRING,"minItems":1}})),
    descriptor("control.join",obj({"waitFor":{"type":"array","items":STRING,"minItems":1},"strategy":{"enum":["all","any"]}})),
    descriptor("control.send",obj({"items":STRING,"target":STRING,"itemKey":STRING,"concurrency":{"type":"integer","minimum":1,"maximum":20}})),
    descriptor("core.subgraph",obj({"graph":ANY_OBJ,"stateMode":{"enum":["independent","shared"]},"persistence":{"enum":["per-invocation","stateless","per-thread"]}},["graph"]),ANY_OBJ,ANY_OBJ),
    descriptor("core.function", obj({"implementation":{"enum":["registered","code"]},"functionRef":STRING,"functionVersion":{"type":"integer","minimum":1},"language":{"enum":["python","javascript"]},"code":STRING,"inputSchema":ANY_OBJ,"outputSchema":ANY_OBJ},["implementation"]),ANY_OBJ,ANY_OBJ),
    descriptor("core.start", OBJ), descriptor("core.end", OBJ, outlets=[]),
    descriptor("core.router", obj({"cases":{"type":"array","items":{"type":"object"}},"defaultOutlet":STRING,"defaultLabel":STRING,"mode":{"enum":["first","all"]}}, ["cases","defaultOutlet"]), output=obj({"outlet":{"type":["string","array"],"items":STRING}})),
    descriptor("core.transform", obj({"operationRef":STRING,"operationVersion":{"const":1}}), ANY_OBJ, ANY_OBJ),
    descriptor("core.llm", LLM_CONFIG, LLM_INPUTS, LLM_OUTPUT, "read", version=2),
    descriptor("core.tool", obj({"toolRef":STRING,"contractDigest":STRING}), ANY_OBJ, obj({"result":{}}), "write", version=2),
    descriptor("core.tool_dispatch", obj({"allowedToolRefs":{"type":"array","items":STRING}}),obj({"toolCalls":CALLS}),obj({"toolMessages":MESSAGES}),"write"),
]
# Product tools are real, read-only public services available without a user
# connection. They keep the first-run flow runnable with only a model connection.
BUILTIN_TOOLS = [
    {
        "ref": "hn_search",
        "name": "Hacker News 搜索",
        "description": "搜索 Hacker News 的公开讨论（Algolia 搜索）",
        "version": 1,
        "adapter": "http",
        "baseUrl": "https://hn.algolia.com",
        "method": "GET",
        "path": "/api/v1/search?query={query}&tags=story&hitsPerPage=5&optionalWords={query}&typoTolerance=false",
        "sideEffect": "read",
        "inputSchema": obj({"query": {"type": "string", "title": "搜索关键词", "description": "要搜索的关键词；纯中文问题先由模型转成英文关键词。", "minLength": 1, "maxLength": 200}}),
        "outputSchema": {"type": "object", "properties": {"hits": {"type": "array", "items": {"type": "object"}}}, "required": ["hits"]},
    },
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

def restore_frozen_environment(env, frozen):
    """Reapply frozen ordinary values and variable environment selection to a fresh environment."""
    frozen=frozen if isinstance(frozen,dict) else {}
    if "variables" in frozen: env["variables"]=copy.deepcopy(frozen["variables"])
    if "configurationRevision" in frozen: env["configurationRevision"]=frozen["configurationRevision"]
    env["variableEnvironment"]=copy.deepcopy(frozen.get("variableEnvironment"))
    env["variableEnvironmentId"]=frozen.get("variableEnvironmentId")
    return env

def requested_variable_environment(body):
    """Optional request field shared by every endpoint that resolves workspace variables."""
    value=body.get("variableEnvironmentId") if isinstance(body,dict) else None
    if value is None: return None
    if not isinstance(value,str) or not value or len(value)>128: raise ExecutionError("INVALID_VARIABLE_ENVIRONMENT","Variable environment is unavailable","policy")
    return value

def resolve_variable_configuration(configuration, variable_environment_id=None):
    """Resolve ordinary variables for one owner-visible variable environment.

    RPC contract (workflow_private.environment_variables): revision, variables
    [{key,value,overrides}], environments [{id,name}], default_environment_id.
    A function that predates variable environments omits environments/default;
    resolution then keeps pure default values. An explicitly requested id that
    is not present in this owner's configuration is rejected.
    """
    configuration=configuration if isinstance(configuration,dict) else {}
    raw_variables=configuration.get("variables")
    raw_environments=configuration.get("environments")
    variables=raw_variables if isinstance(raw_variables,list) else []
    environments=raw_environments if isinstance(raw_environments,list) else []
    known={item["id"]:item for item in environments if isinstance(item,dict) and isinstance(item.get("id"),str) and item["id"]}
    default_id=configuration.get("default_environment_id",configuration.get("defaultEnvironmentId"))
    if not isinstance(default_id,str) or default_id not in known: default_id=None
    if variable_environment_id is not None:
        if not isinstance(variable_environment_id,str) or variable_environment_id not in known:
            raise ExecutionError("INVALID_VARIABLE_ENVIRONMENT","Variable environment is unavailable","policy")
        selected=known[variable_environment_id]
    else: selected=known[default_id] if default_id else None
    selected_id=selected["id"] if selected else None
    name=selected.get("name") if selected else None
    resolved={}
    for variable in variables:
        if not isinstance(variable,dict) or not isinstance(variable.get("key"),str): continue
        overrides=variable.get("overrides") if isinstance(variable.get("overrides"),dict) else {}
        resolved[variable["key"]]=overrides[selected_id] if selected_id is not None and selected_id in overrides else variable.get("value")
    revision=configuration.get("revision",0)
    if isinstance(revision,bool) or not isinstance(revision,int): revision=0
    return {"revision":revision,"variables":resolved,
            "variableEnvironment":({"id":selected_id,"name":name if isinstance(name,str) and name else selected_id} if selected else None),
            "variableEnvironmentId":selected_id,"defaultVariableEnvironmentId":default_id}

def fixture_tool_refs():
    """Local acceptance-only tools are hidden from the user-facing catalog.

    The environment may mark tools explicitly; a local launcher may also name
    legacy fixture refs without editing or deleting the owner's catalog rows.
    """
    return {item.strip() for item in os.environ.get("WORKFLOW_FIXTURE_TOOL_REFS","").split(",") if item.strip()}

def is_fixture_tool(tool, hidden=None):
    if tool.get("fixture") is True: return True
    hidden = fixture_tool_refs() if hidden is None else hidden
    ref = str(tool.get("ref") or "")
    if ref in hidden: return True
    # Owner catalog tools carry identity as p4:<owner>:<logicalRef>:<version>.
    parts = ref.split(":")
    return len(parts) >= 4 and parts[0] == "p4" and parts[2] in hidden

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
            elif access=="owners":
                # Built-in real public tools do not require a user-managed connection.
                known={tool.get("ref") for tool in env["tools"]}
                env["tools"]=[*env["tools"], *[copy.deepcopy(tool) for tool in BUILTIN_TOOLS if tool["ref"] not in known]]
            self.update(env)
    def update(self, env):
        for tool in env["tools"]:
            try:
                schema_check(tool["inputSchema"]); schema_check(tool.get("outputSchema",{})); tool["available"]=True;tool.pop("diagnostics",None)
            except Exception as error:
                tool["available"]=False;tool["diagnostics"]=[{"code":getattr(error,"code","INVALID_TOOL_SCHEMA"),"severity":"error","message":"Tool Schema is unsupported or invalid in M1"}]
            tool["contractDigest"]=digest({key:value for key,value in tool.items() if key not in ("contractDigest","available","diagnostics")})
        env["revision"] = digest({key:value for key,value in env.items() if key not in ("revision","functions","variables","configurationRevision","capabilityOrigins","variableEnvironment","variableEnvironmentId","defaultVariableEnvironmentId")})
    def environment_allowed(self, env, owner):
        if not owner or env.get("disabled"): return False
        return env.get("access","owners")=="authenticated" or owner in env.get("ownerIds",[]) or "*" in env.get("ownerIds",[])
    def variable_configuration(self, owner):
        database=os.environ.get("WORKFLOW_DATABASE_URL")
        if not database: return None
        import psycopg
        with psycopg.connect(database,connect_timeout=5,tcp_user_timeout=20000,options='-c statement_timeout=15000 -c lock_timeout=3000') as connection:
            row=connection.execute("select workflow_private.environment_variables(%s::uuid)",(owner,)).fetchone()
        return row[0] if row and row[0] else None
    def environment(self, ref, owner, variable_environment_id=None):
        matches = [env for env in self.environments if env["ref"]==ref and self.environment_allowed(env,owner)]
        if not matches: raise ExecutionError("ENVIRONMENT_FORBIDDEN","Environment is not authorized", "auth")
        env=copy.deepcopy(matches[0])
        env["variables"]={};env["configurationRevision"]=0
        env["variableEnvironment"]=None;env["variableEnvironmentId"]=None;env["defaultVariableEnvironmentId"]=None
        database=os.environ.get("WORKFLOW_DATABASE_URL")
        configuration=self.variable_configuration(owner)
        if configuration:
            resolution=resolve_variable_configuration(configuration,variable_environment_id)
            env["configurationRevision"]=resolution["revision"]
            env["variables"]=resolution["variables"]
            env["variableEnvironment"]=resolution["variableEnvironment"]
            env["variableEnvironmentId"]=resolution["variableEnvironmentId"]
            env["defaultVariableEnvironmentId"]=resolution["defaultVariableEnvironmentId"]
        elif variable_environment_id is not None:
            raise ExecutionError("INVALID_VARIABLE_ENVIRONMENT","Variable environment is unavailable","policy")
        env['functions']=[]
        if database:
            import psycopg
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
        content = {"id":env["ref"],"nodes":self.nodes,"tools":env["tools"],"operations":self.operations,"capabilities":env["capabilities"],"environmentRevision":env["revision"],"providers":[{"ref":p["ref"],"modelRefs":p.get("modelRefs",[])} for p in env.get("providers",[])],"variables":env.get("variables",{}),"variableEnvironment":copy.deepcopy(env.get("variableEnvironment")),"variableEnvironmentId":env.get("variableEnvironmentId"),"configurationRevision":env.get("configurationRevision",0),"dependencyManifest":DEPENDENCY_MANIFEST}
        if os.environ.get('WORKFLOW_SANDBOX_BACKEND')=='vercel':
            content['executionBackend']={'type':'vercel','image':os.environ.get('WORKFLOW_SANDBOX_IMAGE','')}
        return {**content,"digest":digest(content),"functions":env.get("functions",[])}
    def public_environment(self, env):
        origins=env.get("capabilityOrigins",{})
        def meta(ref):
            value=origins.get(ref,{})
            return {"origin":value.get("origin","environment"), **({"connectionRef":value["connectionRef"],"version":value["version"]} if "connectionRef" in value else {})}
        return {"environmentRef":env["ref"],"environmentRevision":env["revision"],"name":env.get("name",env["ref"]),"access":env.get("access","owners"),"capabilities":env["capabilities"],"providers":[{"ref":p["ref"],"modelRefs":p["modelRefs"],"name":p.get("name",p["ref"]),**meta(p["ref"])} for p in env["providers"]],"connectors":[{"ref":c["ref"],"name":c.get("name",c["ref"]),"transport":c.get("transport","streamable-http"),**meta(c["ref"])} for c in env["connectors"] if c.get("fixture") is not True],"limits":env["limits"],"variables":env.get("variables",{}),"configurationRevision":env.get("configurationRevision",0)}
    def public_tools(self, env):
        origins=env.get("capabilityOrigins",{})
        hidden=fixture_tool_refs()
        def meta(ref):
            value=origins.get(ref,{})
            return {"origin":value.get("origin","environment"), **({"connectionRef":value["connectionRef"]} if "connectionRef" in value else {})}
        return [{**{k:v for k,v in tool.items() if k in ("ref","name","description","version","inputSchema","outputSchema","contractDigest","sideEffect","available","adapter","connectorRef","diagnostics") or k=="group" and v in ("test","general")},**meta(tool["ref"])} for tool in env["tools"] if not is_fixture_tool(tool,hidden)]
