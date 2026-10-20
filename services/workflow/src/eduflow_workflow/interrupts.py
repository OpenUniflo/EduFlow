"""Node-local SDK interrupts; JSON Schema validation remains a server boundary."""
from .contracts import ExecutionError, validate_value, schema_check, canonical

class RunPaused(Exception):
    def __init__(self, interrupts, wait_ms):
        self.interrupts, self.wait_ms = interrupts, wait_ms


def interaction_check(definition,node):
    settings=node['config'].get('authoring',{})
    if not isinstance(settings,dict) or set(settings)-{'interrupt','command','defer','retry','timeoutMs','cache','errorHandler','overwrite'}:
        raise ExecutionError('UNSUPPORTED_CAPABILITY','Unknown node runtime setting')
    if 'interrupt' not in settings: return
    spec=settings['interrupt']
    if not isinstance(spec,dict) or set(spec)!={'title','schema','resumeWrites'} or not isinstance(spec['title'],str) or not spec['title'].strip() or len(spec['title'])>300:
        raise ExecutionError('INVALID_INTERRUPT','Interrupt requires a title, response schema and State mapping')
    schema_check(spec['schema'])
    if spec['schema'].get('type')!='object': raise ExecutionError('INVALID_INTERRUPT','Response must be an object')
    if not isinstance(spec['resumeWrites'],dict): raise ExecutionError('INVALID_INTERRUPT','State mapping must be an object')
    targets=list(spec['resumeWrites'].values())
    if len(set(targets))!=len(targets): raise ExecutionError('INVALID_INTERRUPT','Response fields cannot target the same State field')
    for source,target in spec['resumeWrites'].items():
        if source not in spec['schema'].get('properties',{}) or target not in definition['state']['schema'].get('properties',{}):
            raise ExecutionError('INVALID_INTERRUPT','Response mapping references an undeclared field')


def response_patch_for(definition,node,response):
    spec=node['config']['authoring']['interrupt']
    validate_value(spec['schema'],response,'INVALID_INTERRUPT_RESPONSE')
    def nonblank(value,schema):
        if isinstance(value,str) and schema.get('minLength',0)>0 and not value.strip():
            raise ExecutionError('INVALID_INTERRUPT_RESPONSE','Required text cannot contain only whitespace')
        if isinstance(value,dict):
            for key,item in value.items(): nonblank(item,schema.get('properties',{}).get(key,{}))
        if isinstance(value,list):
            for item in value: nonblank(item,schema.get('items',{}))
    nonblank(response,spec['schema'])
    return {target:response[source] for source,target in spec['resumeWrites'].items() if source in response}


def validate_resume(definition,thread,responses,env):
    from .credentials import assert_no_secrets
    from .contracts import apply_patch
    if not isinstance(responses,dict): raise ExecutionError('INVALID_INTERRUPT_RESPONSE','Responses must be keyed by interrupt identity')
    pending=thread.get('interrupts',[])
    if (pending and not responses) or not set(responses)<={item['id'] for item in pending}: raise ExecutionError('INTERRUPT_ID_CONFLICT','Respond only to current interrupt identities')
    if any(item.get('breakpoint') for item in pending) and set(responses)!={item['id'] for item in pending}: raise ExecutionError('STATIC_BREAKPOINT_BATCH_REQUIRED','Static debug continuation is graph-wide; respond to all current waits together')
    state=thread['state']
    for item in pending:
        if item['id'] not in responses: continue
        if item.get('breakpoint'):
            if responses[item['id']]!={}: raise ExecutionError('INVALID_INTERRUPT_RESPONSE','Breakpoint continuation takes an empty object')
            continue
        scoped=definition
        for node_id in item.get('graphPath',[]):
            parent=next((n for n in scoped['nodes'] if n['id']==node_id and n['type']=='core.subgraph'),None)
            if not parent: raise ExecutionError('INTERRUPT_ID_CONFLICT','Invalid frozen graph path')
            scoped=parent['config']['graph']
        node=next((n for n in scoped['nodes'] if n['id']==item['nodeId']),None)
        if not node or not node['config'].get('authoring',{}).get('interrupt'): raise ExecutionError('INTERRUPT_ID_CONFLICT','Interrupt no longer matches its frozen node')
        patch=response_patch_for(scoped,node,responses[item['id']])
        for field,value in patch.items(): validate_value(scoped['state']['schema']['properties'][field],value,'INVALID_INTERRUPT_RESPONSE')
        if not item.get('graphPath'): state=apply_patch(state,patch,definition)
        if len(canonical(patch))>definition['policy']['maxStateBytes']: raise ExecutionError('STATE_TOO_LARGE','Response patch exceeds State budget','policy')
    assert_no_secrets(responses,env)
    if len(canonical(responses))>definition['policy']['maxInputBytes']: raise ExecutionError('INPUT_TOO_LARGE','Responses exceed budget','policy')
    if len(canonical(state))>definition['policy']['maxStateBytes']: raise ExecutionError('STATE_TOO_LARGE','Response State exceeds budget','policy')
    return True
