import { apiRequest as sharedApiRequest, ApiRequestError, ApiResponseError } from "@/shared/api/apiClient";
import { z } from "zod";
import type { WorkflowConfiguration, EditorDocumentV2, JsonValue, WorkflowCompileResult, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowEnvironment, WorkflowEventV2, WorkflowLaunchContext, WorkflowRunV2, WorkflowStepV2, WorkflowSummaryV2, WorkflowTool, WorkflowRevisionSummary, WorkflowLibraryQuery, WorkflowLibraryPage, WorkflowDeleteImpact, WorkflowThreadV2, WorkflowTemplateDetail, WorkflowTemplateSummary, ConnectionTestResult, ResourceReferenceRow, McpMarketPage, McpMarketSync, McpOAuthDiscovery, WorkflowEvaluation, WorkflowEvaluationConfig, WorkflowReferenceItem, WorkflowReferencedByResult } from "../../domain/v2/types";
import type { RunReferenceSnapshot } from "../../domain/v2/runReferences";

const endpoint = (resource: string, query: Record<string, string | number | undefined> = {}) => `/api/workflows?${new URLSearchParams({ resource, ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])) })}`;
const runSubmissionReceipt = z.object({
  runId: z.string().uuid(), revision: z.number().int().positive(),
  status: z.enum(["queued", "running", "waiting", "continued", "success", "failed", "cancelled", "expired"]),
  eventsCursor: z.number().int().nonnegative().optional(), historyExpired: z.boolean().optional(),
}).refine(receipt => (receipt.status === "expired") === (receipt.historyExpired === true));
export class WorkflowRequestError extends Error {
  constructor(readonly cause: unknown) {
    super("网络请求未完成，请检查连接与登录状态后重试。");
    this.name = "WorkflowRequestError";
  }
}
// Presentation only: keep the original status/code/details for submission certainty and diagnostics.
export function workflowErrorMessage(reason: unknown): string {
  if (!(reason instanceof ApiRequestError)) return reason instanceof Error ? reason.message : "操作未完成，请检查连接后重试。";
  const byCode: Record<string, string> = {
    MEMORY_VERSION_CONFLICT: "记忆已更新，请先读取最新版本再保存。",
    P5_OPERATION_FAILED: "此操作暂未完成，原历史保持不变，请刷新后检查。",
    CHECKPOINT_MISSING: "来源检查点已不存在，不能从初始状态代替重放。",
    ROUND_BUDGET_EXCEEDED: "此会话已达到20轮上限，请新建会话。",
    THREAD_EXPIRED: "此会话已超过保留期限，请新建会话。",
    IMMUTABLE_VERSION: "此版本已发布且不可修改，请使用新的版本号。",
    FUNCTION_UNAVAILABLE: "所选函数版本不存在或已停用，请重新选择。",
    SANDBOX_UNAVAILABLE: "当前隔离执行环境不可用，请检查固定镜像和运行服务。",
    THREAD_STATE_CONFLICT: "等待任务已更新，请刷新后查看剩余回应。已填写内容保留。",
    STATIC_BREAKPOINT_BATCH_REQUIRED: "调试断点按整图继续，请填写当前所有等待项后批量提交。",
    CONCURRENT_STATE_CONFLICT: "并行任务写入同一字段时发生冲突，请配置合适的 Reducer。",
    BINDING_MISSING: "读取的字段或环境变量不存在，请检查读取来源和字段位置。",
    INVALID_TEST_STATE: "测试 State 缺少字段或类型不符，请填写完整的测试 State。",
    INVALID_RUN_INPUT: "外部调用数据不符合要求，请检查必填字段与类型。",
    NODE_TEST_REQUIRES_RUN:"此节点会请求回应，请运行整个工作流进行测试。",
    NODE_TEST_INVALID: "节点配置未通过校验，请检查处理参数、读取项和写入目标。",
    EXTERNAL_EFFECT_CONFIRMATION_REQUIRED: "此工具可能修改外部数据，请先勾选允许本次工具测试。",
    INVALID_NODE_INPUT: "节点读取值不符合处理要求，请检查字段类型和消息结构。",
    INVALID_CONFIGURATION: "环境变量配置无效，请检查名称、类型与覆盖值。",
    REVISION_CONFLICT: "保存冲突：服务器修订已变化，本地草稿已保留。请查看服务器版本。",
    INVALID_EDITOR: "布局配置与节点不一致，请检查节点与连线后重试。",
    GRAPH_INVALID: "配置或输入校验未通过，请点击问题列表定位并修正。",
    SECRET_IN_DEFINITION: "工作流中不能保存密钥，请改用连接中的安全引用。",
    MCP_AUTH_REQUIRED: "MCP 授权已失效，请在资源中心重新连接或重新授权。",
    MCP_CONNECTION_FAILED: "MCP 服务不可达，请检查地址、网络或服务状态。",
    INVALID_CONNECTION: "连接配置无效，请检查地址、鉴权方式和允许工具。",
    CONNECTION_UNAVAILABLE: "连接已删除或版本不存在。请刷新资源，重新选择连接后再保存或运行。",
    CONNECTION_BUSY: "仍有未完成或等待回应的运行正在使用此连接。请先等待运行结束或取消运行，再删除。",
    INVALID_CONNECTION_REFERENCE: "工作流中的连接引用格式无效。请先打开原工作流，在节点中重新选择连接后再复制或保存。",
    ENVIRONMENT_REQUIRED: "保存前请选择运行环境，以便校验工作流引用的连接。",
    CONNECTION_IN_USE: "此连接仍被当前工作流引用，不能删除。请先替换或移除这些引用，再重试。",
    FUNCTION_IN_USE: "此函数仍被当前工作流引用，不能删除。请先替换或移除这些引用，再重试。",
    FUNCTION_BUSY: "仍有未完成或等待回应的运行正在使用此函数。请先等待运行结束或取消运行，再删除。",
    FUNCTION_VERSION_CONFLICT: "函数已被其他操作更新，请刷新确认后再试。",
    INVALID_SUBGRAPH_REFERENCE: "子图引用无效：请只保留内嵌子图或固定版本引用之一，并填写目标修订与运行环境。",
    WORKFLOW_REFERENCE_UNAVAILABLE: "固定版本引用的目标工作流或修订不存在，或当前账号无权访问。",
    WORKFLOW_REFERENCE_ARCHIVED: "目标工作流已归档，不能继续被引用。请选择可用修订或移除引用。",
    WORKFLOW_REFERENCE_MAPPING: "引用的输入或输出映射与目标修订的接口不兼容，请重新选择字段。",
    WORKFLOW_REFERENCE_CYCLE: "固定版本引用形成循环，无法保存。请调整引用链后再试。",
    WORKFLOW_REFERENCE_LIMIT: "固定版本引用层级或规模超过上限，请减少嵌套或拆分流程。",
    WORKFLOW_REFERENCE_ENVIRONMENT: "引用指定的目标运行环境当前不可用，请选择已授权环境。",
    WORKFLOW_REFERENCED: "此工作流仍被当前修订固定引用，不能归档或删除。请先更新引用它的工作流。",
    CONNECTION_VERSION_CONFLICT: "供应商已被其他操作更新，请刷新确认后再试。",
    CONNECTION_NOT_DISABLED: "此连接已恢复可用，无需再次恢复。",
    CONNECTION_DISABLED: "此连接已停用，请先恢复连接再修改名称或测试。",
    CATALOG_NOT_FOUND: "此连接已不存在，请刷新资源中心。",
    MCP_CONNECTION_DISABLED: "MCP 连接已断开，请重新连接后再运行。",
    MCP_OAUTH_STATE: "OAuth 授权已过期，请重新发起连接。",
    MCP_OAUTH_DENIED: "OAuth 授权未完成，请重试。",
    MCP_OAUTH_UNSUPPORTED: "该服务未公开可用的 OAuth 元数据，请改用 API Key 或 Bearer。",
    MCP_OAUTH_TOKEN: "OAuth 授权码换取令牌失败，请重新发起连接。",
    MCP_OAUTH_REGISTRATION_FAILED: "OAuth 客户端注册被服务方拒绝。",
    MCP_OAUTH_DISCOVERY_FAILED: "无法读取服务方的 OAuth 元数据。",
    INVALID_MCP_ENDPOINT: "MCP 服务地址不可用，必须使用公网 HTTPS 地址。",
    MCP_MARKET_ADMIN_REQUIRED: "只有管理员可以维护补充目录。",
    INVALID_MARKET_SERVER: "补充目录内容无效。",
    MCP_MARKET_UNAVAILABLE: "MCP 目录暂时不可用，请稍后重试。",
    SECRET_IN_RUN_INPUT: "外部调用数据中不能包含密钥，请改用连接中的安全引用。",
    INVALID_LAUNCH_CONTEXT: "当前动手任务与工作流不匹配，请从对应课程动手任务重新进入。",
    ASSIGNMENT_PREREQUISITE_REQUIRED: "此动手任务的前置要求尚未满足，请返回课程查看。",
    ASSIGNMENT_STATE_CONFLICT: "此动手任务已提交或完成，请返回课程查看已保存的结果。",
    IDEMPOTENCY_CONFLICT: "原提交与当前内容不一致，请先确认原提交状态。",
    INVALID_NAME: "名称应为 1 至 120 个字符。",
    INVALID_INTERRUPT_RESPONSE:"回应不符合节点要求，请检查必填字段与类型。",
    INTERRUPT_ID_CONFLICT:"回应与当前等待步骤不匹配，请刷新后重试。",
    WAIT_EXPIRED:"等待已到期，无法继续此执行。",
    COMPILE_FINGERPRINT_CHANGED:"执行器或授权已变化，无法安全恢复旧检查点。请重新运行已保存流程。",
    WORKFLOW_BUSY: "此工作流仍在排队或运行，请结束运行后再删除。",
    WORKFLOW_ARCHIVED: "此工作流已归档，不能启动新的运行。",
    SOURCE_CHANGED: "旧版本来源已变化，请重新预览迁移。",
  };
  const message = byCode[reason.code ?? ""] ?? (reason.status === 401 ? "登录状态已失效，请重新登录后继续。"
    : reason.status === 403 ? "当前账号没有此操作权限，请检查授权。"
    : reason.status === 404 ? "所需工作流或运行记录不存在，请返回列表检查。"
    : reason.status === 410 ? "此运行的调试历史已清理，不会因此重新执行。"
    : reason.status === 429 ? "当前运行数量或请求频率已达上限，请等待已有运行结束后重试。"
    : reason.status >= 500 ? "执行服务暂不可用，请稍后重试。"
    : reason.status === 408 ? "请求超时，请检查连接后重试。"
    : "请求未完成，请检查配置与问题列表后重试。");
  // User-facing text stays a Chinese reason plus next step; status and request identity
  // remain in ApiRequestError/details for diagnostics, never as a raw HTTP code.
  return message;
}
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try { return await sharedApiRequest<T>(path, init); }
  catch (reason) { if (reason instanceof ApiRequestError) throw reason; throw new WorkflowRequestError(reason); }
}
/** Normalizes the configuration contract: environments default to [] and the default id to null. */
function normalizeConfiguration(value: WorkflowConfiguration): WorkflowConfiguration {
  return {
    revision: value.revision,
    variables: value.variables ?? [],
    environments: value.environments ?? [],
    defaultEnvironmentId: value.defaultEnvironmentId ?? null,
  };
}
const jsonRequest = <T>(resource: string, method: string, body: unknown, query?: Record<string, string | number | undefined>) => apiRequest<T>(endpoint(resource, query), { method, body: JSON.stringify(body) });
export class WorkflowApiV2 {
  p5<T>(body:Record<string,unknown>) { return jsonRequest<T>("p5","POST",body); }
  async list() {
    const items: WorkflowSummaryV2[] = []; let cursor: string | undefined;
    do { const page = await apiRequest<{ items: WorkflowSummaryV2[]; nextCursor?: string }>(endpoint("definitions", { cursor, limit: 100 })); items.push(...page.items); cursor = page.nextCursor || undefined; } while (cursor);
    return { items };
  }
  listPage(query: WorkflowLibraryQuery) { return apiRequest<WorkflowLibraryPage>(endpoint("definitions",{op:"library",...query})); }
  deleteImpact(id: string) { return apiRequest<WorkflowDeleteImpact>(endpoint("definitions",{id,op:"delete-impact"})); }
  remove(id: string, baseRevision: number) { return jsonRequest<{ok:boolean}>("definitions","DELETE",{baseRevision},{id,op:"delete"}); }
  rename(id: string, baseRevision: number, name: string) { return jsonRequest<{workflowId:string;revision:number}>("definitions","PATCH",{baseRevision,name},{id,op:"rename"}); }
  templates(purpose?: "starter" | "course") { return apiRequest<{items: WorkflowTemplateSummary[]}>(endpoint("templates", { purpose })); }
  template(templateId: string, purpose?: "starter" | "course") { return apiRequest<WorkflowTemplateDetail>(endpoint("templates", { id: templateId, purpose })); }
  useTemplate(templateId: string, options: {name?:string;fresh?:boolean;creationId?:string;environmentRef?:string;bindings?:{nodeId:string;graphPath:string[];field:"providerRef"|"toolRef";reference:string;modelRef?:string;contractDigest?:string}[]} = {}) { return jsonRequest<{workflowId:string;revision:number}>("definitions","POST",{templateId,...options},{op:"template"}); }
  get(workflowId: string, revision?: number) { return apiRequest<WorkflowDocumentV2>(endpoint("definitions", { id: workflowId, revision })); }
  /** Outgoing fixed references of one source revision, including target name/current revision/availability. */
  references(workflowId: string, revision?: number) { return apiRequest<{ workflowId: string; revision: number; items: WorkflowReferenceItem[] }>(endpoint("definitions", { id: workflowId, op: "references", revision }), { cache: "no-store" }); }
  /** Incoming current-closure relationships. Historical index rows are not used by the Works detail. */
  referencedBy(workflowId: string, revision?: number) { return apiRequest<WorkflowReferencedByResult>(endpoint("definitions", { id: workflowId, op: "referenced-by", revision }), { cache: "no-store" }); }
  create(definition: WorkflowDefinitionV2, editor: EditorDocumentV2, creationId?: string, environmentRef?: string) { return jsonRequest<{ workflowId: string; revision: number; editorRevision: number }>("definitions", "POST", { definition, editor, ...(creationId ? {creationId} : {}), ...(environmentRef ? {environmentRef} : {}) }); }
  save(definition: WorkflowDefinitionV2, editor: EditorDocumentV2, baseRevision: number, baseEditorRevision: number, environmentRef: string) { return jsonRequest<{ workflowId: string; revision: number; editorRevision: number }>("definitions", "PUT", { definition, editor, baseRevision, baseEditorRevision, environmentRef }, { id: definition.workflowId }); }
  saveEditor(editor: EditorDocumentV2, baseEditorRevision: number) { return jsonRequest<{ editorRevision: number }>("editor", "PUT", { editor, baseEditorRevision }, { id: editor.workflowId }); }
  copy(workflowId: string, revision: number, name?: string, creationId?: string) { return jsonRequest<{ workflowId: string; revision: number }>("definitions", "POST", { sourceWorkflowId: workflowId, sourceRevision: revision, ...(name ? {name} : {}), ...(creationId ? {creationId} : {}) }, { op: "copy" }); }
  archive(workflowId: string, baseRevision: number) { return jsonRequest<{ ok: boolean }>("definitions", "DELETE", { baseRevision }, { id: workflowId }); }
  testNode(body: {workflowId:string;baseRevision:number;definition:WorkflowDefinitionV2;nodeId:string;input:JsonValue;state:JsonValue;environmentRef:string;confirmExternalEffect:boolean}) { return jsonRequest<{mode:string;input:JsonValue;output:JsonValue;writes:JsonValue;stateBefore:JsonValue;stateAfter:JsonValue}>("node-tests","POST",body); }
  mcpMarket(query:{q?:string;category?:string;page?:number;limit?:number} = {}) { return apiRequest<McpMarketPage>(endpoint("mcp-market",{view:"catalog",...query})); }
  syncMcpMarket(maxPages?:number) { return jsonRequest<McpMarketSync>("mcp-market","POST",{action:"sync",...(maxPages?{maxPages}:{})}); }
  supplementMcpMarket(input:Record<string,unknown>) { return jsonRequest<unknown>("mcp-market","POST",{action:"supplement",...input}); }
  removeMcpMarketServer(id:string) { return jsonRequest<{ok:boolean}>("mcp-market","POST",{action:"remove",id}); }
  discoverMcpOAuth(body:{url:string;resourceMetadataUrl?:string}) { return jsonRequest<McpOAuthDiscovery>("mcp-auth","POST",body,{op:"discover"}); }
  startMcpOAuth(body:{environmentRef:string;ref:string;version:number;name:string;url:string;transport:"streamable-http"|"sse";sourceId?:string;serverTitle?:string;returnTo?:string;scopes?:string[];resourceMetadataUrl?:string}) { return jsonRequest<{authorizationUrl:string;callbackUrl:string}>("mcp-auth","POST",body,{op:"start"}); }
  inspectMcp(environmentRef:string,body:{content:Record<string,JsonValue>;credential?:string}) { return jsonRequest<ConnectionTestResult>("extensions","POST",{environmentRef,action:"inspect",kind:"connection",...body}); }
  extensions<T>(environmentRef:string) { return apiRequest<T>(endpoint("extensions",{environmentRef})); }
  extension<T>(environmentRef:string,body:Record<string,unknown>) { return jsonRequest<T>("extensions","POST",{...body,environmentRef}); }
  /** Read-only "who uses this connection" scan across the current user's current definitions. */
  extensionReferences(ref:string,environmentRef?:string) { return apiRequest<{items:ResourceReferenceRow[]}>(endpoint("extensions",{view:"references",ref,environmentRef})); }
  /** Read-only "who reads this variable" scan across the current user's current definitions. */
  variableReferences() { return apiRequest<{items:ResourceReferenceRow[]}>(endpoint("configuration",{view:"references"})); }
  /** Connection test; the Worker returns the shared ConnectionTestResult contract. */
  testExtension(environmentRef:string,body:{ref:string;version:number;kind?:"connection"|"function";arguments?:Record<string,JsonValue>;confirmExternalEffect?:boolean;testModel?:string;testMessage?:string;content?:JsonValue}) { return jsonRequest<ConnectionTestResult>("extensions","POST",{action:"test",kind:"connection",...body,environmentRef}); }
  async configuration() { return normalizeConfiguration(await apiRequest<WorkflowConfiguration>(endpoint("configuration"))); }
  async saveConfiguration(config: WorkflowConfiguration) {
    const normalized = normalizeConfiguration(config);
    return normalizeConfiguration(await jsonRequest<WorkflowConfiguration>("configuration","PUT",{
      baseRevision: normalized.revision,
      variables: normalized.variables,
      environments: normalized.environments,
      defaultEnvironmentId: normalized.defaultEnvironmentId,
    }));
  }
  environments() { return apiRequest<{ items: WorkflowEnvironment[] }>(endpoint("environments")); }
  tools(environmentRef: string) { return apiRequest<{ items: WorkflowTool[] }>(endpoint("tools", { environmentRef })); }
  discover(environmentRef: string, connectorRef: string) { return jsonRequest<{ items: WorkflowTool[]; discoveredToolNames?: string[] }>("tools", "POST", { environmentRef, connectorRef }, { op: "discover" }); }
  validate(workflowId: string, revision: number, environmentRef: string) { return jsonRequest<WorkflowCompileResult>("validate", "POST", { workflowId, revision, environmentRef }); }
  validateDraft(definition: WorkflowDefinitionV2, environmentRef: string, input: JsonValue | undefined, draftGeneration: number) {
    return jsonRequest<WorkflowCompileResult>("validate", "POST", { mode: "draft", workflowId: definition.workflowId, baseRevision: definition.revision, draftDefinition: definition, environmentRef, ...(input !== undefined ? { input } : {}), clientRequestId: crypto.randomUUID(), draftGeneration });
  }
  async revisions(workflowId: string) {
    const items: WorkflowRevisionSummary[] = []; let cursor: number | undefined;
    do { const page = await apiRequest<{ items: WorkflowRevisionSummary[]; nextCursor?: number | null }>(endpoint("revisions", { workflowId, cursor, limit: 100 })); items.push(...page.items); cursor = page.nextCursor ?? undefined; } while (cursor !== undefined);
    return { items };
  }
  async createRun(workflowId: string, revision: number, input: JsonValue, environmentRef: string, idempotencyKey: string, launchContext?: WorkflowLaunchContext, variableEnvironmentId?: string) {
    const context = launchContext ? { courseId: launchContext.courseId, assignmentId: launchContext.assignmentId, workflowTemplateId: launchContext.workflowTemplateId } : undefined;
    const result = await apiRequest<unknown>(endpoint("runs"), { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ workflowId, revision, input, environmentRef, ...(context ? { launchContext: context } : {}), ...(variableEnvironmentId ? { variableEnvironmentId } : {}) }) });
    const receipt = runSubmissionReceipt.safeParse(result);
    if (!receipt.success || receipt.data.revision !== revision) throw new ApiResponseError();
    return receipt.data;
  }
  run(runId: string) { return apiRequest<WorkflowRunV2>(endpoint("runs", { id: runId })); }
  /** Exact launch-time fixed-reference closure of one owner-authorized Run. */
  runReferences(runId: string) { return apiRequest<RunReferenceSnapshot>(endpoint("runs", { id: runId, op: "references" }), { cache: "no-store" }); }
  history(workflowId: string) { return apiRequest<{ items: WorkflowRunV2[] }>(endpoint("runs", { workflowId })); }
  events(runId: string, afterSeq = 0) { return apiRequest<{ events: WorkflowEventV2[]; nextSeq: number; hasMore: boolean; status: string; gap?:boolean }>(endpoint("events", { runId, afterSeq, limit: 100 })); }
  async steps(runId: string) {
    const items: WorkflowStepV2[] = []; let cursor: number | undefined;
    do { const page = await apiRequest<{ items: WorkflowStepV2[]; nextCursor?: number }>(endpoint("steps", { runId, limit: 100, cursor })); items.push(...page.items); cursor = page.nextCursor ?? undefined; } while (cursor !== undefined);
    return { items };
  }
  threads(workflowId:string){return apiRequest<{items:WorkflowThreadV2[]}>(endpoint('threads',{workflowId}));}
  thread(id:string){return apiRequest<WorkflowThreadV2>(endpoint('threads',{id}));}
  async resumeThread(id:string,checkpointId:string,responses:Record<string,JsonValue>,currentRunId?:string){
    const result=await jsonRequest<unknown>('threads','POST',{checkpointId,responses,...(currentRunId?{currentRunId}:{})},{id,op:'resume'});
    const receipt=runSubmissionReceipt.safeParse(result);if(!receipt.success)throw new ApiResponseError();return receipt.data;
  }
  cancelThread(id:string){return jsonRequest<{ok:boolean}>('threads','POST',{},{id,op:'cancel'});}
  cancel(runId: string) { return jsonRequest<{ status: string }>("runs", "POST", {}, { id: runId, op: "cancel" }); }
  artifact(id: string) { return apiRequest<{ content?: JsonValue; url?: string }>(endpoint("artifacts", { id })); }
  evaluationConfig(workflowId: string) { return apiRequest<{ config: WorkflowEvaluationConfig }>(endpoint("evaluation-config", { workflowId })); }
  saveEvaluationConfig(config: WorkflowEvaluationConfig) { return jsonRequest<{ config: WorkflowEvaluationConfig }>("evaluation-config", "PUT", { workflowId: config.workflowId, baseVersion: config.version, enabled: config.enabled, goal: config.goal, criteria: config.criteria, providerRef: config.providerRef, modelRef: config.modelRef, environmentRef: config.environmentRef }); }
  evaluations(runId: string) { return apiRequest<{ items: WorkflowEvaluation[]; runStatus: string; runId: string }>(endpoint("evaluations", { runId })); }
  retryEvaluation(runId: string, idempotencyKey: string) { return apiRequest<{ evaluation: WorkflowEvaluation }>(endpoint("evaluations", { id: runId, op: "retry" }), { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({}) }); }
}
