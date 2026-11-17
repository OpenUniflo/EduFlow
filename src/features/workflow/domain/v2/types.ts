export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = Record<string, JsonValue>;
export type Binding = { source: "literal"; value: JsonValue } | { source: "input" | "state" | "environment"; pointer: string; onMissing: { mode: "error" } | { mode: "default"; value: JsonValue } };
export type Predicate = { op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte"; left: Binding; right: Binding } | { op: "exists" | "nonEmpty"; source: "input" | "state" | "environment"; pointer: string } | { op: "and" | "or"; children: Predicate[] } | { op: "not"; child: Predicate };
export type WorkflowNodeV2 = { id: string; label: string; type: string; typeVersion: number; config: Record<string, JsonValue>; inputs: Record<string, Binding>; writes: Record<string, string> };
export type WorkflowTransitionV2 = { id: string; from: string; outlet: string; to: string };
export type ExecutionPolicy = { timeoutMs: number; nodeTimeoutMs: number; maxNodeExecutions: number; maxToolCalls: number; maxInputBytes: number; maxStateBytes: number; maxEventBytes: number; maxOutputTokens?: number; maxAttempts: number; authoring?: { recursionLimit: number; waitTimeoutMs: number; checkpoint: "superstep"; interruptBefore?:string[]; interruptAfter?:string[]; entryRouter?:string }; maxCost?: { amount: string; currency: string } };
export type WorkflowDefinitionV2 = {
  schemaVersion: "2.0"; workflowId: string; revision: number; name: string; description: string;
  inputSchema: JsonSchema; outputSchema: JsonSchema;
  state: { schema: JsonSchema; initial: Record<string, JsonValue>; inputBindings: Record<string, Binding>; reducers: Record<string, { name: string; version: 1 }> };
  entryNodeId: string; nodes: WorkflowNodeV2[]; transitions: WorkflowTransitionV2[];
  outputBindings: Record<string, Binding>; policy: ExecutionPolicy; requiredCapabilities: string[];
};
export type WorkflowPortPlacement = { side: "left" | "right" | "top" | "bottom"; offset: number };
export type WorkflowRouting = { version: 1; mode: "auto" | "manual"; source?: WorkflowPortPlacement; target?: WorkflowPortPlacement; points?: { x: number; y: number }[] };
export type WorkflowGraphLayout = { nodes: Record<string, { x: number; y: number; width?: number; height?: number; collapsed?: boolean }>; edges: Record<string, { sourceHandle?: string; targetHandle?: string; routing?: WorkflowRouting }>; viewport?: { x: number; y: number; zoom: number } };
export type EditorDocumentV2 = { schemaVersion: 1; workflowId: string; editorRevision: number; definitionRevision: number; graphs?: Record<string, WorkflowGraphLayout>; nodes: Record<string, { x: number; y: number; width?: number; height?: number; collapsed?: boolean }>; edges: Record<string, { sourceHandle?: string; targetHandle?: string; routing?: WorkflowRouting }>; viewport?: { x: number; y: number; zoom: number } };
export type WorkflowDiagnostic = { code: string; severity: "error" | "warning"; message: string; graphPath?:string[]; nodeId?: string; transitionId?: string; pointer?: string; scope?: "definition" | "input" | "environment" | "run"; requestId?: string; clientRequestId?: string; draftGeneration?: number; runId?: string; stepId?: string; invocation?: number };
export type WorkflowCompileResult = { valid: boolean; diagnostics: WorkflowDiagnostic[]; semanticHash?: string; compileFingerprint?: string; requiredCapabilities: string[]; environmentReadiness?: string; checks?: { structure: boolean; environment: boolean; input: "unchecked" | boolean }; requestId?: string; clientRequestId?: string; draftGeneration?: number };
export type WorkflowDocumentV2 = { definition: WorkflowDefinitionV2; editor: EditorDocumentV2; structuralValidity?: boolean; diagnostics?: WorkflowDiagnostic[]; archived?: boolean };
export type WorkflowNodeOutline = { id: string; type: string; label: string };
/** Distinct-Workflow counts for the Works card. Call sites are counted separately. */
export type WorkflowRelationSummary = {
  referenceWorkflows: number;
  referenceCallSites: number;
  referencedByWorkflows: number;
  referencedByCallSites: number;
};
export type WorkflowSummaryV2 = { workflowId: string; revision: number; name: string; description: string; archived?: boolean; nodeCount?: number; updatedAt?: string; group?: "test" | "general"; sourceTemplateId?: string; sourceName?: string; nodes?: WorkflowNodeOutline[]; relations?: WorkflowRelationSummary };
export type WorkflowLibraryQuery = { search: string; scope: "all" | "personal" | "course"; sort: "updated" | "name"; page: number; pageSize: number };
export type WorkflowLibraryPage = { items: WorkflowSummaryV2[]; total: number; page: number; pageSize: number };
export type WorkflowTemplateSummary = { workflowId: string; name: string; description: string; purpose?: "starter" | "course"; definition?: WorkflowDefinitionV2 };
export type WorkflowTemplateDetail = WorkflowTemplateSummary & { definition: WorkflowDefinitionV2 };
export type WorkflowReferenceTargetInfo = {
  workflowId: string;
  revision: number;
  name?: string;
  archived?: boolean;
  currentRevision?: number;
  available: boolean;
  reason?: "missing" | "archived";
  environmentRef: string;
};
export type WorkflowReferenceItem = {
  graphPath: string[];
  nodeId: string;
  nodeLabel: string;
  inputs: Record<string, Binding>;
  writes: Record<string, string>;
  target: WorkflowReferenceTargetInfo;
};
export type WorkflowReferenceBlock = {
  indirect?: boolean;
  blocking?: boolean;
  rootWorkflowId: string;
  rootRevision: number;
  rootName?: string;
  sourceWorkflowId: string;
  sourceRevision: number;
  sourceName?: string;
  sourceCurrent?: boolean;
  nodeId: string;
  nodeLabel?: string;
  graphPath: string[];
  targetWorkflowId: string;
  targetRevision: number;
  targetName?: string;
  environmentRef?: string;
  chain: string[];
  chainNames: string[];
};
/** Presentation-only focus for opening an independent Workflow at one node. */
export type WorkflowEditorFocus = { nodeId: string; graphPath: string[] };
export type WorkflowReferencedByResult = { workflowId: string; mode: "current-closure" | "historical-index"; items: WorkflowReferenceBlock[] };
export type WorkflowDeleteImpact = { revision: number; revisions: number; runs: number; activeRuns: number; referenceCount?: number; referencedBy?: number; blockingReferences?: WorkflowReferenceBlock[] };
export type WorkflowEnvironment = { environmentRef: string; environmentRevision: string; name: string; access?: "owners" | "authenticated"; capabilities: string[]; providers: { ref: string; name: string; modelRefs: string[]; origin?: "environment" | "user"; connectionRef?: string; version?: number }[]; connectors: { ref: string; name: string; transport: string; origin?: "environment" | "user"; connectionRef?: string; version?: number; discoveredToolNames?: string[] }[]; limits?: JsonValue; variables?: Record<string,string|number|boolean>; configurationRevision?: number };
export type WorkflowTool = { ref: string; name: string; description?: string; contractDigest: string; inputSchema: JsonSchema; outputSchema?: JsonSchema; available?: boolean; adapter?: string; sideEffect?: string; declaredReadOnly?: boolean; declaredDestructive?: boolean; diagnostics?: WorkflowDiagnostic[]; connectorRef?: string; origin?: "environment" | "user"; connectionRef?: string; version?: number; group?: string };
export type WorkflowExecutionError = { code: string; category?: string; message: string; retryable?: boolean; externalStatus?: number; httpStatus?: number; reason?: string; provider?: string; model?: string; host?: string; tool?: string; effect?: string; elapsedMs?: number; timeoutMs?: number; graphPath?:string[]; nodeId?: string; invocation?: number; stage?: "input_resolution"; pointer?: string; field?: string; expectedType?: string; actualType?: string; expectedLabel?: string; actualLabel?: string; valueSource?: string };
export type WorkflowRunV2 = {
  operation?: "initial" | "next" | "branch" | null;
  variableEnvironment?: string | null;
  variableEnvironmentId?: string | null;
  threadId?:string; resumeOfRunId?:string; continuationRunId?:string; runId: string; workflowId: string; revision: number; mode: "live"; verification: "unverified" | "passed" | "failed";
  status: "queued" | "running" | "waiting" | "continued" | "success" | "failed" | "cancelled";
  definitionHash: string; semanticHash: string; compileFingerprint: string; environmentRef: string; environmentRevision: string; policyVersion: string;
  /** Number of fixed reference targets frozen into this Run; 0 for embedded-only or legacy Runs. */
  referenceCount?: number;
  launchContext?: WorkflowLaunchContext | null;
  inputReuse?: { available: boolean; complete?: boolean; fields?: { pointer: string; value: JsonValue }[]; removedFields?: { pointer: string; reason: string }[]; reason?: string }; inputRef?: string; outputRef?: string; output?: JsonValue; finalState?: JsonValue; createdAt: string; startedAt?: string; finishedAt?: string; cancelRequestedAt?: string; lastSeq: number;
  error?: WorkflowExecutionError;
};
export type WorkflowEventV2 = { protocolVersion: "1"; eventId: string; runId: string; seq: number; type: string; occurredAt: string; stepId?: string; nodeId?: string; attempt?: number; stateVersion?: number; payload: JsonValue };
/** One frozen subgraph call hop recorded by the Worker on a Step. */
export type WorkflowPathEntry = {
  parentWorkflowId?: string; parentRevision?: number; nodeId: string;
  workflowId?: string; revision?: number; environmentRef?: string; invocationId?: string;
};
export type WorkflowStepExecutionV2 = {
  taskId: string; namespace: string; checkpointId: string; attempt: number;
  graphPath?: string[]; graphNamespace?: string; parentTaskId?: string;
  workflowId?: string; revision?: number; workflowPath?: WorkflowPathEntry[];
};
export type WorkflowStepV2 = { execution?: WorkflowStepExecutionV2; taskId?: string; graphPath?: string[]; namespace?: string[]; parentStepId?: string; stepId: string; runId: string; nodeId: string; invocation: number; attempt: number; status: string; input?: JsonValue; output?: JsonValue; inputRef?: string; outputRef?: string; stateVersionBefore?: number; stateVersionAfter?: number; startedAt?: string; finishedAt?: string; error?: { code: string; message: string; category?: string; retryable?: boolean; externalStatus?: number; httpStatus?: number; reason?: string; provider?: string; model?: string; host?: string; tool?: string; effect?: string; elapsedMs?: number; timeoutMs?: number }; toolCallIds?: string[] };
export type WorkflowLaunchContext = { courseId: string; assignmentId: string; workflowTemplateId: string; workflowInput?: JsonValue };


export type WorkflowRevisionSummary = { revision: number; name: string; createdAt: string; definitionHash: string; availability: "available" };

export type WorkflowVariable = {key:string;value:string|number|boolean;overrides:Record<string,string|number|boolean>;description?:string};
/** Workspace-level variable environment (M13). Kept optional here so existing callers remain valid until the API returns it. */
export type VariableEnvironment = {id:string;name:string;description?:string;order?:number};
export type WorkflowConfiguration = {revision:number;variables:WorkflowVariable[];environments?:VariableEnvironment[];defaultEnvironmentId?:string|null};

export type WorkflowThreadV2={threadId:string;workflowId:string;revision:number;status:'active'|'waiting'|'closed'|'expired';currentRunId:string;checkpointId:string;state:JsonValue;stateVersion:number;interrupts:{id:string;nodeId:string;title:string;schema:JsonSchema;graphPath?:string[];taskId?:string;namespace?:string;breakpoint?:boolean}[];waitExpiresAt?:string;updatedAt:string;lastError?:{code:string};nodeExecutions:number;toolCalls:number;computeMs:number};

/** Resource center and node configuration contracts (M1). These describe persisted definitions, never runtime answers. */
export type ToolConfigV2 = { toolRef: string; contractDigest: string };
export type PromptSegment = { type: "text"; text: string } | { type: "param"; name: string; format?: "text" | "json" };
export type PromptMessageV2 = { role: "user" | "assistant"; content: PromptSegment[] };
export type StructuredOutputFieldType = "string" | "number" | "boolean" | "array" | "object";
/** One model structured-output field; the runtime returns it as a top-level output item. */
export type StructuredOutputField = { name: string; type: StructuredOutputFieldType; description?: string };
export type LlmConfigV2 = { providerRef: string; modelRef: string; modelParameters: Record<string, JsonValue>; allowedToolRefs: string[]; prompt: { system: PromptSegment[]; messages: PromptMessageV2[] }; structuredOutput?: { fields: StructuredOutputField[] } };
/** P1 MCP market DTOs. Catalog rows come from the official Registry or an administrator supplement. */
export type McpMarketCategory = { key: string; label: string; count: number };
export type McpMarketHeaderHint = { name: string; description?: string; isSecret?: boolean; isRequired?: boolean };
export type McpMarketItem = {
  id: string; source: "registry" | "admin"; sourceId: string; name: string; title: string; description: string;
  version: string; url: string; transport: "streamable-http" | "sse"; authHint: "none" | "oauth" | "api-key" | "bearer" | "unknown";
  headerHints: McpMarketHeaderHint[]; category: string; categoryLabel: string; iconUrl?: string; websiteUrl?: string;
  repositoryUrl?: string; featured: boolean; registryStatus?: string; publishedAt?: string; updatedAt?: string;
  suggestedRef: string; recommended: boolean;
};
export type McpMarketSync = { status: "idle" | "running" | "ok" | "error"; cursor: string | null; hasMore: boolean; pageCount: number; serverCount: number; fullSyncCompleted: boolean; lastSuccessAt: string | null; lastAttemptAt: string | null; error: string | null };
export type McpMarketPage = { items: McpMarketItem[]; page: number; limit: number; total: number; hasMore: boolean; categories: McpMarketCategory[]; recommendedIds: string[]; sync: McpMarketSync; canAdmin: boolean };
export type McpConnectionAuthType = "none" | "bearer" | "api-key" | "oauth" | "legacy";
export type McpOAuthDiscovery = { issuer: string; authorizationEndpoint: string; tokenEndpoint: string; resource: string; resourceMetadataUrl?: string; scopes: string[] };

export type ConnectionTestResult = { ok: boolean; elapsedMs?: number; status?: number; preview?: string; models?: string[]; reply?: string; output?: JsonValue; tools?: { name: string; description?: string; allowed?: boolean; inputSchema?: JsonSchema }[]; discoveredToolNames?: string[]; error?: { code: string; message: string } };
export type ResourceReferenceRow = { workflowId: string; workflowName: string; revision: number; graphPath: string[]; nodeId: string; nodeLabel: string; version?: number; modelRef?: string; variableKey?: string };

/** P2 completion evaluation. Reports are historical records; they never change Run truth. */
export type WorkflowEvaluationEvidence = { label: string; value: string };
export type WorkflowEvaluationDimension = {
  key: string; label: string;
  status: "passed" | "failed" | "not_applicable" | "not_evaluated";
  source: "rule" | "semantic";
  reason: string;
  evidence: WorkflowEvaluationEvidence[];
  score?: number; threshold?: number; passed?: boolean; elapsedMs?: number;
};
export type WorkflowEvaluationHardFailure = { code: string; reason: string; evidence: string };
export type WorkflowEvaluationSemantic = {
  status: "pending" | "not_configured" | "completed" | "failed" | "skipped_hard_failure" | "insufficient_evidence" | "not_evaluated";
  reason: string; model?: string | null; provider?: string | null;
  adapter?: string; promptVersion?: string; threshold?: number;
  deepevalVersion?: string; errorCode?: string;
  metrics?: WorkflowEvaluationDimension[];
};
export type WorkflowEvaluationReport = {
  schemaVersion: number; promptVersion: string; generatedAt: string;
  mode: "rules" | "semantic";
  outcome: "passed" | "needs_improvement" | "failed" | "insufficient_evidence" | "rules_passed";
  headline: string; summary: string;
  dimensions: WorkflowEvaluationDimension[];
  hardFailures: WorkflowEvaluationHardFailure[];
  suggestions: string[];
  semantic: WorkflowEvaluationSemantic;
  trace: {
    complete: boolean; expectedNodeCount: number; stepCount: number; failedStepCount: number;
    toolEventCount: number; toolFailureCount: number;
    stepReturned?: number; stepsTruncated?: boolean; stepErrorCount?: number; stepStatusCounts?: Record<string, number>;
    toolEventReturned?: number; toolEventsTruncated?: boolean; toolCallCount?: number;
    toolRecoveredCount?: number; toolFinalFailureCount?: number; toolIncompleteCount?: number;
  };
  rubric: { version: number; goal: string; criteria: string[] };
  limitations: string[]; truncated?: boolean;
};
export type WorkflowEvaluation = {
  evaluationId: string; runId: string; workflowId: string; revision: number;
  trigger: "automatic" | "manual";
  status: "queued" | "running" | "completed" | "failed";
  outcome: WorkflowEvaluationReport["outcome"] | null;
  mode: "rules" | "semantic";
  semanticStatus: WorkflowEvaluationSemantic["status"];
  rubricVersion: number;
  providerRef: string | null; modelRef: string | null;
  report: WorkflowEvaluationReport | null;
  error: { code: string; message: string } | null;
  attemptCount: number; maxAttempts: number;
  supersedesId: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
};
export type WorkflowEvaluationConfig = {
  workflowId: string; version: number; enabled: boolean; goal: string; criteria: string[];
  providerRef: string | null; modelRef: string | null; environmentRef: string | null;
  updatedAt: string | null;
};
