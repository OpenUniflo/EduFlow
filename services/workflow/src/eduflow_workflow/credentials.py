"""Reject credential data before validation errors, State or Trace can capture it."""
import os
from .contracts import ExecutionError

def secret_values(environment):
    refs={provider["secretRef"] for provider in environment["providers"] if provider.get("secretRef")}
    refs.update(ref for tool in environment["tools"] for ref in tool.get("headerSecretRefs",{}).values())
    refs.update(ref for connector in environment["connectors"] for ref in connector.get("headerSecretRefs",{}).values())
    values=[os.environ[ref] for ref in refs if os.environ.get(ref)]
    from .tools import secret
    values.extend(secret(ref) for ref in refs if ref.startswith('vault:'))
    return values

def assert_no_secrets(value,environment):
    values=secret_values(environment)
    def inspect(item):
        if isinstance(item,str) and any(secret_value in item for secret_value in values):
            raise ExecutionError("SECRET_IN_EXECUTION_DATA","Credential value cannot enter Workflow execution data","policy",effect="unknown")
        if isinstance(item,dict):
            for key,nested in item.items():inspect(key);inspect(nested)
        elif isinstance(item,list):
            for nested in item:inspect(nested)
    inspect(value)
