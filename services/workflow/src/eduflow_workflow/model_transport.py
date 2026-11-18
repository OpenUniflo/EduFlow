"""Shared request configuration for managed model connections and Workflow runs."""
import json
import re

from langchain_deepseek import ChatDeepSeek
from langchain_openai import ChatOpenAI

from .contracts import ExecutionError, digest, validate_value
from .tools import model_http_client, secret

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
JSON_RESPONSE_FORMAT = {"type": "json_object"}
LOCAL_MODEL_KEY_PLACEHOLDER = "local-fixture-no-credential"
HEADER_NAME = re.compile(r"[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}", re.ASCII)
RESERVED_HEADERS = {
    "authorization", "connection", "content-encoding", "content-length", "content-type",
    "cookie", "expect", "forwarded", "host", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "set-cookie", "te", "trailer", "transfer-encoding", "upgrade", "x-api-key", "api-key",
    "x-http-method-override",
}


def normalize_header_name(value):
    if not isinstance(value, str) or not HEADER_NAME.fullmatch(value):
        raise ExecutionError("INVALID_CONNECTION", "Provide a valid model Header name")
    name = value.lower()
    if name in RESERVED_HEADERS or name.startswith(("proxy-", "x-forwarded-", "x-stainless-")):
        raise ExecutionError("INVALID_CONNECTION", "This Header is managed by the client or the credential field")
    return name


def normalize_model_headers(content):
    headers = content.get("headers", {})
    if not isinstance(headers, dict) or len(headers) > 20:
        raise ExecutionError("INVALID_CONNECTION", "Configure at most 20 fixed model Headers")
    normalized = {}
    for key, value in headers.items():
        name = normalize_header_name(key)
        if name in normalized:
            raise ExecutionError("INVALID_CONNECTION", "Model Header names must be unique")
        if not isinstance(value, str) or not re.fullmatch(r"[\x20-\x7e]{1,1000}", value) or value != value.strip():
            raise ExecutionError("INVALID_CONNECTION", "Provide a 1–1000 character ASCII model Header value")
        normalized[name] = value
    session = content.get("sessionAffinityHeader")
    if session is not None:
        session = normalize_header_name(session)
        if session in normalized or session in ("accept", "accept-encoding", "user-agent"):
            raise ExecutionError("INVALID_CONNECTION", "Use a separate Header name for the model session")
    return {**({"headers": normalized} if normalized else {}),
            **({"sessionAffinityHeader": session} if session else {})}


def model_request_headers(provider, session_key):
    # Platform registry entries historically allow a partial mapping. Ignore
    # legacy malformed values while applying the same protected-name rules.
    fixed = provider.get("headers")
    headers = {}
    if isinstance(fixed, dict):
        for name, value in fixed.items():
            if not isinstance(value, str):
                continue
            headers.update(normalize_model_headers({"headers": {name: value}})["headers"])
    session = provider.get("sessionAffinityHeader")
    if session:
        session = normalize_model_headers({"headers": headers, "sessionAffinityHeader": session})["sessionAffinityHeader"]
        headers[session] = digest(["model-session", provider.get("ref"), session_key])
    return headers


def model_output_limit(parameters):
    if not isinstance(parameters, dict) or "maxOutputTokens" not in parameters:
        return None
    limit = parameters["maxOutputTokens"]
    if type(limit) is not int or not 1 <= limit <= 2**53-1:
        raise ExecutionError("UNSUPPORTED_MODEL_PARAMETER", "Max output tokens must be a positive safe integer")
    return limit


def create_model_client(provider, model, env, session_key, max_tokens, timeout, *, parameters=None, credential=None, http_client=None):
    adapter = provider.get("adapter", "deepseek")
    options = dict(parameters or {})
    thinking = options.pop("thinking", None)
    if thinking is not None and adapter != "deepseek":
        raise ExecutionError("UNSUPPORTED_MODEL_PARAMETER", "Thinking is only available on DeepSeek connections")
    if adapter not in ("openai", "deepseek"):
        raise ExecutionError("MODEL_ADAPTER_FAILED", "Unsupported model adapter", "infrastructure", effect="none")
    base_url = provider.get("baseUrl") or (DEEPSEEK_BASE_URL if adapter == "deepseek" else "")
    api_key = credential if credential else secret(provider["secretRef"]) if provider.get("secretRef") else LOCAL_MODEL_KEY_PLACEHOLDER
    headers = model_request_headers(provider, session_key)
    # Match the SDK's spelling so its dictionary merge replaces these defaults.
    for header in ("Accept", "User-Agent"):
        if header.lower() in headers:
            headers[header] = headers.pop(header.lower())
    kwargs = {
        "model": model, "api_key": api_key, "timeout": timeout,
        **({"max_tokens": max_tokens} if max_tokens is not None else {}),
        "max_retries": 0, "http_async_client": http_client if http_client is not None else model_http_client(base_url, env),
        **({"default_headers": headers} if headers else {}), **options,
    }
    if adapter == "deepseek":
        if thinking is not None:
            kwargs["extra_body"] = {"thinking": thinking}
        return ChatDeepSeek(api_base=base_url, **kwargs)
    return ChatOpenAI(base_url=base_url, **kwargs)


_STRUCTURED_FIELD_TYPES = {
    "string": ({"type":"string"},"文本"),
    "number": ({"type":"number"},"数字"),
    "boolean": ({"type":"boolean"},"是否"),
    "array": ({"type":"array"},"列表"),
    "object": ({"type":"object"},"对象"),
}

def structured_instruction(fields):
    lines = ["请只返回一个 JSON 对象，不要 Markdown 代码块，不要额外说明。JSON 字段如下："]
    for field in fields:
        label = _STRUCTURED_FIELD_TYPES[field["type"]][1]
        description = field.get("description") or ""
        lines.append(f"- {field['name']}（{label}）{('：' + description) if description else ''}")
    return "\n".join(lines)

def parse_structured_output(text, fields):
    raw = (text or "").strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"): lines = lines[1:]
        if lines and lines[-1].strip() == "```": lines = lines[:-1]
        raw = "\n".join(lines).strip()
    try: parsed = json.loads(raw)
    except (TypeError, ValueError): raise ExecutionError("INVALID_MODEL_OUTPUT", "模型返回的内容不符合输出字段要求", "validation", effect="none") from None
    if not isinstance(parsed, dict): raise ExecutionError("INVALID_MODEL_OUTPUT", "模型返回的内容不符合输出字段要求", "validation", effect="none")
    values = {}
    for field in fields:
        name = field["name"]
        if name not in parsed:
            raise ExecutionError("INVALID_MODEL_OUTPUT", f"模型返回的内容不符合输出字段要求：缺少字段「{name}」", "validation", effect="none", pointer="/"+name)
        schema, label = _STRUCTURED_FIELD_TYPES[field["type"]]
        try: validate_value(schema, parsed[name], "INVALID_MODEL_OUTPUT")
        except ExecutionError:
            raise ExecutionError("INVALID_MODEL_OUTPUT", f"模型返回的内容不符合输出字段要求：字段「{name}」应为{label}", "validation", effect="none", pointer="/"+name) from None
        values[name] = parsed[name]
    return values
