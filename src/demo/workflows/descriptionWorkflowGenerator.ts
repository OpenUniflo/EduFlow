export function inferDemoWorkflowTemplateId(description: string) {
  const text = description.toLowerCase();
  if (/langgraph|stategraph|完整|router.*loop|loop.*router|第三方/.test(text)) return "showcase";
  if (/agent|工具|tool|循环|搜索|调用/.test(text)) return "showcase";
  if (/条件|分支|router|路由|判断|选择/.test(text)) return "branch";
  if (/顺序|依次|多节点|串行|读取.*摘要|处理.*输出/.test(text)) return "sequence";
  return "minimal";
}
