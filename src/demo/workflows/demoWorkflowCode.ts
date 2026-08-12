import type { CodeFile, WorkflowDefinition } from "@/features/workflow/domain/types";
import type { WorkflowCodeExporter } from "@/features/workflow/editor/WorkflowCodeExporter";
import { getGenericWorkflowExportFiles, getNodeExampleCode, getStateCode } from "@/features/workflow/editor/editorUtilities";

export const showcaseGraphCode = `from langgraph.graph import StateGraph, START, END

from state import State
from nodes.normalize_input import normalize_input
from nodes.classify_task import classify_task
from nodes.write_answer import write_answer
from nodes.call_search_api import call_search_api
from nodes.agent import agent_node
from nodes.tool import tool_node
from nodes.format_answer import format_answer
from routers.route_task import route_task
from routers.route_agent_loop import route_agent_loop


graph_builder = StateGraph(State)

graph_builder.add_node("normalize_input", normalize_input)
graph_builder.add_node("classify_task", classify_task)
graph_builder.add_node("write_answer", write_answer)
graph_builder.add_node("call_search_api", call_search_api)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tool", tool_node)
graph_builder.add_node("format_answer", format_answer)

graph_builder.add_edge(START, "normalize_input")
graph_builder.add_edge("normalize_input", "classify_task")

graph_builder.add_conditional_edges(
    "classify_task",
    route_task,
    {
        "search": "call_search_api",
        "writing": "write_answer",
        "agent": "agent",
        "end": END,
    }
)

graph_builder.add_edge("call_search_api", "format_answer")
graph_builder.add_edge("write_answer", "format_answer")

graph_builder.add_conditional_edges(
    "agent",
    route_agent_loop,
    {
        "continue": "tool",
        "end": "format_answer",
    }
)

graph_builder.add_edge("tool", "agent")
graph_builder.add_edge("format_answer", END)

graph = graph_builder.compile()`;

export const showcaseCodeFiles: CodeFile[] = [
  { path: "state.py", title: "State Schema", code: getStateCode() },
  { path: "nodes/normalize_input.py", title: "Normalize Input", code: `from state import State


${getNodeExampleCode({ id: "normalize_input", label: "Normalize Input", subtitle: "", kind: "function", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/classify_task.py", title: "Classify Task", code: `from state import State


${getNodeExampleCode({ id: "classify_task", label: "Classify Task", subtitle: "", kind: "function", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/write_answer.py", title: "Write Answer", code: `from state import State


${getNodeExampleCode({ id: "write_answer", label: "Write Answer", subtitle: "", kind: "llm", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/call_search_api.py", title: "HTTP API", code: `from state import State


${getNodeExampleCode({ id: "call_search_api", label: "HTTP API", subtitle: "", kind: "http", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/agent.py", title: "Agent", code: `from state import State


${getNodeExampleCode({ id: "agent", label: "Agent", subtitle: "", kind: "agent", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/tool.py", title: "Tool", code: `from state import State


${getNodeExampleCode({ id: "tool", label: "Tool", subtitle: "", kind: "tool", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "nodes/format_answer.py", title: "Format Answer", code: `from state import State


${getNodeExampleCode({ id: "format_answer", label: "Format Answer", subtitle: "", kind: "transform", x: 0, y: 0, reads: [], writes: [], logic: "" })}` },
  { path: "routers/route_task.py", title: "Task Router", code: `from typing import Literal
from state import State


def route_task(state: State) -> Literal["search", "writing", "agent", "end"]:
    return state["task_type"]` },
  { path: "routers/route_agent_loop.py", title: "Agent Loop", code: `from typing import Literal
from state import State


def route_agent_loop(state: State) -> Literal["continue", "end"]:
    if state["should_continue"]:
        return "continue"
    return "end"` },
  { path: "graph.py", title: "Workflow Graph", code: showcaseGraphCode },
  { path: "run.py", title: "Runner", code: `from graph import graph


result = graph.invoke({
    "user_input": "请用 agent 和工具帮我查找资料并生成回答"
})

print(result["final_answer"])` }
];

export class DemoWorkflowCodeExporter implements WorkflowCodeExporter {
  getFiles(definition: WorkflowDefinition) {
    return definition.id === "showcase" ? showcaseCodeFiles : getGenericWorkflowExportFiles(definition);
  }
}
