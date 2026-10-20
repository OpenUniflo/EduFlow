"""Language-independent V2 protocol validation and canonical identities."""
import copy
import hashlib
import math
from typing import Any
import jsonschema
import rfc8785

VERSION = "0.1.0"
from importlib.metadata import version as dependency_version
from pathlib import Path
DEPENDENCY_MANIFEST = {"serviceVersion": VERSION, "packages": {name: dependency_version(name) for name in ("langgraph", "langgraph-checkpoint", "langgraph-prebuilt", "langgraph-checkpoint-postgres", "langchain-deepseek", "langchain-core", "mcp", "jsonschema", "rfc8785", "psycopg", "httpx", "httpcore", "socksio", "openai", "langchain-openai", "vercel-sandbox", "vercel-oidc")}}
# Import-time identity tracks the actual loaded build, not future on-disk edits.
DEPENDENCY_MANIFEST["executorDigest"] = hashlib.sha256(b"".join((Path(__file__).parent/name).read_bytes() for name in ("contracts.py", "compiler.py", "runtime.py", "tools.py", "registry.py", "messages.py", "storage.py", "credentials.py", "telemetry.py", "support.py", "checkpoints.py", "interrupts.py", "graph_control.py", "execution_policies.py", "sandbox.py", "extensions.py", "cli.py", "session_memory_history.py", "operations.py", "cloud_sandbox.py", "cloud_launcher.py"))).hexdigest()
KEYWORDS = {"type", "properties", "required", "additionalProperties", "items", "enum", "const", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "$defs", "$ref", "title", "description", "default", "$schema"}
DEFAULT_POLICY = {"timeoutMs": 120000, "nodeTimeoutMs": 30000, "maxNodeExecutions": 50, "maxToolCalls": 10, "maxInputBytes": 65536, "maxStateBytes": 1048576, "maxEventBytes": 65536, "maxOutputTokens": 2048, "maxAttempts": 1}
HARD_LIMITS = {**DEFAULT_POLICY, "timeoutMs": 600000, "nodeTimeoutMs": 120000, "maxNodeExecutions": 200, "maxToolCalls": 50, "maxOutputTokens": 8192}

class ExecutionError(Exception):
    def __init__(self, code, message, category="validation", retryable=False, external_status=None, effect=None, pointer=None, node_id=None, invocation=None, stage=None):
        super().__init__(message)
        self.code, self.category, self.retryable = code, category, retryable
        self.external_status, self.effect = external_status, effect
        self.pointer = pointer
        self.node_id, self.invocation, self.stage = node_id, invocation, stage
    def dto(self):
        context = {"nodeId":self.node_id,"invocation":self.invocation,"stage":self.stage,"pointer":self.pointer} if self.stage=="input_resolution" else {}
        return {"code": self.code, "category": self.category, "message": str(self), "retryable": self.retryable, **({"externalStatus": self.external_status} if self.external_status is not None else {}), **({"effect": self.effect} if self.effect else {}), **context, **({"graphPath":self.graph_path} if hasattr(self,"graph_path") else {})}

def canonical(value):
    check_json(value)
    return rfc8785.dumps(value)

def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()

def check_json(value):
    if isinstance(value,str):
        try: value.encode("utf-8",errors="strict")
        except UnicodeEncodeError: raise ExecutionError("INVALID_JSON_STRING","Unpaired Unicode surrogate rejected") from None
    if isinstance(value, float) and (not math.isfinite(value) or abs(value) > 9007199254740991):
        raise ExecutionError("INVALID_JSON_NUMBER", "Number exceeds interoperable JSON range")
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 9007199254740991:
        raise ExecutionError("INVALID_JSON_NUMBER", "Integer exceeds interoperable JSON range")
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ExecutionError("INVALID_JSON", "Object keys must be strings")
            check_json(item)
    elif isinstance(value, list):
        for item in value: check_json(item)
    elif value is not None and not isinstance(value, (bool, str, int, float)):
        raise ExecutionError("INVALID_JSON", "Value must be JSON serializable")

def semantic_hash(definition):
    result = copy.deepcopy(definition)
    for key in ("workflowId", "revision", "name", "description", "provenance"):
        result.pop(key, None)
    result["nodes"] = sorted(result["nodes"], key=lambda n: n["id"].encode("utf-16-be"))
    for node in result["nodes"]: node.pop("label", None)
    result["transitions"] = sorted(result["transitions"], key=lambda e: e["id"].encode("utf-16-be"))
    result["requiredCapabilities"] = sorted(set(result["requiredCapabilities"]),key=lambda value:value.encode("utf-16-be"))
    return digest(result)

def schema_check(schema, root=None, stack=()):
    root = schema if root is None else root
    if isinstance(schema, bool): return
    if not isinstance(schema, dict): raise ExecutionError("INVALID_SCHEMA", "Schema must be an object or boolean")
    unknown = set(schema) - KEYWORDS
    # Extension annotations from MCP schema producers carry metadata, never new
    # validation semantics. Retain them in digests; the official validator ignores them.
    unknown = {key for key in unknown if not key.startswith('x-')}
    if unknown: raise ExecutionError("UNSUPPORTED_SCHEMA", "Unsupported Schema keywords: " + ", ".join(sorted(unknown)))
    ref = schema.get("$ref")
    if ref:
        if not ref.startswith("#/$defs/"): raise ExecutionError("UNSUPPORTED_SCHEMA", "Only local $defs references are supported")
        if ref in stack: raise ExecutionError("UNSUPPORTED_SCHEMA", "Recursive Schema is unsupported in M1")
        schema_check(pointer(root, ref[1:]), root, (*stack, ref))
    for value in schema.get("properties", {}).values(): schema_check(value, root, stack)
    for value in schema.get("$defs", {}).values(): schema_check(value, root, stack)
    for key in ("items", "additionalProperties"):
        if isinstance(schema.get(key), dict): schema_check(schema[key], root, stack)
    jsonschema.Draft202012Validator.check_schema(schema)

def validate_value(schema, value, code="SCHEMA_VALIDATION_FAILED"):
    check_json(value)
    errors = sorted(jsonschema.Draft202012Validator(schema).iter_errors(value), key=lambda e: str(e.path))
    if errors:
        error = errors[0]
        path = list(error.path)
        if error.validator == "required" and isinstance(error.instance, dict):
            missing = next((field for field in error.validator_value if field not in error.instance), None)
            if missing is not None: path.append(missing)
        location = "".join("/" + str(token).replace("~", "~0").replace("/", "~1") for token in path)
        # Validator messages can quote the failing business value. Keep the
        # mature validator's structured location/keyword without echoing data.
        raise ExecutionError(code, "Schema mismatch at " + (location or "/") + ": " + str(error.validator) + " constraint failed", pointer=location)

def pointer(document, path):
    if path == "": return document
    if not isinstance(path, str) or not path.startswith("/"): raise ExecutionError("INVALID_POINTER", "JSON Pointer must be empty or start with /")
    result = document
    for token in path[1:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        try:
            if isinstance(result, list):
                if not token.isdigit() or (len(token)>1 and token[0]=="0"): raise KeyError(token)
                result = result[int(token)]
            else: result = result[token]
        except (KeyError, IndexError, TypeError): raise ExecutionError("BINDING_MISSING", "Binding pointer does not exist: " + path, pointer=path) from None
    return result

def resolve(binding, run_input, state, environment=None):
    source = binding.get("source")
    if source == "literal": return copy.deepcopy(binding["value"])
    if source not in ("input", "state", "environment"): raise ExecutionError("INVALID_BINDING", "Unsupported binding source")
    try: return copy.deepcopy(pointer((environment or {}) if source == "environment" else run_input if source == "input" else state, binding["pointer"]))
    except ExecutionError as error:
        if error.code == "BINDING_MISSING" and binding.get("onMissing", {}).get("mode") == "default": return copy.deepcopy(binding["onMissing"]["value"])
        raise

def bind(fields, run_input, state, environment=None):
    return {key: resolve(value, run_input, state, environment) for key, value in fields.items()}

def predicate(spec, run_input, state):
    op = spec.get("op")
    if op=='function':
        if spec.get('functionVersion')!=1: raise ExecutionError('INVALID_PREDICATE_FUNCTION','Unknown predicate version')
        value=resolve(spec['value'],run_input,state)
        if spec['functionRef']=='edu.positive':
            if isinstance(value,bool) or not isinstance(value,(int,float)): raise ExecutionError('INVALID_PREDICATE','Positive predicate requires a number')
            return value>0
        if spec['functionRef']=='edu.truthy': return bool(value)
        raise ExecutionError('INVALID_PREDICATE_FUNCTION','Unknown predicate function')
    if op in ("and", "or"):
        children = spec.get("children", [])
        if not children: raise ExecutionError("INVALID_PREDICATE", "Predicate children cannot be empty")
        return (all if op == "and" else any)(predicate(child, run_input, state) for child in children)
    if op == "not": return not predicate(spec["child"], run_input, state)
    if op in ("exists", "nonEmpty"):
        try: value = pointer(run_input if spec["source"]=="input" else state, spec["pointer"])
        except ExecutionError as error:
            if error.code == "BINDING_MISSING": return False
            raise
        if op == "exists": return True
        if value is None: return False
        if not isinstance(value, (list, str)): raise ExecutionError("INVALID_PREDICATE", "nonEmpty requires array or string")
        return bool(value)
    left, right = resolve(spec["left"], run_input, state), resolve(spec["right"], run_input, state)
    if op in ("eq", "ne"):
        same_type = type(left) is type(right)
        if isinstance(left, (int,float)) and not isinstance(left,bool) and isinstance(right,(int,float)) and not isinstance(right,bool): same_type = True
        if not same_type: raise ExecutionError("INVALID_PREDICATE", "Equality predicates require matching JSON types")
        equivalent = left == right
        return equivalent if op == "eq" else not equivalent
    if op not in ("gt","gte","lt","lte") or any(isinstance(v,bool) or not isinstance(v,(int,float)) for v in (left,right)):
        raise ExecutionError("INVALID_PREDICATE", "Ordering predicates require numbers")
    return {"gt": left>right, "gte": left>=right, "lt": left<right, "lte": left<=right}[op]

# Pure reducer used both by StateGraph and precommit validation.
def reduce_field(left, right, reducer):
    if reducer == "replace": return right
    if reducer in ('edu.sum','edu.max'):
        if any(isinstance(v,bool) or not isinstance(v,(int,float)) for v in (left,right)): raise ExecutionError('INVALID_STATE_UPDATE','Numeric reducer requires numbers')
        return left+right if reducer=='edu.sum' else max(left,right)
    if reducer=='edu.unique':
        if not isinstance(left,list) or not isinstance(right,list): raise ExecutionError('INVALID_STATE_UPDATE','Unique reducer requires arrays')
        out=[]
        for value in left+right:
            if value not in out: out.append(value)
        return out
    if not isinstance(right,list) or not isinstance(left,list): raise ExecutionError("INVALID_STATE_UPDATE", "Array reducer requires arrays")
    if reducer == "append": return left + right
    if reducer == "messages":
        from langgraph.graph.message import add_messages
        from .messages import to_langchain, from_langchain
        return [from_langchain(m) for m in add_messages([to_langchain(m) for m in left], [to_langchain(m) for m in right])]
    raise ExecutionError("UNSUPPORTED_CAPABILITY", "Unknown reducer")

def apply_patch(state, patch, definition):
    result = copy.deepcopy(state)
    for field, value in patch.items():
        reducer = definition["state"]["reducers"].get(field, {"name":"replace"})["name"]
        result[field] = reduce_field(result.get(field, 0 if reducer in ("edu.sum","edu.max") else [] if reducer != "replace" else None), value, reducer)
    validate_value(definition["state"]["schema"], result, "INVALID_STATE_UPDATE")
    if len(canonical(result)) > definition["policy"]["maxStateBytes"]: raise ExecutionError("STATE_TOO_LARGE", "State exceeds size budget", "policy")
    return result
