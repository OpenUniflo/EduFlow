import { edge, node, systemNode } from "@/features/workflow/domain/graphOperations";
import type { Field, WorkflowDefinition } from "@/features/workflow/domain/types";

export const demoWorkflowSchemaFields: Field[] = [
  { name: "user_input", type: "string", defaultValue: "\"\"", note: "用户原始输入" },
  { name: "query", type: "string", defaultValue: "\"\"", note: "规范化查询" },
  { name: "task_type", type: "enum", defaultValue: "\"end\"", note: "Router 分支字段" },
  { name: "api_result", type: "object", defaultValue: "{}", note: "HTTP API 返回" },
  { name: "draft_answer", type: "string", defaultValue: "\"\"", note: "草稿回答" },
  { name: "final_answer", type: "string", defaultValue: "\"\"", note: "最终输出" },
  { name: "messages", type: "list", defaultValue: "[]", note: "Agent 消息历史" },
  { name: "should_continue", type: "boolean", defaultValue: "false", note: "Loop 判断字段" },
  { name: "tool_name", type: "string", defaultValue: "null", note: "待调用工具名" },
  { name: "tool_args", type: "object", defaultValue: "null", note: "工具参数" },
  { name: "tool_result", type: "string", defaultValue: "null", note: "工具返回结果" },
  { name: "iteration", type: "number", defaultValue: "0", note: "Agent 循环次数" }
];

const baseDemoWorkflowTemplates: WorkflowDefinition[] = [
  {
    id: "support-ticket-showcase",
    name: "客服工单处理闭环",
    description: "模拟售后客服工单：清洗输入、读取附件、查询客户资料、按问题类型分流，并通过 Agent + Tool 循环生成可归档回复。",
    nodes: [
      systemNode("start", "START", 20, 300),
      {
        ...node("clean_ticket", "清洗工单", "Function Node", "function", 170, 300, ["user_input"], ["query", "messages", "iteration"], "提取用户诉求、订单线索和联系方式，初始化消息历史与循环次数。"),
        code: `def clean_ticket(state: State):
    text = state["user_input"].strip()
    return {
        "query": text,
        "messages": [{"role": "user", "content": text}],
        "iteration": 0
    }`
      },
      {
        ...node("read_attachment", "读取附件", "File / Cloud Drive Node", "file", 350, 170, ["query"], ["draft_answer"], "读取用户上传的截图、发票或日志摘要，作为后续判断的上下文。"),
        code: `def read_attachment(state: State):
    return {
        "draft_answer": "附件摘要：包含订单号、付款截图和用户描述的问题现象。"
    }`
      },
      {
        ...node("query_customer", "查询客户资料", "Database Node", "database", 350, 430, ["query"], ["api_result"], "根据工单线索查询客户等级、订单状态、历史售后记录。"),
        code: `def query_customer(state: State):
    return {
        "api_result": {
            "customer_tier": "gold",
            "order_status": "paid",
            "last_ticket": "none"
        }
    }`
      },
      {
        ...node("classify_ticket", "分类工单", "Function Node", "function", 540, 300, ["query", "draft_answer", "api_result"], ["task_type"], "根据用户诉求与客户资料判断 refund / technical / account / human_review。"),
        code: `def classify_ticket(state: State):
    text = state["query"]
    if "退款" in text or "退货" in text:
        task_type = "refund"
    elif "登录" in text or "账号" in text:
        task_type = "account"
    elif "报错" in text or "无法使用" in text:
        task_type = "technical"
    else:
        task_type = "human_review"
    return {"task_type": task_type}`
      },
      node("ticket_router", "工单路由", "Router Node", "router", 735, 300, ["task_type"], [], "读取 task_type，将工单分发到退款、技术、账号或人工复核路径。", { branches: ["refund", "technical", "account", "human_review"] }),
      {
        ...node("search_policy", "检索知识库", "HTTP API Node", "http", 960, 135, ["query", "task_type"], ["api_result", "draft_answer"], "调用知识库检索售后政策、处理话术和故障排查步骤。"),
        code: `def search_policy(state: State):
    return {
        "api_result": {"policy": "符合条件可优先补偿或退款"},
        "draft_answer": "知识库建议：先核验订单，再给出可执行处理方案。"
    }`
      },
      {
        ...node("draft_reply", "生成回复草稿", "LLM Node", "llm", 960, 300, ["query", "api_result", "draft_answer"], ["draft_answer"], "结合客户资料、附件摘要和知识库结果生成客服回复草稿。"),
        code: `def draft_reply(state: State):
    return {
        "draft_answer": "您好，我们已核验订单和问题描述，将按售后政策为您处理。"
    }`
      },
      {
        ...node("support_agent", "客服 Agent", "Agent Node", "agent", 1170, 300, ["messages", "query", "draft_answer", "tool_result", "iteration"], ["messages", "should_continue", "tool_name", "tool_args", "iteration", "draft_answer"], "判断是否还需要查询订单、物流或优惠券状态；拿到工具结果后决定是否结束。"),
        code: `def support_agent(state: State):
    iteration = state.get("iteration", 0)
    should_continue = iteration < 1
    return {
        "messages": state["messages"] + [{"role": "assistant", "content": "需要补充订单状态。" if should_continue else "信息已完整，可以回复。"}],
        "should_continue": should_continue,
        "tool_name": "order_status" if should_continue else None,
        "tool_args": {"query": state["query"]} if should_continue else None,
        "iteration": iteration + 1,
        "draft_answer": state.get("draft_answer", "")
    }`
      },
      node("agent_loop", "复核循环", "Loop Node", "loop", 1390, 300, ["should_continue"], [], "根据 should_continue 控制 Agent 是否继续调用工具。", { branches: ["continue", "end"] }),
      {
        ...node("order_tool", "订单工具", "Tool Node", "tool", 1390, 515, ["tool_name", "tool_args", "messages"], ["tool_result", "messages"], "调用内部订单、物流或优惠券工具，并把结果写回消息历史。"),
        code: `def order_tool(state: State):
    result = "订单状态：已付款，物流未发出，可走优先退款。"
    return {
        "tool_result": result,
        "messages": state["messages"] + [{"role": "tool", "content": result}]
    }`
      },
      {
        ...node("format_reply", "格式化回复", "State Transform Node", "transform", 1610, 300, ["draft_answer", "tool_result", "task_type"], ["final_answer"], "将草稿、工具结果和工单分类整理成可发送的标准客服回复。"),
        code: `def format_reply(state: State):
    return {
        "final_answer": f"处理类型：{state['task_type']}。回复：{state['draft_answer']} {state.get('tool_result') or ''}"
    }`
      },
      {
        ...node("archive_ticket", "归档工单", "Output Node", "output", 1810, 300, ["final_answer"], ["messages"], "记录最终回复、处理类型和客服操作结果，完成工单闭环。"),
        code: `def archive_ticket(state: State):
    return {
        "messages": state["messages"] + [{"role": "system", "content": state["final_answer"]}]
    }`
      },
      systemNode("end", "END", 2000, 300)
    ],
    edges: [
      edge("e-support-start-clean", "start", "clean_ticket", "next"),
      edge("e-support-clean-file", "clean_ticket", "read_attachment", "next"),
      edge("e-support-file-db", "read_attachment", "query_customer", "next"),
      edge("e-support-db-classify", "query_customer", "classify_ticket", "next"),
      edge("e-support-classify-router", "classify_ticket", "ticket_router", "next"),
      edge("e-support-router-refund", "ticket_router", "search_policy", "refund"),
      edge("e-support-router-technical", "ticket_router", "search_policy", "technical"),
      edge("e-support-router-account", "ticket_router", "support_agent", "account"),
      edge("e-support-router-human", "ticket_router", "format_reply", "human_review"),
      edge("e-support-policy-draft", "search_policy", "draft_reply", "next"),
      edge("e-support-draft-agent", "draft_reply", "support_agent", "next"),
      edge("e-support-agent-loop", "support_agent", "agent_loop", "next"),
      edge("e-support-loop-tool", "agent_loop", "order_tool", "continue"),
      edge("e-support-tool-agent", "order_tool", "support_agent", "next"),
      edge("e-support-loop-format", "agent_loop", "format_reply", "end"),
      edge("e-support-format-output", "format_reply", "archive_ticket", "next"),
      edge("e-support-output-end", "archive_ticket", "end", "next")
    ],
    runOrder: [
      "start",
      "e-support-start-clean",
      "clean_ticket",
      "e-support-clean-file",
      "read_attachment",
      "e-support-file-db",
      "query_customer",
      "e-support-db-classify",
      "classify_ticket",
      "e-support-classify-router",
      "ticket_router",
      "e-support-router-refund",
      "search_policy",
      "e-support-policy-draft",
      "draft_reply",
      "e-support-draft-agent",
      "support_agent",
      "e-support-agent-loop",
      "agent_loop",
      "e-support-loop-tool",
      "order_tool",
      "e-support-tool-agent",
      "support_agent",
      "e-support-agent-loop",
      "agent_loop",
      "e-support-loop-format",
      "format_reply",
      "e-support-format-output",
      "archive_ticket",
      "e-support-output-end",
      "end"
    ],
    result: "final_answer: 处理类型：refund。您好，我们已核验订单和售后政策，可为该订单优先发起退款，并已记录工单处理结果。",
    code: "查看全部代码会展示客服工单处理的分文件 LangGraph 原型代码。"
  },
  {
    id: "showcase",
    name: "知序 LangGraph 示例",
    description: "节点承载逻辑，边只做连接；Router 和 Loop 节点汇总条件编译逻辑。",
    nodes: [
      systemNode("start", "START", 20, 250),
      node("normalize_input", "Normalize Input", "Function Node", "function", 160, 250, ["user_input"], ["query", "messages", "iteration"], "清理 user_input，初始化 messages 和 iteration。"),
      node("classify_task", "Classify Task", "Function Node", "function", 355, 250, ["user_input"], ["task_type"], "根据用户输入判断 search / writing / agent / end。"),
      node("task_router", "Task Router", "Router Node", "router", 560, 250, ["task_type"], [], "读取 task_type，将分支映射到后续节点。", { branches: ["search", "writing", "agent", "end"] }),
      node("call_search_api", "HTTP API Node", "HTTP API Node", "http", 790, 60, ["query"], ["api_result", "draft_answer"], "通过环境变量配置第三方搜索 API。"),
      node("write_answer", "LLM Node", "LLM Node", "llm", 790, 200, ["query"], ["draft_answer"], "调用大模型生成教学回答草稿。"),
      node("agent", "Agent Node", "Agent Node", "agent", 790, 360, ["messages", "query", "tool_result", "iteration"], ["messages", "should_continue", "tool_name", "tool_args", "iteration", "draft_answer"], "判断是否继续调用工具。"),
      node("agent_loop", "Agent Loop", "Loop Node", "loop", 1010, 360, ["should_continue"], [], "读取 should_continue，决定继续调用工具或退出。", { branches: ["continue", "end"] }),
      node("tool", "Tool Node", "Tool Node", "tool", 1010, 520, ["tool_name", "tool_args", "messages"], ["tool_result", "messages"], "根据 tool_name 调用内部工具。"),
      node("format_answer", "Format Answer", "State Transform Node", "transform", 1190, 200, ["draft_answer"], ["final_answer"], "将 draft_answer 格式化为 final_answer。"),
      systemNode("end", "END", 1400, 250)
    ],
    edges: [
      edge("e-start-normalize", "start", "normalize_input", "next"),
      edge("e-normalize-classify", "normalize_input", "classify_task", "next"),
      edge("e-classify-router", "classify_task", "task_router", "next"),
      edge("e-router-search", "task_router", "call_search_api", "search"),
      edge("e-router-writing", "task_router", "write_answer", "writing"),
      edge("e-router-agent", "task_router", "agent", "agent"),
      edge("e-router-end", "task_router", "end", "end"),
      edge("e-api-format", "call_search_api", "format_answer", "next"),
      edge("e-llm-format", "write_answer", "format_answer", "next"),
      edge("e-agent-loop", "agent", "agent_loop", "next"),
      edge("e-loop-continue", "agent_loop", "tool", "continue"),
      edge("e-tool-agent", "tool", "agent", "next"),
      edge("e-loop-end", "agent_loop", "format_answer", "end"),
      edge("e-format-end", "format_answer", "end", "next")
    ],
    runOrder: [
      "start",
      "e-start-normalize",
      "normalize_input",
      "e-normalize-classify",
      "classify_task",
      "e-classify-router",
      "task_router",
      "e-router-agent",
      "agent",
      "e-agent-loop",
      "agent_loop",
      "e-loop-continue",
      "tool",
      "e-tool-agent",
      "agent",
      "e-agent-loop",
      "agent_loop",
      "e-loop-end",
      "format_answer",
      "e-format-end",
      "end"
    ],
    result: "final_answer: 最终回答：Agent 已调用工具并完成回答。",
    code: "查看全部代码会展示分文件 LangGraph 原型代码。"
  },
  {
    id: "minimal",
    name: "最小工作流",
    description: "START 进入一个处理节点，写入 final_answer 后到 END。",
    nodes: [
      systemNode("start", "START", 50, 210),
      node("process", "Function Node", "Function Node", "function", 250, 180, ["user_input"], ["final_answer"], "读取 user_input，生成教学演示结果。"),
      systemNode("end", "END", 500, 210)
    ],
    edges: [
      edge("e1", "start", "process", "next"),
      edge("e2", "process", "end", "next")
    ],
    runOrder: ["start", "e1", "process", "e2", "end"],
    result: "final_answer: 已根据 user_input 生成一个可解释的处理结果。",
    code: `class State(TypedDict):
    user_input: str
    final_answer: str

def process_node(state: State):
    return {"final_answer": "处理完成"}

graph = StateGraph(State)
graph.add_node("process_node", process_node)
graph.add_edge(START, "process_node")
graph.add_edge("process_node", END)`
  },
  {
    id: "sequence",
    name: "顺序工作流",
    description: "多个节点依次读取并更新共享 State。",
    nodes: [
      systemNode("start", "START", 40, 210),
      node("input", "Normalize Input", "Function Node", "function", 160, 95, ["user_input"], ["messages"], "接收测试输入并写入消息历史。"),
      node("read", "File Node", "File / Cloud Drive Node", "file", 345, 95, ["user_input"], ["tool_result"], "模拟读取文件内容。"),
      node("summary", "Summary Node", "LLM Node", "llm", 345, 305, ["tool_result"], ["final_answer"], "读取文件内容并生成摘要。"),
      node("output", "Output Node", "基础节点 / 输出", "output", 510, 210, ["final_answer"], ["messages"], "整理最终输出并追加消息。"),
      systemNode("end", "END", 720, 210)
    ],
    edges: [
      edge("e1", "start", "input", "next"),
      edge("e2", "input", "read", "next"),
      edge("e3", "read", "summary", "next"),
      edge("e4", "summary", "output", "next"),
      edge("e5", "output", "end", "next")
    ],
    runOrder: ["start", "e1", "input", "e2", "read", "e3", "summary", "e4", "output", "e5", "end"],
    result: "final_answer: 这份文件已经被读取、摘要并整理为教学输出。",
    code: `graph.add_node("input_node", input_node)
graph.add_node("read_file_node", read_file_node)
graph.add_node("summary_node", summary_node)
graph.add_node("output_node", output_node)

graph.add_edge(START, "input_node")
graph.add_edge("input_node", "read_file_node")
graph.add_edge("read_file_node", "summary_node")
graph.add_edge("summary_node", "output_node")
graph.add_edge("output_node", END)`
  },
  {
    id: "branch",
    name: "条件分支",
    description: "Function 写入 task_type，Router 节点决定后续路径。",
    nodes: [
      systemNode("start", "START", 40, 220),
      node("classify_task", "Classify Task", "Function Node", "function", 170, 190, ["user_input"], ["task_type"], "判断用户意图并写入 task_type。"),
      node("router", "Task Router", "Router Node", "router", 360, 190, ["task_type"], [], "读取 task_type 并映射分支。", { branches: ["writing", "search"] }),
      node("summary", "Summary Node", "LLM Node", "llm", 560, 90, ["user_input", "task_type"], ["draft_answer"], "当 task_type 为 writing 时执行。"),
      node("search", "HTTP API Node", "HTTP API Node", "http", 560, 305, ["query", "task_type"], ["draft_answer"], "当 task_type 为 search 时执行。"),
      node("merge", "Format Answer", "State Transform Node", "transform", 760, 190, ["draft_answer"], ["final_answer"], "合并分支输出。"),
      systemNode("end", "END", 720, 220)
    ],
    edges: [
      edge("e1", "start", "classify_task", "next"),
      edge("e2", "classify_task", "router", "next"),
      edge("e3", "router", "summary", "writing"),
      edge("e4", "router", "search", "search"),
      edge("e5", "summary", "merge", "next"),
      edge("e6", "search", "merge", "next"),
      edge("e7", "merge", "end", "next")
    ],
    runOrder: ["start", "e1", "router", "e2", "summary", "e4", "merge", "e6", "end"],
    result: "final_answer: Router 判定为 summary，流程进入 Summary Node 并完成输出。",
    code: `def router(state: State):
    if "总结" in state["user_input"]:
        return "summary"
    if "改写" in state["user_input"]:
        return "rewrite"
    return "fallback"

graph.add_conditional_edges(
    "router_node",
    router,
    {"summary": "summary_node", "rewrite": "rewrite_node"}
)`
  },
  {
    id: "agent",
    name: "Agent 工具调用",
    description: "Agent 根据 should_continue 决定调用 Tool 或结束。",
    nodes: [
      systemNode("start", "START", 40, 220),
      node("agent", "Agent Node", "Agent 节点 / Agent", "agent", 190, 185, ["user_input", "messages", "tool_result"], ["messages", "should_continue", "tool_name", "tool_args", "final_answer"], "判断是否需要工具，最多循环 5 次。"),
      node("tool", "Search Tool", "Agent 节点 / Tool", "tool", 405, 310, ["tool_call"], ["tool_result", "messages"], "根据 tool_call.query 模拟搜索并写回 tool_result。"),
      node("observe", "Agent Loop", "Loop Node", "loop", 405, 95, ["should_continue"], [], "根据 should_continue 控制循环。", { branches: ["continue", "end"] }),
      systemNode("end", "END", 700, 220)
    ],
    edges: [
      edge("e1", "start", "agent", "next"),
      edge("e2", "agent", "observe", "next"),
      edge("e3", "observe", "tool", "continue"),
      edge("e4", "tool", "agent", "next"),
      edge("e5", "observe", "end", "end")
    ],
    runOrder: ["start", "e1", "agent", "e2", "tool", "e3", "observe", "e4", "agent", "e5", "end"],
    result: "final_answer: Agent 已调用 Search Tool，吸收 Observation 后满足停止条件并结束。",
    code: `graph.add_node("agent", agent_node)
graph.add_node("search_tool", search_tool)
graph.add_node("observation", observation_node)

graph.add_conditional_edges(
    "agent",
    route_agent,
    {"need_tool": "search_tool", "done": END}
)
graph.add_edge("search_tool", "observation")
graph.add_edge("observation", "agent")`
  },
  {
    id: "lesson-04-direct",
    name: "Direct · 政策简报基线",
    description: "一次生成三所高校的生成式 AI 政策比较简报，用作速度、成本、覆盖度和引用可靠性的基线。",
    nodes: [
      systemNode("start", "START", 60, 240),
      node("brief_input", "研究任务", "Input Node", "function", 220, 205, ["user_input"], ["query"], "接收政策比较任务和 800-1200 字输出约束。"),
      node("direct_writer", "Direct Writer", "LLM Node", "llm", 470, 205, ["query"], ["final_answer"], "不调用外部工具，直接使用模型已有知识生成简报。"),
      node("constraint_check", "约束检查", "Function Node", "function", 720, 205, ["final_answer"], ["draft_answer"], "检查三所高校、风险和三条建议是否出现。"),
      systemNode("end", "END", 960, 240)
    ],
    edges: [
      edge("e-direct-1", "start", "brief_input"),
      edge("e-direct-2", "brief_input", "direct_writer"),
      edge("e-direct-3", "direct_writer", "constraint_check"),
      edge("e-direct-4", "constraint_check", "end")
    ],
    runOrder: ["start", "e-direct-1", "brief_input", "e-direct-2", "direct_writer", "e-direct-3", "constraint_check", "e-direct-4", "end"],
    result: "final_answer: 已生成政策简报基线；覆盖三所高校与三条建议，但没有主动检索，引用可靠性需要人工核验。",
    code: `graph.add_node("direct_writer", direct_writer)
graph.add_node("constraint_check", constraint_check)
graph.add_edge(START, "direct_writer")
graph.add_edge("direct_writer", "constraint_check")
graph.add_edge("constraint_check", END)`
  },
  {
    id: "lesson-04-react",
    name: "ReAct · 搜索与观察循环",
    description: "边判断信息缺口、边调用官方来源搜索工具，并依据观察结果决定继续检索或结束。",
    nodes: [
      systemNode("start", "START", 40, 260),
      node("react_agent", "ReAct Agent", "Agent Node", "agent", 210, 220, ["user_input", "messages", "tool_result", "iteration"], ["messages", "tool_name", "tool_args", "should_continue", "iteration", "draft_answer"], "维护当前子目标，选择高校官方政策搜索或结束。"),
      node("react_route", "继续检索？", "Loop Node", "loop", 470, 220, ["should_continue"], [], "根据覆盖度、来源可信度和最大步数决定继续或结束。", { branches: ["continue", "end"] }),
      node("official_search", "官方来源搜索", "Tool Node", "tool", 500, 430, ["tool_name", "tool_args"], ["tool_result", "messages"], "限定高校官方域名搜索政策页面和教务处 PDF。"),
      node("source_validator", "来源验证", "Function Node", "function", 760, 430, ["tool_result"], ["api_result"], "检查来源域名、发布日期和政策主体。"),
      node("brief_formatter", "政策简报", "LLM Node", "llm", 760, 160, ["messages", "draft_answer", "api_result"], ["final_answer"], "在满足覆盖和引用条件后生成结构化简报。"),
      systemNode("end", "END", 1010, 220)
    ],
    edges: [
      edge("e-react-1", "start", "react_agent"),
      edge("e-react-2", "react_agent", "react_route"),
      edge("e-react-3", "react_route", "official_search", "continue"),
      edge("e-react-4", "official_search", "source_validator"),
      edge("e-react-5", "source_validator", "react_agent"),
      edge("e-react-6", "react_route", "brief_formatter", "end"),
      edge("e-react-7", "brief_formatter", "end")
    ],
    runOrder: ["start", "e-react-1", "react_agent", "e-react-2", "react_route", "e-react-3", "official_search", "e-react-4", "source_validator", "e-react-5", "react_agent", "e-react-2", "react_route", "e-react-6", "brief_formatter", "e-react-7", "end"],
    result: "final_answer: 已完成三所高校政策比较，保留四条官方来源，并记录一次低可信来源被拒绝的观察轨迹。",
    code: `graph.add_conditional_edges(
    "react_agent",
    route_action,
    {"search": "official_search", "done": "brief_formatter"}
)
graph.add_edge("official_search", "source_validator")
graph.add_edge("source_validator", "react_agent")`
  },
  {
    id: "lesson-04-plan",
    name: "Plan-and-Execute · 结构化研究计划",
    description: "先生成包含输入、输出和完成条件的计划，再逐项收集资料、抽取政策、比较差异并验证引用。",
    nodes: [
      systemNode("start", "START", 40, 250),
      node("planner", "Planner", "LLM Node", "llm", 200, 215, ["user_input"], ["messages", "draft_answer"], "把任务拆分为约束识别、资料收集、可信度验证、条款抽取、比较、写作和验收。"),
      node("plan_review", "计划检查", "Function Node", "function", 440, 215, ["draft_answer"], ["api_result"], "检查每一步是否具有输入、输出和完成条件。"),
      node("executor", "Executor", "Agent Node", "agent", 680, 215, ["messages", "api_result"], ["tool_name", "tool_args", "tool_result", "draft_answer"], "按计划逐项执行搜索、抽取和比较任务。"),
      node("completion_check", "Completion Check", "Function Node", "function", 920, 215, ["draft_answer", "tool_result"], ["final_answer"], "验证三校覆盖、四条引用、风险和三条建议。"),
      systemNode("end", "END", 1160, 250)
    ],
    edges: [
      edge("e-plan-1", "start", "planner"),
      edge("e-plan-2", "planner", "plan_review"),
      edge("e-plan-3", "plan_review", "executor"),
      edge("e-plan-4", "executor", "completion_check"),
      edge("e-plan-5", "completion_check", "end")
    ],
    runOrder: ["start", "e-plan-1", "planner", "e-plan-2", "plan_review", "e-plan-3", "executor", "e-plan-4", "completion_check", "e-plan-5", "end"],
    result: "final_answer: 结构化计划的六个步骤已逐项完成，三所高校、四条引用、风险和三条建议均通过检查。",
    code: `graph.add_edge(START, "planner")
graph.add_edge("planner", "plan_review")
graph.add_edge("plan_review", "executor")
graph.add_edge("executor", "completion_check")
graph.add_edge("completion_check", END)`
  },
  {
    id: "lesson-04-replan",
    name: "Replanning · 失败与目标变化",
    description: "当搜索超时、来源缺失或用户追加隐私要求时，保留已完成结果并只修改剩余计划。",
    nodes: [
      systemNode("start", "START", 40, 260),
      node("planner", "Planner", "LLM Node", "llm", 190, 220, ["user_input"], ["messages", "draft_answer"], "生成初始研究计划和验收标准。"),
      node("executor", "Executor", "Agent Node", "agent", 420, 220, ["messages", "draft_answer"], ["tool_result", "api_result", "should_continue"], "执行当前步骤并记录已完成产物。"),
      node("success_check", "步骤成功？", "Router Node", "router", 660, 220, ["tool_result", "should_continue"], [], "区分成功、失败和整体完成。", { branches: ["continue", "replan", "done"] }),
      node("replanner", "Replanner", "LLM Node", "llm", 660, 450, ["messages", "tool_result", "api_result"], ["draft_answer", "messages"], "保留有效结果，为超时、来源缺失或新增隐私要求修改剩余步骤。"),
      node("final_report", "最终简报", "Output Node", "output", 910, 160, ["draft_answer", "api_result"], ["final_answer"], "输出更新后的政策比较和建议。"),
      systemNode("end", "END", 1140, 220)
    ],
    edges: [
      edge("e-replan-1", "start", "planner"),
      edge("e-replan-2", "planner", "executor"),
      edge("e-replan-3", "executor", "success_check"),
      edge("e-replan-4", "success_check", "executor", "continue"),
      edge("e-replan-5", "success_check", "replanner", "replan"),
      edge("e-replan-6", "replanner", "executor"),
      edge("e-replan-7", "success_check", "final_report", "done"),
      edge("e-replan-8", "final_report", "end")
    ],
    runOrder: ["start", "e-replan-1", "planner", "e-replan-2", "executor", "e-replan-3", "success_check", "e-replan-5", "replanner", "e-replan-6", "executor", "e-replan-3", "success_check", "e-replan-7", "final_report", "e-replan-8", "end"],
    result: "final_answer: 已保留高校 A/B 的结果，为高校 C 使用替代来源，并把新增隐私要求写入剩余计划和最终验收。",
    code: `graph.add_conditional_edges(
    "success_check",
    route_result,
    {"continue": "executor", "replan": "replanner", "done": "final_report"}
)
graph.add_edge("replanner", "executor")`
  },
  {
    id: "lesson-04-evaluator",
    name: "Evaluator-Optimizer · 结构化质量控制",
    description: "用覆盖、引用、准确性、风险、字数和建议等结构化 Rubric 控制生成与返工。",
    nodes: [
      systemNode("start", "START", 40, 260),
      node("generator", "Generator", "LLM Node", "llm", 200, 220, ["user_input"], ["draft_answer"], "生成包含比较、风险和建议的政策简报初稿。"),
      node("evaluator", "Evaluator", "LLM Node", "llm", 440, 220, ["draft_answer"], ["api_result", "should_continue"], "使用结构化 Rubric 输出通过项、失败项和可执行修订建议。"),
      node("quality_route", "通过？", "Router Node", "router", 680, 220, ["api_result", "should_continue"], [], "通过则输出，否则进入优化器。", { branches: ["pass", "revise"] }),
      node("optimizer", "Optimizer", "LLM Node", "llm", 690, 430, ["draft_answer", "api_result"], ["draft_answer"], "根据失败项补齐高校覆盖、引用、隐私风险和可执行建议。"),
      node("final_output", "验收结果", "Output Node", "output", 920, 160, ["draft_answer", "api_result"], ["final_answer"], "输出最终简报和验收得分。"),
      systemNode("end", "END", 1160, 220)
    ],
    edges: [
      edge("e-eval-1", "start", "generator"),
      edge("e-eval-2", "generator", "evaluator"),
      edge("e-eval-3", "evaluator", "quality_route"),
      edge("e-eval-4", "quality_route", "optimizer", "revise"),
      edge("e-eval-5", "optimizer", "evaluator"),
      edge("e-eval-6", "quality_route", "final_output", "pass"),
      edge("e-eval-7", "final_output", "end")
    ],
    runOrder: ["start", "e-eval-1", "generator", "e-eval-2", "evaluator", "e-eval-3", "quality_route", "e-eval-4", "optimizer", "e-eval-5", "evaluator", "e-eval-3", "quality_route", "e-eval-6", "final_output", "e-eval-7", "end"],
    result: "final_answer: 第二轮已满足三校覆盖、四条引用、隐私与公平风险、三条建议和 800-1200 字约束。",
    code: `graph.add_conditional_edges(
    "quality_route",
    route_quality,
    {"pass": "final_output", "revise": "optimizer"}
)
graph.add_edge("optimizer", "evaluator")`
  }
];

function workflowVariant(sourceId: string, id: string, name: string): WorkflowDefinition {
  const source = baseDemoWorkflowTemplates.find((template) => template.id === sourceId)!;
  return {
    ...source,
    id,
    name,
    nodes: source.nodes.map((item) => ({ ...item, control: item.control ? { branches: [...item.control.branches] } : undefined })),
    edges: source.edges.map((item) => ({ ...item })),
    runOrder: [...source.runOrder]
  };
}

export const demoWorkflowTemplates: WorkflowDefinition[] = [
  ...baseDemoWorkflowTemplates,
  workflowVariant("minimal", "agent-core", "最小 Agent Core"),
  workflowVariant("agent", "tool-calling-layer", "Tool Calling Layer"),
  workflowVariant("sequence", "cited-rag", "带引用的 RAG Pipeline"),
  workflowVariant("agent", "agent-loop", "有界 Agent Loop"),
  workflowVariant("branch", "runtime-recovery", "Runtime Recovery & Audit"),
  workflowVariant("sequence", "orchestrator-worker", "Orchestrator–Worker"),
  workflowVariant("showcase", "agentic-workflow", "受治理 Agentic Workflow"),
  workflowVariant("showcase", "multi-agent-workflow", "Supervisor 多智能体协作"),
  workflowVariant("showcase", "agentic-ai-capstone", "Agentic AI 综合系统")
];
