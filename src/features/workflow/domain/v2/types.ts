export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = Record<string, JsonValue>;
export type Binding = { source: "literal"; value: JsonValue } | { source: "input" | "state" | "environment"; pointer: string; onMissing: { mode: "error" } | { mode: "default"; value: JsonValue } };
export type Predicate = { op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte"; left: Binding; right: Binding } | { op: "exists" | "nonEmpty"; source: "input" | "state" | "environment"; pointer: string } | { op: "and" | "or"; children: Predicate[] } | { op: "not"; child: Predicate };
export type WorkflowNodeV2 = { id: string; label: string; type: string; typeVersion: number; config: Record<string, JsonValue>; inputs: Record<string, Binding>; writes: Record<string, string> };
export type WorkflowTransitionV2 = { id: string; from: string; outlet: string; to: string };
export type ExecutionPolicy = { timeoutMs: number; nodeTimeoutMs: number; maxNodeExecutions: number; maxToolCalls: number; maxInputBytes: number; maxStateBytes: number; maxEventBytes: number; maxOutputTokens: number; maxAttempts: number; authoring?: { recursionLimit: number; waitTimeoutMs: number; checkpoint: "superstep"; interruptBefore?:string[]; interruptAfter?:string[]; entryRouter?:string }; maxCost?: { amount: string; currency: string } };
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
export type WorkflowSummaryV2 = { workflowId: string; revision: number; name: string; description: string; archived?: boolean; nodeCount?: number; updatedAt?: string; group?: "test" | "general"; sourceTemplateId?: string; sourceName?: string };
export type WorkflowLibraryQuery = { search: string; scope: "all" | "personal" | "course"; sort: "updated" | "name"; page: number; pageSize: number };
export type WorkflowLibraryPage = { items: WorkflowSummaryV2[]; total: number; page: number; pageSize: number };
export type WorkflowTemplateSummary = { workflowId: string; name: string; description: string };
export type WorkflowTemplateDetail = WorkflowTemplateSummary & { definition: WorkflowDefinitionV2 };
export type WorkflowDeleteImpact = { revision: number; revisions: number; runs: number; activeRuns: number };
export type WorkflowEnvironment = { environmentRef: string; environmentRevision: string; name: string; access?: "owners" | "authenticated"; capabilities: string[]; providers: { ref: string; name: string; modelRefs: string[]; origin?: "environment" | "user"; connectionRef?: string; version?: number }[]; connectors: { ref: string; name: string; transport: string; origin?: "environment" | "user"; connectionRef?: string; version?: number }[]; limits?: JsonValue; variables?: Record<string,string|number|boolean>; configurationRevision?: number };
export type WorkflowTool = { ref: string; name: string; description?: string; contractDigest: string; inputSchema: JsonSchema; outputSchema?: JsonSchema; available?: boolean; adapter?: string; sideEffect?: string; diagnostics?: WorkflowDiagnostic[]; connectorRef?: string; origin?: "environment" | "user"; connectionRef?: string; version?: number; group?: string };
export type WorkflowExecutionError = { code: string; category?: string; message: string; retryable?: boolean; externalStatus?: number; effect?: string; graphPath?:string[]; nodeId?: string; invocation?: number; stage?: "input_resolution"; pointer?: string };
export type WorkflowRunV2 = {
  operation?: "initial" | "next" | "branch" | null;
  threadId?:string; resumeOfRunId?:string; continuationRunId?:string; runId: string; workflowId: string; revision: number; mode: "live"; verification: "unverified" | "passed" | "failed";
  status: "queued" | "running" | "waiting" | "continued" | "success" | "failed" | "cancelled";
  definitionHash: string; semanticHash: string; compileFingerprint: string; environmentRef: string; environmentRevision: string; policyVersion: string;
  launchContext?: WorkflowLaunchContext | null;
  inputReuse?: { available: boolean; complete?: boolean; fields?: { pointer: string; value: JsonValue }[]; removedFields?: { pointer: string; reason: string }[]; reason?: string }; inputRef?: string; outputRef?: string; output?: JsonValue; finalState?: JsonValue; createdAt: string; startedAt?: string; finishedAt?: string; cancelRequestedAt?: string; lastSeq: number;
  error?: WorkflowExecutionError;
};
export type WorkflowEventV2 = { protocolVersion: "1"; eventId: string; runId: string; seq: number; type: string; occurredAt: string; stepId?: string; nodeId?: string; attempt?: number; stateVersion?: number; payload: JsonValue };
export type WorkflowStepV2 = { execution?: { taskId: string; namespace: string; checkpointId: string; attempt: number }; taskId?: string; graphPath?: string[]; namespace?: string[]; parentStepId?: string; stepId: string; runId: string; nodeId: string; invocation: number; attempt: number; status: string; input?: JsonValue; output?: JsonValue; inputRef?: string; outputRef?: string; stateVersionBefore?: number; stateVersionAfter?: number; startedAt?: string; finishedAt?: string; error?: { code: string; message: string }; toolCallIds?: string[] };
export type WorkflowLaunchContext = { courseId: string; assignmentId: string; workflowTemplateId: string; workflowInput?: JsonValue };


export type WorkflowRevisionSummary = { revision: number; name: string; createdAt: string; definitionHash: string; availability: "available" };

export type WorkflowVariable = {key:string;value:string|number|boolean;overrides:Record<string,string|number|boolean>;description?:string};
/** Workspace-level variable environment (M13). Kept optional here so existing callers remain valid until the API returns it. */
export type VariableEnvironment = {id:string;name:string};
export type WorkflowConfiguration = {revision:number;variables:WorkflowVariable[];environments?:VariableEnvironment[];defaultEnvironmentId?:string|null};

export type WorkflowThreadV2={threadId:string;workflowId:string;revision:number;status:'active'|'waiting'|'closed'|'expired';currentRunId:string;checkpointId:string;state:JsonValue;stateVersion:number;interrupts:{id:string;nodeId:string;title:string;schema:JsonSchema;graphPath?:string[];taskId?:string;namespace?:string;breakpoint?:boolean}[];waitExpiresAt?:string;updatedAt:string;lastError?:{code:string};nodeExecutions:number;toolCalls:number;computeMs:number};

/** Resource center and node configuration contracts (M1). These describe persisted definitions, never runtime answers. */
export type ToolConfigV2 = { toolRef: string; contractDigest: string };
export type PromptSegment = { type: "text"; text: string } | { type: "param"; name: string; format?: "text" | "json" };
export type PromptMessageV2 = { role: "user" | "assistant"; content: PromptSegment[] };
export type LlmConfigV2 = { providerRef: string; modelRef: string; modelParameters: Record<string, JsonValue>; allowedToolRefs: string[]; prompt: { system: PromptSegment[]; messages: PromptMessageV2[] } };
export type ConnectionTestResult = { ok: boolean; elapsedMs?: number; status?: number; preview?: string; models?: string[]; tools?: { name: string; description?: string }[]; error?: { code: string; message: string } };
export type ResourceReferenceRow = { workflowId: string; workflowName: string; revision: number; graphPath: string[]; nodeId: string; nodeLabel: string; version?: number; modelRef?: string; variableKey?: string };
