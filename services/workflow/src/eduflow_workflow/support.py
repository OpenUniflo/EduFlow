"""Execution support, separate from SDK availability and authoring descriptors."""
from importlib.metadata import version

TARGET_LANGGRAPH_VERSION = "1.2.15"


def stategraph_support():
    # This describes this executor build. Environment authorization can only
    # restrict it; an environment label cannot implement an absent executor.
    return {
        "schemaVersion": 1,
        "sdk": {"package": "langgraph", "targetVersion": TARGET_LANGGRAPH_VERSION,
                "installedVersion": version("langgraph")},
        "implemented": ["serial", "conditional-single-target", "bounded-loop",
                        "json-state", "graph-input-output", "reducer-replace",
                        "reducer-append", "reducer-messages", "registered-transform",
                        "deepseek", "registered-tool", "serial-tool-batch",
                        "environment-bindings", "node-test", "run-events", "cancel", "checkpoint", "interrupt-resume", "crash-resume", "parallel", "join", "send", "command", "subgraph",
                        "conditional-multi-target", "conditional-entry", "multi-interrupt-resume",
                        "deferred-node", "static-breakpoint", "registered-function", "user-code", "isolated-python", "isolated-javascript",
                        "custom-reducer", "node-retry", "node-timeout", "node-cache", "node-error-handler", "runtime-context",
                        "node-overwrite", "message-remove", "predicate-function", "connection-management",
                        "thread-continuation", "replay-fork", "store", "model-token-stream", "state-update", "bulk-state-update"],
        "pending": [],
    }
