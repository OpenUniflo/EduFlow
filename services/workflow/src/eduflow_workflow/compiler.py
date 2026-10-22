"""Pure validation and actual LangGraph construction; no discovery or I/O."""
from typing import Annotated, TypedDict, Any
from functools import lru_cache
from dataclasses import dataclass
from jsonschema import Draft202012Validator
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from contextvars import ContextVar
from .contracts import ExecutionError, VERSION, bind, digest, semantic_hash, schema_check, validate_value, check_json, HARD_LIMITS, DEPENDENCY_MANIFEST, reduce_field

SDK_EXECUTION = ContextVar("workflow_sdk_execution", default=None)
SDK_SCOPE = ContextVar("workflow_graph_scope", default=None)
SDK_MESSAGES = ContextVar("workflow_provider_messages", default={})

DEFINITION_KEYS={"schemaVersion","workflowId","revision","name","description","inputSchema","outputSchema","state","entryNodeId","nodes","transitions","outputBindings","policy","requiredCapabilities"}

def envelope(definition):
    check_json(definition)
    if not isinstance(definition,dict) or definition.get("schemaVersion")!="2.0": raise ExecutionError("UNKNOWN_DEFINITION_VERSION","Expected Definition 2.0")
    if set(definition)!=DEFINITION_KEYS: raise ExecutionError("INVALID_DEFINITION","Definition fields do not match V2 envelope")
    if not isinstance(definition["nodes"],list) or not isinstance(definition["transitions"],list): raise ExecutionError("INVALID_DEFINITION","Nodes and transitions must be arrays")
    if len(definition["nodes"])>500 or len(definition["transitions"])>1000: raise ExecutionError("DEFINITION_TOO_LARGE","Definition exceeds limits","policy")
    for key in ("workflowId","name","description","entryNodeId"):
        if not isinstance(definition[key],str): raise ExecutionError("INVALID_DEFINITION",key+" must be a string")
    if isinstance(definition["revision"],bool) or not isinstance(definition["revision"],int) or definition["revision"]<0: raise ExecutionError("INVALID_DEFINITION","Invalid revision")
    for collection in (definition["nodes"],definition["transitions"]):
        ids=[item.get("id") for item in collection]
        if any(not isinstance(i,str) or not i for i in ids) or len(ids)!=len(set(ids)): raise ExecutionError("DUPLICATE_ID","Stable unique IDs required")
    if not isinstance(definition["state"],dict) or set(definition["state"])!={"schema","initial","inputBindings","reducers"}: raise ExecutionError("INVALID_STATE","State envelope invalid")
    for key in ("schema","initial","inputBindings","reducers"):
        if not isinstance(definition["state"][key],dict): raise ExecutionError("INVALID_STATE","State field must be object")
    for key in ("inputSchema","outputSchema","outputBindings","policy"):
        if not isinstance(definition[key],dict): raise ExecutionError("INVALID_DEFINITION",key+" must be object")
    if not isinstance(definition["requiredCapabilities"],list) or any(not isinstance(v,str) for v in definition["requiredCapabilities"]): raise ExecutionError("INVALID_CAPABILITIES","Capabilities must be string array")
    for node in definition["nodes"]:
        if set(node)!={"id","label","type","typeVersion","config","inputs","writes"}: raise ExecutionError("INVALID_NODE","Node fields do not match V2")
        if not isinstance(node["label"],str) or not isinstance(node["type"],str) or isinstance(node["typeVersion"],bool) or not isinstance(node["typeVersion"],int) or any(not isinstance(node[key],dict) for key in ("config","inputs","writes")): raise ExecutionError("INVALID_NODE","Node field types invalid")
    if len(__import__('json').dumps(definition))>2097152: raise ExecutionError("DEFINITION_TOO_LARGE","Definition exceeds size limit","policy")

def binding_check(binding, allowed):
    if not isinstance(binding,dict) or binding.get("source") not in allowed: raise ExecutionError("INVALID_BINDING","Invalid binding source")
    if binding["source"]=="literal":
        if set(binding)!={"source","value"}: raise ExecutionError("INVALID_BINDING","Literal binding fields invalid")
        return
    if set(binding)!={"source","pointer","onMissing"} or not isinstance(binding["pointer"],str) or binding["pointer"] and not binding["pointer"].startswith("/"): raise ExecutionError("INVALID_BINDING","Invalid JSON Pointer binding")
    missing=binding["onMissing"]
    if missing not in ({"mode":"error"},) and (not isinstance(missing,dict) or set(missing)!={"mode","value"} or missing["mode"]!="default"): raise ExecutionError("INVALID_BINDING","Missing-value rule required")

def schema_pointer(schema, path):
    if path=="": return schema
    current=schema
    for token in path[1:].split("/"):
        token=token.replace("~1","/").replace("~0","~")
        if not isinstance(current,dict): return {}
        if "$ref" in current:
            from .contracts import pointer
            current=pointer(schema,current["$ref"][1:])
            if not isinstance(current,dict): return {}
        kind=current.get("type")
        if kind=="array": current=current.get("items",{}); continue
        if token in current.get("properties",{}): current=current["properties"][token]; continue
        if current.get("additionalProperties",True) is False: raise ExecutionError("UNKNOWN_BINDING_FIELD","Binding references undeclared Schema field: "+path)
        return {}
    return current

def declared_root_types(schema):
    # This is a necessary-type check, not a second JSON Schema validator.
    # Ref/unknown schemas remain runtime decisions; integer and number overlap.
    if not isinstance(schema,dict) or "$ref" in schema: return None
    declared=schema.get("type")
    if isinstance(declared,str): declared=[declared]
    if not isinstance(declared,list) or not declared or any(not isinstance(kind,str) for kind in declared): return None
    return {"number" if kind=="integer" else kind for kind in declared}

def binding_schema_check(binding, definition, target_schema=None):
    if binding.get("source") in ("literal","environment"): return
    schema=definition["inputSchema"] if binding["source"]=="input" else definition["state"]["schema"]
    source_types=declared_root_types(schema_pointer(schema,binding["pointer"]))
    target_types=declared_root_types(target_schema)
    if source_types is None or target_types is None: return
    missing=binding.get("onMissing",{})
    if missing.get("mode")=="default":
        source_types|={kind for kind in ("null","boolean","object","array","number","string") if Draft202012Validator.TYPE_CHECKER.is_type(missing["value"],kind)}
    if source_types.isdisjoint(target_types):
        raise ExecutionError("BINDING_TYPE_MISMATCH","Binding source and node input declare incompatible JSON types")

def predicate_check(spec):
    op=spec.get("op")
    if op=='function':
        if set(spec)!={'op','functionRef','functionVersion','value'} or spec['functionRef'] not in ('edu.positive','edu.truthy') or spec['functionVersion']!=1: raise ExecutionError('INVALID_PREDICATE_FUNCTION','Select a registered predicate @1')
        binding_check(spec['value'],('input','state','literal'));return
    if op in ("and","or"):
        if set(spec)!={"op","children"} or not isinstance(spec["children"],list) or not spec["children"]: raise ExecutionError("INVALID_PREDICATE","Nonempty children required")
        for item in spec["children"]: predicate_check(item)
    elif op=="not":
        if set(spec)!={"op","child"}: raise ExecutionError("INVALID_PREDICATE","Invalid not predicate")
        predicate_check(spec["child"])
    elif op in ("exists","nonEmpty"):
        if set(spec)!={"op","source","pointer"} or spec["source"] not in ("state","input") or not isinstance(spec["pointer"],str) or spec["pointer"] and not spec["pointer"].startswith("/"): raise ExecutionError("INVALID_PREDICATE","Invalid existence predicate")
    elif op in ("eq","ne","gt","gte","lt","lte"):
        if set(spec)!={"op","left","right"}: raise ExecutionError("INVALID_PREDICATE","Invalid comparison predicate")
        binding_check(spec["left"],("input","state","literal")); binding_check(spec["right"],("input","state","literal"))
    else: raise ExecutionError("INVALID_PREDICATE","Unknown predicate operation")

def _validate_definition(definition, registry_snapshot, environment_checks, parent=None, depth=0):
    diagnostics=[]
    if depth>8: return {'valid':False,'diagnostics':[{'code':'SUBGRAPH_DEPTH_EXCEEDED','severity':'error','message':'Subgraphs support at most 8 nesting levels'}],'requiredCapabilities':[]}
    def inspect(function, pointer="", node=None, edge=None):
        try: function(); return True
        except Exception as error:
            location=pointer+(getattr(error,"pointer",None) or "") if pointer else ""
            diagnostics.append({"code":getattr(error,"code","INVALID_DEFINITION"),"severity":"error","message":str(error),**({"pointer":location} if location else {}),**({"nodeId":node} if node else {}),**({"transitionId":edge} if edge else {})})
            return False
    if not inspect(lambda:envelope(definition)): return {"valid":False,"diagnostics":diagnostics,"requiredCapabilities":[]}
    descriptors={(node["type"],node["version"]):node for node in registry_snapshot["nodes"]}
    tools={tool["ref"]:tool for tool in registry_snapshot["tools"]}
    operations=registry_snapshot.get("operations",{})
    for key in ("inputSchema","outputSchema"):
        inspect(lambda key=key:schema_check(definition[key]),"/"+key)
        if definition[key].get("type")!="object": diagnostics.append({"code":"INVALID_SCHEMA","severity":"error","pointer":"/"+key,"message":"Top-level Schema must be object"})
    inspect(lambda:schema_check(definition["state"]["schema"]),"/state/schema")
    if definition["state"]["schema"].get("type")!="object": diagnostics.append({"code":"INVALID_SCHEMA","severity":"error","pointer":"/state/schema","message":"Top-level State Schema must be object"})
    fields=set(definition["state"]["schema"].get("properties",{}))
    for field,reducer in definition["state"]["reducers"].items():
        if field not in fields or not isinstance(reducer,dict) or isinstance(reducer.get("version"),bool) or not isinstance(reducer.get("version"),int) or reducer not in ({"name":"replace","version":1},{"name":"append","version":1},{"name":"messages","version":1},{"name":"edu.sum","version":1},{"name":"edu.max","version":1},{"name":"edu.unique","version":1}): diagnostics.append({"code":"INVALID_REDUCER","severity":"error","pointer":"/state/reducers/"+field,"message":"Unknown field or reducer"})
    for key,bindings in (("/state/inputBindings",definition["state"]["inputBindings"]),("/outputBindings",definition["outputBindings"])):
        declared=fields if key.startswith("/state") else set(definition["outputSchema"].get("properties",{}))
        for field,value in bindings.items():
            inspect(lambda value=value:binding_check(value,("input","literal") if key.startswith("/state") else ("input","state","literal")),key+"/"+field)
            inspect(lambda value=value:binding_schema_check(value,definition),key+"/"+field)
            if field not in declared: diagnostics.append({"code":"UNKNOWN_FIELD","severity":"error","pointer":key+"/"+field,"message":"Binding targets undeclared field"})
    advanced=definition['policy'].get('authoring',{})
    def policy_authoring_check():
        if not isinstance(advanced,dict) or set(advanced)-{'checkpoint','waitTimeoutMs','recursionLimit','interruptBefore','interruptAfter','entryRouter'}: raise ExecutionError('UNSUPPORTED_CAPABILITY','Unknown graph runtime policy')
        if advanced.get('checkpoint','superstep')!='superstep': raise ExecutionError('INVALID_POLICY','Only superstep checkpointing is supported')
        for key,limit in (('waitTimeoutMs',604800000),('recursionLimit',10000)):
            value=advanced.get(key,86400000 if key=='waitTimeoutMs' else 1000)
            if isinstance(value,bool) or not isinstance(value,int) or value<(1000 if key=='waitTimeoutMs' else 1) or value>limit: raise ExecutionError('INVALID_POLICY','Invalid '+key)
    inspect(policy_authoring_check,'/policy/authoring')
    from .graph_control import validate_control
    inspect(lambda:validate_control(definition), '/control')
    for key,value in definition["policy"].items():
        if key=='authoring': continue
        if key not in HARD_LIMITS or isinstance(value,bool) or not isinstance(value,int) or value<1 or value>HARD_LIMITS[key]: diagnostics.append({"code":"UNSUPPORTED_CAPABILITY" if key=="maxCost" else "INVALID_POLICY","severity":"error","pointer":"/policy/"+key,"message":"Unsupported or excessive execution limit"})
    if set(definition["policy"])-{"authoring"}!=set(HARD_LIMITS): diagnostics.append({"code":"INVALID_POLICY","severity":"error","pointer":"/policy","message":"All M1 policy fields required"})
    unsupported=set(definition["requiredCapabilities"])-set(registry_snapshot["capabilities"])
    if unsupported: diagnostics.append({"code":"UNSUPPORTED_CAPABILITY","severity":"error","message":"Unsupported capabilities: "+",".join(sorted(unsupported))})
    nodes={node["id"]:node for node in definition["nodes"]}
    outlets={}
    for node in nodes.values():
        nid=node["id"]; desc=descriptors.get((node["type"],node["typeVersion"]))
        if not desc:
            diagnostics.append({"code":"UNKNOWN_NODE_TYPE","severity":"error","nodeId":nid,"message":"Unknown node executor"}); continue
        if node['config'].get('authoring',{}).get('command',{}).get('graph')=='parent' and parent is None:
            diagnostics.append({'code':'INVALID_COMMAND','severity':'error','nodeId':nid,'message':'Parent Command requires a subgraph'})
        from .execution_policies import validate_node
        inspect(lambda:validate_node(node,registry_snapshot,environment_checks),'/nodes/'+nid+'/config',nid)
        from .interrupts import interaction_check
        inspect(lambda:interaction_check(definition,node),'/nodes/'+nid+'/config/authoring',nid)
        inspect(lambda:validate_value(desc["configSchema"],{k:v for k,v in node['config'].items() if k!='authoring'}),"/nodes/"+nid+"/config",nid)
        operation=operations.get(config_ref,{}) if (config_ref:=node["config"].get("operationRef")) else {}
        input_schema=operation.get("inputSchema",desc["inputSchema"])
        if node['type']=='core.function':
            input_schema=node['config'].get('inputSchema',{'type':'object'})
            if environment_checks and node['config'].get('implementation')=='registered':
                try:
                    from .execution_policies import function
                    input_schema=function({'functions':registry_snapshot.get('functions',[])},node['config'].get('functionRef'),node['config'].get('functionVersion'))['inputSchema']
                except ExecutionError: pass
        supplied=set(node["inputs"])
        if set(input_schema.get("required",[]))-supplied or input_schema.get("additionalProperties",True) is False and supplied-set(input_schema.get("properties",{})):
            diagnostics.append({"code":"INVALID_NODE_INPUT_BINDINGS","severity":"error","nodeId":nid,"pointer":"/nodes/"+nid+"/inputs","message":"Node inputs require declared fields and all required bindings"})
        for field,value in node["inputs"].items():
            location="/nodes/"+nid.replace("~","~0").replace("/","~1")+"/inputs/"+field.replace("~","~0").replace("/","~1")
            target_schema=input_schema.get("properties",{}).get(field,{})
            valid=inspect(lambda value=value:binding_check(value,("input","state","literal","environment")),location,nid)
            if valid: valid=inspect(lambda value=value:binding_schema_check(value,definition,target_schema),location,nid)
            if valid and value.get("source")=="literal": valid=inspect(lambda value=value:validate_value(target_schema,value["value"],"INVALID_NODE_INPUT"),location,nid)
            if valid and environment_checks and value.get("source")=="environment":
                from .contracts import resolve
                valid=inspect(lambda value=value:validate_value(target_schema,resolve(value,{}, {},registry_snapshot.get("variables",{})),"INVALID_NODE_INPUT"),location,nid)
            tool_schema=tools.get(node["config"].get("toolRef"),{}).get("inputSchema") if environment_checks and node["type"]=="core.tool" and field=="arguments" else None
            if valid and tool_schema is not None:
                inspect(lambda value=value:validate_value(tool_schema,value["value"],"INVALID_NODE_INPUT") if value.get("source")=="literal" else binding_schema_check(value,definition,tool_schema),location,nid)
        for field,path in node["writes"].items():
            if field not in fields or not isinstance(path,str) or path and not path.startswith("/"): diagnostics.append({"code":"INVALID_STATE_WRITE","severity":"error","nodeId":nid,"pointer":"/nodes/"+nid+"/writes/"+field,"message":"Write requires declared top-level field and JSON Pointer"})
        outlets[nid]=desc["outlets"]
        config=node["config"]
        if node["type"]=="control.fork": outlets[nid]=config.get("branches",[])
        if node["type"]=="control.send": outlets[nid]=["next"]
        if node["type"]=="core.subgraph":
            child=config.get("graph",{})
            nested=_validate_definition(child,registry_snapshot,environment_checks,parent=definition,depth=depth+1)
            for diagnostic in nested["diagnostics"]: diagnostics.append({**diagnostic,"graphPath":[nid,*diagnostic.get("graphPath",[])]})
        if node["type"]=="control.send" and config.get("target") in nodes:
            pass
        if node["type"]=="core.router":
            cases=config.get("cases",[])
            ids=[case.get("id") for case in cases]; priorities=[case.get("priority") for case in cases]
            if len(ids)!=len(set(ids)) or config.get("defaultOutlet") in ids or len(priorities)!=len(set(priorities)) or any(isinstance(p,bool) or not isinstance(p,int) for p in priorities): diagnostics.append({"code":"INVALID_ROUTER","severity":"error","nodeId":nid,"message":"Unique outlets/priorities required"})
            for case in cases: inspect(lambda case=case:predicate_check(case["predicate"]),"/nodes/"+nid+"/config/cases",nid)
            outlets[nid]=ids+[config.get("defaultOutlet")]
        if node["type"]=="core.transform" and config.get("operationRef") not in operations: diagnostics.append({"code":"UNKNOWN_OPERATION","severity":"error","nodeId":nid,"message":"Operation not registered"})
        refs=config.get("allowedToolRefs",[]) if node["type"] in ("core.llm","core.tool_dispatch") else [config.get("toolRef")] if node["type"]=="core.tool" else []
        for index, ref in enumerate(refs if environment_checks else []):
            pointer="/nodes/"+nid+"/config/"+("toolRef" if node["type"]=="core.tool" else "allowedToolRefs/"+str(index))
            if ref not in tools or not tools[ref].get("available",True): diagnostics.append({"code":"TOOL_UNAVAILABLE","severity":"error","nodeId":nid,"pointer":pointer,"message":"Tool unavailable or unsupported Schema"})
            elif node["type"]=="core.tool" and config.get("contractDigest")!=tools[ref]["contractDigest"]: diagnostics.append({"code":"TOOL_CONTRACT_CHANGED","severity":"error","nodeId":nid,"pointer":pointer,"message":"Tool contract has changed"})
    outgoing={nid:[] for nid in nodes}
    for edge in definition["transitions"]:
        if set(edge)!={"id","from","outlet","to"} or edge.get("from") not in nodes or edge.get("to") not in nodes:
            diagnostics.append({"code":"DANGLING_TRANSITION","severity":"error","transitionId":edge["id"],"message":"Transition endpoints invalid"}); continue
        outgoing[edge["from"]].append(edge)
    for nid,expected in outlets.items():
        actual=[edge["outlet"] for edge in outgoing[nid]]
        if set(actual)!=set(expected): diagnostics.append({"code":"INVALID_OUTLETS","severity":"error","nodeId":nid,"message":"Each declared outlet must have a transition; undeclared outlets are forbidden"})
    entry=definition["entryNodeId"]
    if entry not in nodes or nodes[entry]["type"]!="core.start": diagnostics.append({"code":"INVALID_ENTRY","severity":"error","message":"Entry must be core.start"})
    seen=set(); pending=[entry]
    while pending:
        nid=pending.pop()
        if nid in seen: continue
        seen.add(nid); pending.extend(edge["to"] for edge in outgoing.get(nid,[]))
        if nodes.get(nid,{}).get("type")=="control.send": pending.append(nodes[nid]["config"].get("target"))
        pending.extend(nodes.get(nid,{}).get("config",{}).get("authoring",{}).get("command",{}).get("destinations",[]))
        if nodes.get(nid,{}).get('type')=='core.subgraph':
            pending.extend(t for cn in nodes[nid]['config']['graph']['nodes'] for t in cn['config'].get('authoring',{}).get('command',{}).get('destinations',[]) if cn['config'].get('authoring',{}).get('command',{}).get('graph')=='parent')
    for nid in set(nodes)-seen: diagnostics.append({"code":"UNREACHABLE_NODE","severity":"error","nodeId":nid,"message":"Node is unreachable"})
    if not any(nodes[nid]["type"]=="core.end" for nid in seen if nid in nodes): diagnostics.append({"code":"MISSING_END","severity":"error","message":"Reachable end required"})
    result={"valid":not diagnostics,"diagnostics":diagnostics,"requiredCapabilities":definition["requiredCapabilities"]}
    if result["valid"]:
        result["semanticHash"]=semantic_hash(definition)
        if environment_checks:
            result["compileFingerprint"]=digest({"semanticHash":result["semanticHash"],"compilerVersion":VERSION,"dependencyManifest":DEPENDENCY_MANIFEST,"registryDigest":registry_snapshot["digest"],"functionVersions":_function_versions(definition,registry_snapshot)})
    return result


def _function_versions(definition,snapshot):
    from .execution_policies import function
    entries=[]
    for node in definition['nodes']:
        if node['type']=='core.subgraph': entries.extend(_function_versions(node['config']['graph'],snapshot))
        cfg=node['config'];refs=[]
        if node['type']=='core.function' and cfg.get('implementation')=='registered': refs.append((cfg['functionRef'],cfg['functionVersion']))
        if cfg.get('authoring',{}).get('errorHandler'):
            h=cfg['authoring']['errorHandler'];refs.append((h['functionRef'],h['functionVersion']))
        for ref,version in refs: entries.append(function({'functions':snapshot.get('functions',[])},ref,version))
    return sorted(entries,key=lambda e:(e['ref'],e['version']))

def validate_structure(definition, node_descriptors, operations):
    """Pure authoring diagnostics: no catalog, credentials or execution fingerprint.

    A structurally valid document still requires a fresh authorized environment
    compilation before any Run can be accepted.
    """
    snapshot={"nodes":node_descriptors,"tools":[],"operations":operations,
              "capabilities":["serial","bounded-loop","llm","http","mcp","function","interrupt","checkpoint","parallel","join","send","command","subgraph"]}
    return _validate_definition(definition,snapshot,environment_checks=False)

def compile_definition(definition, registry_snapshot):
    """Execution preflight always enforces frozen authorized catalog contracts."""
    return _validate_definition(definition,registry_snapshot,environment_checks=True)

class NodeResult(dict):
    """Business result plus the unmerged update for native StateGraph channels."""
    def __init__(self, values, outlet, patch):
        super().__init__(values=values, outlet=outlet)
        self.patch = patch


def state_channels(definition):
    fields = sorted(set(definition["state"]["schema"].get("properties", {})) |
                    set(definition["state"]["initial"]))
    return {field: "eduflow_state_" + str(index) for index, field in enumerate(fields)}


def encode_state(definition, values):
    return {channel: values[field] for field, channel in state_channels(definition).items() if field in values}



def encode_patch(definition,node,patch):
    from langgraph.types import Overwrite
    update=encode_state(definition,patch)
    fields=node['config'].get('authoring',{}).get('overwrite',[])
    for field in fields:
        if field in patch: update[state_channels(definition)[field]]=Overwrite(patch[field])
    return update

def decode_state(definition, channels):
    return {field: channels[channel] for field, channel in state_channels(definition).items() if channel in channels}


def _channel_reducer(name):
    def reduce(left, right):
        return reduce_field(left, right, name)
    return reduce


@dataclass(frozen=True)
class NodePlan:
    node_id: str
    node_type: str
    outgoing: tuple[tuple[str,str], ...]

@dataclass(frozen=True)
class GraphPlan:
    entry_node_id: str
    nodes: tuple[NodePlan, ...]

@lru_cache(maxsize=64)
def _graph_plan(compile_fingerprint, entry, nodes, transitions):
    """Only immutable control structure; no callbacks, config, authority or values."""
    return GraphPlan(entry,tuple(NodePlan(node_id,node_type,tuple((outlet,target) for _,source,outlet,target in transitions if source==node_id)) for node_id,node_type in nodes))

def cache_info():
    """Safe aggregate diagnostics; cache keys and cached values are never exposed."""
    return _graph_plan.cache_info()._asdict()

def graph_for(definition, execute, compile_fingerprint, *, checkpointer=None):
    from .graph_control import build_control_graph, advanced_graph
    if advanced_graph(definition): return build_control_graph(definition,execute,compile_fingerprint,checkpointer=checkpointer)
    if not isinstance(compile_fingerprint,str) or not compile_fingerprint:
        raise ExecutionError("MISSING_COMPILE_FINGERPRINT","A validated compilation identity is required")
    nodes=tuple(sorted(((node["id"],node["type"]) for node in definition["nodes"]),key=lambda node:node[0].encode("utf-16-be")))
    transitions=tuple(sorted(((edge["id"],edge["from"],edge["outlet"],edge["to"]) for edge in definition["transitions"]),key=lambda edge:edge[0].encode("utf-16-be")))
    plan=_graph_plan(compile_fingerprint,definition["entryNodeId"],nodes,transitions)
    # Every binding below is fresh per Run; the cache never captures node definitions.
    node_lookup={node["id"]:node for node in definition["nodes"]}
    # SDK names are a stable projection, never persisted Domain identities.
    sdk_names={node.node_id:"eduflow_node_"+str(index) for index,node in enumerate(plan.nodes)}
    channels=state_channels(definition)
    annotations={}
    for field, channel in channels.items():
        reducer=definition["state"]["reducers"].get(field,{"name":"replace"})["name"]
        annotations[channel]=Any if reducer=="replace" else Annotated[Any,_channel_reducer(reducer)]
    routes={node.node_id:"eduflow_route_"+str(index) for index,node in enumerate(plan.nodes) if node.node_type=="core.router"}
    annotations.update({channel:str for channel in routes.values()})
    annotations["eduflow_provider_messages"]=Any
    annotations["eduflow_graph_input"]=Any
    graph=StateGraph(TypedDict("WorkflowChannels",annotations,total=False))
    for node in plan.nodes:
        async def call(state, runtime: Runtime, node_id=node.node_id):
            values=decode_state(definition,state)
            info=runtime.execution_info
            identity={"taskId":info.task_id,"namespace":info.checkpoint_ns,"graphNamespace":info.checkpoint_ns.rsplit("|",1)[0] if "|" in info.checkpoint_ns else "","checkpointId":info.checkpoint_id or (SDK_SCOPE.get() or {}).get("parentCheckpoint"),"attempt":info.node_attempt,"graphPath":(SDK_SCOPE.get() or {}).get("graphPath",[]),"parentTaskId":(SDK_SCOPE.get() or {}).get("parentTaskId")} if info else None
            token=SDK_EXECUTION.set(identity)
            message_token=SDK_MESSAGES.set(state.get("eduflow_provider_messages",{}))
            try:
                result=await execute(node_lookup[node_id],values)
            finally:
                SDK_EXECUTION.reset(token)
                SDK_MESSAGES.reset(message_token)
            # Replacement-only callbacks may return a full candidate. A reducer
            # needs its raw update; inferring a delta from a full list/message
            # value is ambiguous and can silently apply the initial value twice.
            patch=result.patch if isinstance(result,NodeResult) else {key:value for key,value in result["values"].items() if key not in values or value!=values[key]}
            if not isinstance(result,NodeResult) and any(definition["state"]["reducers"].get(field,{"name":"replace"})["name"]!="replace" for field in patch):
                raise ExecutionError("AMBIGUOUS_REDUCER_UPDATE","Reducer callbacks must provide an explicit raw update","validation",effect="none")
            update=encode_patch(definition,node_lookup[node_id],patch)
            if getattr(result,"provider_messages",None) is not None: update["eduflow_provider_messages"]=result.provider_messages
            if node_id in routes: update[routes[node_id]]=result["outlet"]
            return update
        graph.add_node(sdk_names[node.node_id],call)
    graph.add_edge(START,sdk_names[plan.entry_node_id])
    for node in plan.nodes:
        if node.node_type=="core.end": graph.add_edge(sdk_names[node.node_id],END)
        elif node.node_type=="core.router":
            def route(state, channel=routes[node.node_id]): return state[channel]
            graph.add_conditional_edges(sdk_names[node.node_id],route,{outlet:sdk_names[target] for outlet,target in node.outgoing})
        else: graph.add_edge(sdk_names[node.node_id],sdk_names[node.outgoing[0][1]])
    return graph.compile(checkpointer=checkpointer)
