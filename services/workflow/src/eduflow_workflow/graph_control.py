"""Thin canvas-to-StateGraph control flow adapter. Scheduling stays in the SDK."""
import copy
from typing import Any, Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.types import Send, Command
from .contracts import ExecutionError, predicate, pointer


def advanced_graph(d):
    return any(n['type'].startswith('control.') or n['type']=='core.subgraph' or
               set(n['config'].get('authoring',{}))-{'interrupt'} or
               n['config'].get('mode')=='all' for n in d['nodes']) or any(
        sum(e['from']==n['id'] and e['outlet']=='next' for e in d['transitions'])>1 for n in d['nodes']) or bool(set(d['policy'].get('authoring',{})) & {'interruptBefore','interruptAfter','entryRouter'})


def has_suspension(d):
    return any(n.get('config',{}).get('authoring',{}).get('interrupt') or n['type']=='core.subgraph' and has_suspension(n['config']['graph']) for n in d.get('nodes',[])) or any(d.get('policy',{}).get('authoring',{}).get(k) for k in ('interruptBefore','interruptAfter'))


def validate_control(d):
    nodes={n['id']:n for n in d['nodes']}
    for key in ('interruptBefore','interruptAfter'):
        values=d['policy'].get('authoring',{}).get(key,[])
        if not isinstance(values,list) or any(v not in nodes for v in values): raise ExecutionError('INVALID_BREAKPOINT','Breakpoints must reference graph nodes')
    entry=d['policy'].get('authoring',{}).get('entryRouter')
    if entry is not None and (entry not in nodes or nodes[entry]['type']!='core.router' or [(e['from'],e['to']) for e in d['transitions'] if e['from']==d['entryNodeId']]!=[(d['entryNodeId'],entry)]): raise ExecutionError('INVALID_ENTRY_ROUTE','Conditional entry requires start connected only to the selected router')
    for n in d['nodes']:
        c=n['config']; settings=c.get('authoring',{})
        if 'defer' in settings and not isinstance(settings['defer'],bool): raise ExecutionError('INVALID_POLICY','defer must be boolean')
        command=settings.get('command')
        if command:
            if not isinstance(command,dict) or set(command)-{'enabled','destinations','graph','update'} or not isinstance(command.get('enabled'),bool) or not isinstance(command.get('destinations'),list): raise ExecutionError('INVALID_COMMAND','Command configuration invalid')
            if command.get('graph','current') not in ('current','parent'): raise ExecutionError('INVALID_COMMAND','Unknown Command graph')
            if command.get('graph','current')=='current' and any(t not in nodes for t in command['destinations']): raise ExecutionError('INVALID_COMMAND','Unknown Command destination')
            if not isinstance(command.get('update',{}),dict): raise ExecutionError('INVALID_COMMAND','Command update must be field bindings')
            from .compiler import binding_check
            for field,binding in command.get('update',{}).items():
                if field not in d['state']['schema'].get('properties',{}): raise ExecutionError('INVALID_COMMAND','Unknown Command field')
                binding_check(binding,('input','state','literal'))
        if n['type']=='core.subgraph' and c.get('stateMode')=='shared' and any(cn['config'].get('authoring',{}).get('overwrite') for cn in c['graph']['nodes']):
            raise ExecutionError('INVALID_OVERWRITE_COMBINATION','Explicit overwrite is not supported in shared child State transfer')
        if n['type']=='control.join':
            incoming={e['from'] for e in d['transitions'] if e['to']==n['id']}
            if not c.get('waitFor') or set(c['waitFor'])!=incoming: raise ExecutionError('INVALID_JOIN','waitFor must equal connected predecessors; conditional alternatives require any strategy')
        if n['type']=='control.fork' and len(c.get('branches',[]))!=len(set(c.get('branches',[]))): raise ExecutionError('INVALID_FORK','Branch outlets must be unique')
        if n['type']=='control.send':
            if c.get('target') not in nodes or c.get('target')==n['id']: raise ExecutionError('INVALID_SEND','Send target must be another node')
            if nodes[c['target']]['type']=='core.subgraph' and nodes[c['target']]['config'].get('persistence')=='per-thread': raise ExecutionError('INVALID_SUBGRAPH_PERSISTENCE','Concurrent Send requires per-invocation subgraph persistence')
            if c.get('itemKey') not in d['state']['schema'].get('properties',{}): raise ExecutionError('INVALID_SEND','Declare the Send item field in State')
            if not isinstance(c.get('items'),str) or not c['items'].startswith('/'): raise ExecutionError('INVALID_SEND','Send list requires State JSON Pointer')
        if n['type']=='core.subgraph':
            child=c.get('graph',{})
            if c.get('persistence')=='stateless' and has_suspension(child): raise ExecutionError('INVALID_SUBGRAPH_PERSISTENCE','Stateless subgraphs cannot suspend; use per-invocation persistence')
            if len(str(child))>1500000: raise ExecutionError('DEFINITION_TOO_LARGE','Subgraph exceeds size budget')
            if c.get('stateMode','independent')=='shared':
                if child.get('state',{}).get('schema')!=d['state']['schema'] or child['state']['reducers']!=d['state']['reducers']: raise ExecutionError('INVALID_SUBGRAPH_STATE','Shared subgraph must declare the same State schema and reducers')
            for cn in child.get('nodes',[]):
                cmd=cn.get('config',{}).get('authoring',{}).get('command',{})
                if cmd.get('graph')=='parent' and any(t not in nodes for t in cmd.get('destinations',[])): raise ExecutionError('INVALID_COMMAND','Unknown parent destination')
                if cmd.get('enabled') and cmd.get('graph')=='parent' and (set(cn.get('writes',{}))|set(cmd.get('update',{})))-set(d['state']['schema'].get('properties',{})): raise ExecutionError('INVALID_COMMAND','Parent Command updates require fields declared in both child and parent State')


def _merge_maps(left,right): return {**(left or {}),**(right or {})}


def build_control_graph(definition, execute, compile_fingerprint, *, checkpointer=None):
    from .compiler import state_channels, encode_state, decode_state, _channel_reducer, NodeResult, encode_patch, SDK_EXECUTION, SDK_MESSAGES, SDK_SCOPE
    if not compile_fingerprint: raise ExecutionError('MISSING_COMPILE_FINGERPRINT','Validated compilation identity required')
    names={n['id']:'eduflow_node_'+str(i) for i,n in enumerate(sorted(definition['nodes'],key=lambda n:n['id']))}
    channels=state_channels(definition)
    annotations={ch:Any if definition['state']['reducers'].get(f,{'name':'replace'})['name']=='replace' else Annotated[Any,_channel_reducer(definition['state']['reducers'][f]['name'])] for f,ch in channels.items()}
    annotations['eduflow_provider_messages']=Annotated[dict,_merge_maps]
    annotations['eduflow_graph_input']=Any
    routes={n['id']:'eduflow_route_'+str(i) for i,n in enumerate(definition['nodes']) if n['type']=='core.router'}
    annotations.update({ch:list for ch in routes.values()})
    graph=StateGraph(TypedDict('WorkflowP3Channels',annotations,total=False))
    outgoing={n['id']:[e for e in definition['transitions'] if e['from']==n['id']] for n in definition['nodes']}
    for node in definition['nodes']:
        async def call(state,runtime:Runtime,node=node):
            values=decode_state(definition,state); info=runtime.execution_info
            scope=SDK_SCOPE.get(); path=scope.get('graphPath',[]) if scope else []
            identity={'taskId':info.task_id,'namespace':info.checkpoint_ns,'graphNamespace':info.checkpoint_ns.rsplit('|',1)[0] if '|' in info.checkpoint_ns else '', 'checkpointId':info.checkpoint_id or (SDK_SCOPE.get() or {}).get('parentCheckpoint'),'attempt':info.node_attempt,'graphPath':path,'parentTaskId':(scope or {}).get('parentTaskId')} if info else None
            token=SDK_EXECUTION.set(identity); mt=SDK_MESSAGES.set(state.get('eduflow_provider_messages',{}))
            try: result=await execute(node,values)
            finally: SDK_EXECUTION.reset(token); SDK_MESSAGES.reset(mt)
            patch=result.patch if isinstance(result,NodeResult) else {k:v for k,v in result['values'].items() if k not in values or v!=values[k]}
            if not isinstance(result,NodeResult) and any(definition['state']['reducers'].get(f,{'name':'replace'})['name']!='replace' for f in patch): raise ExecutionError('AMBIGUOUS_REDUCER_UPDATE','Reducer callbacks require raw updates')
            update=encode_patch(definition,node,patch)
            if getattr(result,'parent_command',None) is not None:
                return Command(update=update,goto=result.parent_command.goto)
            if getattr(result,'provider_messages',None) is not None: update['eduflow_provider_messages']=result.provider_messages
            if node['id'] in routes:
                value=result['outlet']; update[routes[node['id']]]=value if isinstance(value,list) else [value]
            cmd=node['config'].get('authoring',{}).get('command',{})
            if cmd.get('enabled'):
                parent=cmd.get('graph')=='parent'
                parent_def=scope.get('parentDefinition') if scope else None
                targets={n['id']:'eduflow_node_'+str(i) for i,n in enumerate(sorted(parent_def['nodes'],key=lambda n:n['id']))} if parent and parent_def else names
                if parent and not parent_def: raise ExecutionError('INVALID_COMMAND','Parent Command requires subgraph')
                if parent:
                    update=encode_state(parent_def,patch)
                return Command(update=update,goto=[targets[t] for t in cmd['destinations']],graph=Command.PARENT if parent else None)
            return update
        graph.add_node(names[node['id']],call,defer=node['config'].get('authoring',{}).get('defer',False))
    entry=definition['policy'].get('authoring',{}).get('entryRouter')
    if entry:
        router=next(n for n in definition['nodes'] if n['id']==entry)
        def enter(state):
            values=decode_state(definition,state)
            matches=[case['id'] for case in sorted(router['config']['cases'],key=lambda c:c['priority']) if predicate(case['predicate'],state.get('eduflow_graph_input',{}),values)]
            chosen=(matches if router['config'].get('mode')=='all' else matches[:1]) or [router['config']['defaultOutlet']]
            return list(dict.fromkeys(names[e['to']] for e in outgoing[entry] if e['outlet'] in chosen))
        graph.add_conditional_edges(START,enter)
    else: graph.add_edge(START,names[definition['entryNodeId']])
    for node in definition['nodes']:
        nid=node['id']; edges=outgoing[nid]
        if node['type']=='core.end': graph.add_edge(names[nid],END); continue
        if node['type']=='core.router':
            def route(state,ch=routes[nid],edges=edges): return list(dict.fromkeys(names[e['to']] for e in edges if e['outlet'] in state[ch]))
            graph.add_conditional_edges(names[nid],route); continue
        if node['type']=='control.send':
            def send(state,node=node,edges=edges):
                values=decode_state(definition,state); items=pointer(values,node['config']['items'])
                if not isinstance(items,list): raise ExecutionError('INVALID_SEND_INPUT','Send source must be a list')
                if len(items)>definition['policy']['maxNodeExecutions']: raise ExecutionError('NODE_BUDGET_EXCEEDED','Send task count exceeds graph budget','policy')
                target=node['config']['target']; key=node['config']['itemKey']
                return [Send(names[target],{**state,**encode_state(definition,{key:item})}) for item in items]+[names[e['to']] for e in edges]
            graph.add_conditional_edges(names[nid],send); continue
        for e in edges:
            target=next(n for n in definition['nodes'] if n['id']==e['to'])
            if target['type']=='control.join' and target['config'].get('strategy')=='all': continue
            graph.add_edge(names[nid],names[e['to']])
    for n in definition['nodes']:
        if n['type']=='control.join' and n['config'].get('strategy')=='all': graph.add_edge([names[t] for t in n['config']['waitFor']],names[n['id']])
    p=definition['policy'].get('authoring',{})
    return graph.compile(checkpointer=checkpointer,interrupt_before=[names[x] for x in p.get('interruptBefore',[])],interrupt_after=[names[x] for x in p.get('interruptAfter',[])])
