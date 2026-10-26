import { apiRequest as sharedApiRequest, ApiRequestError, ApiResponseError } from "@/shared/api/apiClient";
import { z } from "zod";
import type { WorkflowConfiguration, EditorDocumentV2, JsonValue, WorkflowCompileResult, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowEnvironment, WorkflowEventV2, WorkflowLaunchContext, WorkflowRunV2, WorkflowStepV2, WorkflowSummaryV2, WorkflowTool, WorkflowRevisionSummary, WorkflowLibraryQuery, WorkflowLibraryPage, WorkflowDeleteImpact, WorkflowThreadV2, WorkflowTemplateDetail, ConnectionTestResult, ResourceReferenceRow } from "../../domain/v2/types";
import { workflowRunnerOfflineMessage } from "../../domain/v2/runMessages";

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
    WORKFLOW_RUNNER_OFFLINE: workflowRunnerOfflineMessage,
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
    SECRET_IN_RUN_INPUT: "外部调用数据中不能包含密钥，请改用连接中的安全引用。",
    INVALID_LAUNCH_CONTEXT: "当前实训与工作流不匹配，请从对应课程实训重新进入。",
    ASSIGNMENT_PREREQUISITE_REQUIRED: "此实训的前置要求尚未满足，请返回课程查看。",
    ASSIGNMENT_STATE_CONFLICT: "此实训已提交或完成，请返回课程查看已保存的结果。",
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
  templates() { return apiRequest<{items: {workflowId:string;name:string;description:string}[]}>(endpoint("templates")); }
  template(templateId: string) { return apiRequest<WorkflowTemplateDetail>(endpoint("templates", { id: templateId })); }
  useTemplate(templateId: string, options: {name?:string;fresh?:boolean;creationId?:string;environmentRef?:string;bindings?:{nodeId:string;graphPath:string[];field:"providerRef"|"toolRef";reference:string;modelRef?:string;contractDigest?:string}[]} = {}) { return jsonRequest<{workflowId:string;revision:number}>("definitions","POST",{templateId,...options},{op:"template"}); }
  get(workflowId: string, revision?: number) { return apiRequest<WorkflowDocumentV2>(endpoint("definitions", { id: workflowId, revision })); }
  create(definition: WorkflowDefinitionV2, editor: EditorDocumentV2, creationId?: string) { return jsonRequest<{ workflowId: string; revision: number; editorRevision: number }>("definitions", "POST", { definition, editor, ...(creationId ? {creationId} : {}) }); }
  save(definition: WorkflowDefinitionV2, editor: EditorDocumentV2, baseRevision: number, baseEditorRevision: number) { return jsonRequest<{ workflowId: string; revision: number; editorRevision: number }>("definitions", "PUT", { definition, editor, baseRevision, baseEditorRevision }, { id: definition.workflowId }); }
  saveEditor(editor: EditorDocumentV2, baseEditorRevision: number) { return jsonRequest<{ editorRevision: number }>("editor", "PUT", { editor, baseEditorRevision }, { id: editor.workflowId }); }
  copy(workflowId: string, revision: number, name?: string, creationId?: string) { return jsonRequest<{ workflowId: string; revision: number }>("definitions", "POST", { sourceWorkflowId: workflowId, sourceRevision: revision, ...(name ? {name} : {}), ...(creationId ? {creationId} : {}) }, { op: "copy" }); }
  archive(workflowId: string, baseRevision: number) { return jsonRequest<{ ok: boolean }>("definitions", "DELETE", { baseRevision }, { id: workflowId }); }
  testNode(body: {workflowId:string;baseRevision:number;definition:WorkflowDefinitionV2;nodeId:string;input:JsonValue;state:JsonValue;environmentRef:string;confirmExternalEffect:boolean}) { return jsonRequest<{mode:string;input:JsonValue;output:JsonValue;writes:JsonValue;stateBefore:JsonValue;stateAfter:JsonValue}>("node-tests","POST",body); }
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
  discover(environmentRef: string, connectorRef: string) { return jsonRequest<{ items: WorkflowTool[] }>("tools", "POST", { environmentRef, connectorRef }, { op: "discover" }); }
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
}
