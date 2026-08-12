import { Bot, CircleDot, GitBranch, Hammer } from "lucide-react";
import type { Field } from "../domain/types";

export const schemaFields: Field[] = [
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

export const nodePalette = [
  { title: "基础节点", items: ["Function Node", "State Transform Node", "Output Node"], icon: CircleDot },
  { title: "智能节点", items: ["LLM Node", "Agent Node"], icon: Bot },
  { title: "工具 / 第三方系统", items: ["Tool Node", "HTTP API Node", "Database Node", "File / Cloud Drive Node"], icon: Hammer },
  { title: "控制节点", items: ["Router Node", "Loop Node"], icon: GitBranch }
];
