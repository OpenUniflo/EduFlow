"""Pure prompt rendering rules shared by core.llm validation and execution."""
import json
import re
from .contracts import ExecutionError

PARAM_NAME = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')
RESERVED_PARAM = 'history'

def js_value(value):
    """Integral floats become integers so the worker preview matches JSON.stringify."""
    if isinstance(value, float) and value.is_integer() and abs(value) <= 9007199254740991: return int(value)
    if isinstance(value, dict): return {key: js_value(item) for key, item in value.items()}
    if isinstance(value, list): return [js_value(item) for item in value]
    return value

def json_text(value):
    return json.dumps(js_value(value), ensure_ascii=False, separators=(',', ':'))

def render_param_value(value, format='text'):
    """text: strings stay raw, numbers/booleans become JS-style text, objects fall back to JSON."""
    if format == 'json': return json_text(value)
    if isinstance(value, str): return value
    if isinstance(value, bool): return 'true' if value else 'false'
    if value is None: return 'null'
    if isinstance(value, (int, float)): return json_text(value)
    return json_text(value)

def render_segments(segments, params):
    pieces = []
    for segment in segments:
        kind = segment.get('type') if isinstance(segment, dict) else None
        if kind == 'text':
            text = segment.get('text')
            if not isinstance(text, str): raise ExecutionError('INVALID_PROMPT_SEGMENT', 'Text segments require text')
            pieces.append(text)
        elif kind == 'param':
            name = segment.get('name')
            if not isinstance(name, str) or name not in params: raise ExecutionError('PROMPT_PARAM_UNDECLARED', 'Prompt references an undeclared parameter', pointer='/config/prompt')
            pieces.append(render_param_value(params[name], segment.get('format', 'text')))
        else: raise ExecutionError('INVALID_PROMPT_SEGMENT', 'Unsupported prompt segment')
    return ''.join(pieces)

def render_prompt(prompt, params):
    """Return (system_text, [{role, content}]) with segments already rendered."""
    system = render_segments(prompt.get('system') or [], params)
    messages = [{'role': message['role'], 'content': render_segments(message.get('content') or [], params)} for message in prompt.get('messages') or []]
    return system, messages

def prompt_param_positions(prompt):
    """Definition-relative pointers of every param segment, in document order."""
    positions = []
    for index, segment in enumerate(prompt.get('system') or []):
        if isinstance(segment, dict) and segment.get('type') == 'param': positions.append((segment.get('name'), '/config/prompt/system/' + str(index)))
    for message_index, message in enumerate(prompt.get('messages') or []):
        content = message.get('content') if isinstance(message, dict) else None
        for index, segment in enumerate(content or []):
            if isinstance(segment, dict) and segment.get('type') == 'param': positions.append((segment.get('name'), '/config/prompt/messages/' + str(message_index) + '/content/' + str(index)))
    return positions

def estimate_prompt_bytes(prompt, inputs):
    """Lower bound of the rendered prompt size from literal bindings and onMissing defaults."""
    total = 0
    groups = [prompt.get('system') or []] + [(message.get('content') if isinstance(message, dict) else None) or [] for message in prompt.get('messages') or []]
    for segments in groups:
        for segment in segments:
            if not isinstance(segment, dict): continue
            if segment.get('type') == 'text':
                total += len(str(segment.get('text', '')).encode('utf-8'))
            elif segment.get('type') == 'param':
                binding = inputs.get(segment.get('name'))
                known = isinstance(binding, dict)
                if known and binding.get('source') == 'literal': value = binding.get('value')
                elif known and isinstance(binding.get('onMissing'), dict) and binding['onMissing'].get('mode') == 'default': value = binding['onMissing'].get('value')
                else: known = False
                if known: total += len(render_param_value(value, segment.get('format', 'text')).encode('utf-8'))
    return total
