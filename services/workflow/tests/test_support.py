"""Public support must not confuse SDK installation with runtime support."""
from eduflow_workflow.server import capabilities
from eduflow_workflow.support import TARGET_LANGGRAPH_VERSION


async def test_capabilities_distinguish_implemented_from_sdk_only_features():
    result = await capabilities()
    support = result['stategraph']
    assert support['sdk']['installedVersion'] == TARGET_LANGGRAPH_VERSION
    assert not set(support['implemented']) & set(support['pending'])
    assert {'parallel', 'subgraph', 'send', 'command', 'join', 'static-breakpoint'} <= set(support['implemented'])
    assert {'serial', 'reducer-messages', 'registered-tool', 'checkpoint', 'interrupt-resume', 'crash-resume'} <= set(support['implemented'])
    assert result['dependencyManifest']['packages']['langgraph-checkpoint']
    # Returned containers must not allow a request to mutate the next response.
    support['implemented'].clear()
    assert {'store','model-token-stream','thread-continuation','replay-fork','state-update','bulk-state-update'} <= set((await capabilities())['stategraph']['implemented'])
