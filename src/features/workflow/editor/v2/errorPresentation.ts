import type { WorkflowExecutionError } from "../../domain/v2/types";

export type ErrorActionHint = "model-settings" | "tool-settings" | "node" | "field" | "fix-field-type" | "run";
export type ErrorAction = { label: string; hint: ErrorActionHint };

export type PresentedExecutionError = {
  /** User-facing card title, e.g. 模型请求失败. */
  title: string;
  /** One plain Chinese sentence, never a raw provider exception. */
  message: string;
  /** Keep the original code only inside the collapsed technical details. */
  code: string;
  technical: string;
  actions: ErrorAction[];
  retryable: boolean;
  savedAtLabel?: string;
};

const REASON_FALLBACK = "请求没有完成，请检查配置后重试。";

const CODE_TITLES: Record<string, string> = {
  MODEL_REQUEST_FAILED: "模型请求失败", MODEL_ADAPTER_FAILED: "模型请求失败", MODEL_FORBIDDEN: "模型未授权", SECRET_REVOKED: "模型请求失败",
  MODEL_TIMEOUT: "模型回复超时", MODEL_STREAM_INTERRUPTED: "模型输出中断", MODEL_OUTPUT_TRUNCATED: "模型回答未完成", NODE_TIMEOUT: "节点执行超时",
  TOOL_REQUEST_FAILED: "工具请求失败", HTTP_TOOL_FAILED: "工具请求失败", TOOL_FAILED: "工具请求失败", TOOL_TIMEOUT: "工具请求超时",
  BINDING_MISSING: "数据字段缺失", INVALID_STATE_UPDATE: "写入数据不符合要求", INVALID_NODE_OUTPUT: "写入数据不符合要求", INVALID_NODE_INPUT: "节点输入不符合要求",
  WAIT_EXPIRED: "等待回应已到期", WORKER_LOST: "执行服务中断", RUN_CANCELLED: "运行已取消",
};

/** Title for contexts that only persisted the error code. */
export function executionErrorTitle(code: string | undefined): string {
  return (code && CODE_TITLES[code]) || "运行未完成";
}

function providerName(error: WorkflowExecutionError): string {
  return error.provider?.trim() || (error.tool ? "外部工具" : "模型服务");
}

function targetHost(error: WorkflowExecutionError): string {
  return error.host?.trim() || "服务地址";
}

function status(error: WorkflowExecutionError): number | undefined {
  const value = error.httpStatus ?? error.externalStatus;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function waitedSeconds(error: Pick<WorkflowExecutionError, "elapsedMs" | "timeoutMs">): number | undefined {
  const value = error.elapsedMs ?? error.timeoutMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value / 1000)) : undefined;
}

/** Maps the Worker's safe reason vocabulary to one sentence. Unknown values stay generic. */
export function executionErrorReason(error: Pick<WorkflowExecutionError, "code" | "reason" | "httpStatus" | "externalStatus" | "provider" | "model" | "host" | "tool" | "elapsedMs" | "timeoutMs">): string {
  const code = error.reason ?? "";
  const name = error.provider?.trim() || (error.tool ? "外部工具" : "模型服务");
  const host = error.host?.trim() || "服务地址";
  const http = error.httpStatus ?? error.externalStatus;
  const waited = waitedSeconds(error);
  if (code === "timeout") {
    // A model generation budget is not a connection failure. Keep the model and
    // elapsed time visible so the user can shorten the answer or retry.
    if (error.code === "NODE_TIMEOUT") return `节点执行超时${waited ? `（已等待 ${waited} 秒）` : ""}。请缩短处理时间，或在节点“高级”中调高节点超时。`;
    if (error.code === "MODEL_TIMEOUT" || error.model) {
      return `模型${error.model ? `「${error.model}」` : ""}回复超时${waited ? `（已等待 ${waited} 秒）` : ""}。可以缩短回答要求或稍后重试。`;
    }
    if (error.tool) return `工具「${error.tool}」响应超时${waited ? `（已等待 ${waited} 秒）` : ""}。请稍后重试，或检查工具服务。`;
    return `无法连接 ${host}：连接超时，请稍后重试。`;
  }
  if (code === "stream_interrupted") return `模型${error.model ? `「${error.model}」` : ""}输出中断${waited ? `（已等待 ${waited} 秒）` : ""}。请稍后重试；若反复出现，可缩短回答要求。`;
  if (code === "output_truncated") return "模型回答达到长度上限，内容没有完整返回。可以缩短回答要求，或在节点设置中提高输出上限。";
  if (code === "auth_failed") return http ? `${name} 返回 ${http}：API Key 无效或已过期。` : `${name} 的凭据无效或已过期，请检查连接设置。`;
  if (code === "connection_refused") return `无法连接 ${host}：连接被拒绝，请检查网络或供应商地址。`;
  if (code === "rate_limited") return `${name} 返回 ${http ?? 429}：请求过于频繁，请稍后再试。`;
  if (code === "model_not_found") return error.model ? `${name} 找不到模型「${error.model}」。请在模型设置中检查模型名称。` : `${name} 找不到所选模型，请在模型设置中检查。`;
  if (code === "bad_request") return `${name} 返回 ${http ?? 400}：请求参数不被接受，请检查模型参数。`;
  if (code === "provider_error") return http ? `${name} 暂时不可用，请稍后重试。` : `${name} 暂时不可用。请检查模型设置、凭据和网络后重试。`;
  return REASON_FALLBACK;
}

function baseTitle(error: WorkflowExecutionError): { title: string; actions: ErrorAction[] } {
  if (["MODEL_TIMEOUT", "MODEL_STREAM_INTERRUPTED", "MODEL_OUTPUT_TRUNCATED"].includes(error.code)) return { title: CODE_TITLES[error.code], actions: [{ label: "检查模型设置", hint: "model-settings" }, { label: "重新运行", hint: "run" }] };
  if (error.code === "NODE_TIMEOUT") return { title: "节点执行超时", actions: [{ label: "定位出错节点", hint: "node" }, { label: "重新运行", hint: "run" }] };
  if (error.code === "BINDING_MISSING") return { title: "数据字段缺失", actions: [{ label: "定位出错节点", hint: "node" }] };
  if (error.code === "INVALID_STATE_UPDATE" && error.actualType && error.field) return { title: "写入的数据类型不符", actions: [{ label: `把字段改为${error.actualLabel ?? "新类型"}`, hint: "fix-field-type" }, { label: "定位字段", hint: "field" }] };
  if (error.code === "INVALID_STATE_UPDATE" || error.code === "INVALID_NODE_OUTPUT") return { title: "写入数据不符合要求", actions: [{ label: "定位出错字段", hint: "field" }] };
  if (error.code === "INVALID_NODE_INPUT") return { title: "节点输入不符合要求", actions: [{ label: "定位出错字段", hint: "field" }] };
  if (error.code.startsWith("TOOL") || error.code.startsWith("HTTP_TOOL") || error.code.startsWith("MCP_TOOL")) {
    return { title: "工具请求失败", actions: [{ label: "检查工具设置", hint: "tool-settings" }, { label: "重新运行", hint: "run" }] };
  }
  if (error.code.startsWith("MODEL") || error.code === "SECRET_REVOKED" || error.category === "provider" || error.category === "auth" || error.category === "rate_limit") {
    return { title: "模型请求失败", actions: [{ label: "检查模型设置", hint: "model-settings" }, { label: "重新运行", hint: "run" }] };
  }
  return { title: "运行失败", actions: [{ label: "定位出错节点", hint: "node" }, { label: "重新运行", hint: "run" }] };
}

function readableMessage(message: string | undefined): string | undefined {
  // Worker error messages are internal English prose. Only a genuinely Chinese
  // message may reach the card; everything else uses the bounded fallback.
  const text = message?.trim();
  return text && /[\u3400-\u9fff]/.test(text) ? text : undefined;
}

function reasonForBinding(error: WorkflowExecutionError): string {
  if (error.code === "BINDING_MISSING") return "节点需要的数据字段不存在，请检查参数来源，或确认上游节点已经写入。";
  if (error.code === "INVALID_STATE_UPDATE" || error.code === "INVALID_NODE_OUTPUT") return "节点写入的值与字段类型不符，请检查输出字段与类型。";
  if (error.code === "INVALID_NODE_INPUT") return "节点输入不符合要求，请检查参数来源、字段类型和必填项。";
  return readableMessage(error.message) ?? REASON_FALLBACK;
}

function writeMismatchMessage(error: WorkflowExecutionError): string | undefined {
  if (error.code !== "INVALID_STATE_UPDATE" || !error.field || !error.actualLabel) return undefined;
  return `${error.field} 字段是${error.expectedLabel ?? "其他类型"}，但${error.valueSource ?? "节点"}返回的是${error.actualLabel}`;
}

export function presentExecutionError(error: WorkflowExecutionError | undefined, options: { savedAt?: string } = {}): PresentedExecutionError | undefined {
  if (!error) return undefined;
  const base = baseTitle(error);
  const modelFailure = ["MODEL_REQUEST_FAILED", "MODEL_ADAPTER_FAILED", "MODEL_FORBIDDEN", "MODEL_TIMEOUT", "MODEL_STREAM_INTERRUPTED", "MODEL_OUTPUT_TRUNCATED"].includes(error.code);
  const toolFailure = error.code.startsWith("TOOL") || error.code.startsWith("HTTP_TOOL") || error.code.startsWith("MCP_TOOL");
  const message = writeMismatchMessage(error)
    ?? (error.reason ? executionErrorReason(error)
    : modelFailure ? "模型服务暂时不可用，请检查模型设置与网络连接。"
    : toolFailure ? "工具服务暂时不可用，请检查工具设置与网络连接。"
    : reasonForBinding(error));
  const savedAt = options.savedAt ? new Date(options.savedAt) : undefined;
  const time = savedAt && Number.isFinite(savedAt.getTime()) ? savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  return {
    title: base.title,
    message,
    code: error.code,
    technical: [error.code, error.httpStatus ?? error.externalStatus, error.elapsedMs === undefined ? undefined : `elapsedMs=${error.elapsedMs}`, error.message].filter(value => value !== undefined && value !== "").join(" · "),
    actions: base.actions,
    retryable: Boolean(error.retryable),
    ...(time ? { savedAtLabel: `本次运行使用的是 ${time} 保存的版本` } : {}),
  };
}

/** Request-level failures (node test, preflight, submission) never expose raw HTTP status. */
export function presentRequestFailure(code: string | undefined, status?: number): string {
  const byCode: Record<string, string> = {
    NODE_TEST_INVALID: "节点配置没有通过校验。请检查处理参数、读取项和写入目标后重试。",
    NODE_TEST_REQUIRES_RUN: "此节点需要在实际运行中等待回应。请运行整个流程后在节点上继续。",
    EXTERNAL_EFFECT_CONFIRMATION_REQUIRED: "此工具可能修改外部数据。请先勾选允许本次测试后重试。",
    INVALID_TEST_STATE: "测试数据不完整或类型不符。请展开“流程数据测试值”补全后再测试。",
    INVALID_RUN_INPUT: "启动输入不完整或类型不符。请补全必填字段后重试。",
    BINDING_MISSING: "节点读取的字段不存在。请检查参数来源，或确认上游节点已写入。",
    INVALID_NODE_INPUT: "节点读取到的值不符合要求。请检查字段类型和消息结构。",
    MODEL_ADAPTER_FAILED: "模型连接没有准备好。请检查模型设置、凭据和网络后重试。",
    MODEL_REQUEST_FAILED: "模型服务暂时不可用。请检查模型设置和网络后重试。",
    MODEL_FORBIDDEN: "当前模型未获授权。请在模型设置中重新选择连接。",
    TOOL_REQUEST_FAILED: "工具服务暂时不可用。请检查工具设置和网络后重试。",
    TOOL_TIMEOUT: "工具响应超时。请稍后重试，或检查工具服务。",
    WORKFLOW_SERVICE_UNAVAILABLE: "执行服务暂时不可用。请确认本地工作流服务已启动后重试。",
    GRAPH_INVALID: "流程配置或输入没有通过校验。请修正问题列表后重试。",
    REVISION_CONFLICT: "工作流已在别处更新。请先处理保存冲突，再测试。",
    SECRET_IN_RUN_INPUT: "输入中包含密钥。请改用资源中心的连接。",
  };
  if (code && byCode[code]) return byCode[code];
  if (status === 401) return "登录状态已失效。请重新登录后再试。";
  if (status === 403) return "当前账号没有执行此操作的权限。请检查资源授权。";
  if (status === 409) return "内容已变化。请刷新后重新检查配置。";
  if (status === 429) return "请求过于频繁。请稍候重试。";
  if (status && status >= 500) return "执行服务暂时不可用。请稍后重试。";
  return "请求没有完成。请检查配置与网络后重试。";
}

