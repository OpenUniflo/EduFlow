import { pruneGraphLayouts } from "../../domain/v2/authoring";
import { useCallback, useEffect, useRef, useState } from "react";
import { recordEdit, rebaseSnapshot, snapshotChanges, travelHistory, type EditorHistory, type EditorSnapshot, type WorkflowControllerRecovery } from "./editorHistory";
import { ApiRequestError, type ApiAuthenticationFailure } from "@/shared/api/apiClient";
import { WorkflowApiV2, workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";
import type { EditorDocumentV2, JsonValue, WorkflowDiagnostic, WorkflowDocumentV2, WorkflowEnvironment, WorkflowEventV2, WorkflowLaunchContext, WorkflowRunV2, WorkflowStepV2, WorkflowTool, WorkflowThreadV2 } from "../../domain/v2/types";

export const workflowApiV2 = new WorkflowApiV2();
export type WorkflowRunOrigin = "current" | "history" | null;
const terminal = new Set(["success", "failed", "cancelled", "continued"]);
export const runSubmittedNotice = "运行已提交。编辑只影响下次运行。";
export function useWorkflowV2Controller(initial: WorkflowDocumentV2, launchContext?: WorkflowLaunchContext, recovery?: WorkflowControllerRecovery, onRecoverySubmissionRejected?: (key: string) => void) {
  const [definition, setDefinition] = useState(recovery?.timeline.present.definition ?? initial.definition);
  const [editor, setEditor] = useState(recovery?.timeline.present.editor ?? initial.editor);
  const edits = useRef(0);
  const savedDocument = useRef<EditorSnapshot>(recovery?.savedDocument ?? { definition: initial.definition, editor: initial.editor });
  const timeline = useRef<EditorHistory>(recovery?.timeline ?? { past: [], present: savedDocument.current, future: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  const inputStatus = useRef({ dirty: recovery?.inputDirty ?? false, invalid: recovery?.inputInvalid ?? "" });
  const [inputDirty, publishInputDirty] = useState(inputStatus.current.dirty);
  const [inputInvalid, publishInputInvalid] = useState(inputStatus.current.invalid);
  function setInputDirty(value: boolean) { inputStatus.current.dirty = value; publishInputDirty(value); }
  function setInputInvalid(value: string) { inputStatus.current.invalid = value; publishInputInvalid(value); }
  function changeInputInvalid(value: string) {
    setInputInvalid(value); edits.current += 1; if(value) setInputDirty(true);
    setNotice(""); setDiagnostics(current => current.filter(item => item.scope !== "input"));
    if (!submitUnknown) setError("");
  }
  const [submitUnknown, setSubmitUnknown] = useState(Boolean(recovery?.pendingRunRequest));
  const preparationFailure = useRef<"preflight" | "save" | "submit" | null>(recovery?.runPreparationFailure ?? null);
  const [runPreparationFailure, publishPreparationFailure] = useState(preparationFailure.current);
  function setRunPreparationFailure(value: typeof runPreparationFailure) { preparationFailure.current = value; publishPreparationFailure(value); }
  const [runPreparationStage, setRunPreparationStage] = useState<"preflight" | "save" | "submit" | null>(null);
  const preparationStage = useRef<typeof runPreparationStage>(null);
  function changePreparationStage(stage: typeof runPreparationStage) { preparationStage.current = stage; setRunPreparationStage(stage); }
  const authenticationInterrupted = useRef(false);
  const base = useRef(recovery?.base ?? { revision: initial.definition.revision, editorRevision: initial.editor.editorRevision });
  const [dirty, setDirty] = useState(() => snapshotChanges(timeline.current.present, savedDocument.current).dirty);
  const [definitionDirty, setDefinitionDirty] = useState(() => snapshotChanges(timeline.current.present, savedDocument.current).definitionDirty);
  const [busy, setBusy] = useState(false);
  const [cancelPendingRunId, setCancelPendingRunId] = useState<string | null>(null);
  const operationRunning = useRef(false);
  const pendingRunRequest = useRef<{ fingerprint: string; key: string } | null>(recovery?.pendingRunRequest ?? null);
  const [failure, setFailure] = useState<{ message: string; code?: string }>({ message: "" });
  const error = failure.message;
  const setError = useCallback((update: string | ((current: string) => string)) => setFailure(current => {
    const message = typeof update === "function" ? update(current.message) : update;
    return message === current.message ? current : { message };
  }), []);
  const [notice, setNotice] = useState(() => recovery ? `登录已恢复，已找回此标签页的编辑内容、外部调用数据和撤销记录。${recovery.base.revision !== initial.definition.revision || recovery.base.editorRevision !== initial.editor.editorRevision ? "服务端版本已更新；当前草稿仍基于原版本，请比较后处理保存冲突。" : ""}${recovery.pendingRunRequest ? "上次提交状态待确认；请确认原请求，不要重复运行。" : "中断的操作没有自动重试，请检查后继续。"}` : "");
  const [runNotice,setRunNotice]=useState<{runId:string;text:string}|null>(null);
  const [diagnostics, setDiagnostics] = useState<WorkflowDiagnostic[]>(recovery ? [] : initial.diagnostics ?? []);
  const [environments, setEnvironments] = useState<WorkflowEnvironment[]>([]);
  const [initialLoadStatus, setInitialLoadStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [environmentError, setEnvironmentError] = useState("");
  const environmentChoice = useRef(recovery?.environmentRef ?? "");
  const [environmentRef, publishEnvironment] = useState(environmentChoice.current);
  function setEnvironmentRef(update: string | ((current: string) => string)) {
    const value = typeof update === "function" ? update(environmentChoice.current) : update;
    environmentChoice.current = value; publishEnvironment(value);
  }
  function changeEnvironment(value: string) { setEnvironmentRef(value); edits.current += 1; setDiagnostics([]); setNotice(""); }
  const [tools, setTools] = useState<WorkflowTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const toolsRequest = useRef(0);
  const loadTools = useCallback(async (ref: string) => {
    const request = toolsRequest.current + 1;
    toolsRequest.current = request;
    if (!ref) { setTools([]); setToolsLoading(false); return; }
    setToolsLoading(true);
    try {
      const data = await workflowApiV2.tools(ref);
      if (request === toolsRequest.current) setTools(data.items);
    } catch (reason) {
      if (request === toolsRequest.current) setError(workflowErrorMessage(reason));
    } finally {
      if (request === toolsRequest.current) setToolsLoading(false);
    }
  }, [setError]);
  const [run, setRun] = useState<WorkflowRunV2 | null>(null);
  const variableEnvironmentRef = useRef<string | null>(null);
  const observationIdentity = useRef({ runId: recovery?.observedRunId ?? null, origin: recovery?.runOrigin ?? null as WorkflowRunOrigin });
  const [runOrigin, publishRunOrigin] = useState<WorkflowRunOrigin>(observationIdentity.current.origin);
  function setRunOrigin(value: WorkflowRunOrigin) { observationIdentity.current.origin = value; publishRunOrigin(value); }
  const [runSnapshot, setRunSnapshot] = useState<WorkflowDocumentV2 | null>(null);
  const [observedRunId, publishObservedRunId] = useState<string | null>(observationIdentity.current.runId);
  function setObservedRunId(value: string | null) { observationIdentity.current.runId = value; publishObservedRunId(value); }
  const [observationEpoch, setObservationEpoch] = useState(0);
  const [threads,setThreads]=useState<WorkflowThreadV2[]>([]);
  const [threadView,setThreadView]=useState<WorkflowThreadV2|null>(null);
  const [historyExpired,setHistoryExpired]=useState(false);
  const observationThread=useRef<string|null>(null);
  const [threadsError,setThreadsError]=useState('');
  const [history, setHistory] = useState<WorkflowRunV2[]>([]);
  const [events, setEvents] = useState<WorkflowEventV2[]>([]);
  const [steps, setSteps] = useState<WorkflowStepV2[]>([]);
  const [observationComplete, setObservationComplete] = useState(false);
  const sequence = useRef(0);
  const observationGeneration = useRef(0);
  const [input, setInput] = useState<JsonValue>(recovery?.input ?? {});
  const [inputResetVersion, setInputResetVersion] = useState(0);
  const inputRef = useRef<JsonValue>(recovery?.input ?? {});
  const activeWorkflowId = definition.workflowId;

  function requireAuthentication() {
    if (authenticationInterrupted.current) throw new ApiRequestError("AUTHENTICATION_REQUIRED", "登录已失效，操作已中断。请重新登录后检查保留的草稿。", 401);
  }
  function captureSessionRecovery(failure: ApiAuthenticationFailure): WorkflowControllerRecovery {
    // Synchronous before shared auth signs out and unmounts this Feature.
    authenticationInterrupted.current = true;
    return structuredClone({ timeline: timeline.current, savedDocument: savedDocument.current, base: base.current,
      input: inputRef.current, inputDirty: inputStatus.current.dirty, inputInvalid: inputStatus.current.invalid, environmentRef: environmentChoice.current, pendingRunRequest: pendingRunRequest.current,
      observedRunId: observationIdentity.current.runId, runOrigin: observationIdentity.current.origin, runPreparationFailure: pendingRunRequest.current ? null : preparationStage.current ?? preparationFailure.current,
      requestId: failure.requestId });
  }

  function clearRunObservation(origin: WorkflowRunOrigin = null) {
    observationGeneration.current += 1;
    setRunNotice(null);
    sequence.current = 0;
    setObservedRunId(null); setRun(null); setRunSnapshot(null); setRunOrigin(origin);
    observationThread.current=null;setThreadView(null);setHistoryExpired(false);
    setSteps([]); setEvents([]); setObservationComplete(false);
  }
  function rejectRunPreparation(message: string) {
    // An uncertain submission still owns its original key and observation identity.
    if (submitUnknown || pendingRunRequest.current) return;
    clearRunObservation(); setRunPreparationFailure("preflight"); changePreparationStage(null);
    setError(message); setNotice("");
  }

  useEffect(() => {
    let alive = true;
    const generation = observationGeneration.current;
    setInitialLoadStatus("loading");
    setEnvironmentError("");
    void workflowApiV2.environments().then(environmentData => {
      if (!alive) return;
      setEnvironments(environmentData.items);
      setEnvironmentRef(current => current || environmentData.items[0]?.environmentRef || "");
      setInitialLoadStatus("ready");
      setEnvironmentError("");
    }).catch(reason => {
      if (!alive) return;
      setInitialLoadStatus("failed");
      setEnvironmentError(workflowErrorMessage(reason));
      setError(workflowErrorMessage(reason));
    });
    void Promise.all([workflowApiV2.history(activeWorkflowId),workflowApiV2.threads(activeWorkflowId)]).then(([runData,threadData]) => {
      if (!alive) return;
      setHistory(runData.items);setThreads(threadData.items);
      const active = runData.items.find(item => !terminal.has(item.status));
      if (active && !recovery?.observedRunId && !pendingRunRequest.current && generation === observationGeneration.current) { clearRunObservation("current"); setRun(active); setObservedRunId(active.runId); observationThread.current=active.threadId??null; }
      else if(!recovery?.observedRunId&&!pendingRunRequest.current&&generation===observationGeneration.current){const waiting=threadData.items.find(item=>item.status==='waiting');if(waiting)selectThread(waiting);}
    }).catch(reason => { if (alive) setError(workflowErrorMessage(reason)); });
    return () => { alive = false; };
  }, [activeWorkflowId]);
  useEffect(() => {
    void loadTools(environmentRef);
    return () => { toolsRequest.current += 1; };
  }, [environmentRef, loadTools]);
  useEffect(()=>{
    let alive=true;let timer:ReturnType<typeof setTimeout>;
    async function read(){
      const selected=observationThread.current;const generation=observationGeneration.current;
      try{
        const [page,detail]=await Promise.all([workflowApiV2.threads(activeWorkflowId),selected?workflowApiV2.thread(selected):Promise.resolve(null)]);
        if(!alive)return;setThreads(page.items);setThreadsError('');
        if(generation===observationGeneration.current&&selected===observationThread.current)setThreadView(detail);
      }catch(reason){if(alive)setThreadsError(workflowErrorMessage(reason));}
      finally{if(alive)timer=setTimeout(()=>void read(),2500);}
    }
    void read();return()=>{alive=false;clearTimeout(timer);};
  },[activeWorkflowId,observedRunId,observationEpoch]);
  const observationRevision=run?.revision??(historyExpired?threadView?.revision:undefined);
  useEffect(() => {
    if (observationRevision===undefined) { setRunSnapshot(null); return; }
    let alive = true;
    const generation = observationGeneration.current;
    void workflowApiV2.get(activeWorkflowId, observationRevision).then(snapshot => { if (alive && generation === observationGeneration.current) setRunSnapshot(snapshot); }).catch(() => { if(alive && generation === observationGeneration.current) setRunSnapshot(null); });
    return () => { alive = false; };
  }, [activeWorkflowId,observationRevision,observedRunId,observationEpoch]);
  const runId = observedRunId;
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const generation = observationGeneration.current;
    const current = () => alive && !authenticationInterrupted.current && generation === observationGeneration.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function observe() {
      if (!current()) return;
      try {
        const [record, page, detail] = await Promise.all([workflowApiV2.run(runId!), workflowApiV2.events(runId!, sequence.current), workflowApiV2.steps(runId!)]);
        if (!current()) return;
        sequence.current = page.nextSeq;
        if(page.gap)setNotice("部分过程记录已过期，已按服务器最终状态校准；不会重新执行。");
        const caughtUp = terminal.has(record.status) && !page.hasMore && page.nextSeq >= record.lastSeq;
        setRun(record); setSteps(detail.items); setObservationComplete(caughtUp);
        observationThread.current=record.threadId??observationThread.current;
        setError(current => current.startsWith("运行观察暂时中断：") ? "" : current);
        setEvents(current => [...new Map([...current, ...page.events].map(item => [item.eventId, item])).values()].sort((a, b) => a.seq - b.seq));
        if (terminal.has(record.status)) {
          setRunNotice(current => current?.runId===record.runId ? null : current);
          const latest = await workflowApiV2.history(activeWorkflowId); if (current()) { setHistory(latest.items); }
          if (!current()) return;
          if (caughtUp) return;
        }
        timer = setTimeout(() => void observe(), page.hasMore ? 0 : document.visibilityState === "hidden" ? 5000 : 400);
      } catch (reason) {
        if (!current()) return;
        setObservationComplete(false);
        if (reason instanceof ApiRequestError && reason.status === 410) {
          const threadId=observationThread.current;
          if(threadId){
            try{const durable=await workflowApiV2.thread(threadId);if(!current())return;setThreadView(durable);setHistoryExpired(true);setRun(null);setSteps([]);setEvents([]);setNotice('较早的步骤日志已清理；此执行的持久状态仍可查看。');return;}
            catch{/* Fall through to an explicit unavailable-history state. */}
          }
          clearRunObservation();
          setError("此运行的调试历史已清理；原请求不会因此重新执行。"); return;
        }
        setError(`运行观察暂时中断：${workflowErrorMessage(reason)}。将自动重连。`);
        timer = setTimeout(() => void observe(), 5000);
      }
    }
    void observe();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [runId, activeWorkflowId, observationEpoch]);

  function publish(snapshot: EditorSnapshot) {
    setDefinition(snapshot.definition); setEditor(snapshot.editor);
    const changes = snapshotChanges(snapshot, savedDocument.current);
    setDefinitionDirty(changes.definitionDirty); setDirty(changes.dirty);
    setHistoryVersion(value => value + 1); setDiagnostics([]); setNotice(""); edits.current += 1;
  }
  function editDocument(update: (value: EditorSnapshot) => EditorSnapshot, group?: string) {
    const current = timeline.current;
    const next = update(current.present);
    timeline.current = recordEdit(current, { ...next, editor: pruneGraphLayouts(next.definition, next.editor) }, group);
    if (timeline.current !== current) publish(timeline.current.present);
  }
  function editDefinition(update: typeof definition | ((value: typeof definition) => typeof definition), group?: string) {
    editDocument(current => ({ ...current, definition: typeof update === "function" ? update(current.definition) : update }), group);
  }
  function editEditor(update: EditorDocumentV2 | ((value: EditorDocumentV2) => EditorDocumentV2), group?: string) {
    editDocument(current => ({ ...current, editor: typeof update === "function" ? update(current.editor) : update }), group);
  }
  function endEditGroup() { timeline.current.group = undefined; }
  function undo() { timeline.current = travelHistory(timeline.current, "undo"); publish(rebaseSnapshot(timeline.current.present, base.current.revision, base.current.editorRevision)); timeline.current.present = rebaseSnapshot(timeline.current.present, base.current.revision, base.current.editorRevision); }
  function redo() { timeline.current = travelHistory(timeline.current, "redo"); publish(rebaseSnapshot(timeline.current.present, base.current.revision, base.current.editorRevision)); timeline.current.present = rebaseSnapshot(timeline.current.present, base.current.revision, base.current.editorRevision); }
  function discard() { timeline.current = { past: [], present: savedDocument.current, future: [] }; publish(savedDocument.current); }
  function changeInput(value: JsonValue) { setInput(value); inputRef.current = value; setInputDirty(true); setInputInvalid(""); edits.current += 1; setDiagnostics(current => current.filter(item => item.scope !== "input")); setNotice(""); if (!submitUnknown) setError(""); }
  function replaceInput(value: JsonValue) { changeInput(value); setInputResetVersion(current => current + 1); }
  function clearInvocationInput() { replaceInput({}); setInputDirty(false); }
  async function operation<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (operationRunning.current) return undefined;
    if (authenticationInterrupted.current) return undefined;
    operationRunning.current = true; setBusy(true); setError(""); setNotice("");
    try { return await action(); } catch (reason) {
      setFailure({ message: workflowErrorMessage(reason), code: reason instanceof ApiRequestError ? reason.code : undefined });
      if (reason instanceof ApiRequestError && reason.details && typeof reason.details === "object" && "diagnostics" in reason.details && Array.isArray(reason.details.diagnostics)) setDiagnostics(reason.details.diagnostics as WorkflowDiagnostic[]);
      return undefined;
    } finally { operationRunning.current = false; setBusy(false); changePreparationStage(null); }
  }
  const save = useCallback(async (snapshot = timeline.current.present) => {
    requireAuthentication();
    const changed = snapshotChanges(snapshot, savedDocument.current).definitionDirty;
    const saved = changed ? await workflowApiV2.save(snapshot.definition, snapshot.editor, base.current.revision, base.current.editorRevision) : { ...(await workflowApiV2.saveEditor(snapshot.editor, base.current.editorRevision)), workflowId: snapshot.definition.workflowId, revision: base.current.revision };
    base.current = { revision: saved.revision, editorRevision: saved.editorRevision };
    savedDocument.current = rebaseSnapshot(snapshot, saved.revision, saved.editorRevision);
    timeline.current = { ...timeline.current, present: rebaseSnapshot(timeline.current.present, saved.revision, saved.editorRevision), group: undefined };
    setDefinition(timeline.current.present.definition); setEditor(timeline.current.present.editor);
    // A run may save an earlier snapshot after preflight while the user already edits a newer draft.
    const changes = snapshotChanges(timeline.current.present, savedDocument.current);
    setDirty(changes.dirty); setDefinitionDirty(changes.definitionDirty);
    return saved;
  }, []);
  function saveDocument(options?: { silent?: boolean }) { return operation(async () => { const saved = await save(); if (!options?.silent) setNotice(`已保存修订 ${saved.revision}。`); return saved; }); }
  function restoreDocument(snapshot: EditorSnapshot) { return operation(async () => {
    const previous = timeline.current.present;
    const candidate = structuredClone(snapshot);
    if (candidate.definition.workflowId !== activeWorkflowId || candidate.editor.workflowId !== activeWorkflowId) throw new Error("恢复版本的工作流身份不一致，请重新选择版本。");
    requireAuthentication();
    // Restore is always a new immutable Definition revision. Do not publish the
    // candidate, clear redo, or move the saved baseline until the server accepts it.
    const saved = await workflowApiV2.save(candidate.definition, candidate.editor, base.current.revision, base.current.editorRevision);
    base.current = { revision: saved.revision, editorRevision: saved.editorRevision };
    savedDocument.current = rebaseSnapshot(candidate, saved.revision, saved.editorRevision);
    const newerDraft = timeline.current.present !== previous;
    timeline.current = newerDraft
      ? { ...timeline.current, present: rebaseSnapshot(timeline.current.present, saved.revision, saved.editorRevision), group: undefined }
      : recordEdit(timeline.current, savedDocument.current);
    publish(timeline.current.present);
    setNotice(newerDraft ? `已恢复为修订 ${saved.revision}；等待期间的新修改仍保留为未保存草稿。` : `已恢复为新修订 ${saved.revision}。外部调用数据保持不变。`);
    return saved;
  }); }
  function validate() { return operation(async () => {
    const generation = edits.current;
    const result = await workflowApiV2.validateDraft(timeline.current.present.definition, environmentRef, inputInvalid ? undefined : input, generation);
    if (generation !== edits.current) { setNotice("内容已变化，旧校验结果未应用。请重新校验。"); return result; }
    setDiagnostics(result.diagnostics);
    if (inputInvalid) setError(inputInvalid);
    setNotice(result.valid && !inputInvalid ? "图与当前输入校验通过；实际执行仍可能遇到网络或工具错误。" : "校验未通过，请点击问题定位并修正。"); return result;
  }); }
  function startRun(saveChanges = false) { return operation(async () => {
    if (submitUnknown || pendingRunRequest.current) { setError("上次提交状态尚未确认，请先确认原请求再提交新的输入。"); return; }
    if (inputInvalid) { rejectRunPreparation(inputInvalid); return; }
    if (dirty && !saveChanges) { rejectRunPreparation("当前有未保存修改，请选择保存并运行。"); return; }
    const snapshot = timeline.current.present;
    const generation = edits.current;
    const runInput = structuredClone(input);
    const runEnvironment = environmentRef;
    clearRunObservation(); setRunPreparationFailure(null); changePreparationStage("preflight");
    let validated;
    try { validated = await workflowApiV2.validateDraft(snapshot.definition, runEnvironment, runInput, edits.current); }
    catch (reason) { setRunPreparationFailure("preflight"); throw reason; }
    requireAuthentication();
    if (!validated.valid) { setRunPreparationFailure("preflight"); if (generation === edits.current) setDiagnostics(validated.diagnostics); setError("未启动运行：提交时的配置或输入有问题，请重新校验当前内容。"); return; }
    let saved;
    if (dirty) changePreparationStage("save");
    try { saved = dirty ? await save(snapshot) : { revision: snapshot.definition.revision }; }
    catch (reason) { setRunPreparationFailure("save"); throw reason; }
    requireAuthentication();
    const request = { workflowId: activeWorkflowId, revision: saved.revision, input: runInput, environmentRef: runEnvironment, launchContext, variableEnvironmentId: variableEnvironmentRef.current ?? undefined };
    const fingerprint = JSON.stringify(request);
    pendingRunRequest.current = { fingerprint, key: crypto.randomUUID() };
    changePreparationStage("submit");
    const attempt = pendingRunRequest.current;
    try {
      const created = await workflowApiV2.createRun(activeWorkflowId, saved.revision, runInput, runEnvironment, pendingRunRequest.current.key, launchContext, variableEnvironmentRef.current ?? undefined);
      pendingRunRequest.current = null; setSubmitUnknown(false);
      if (JSON.stringify(inputRef.current) === JSON.stringify(runInput)) setInputDirty(false);
      clearRunObservation("current"); setObservedRunId(created.historyExpired ? null : created.runId);
      if(created.historyExpired)setNotice("该请求已执行，运行历史已清理；没有重新执行。");else setRunNotice({runId:created.runId,text:runSubmittedNotice});
    } catch (reason) {
      // An explicit runner-offline rejection proves that no Run was created; it is not
      // an uncertain transport failure and must surface its own plain explanation.
      const definitive = reason instanceof ApiRequestError && (reason.code === "WORKFLOW_RUNNER_OFFLINE" || reason.status < 500 && reason.status !== 408);
      if (!definitive) { setSubmitUnknown(true); setError("提交状态待确认：网络响应中断，请确认原请求，避免重复执行。"); }
      else { if (reason.status === 401) onRecoverySubmissionRejected?.(attempt.key); pendingRunRequest.current = null; setSubmitUnknown(false); setRunPreparationFailure("submit"); throw reason; }
    }
  }); }
  function confirmSubmission() { return operation(async () => {
    const pending = pendingRunRequest.current; if (!pending) return;
    const request = JSON.parse(pending.fingerprint) as { workflowId: string; revision: number; input: JsonValue; environmentRef: string; launchContext?: WorkflowLaunchContext; variableEnvironmentId?: string };
    const created = await workflowApiV2.createRun(request.workflowId, request.revision, request.input, request.environmentRef, pending.key, request.launchContext, request.variableEnvironmentId);
    if (JSON.stringify(inputRef.current) === JSON.stringify(request.input)) setInputDirty(false);
    pendingRunRequest.current = null; setSubmitUnknown(false); clearRunObservation("current"); setObservedRunId(created.historyExpired ? null : created.runId); setObservationEpoch(current => current + 1); if(created.historyExpired)setNotice("原提交的运行历史已清理；没有重复执行。");else setRunNotice({runId:created.runId,text:"已确认原提交；没有创建重复运行。"});
  }); }
  function selectRun(record: WorkflowRunV2) { if (cancelPendingRunId) setNotice(""); clearRunObservation("history"); setRun(record); setObservedRunId(record.runId); observationThread.current=record.threadId??null; setObservationEpoch(current => current + 1); }
  function selectThread(thread:WorkflowThreadV2){
    clearRunObservation('current');observationThread.current=thread.threadId;setThreadView(thread);setObservedRunId(thread.currentRunId);setObservationEpoch(value=>value+1);
  }
  async function resumeThread(thread:WorkflowThreadV2,responses:Record<string,JsonValue>){
    if(thread.currentRunId!==observationIdentity.current.runId){setError('已切换运行，请在当前等待节点重新回应。');return false;}
    const generation=observationGeneration.current;
    const result=await operation(async()=>{
      const created=await workflowApiV2.resumeThread(thread.threadId,thread.checkpointId,responses,thread.currentRunId);
      requireAuthentication();if(generation!==observationGeneration.current)return true;clearRunObservation('current');observationThread.current=thread.threadId;setObservedRunId(created.historyExpired?null:created.runId);setObservationEpoch(current=>current+1);
      setNotice('');if(created.historyExpired)setNotice('原恢复请求已处理，运行历史已清理；没有重复执行。');else setRunNotice({runId:created.runId,text:'已提交恢复，将沿用原流程版本继续执行。'});return true;
    });return Boolean(result);
  }
  function cancel() { return operation(async () => {
    if(!run&&threadView&&threadView.currentRunId===observationIdentity.current.runId){await workflowApiV2.cancelThread(threadView.threadId);setThreadView(await workflowApiV2.thread(threadView.threadId));return;}
    if (!run || terminal.has(run.status)) return;
    const cancellingRunId = run.runId;
    const generation = observationGeneration.current;
    const stillObserved = () => generation === observationGeneration.current && observationIdentity.current.runId === cancellingRunId;
    let accepted = false;
    setCancelPendingRunId(cancellingRunId);
    setRunNotice({runId:cancellingRunId,text:"正在提交取消请求；是否停止以运行状态为准，已发生的外部操作可能仍有效。"});
    try {
      await workflowApiV2.cancel(cancellingRunId);
      accepted = true;
      if (stillObserved()) setRunNotice({runId:cancellingRunId,text:"取消请求已受理，正在确认最终状态。"});
      const latest = await workflowApiV2.run(cancellingRunId);
      if (stillObserved()) setRun(latest);
    } finally {
      setCancelPendingRunId(null);
      if (!accepted && stillObserved()) setRunNotice(null);
    }
  }); }
  function discover(connectorRef: string) { return operation(async () => { const result = await workflowApiV2.discover(environmentRef, connectorRef); setTools(result.items); setNotice("已读取实际工具目录。"); }); }
  async function reloadEnvironments() {
    setInitialLoadStatus("loading");
    setEnvironmentError("");
    try {
      const items = (await workflowApiV2.environments()).items;
      setEnvironments(items);
      setEnvironmentRef(current => current || items[0]?.environmentRef || "");
      setInitialLoadStatus("ready");
    } catch (reason) {
      setInitialLoadStatus("failed");
      setEnvironmentError(workflowErrorMessage(reason));
      throw reason;
    }
  }
  const setVariableEnvironment = (id: string | null) => { variableEnvironmentRef.current = id; };
  const refreshEnvironments = () => operation(reloadEnvironments);
  const refreshTools = () => loadTools(environmentRef);
  const refreshEnvironmentResources = () => operation(async () => {
    await reloadEnvironments();
    await loadTools(environmentChoice.current);
  });
  return { definition, editor, observedRunId, observedThreadId: observationThread.current, threads, threadsError, historyExpired, currentThread:threadView?.currentRunId===observedRunId?threadView:null, threadView, selectThread, exitObservation:()=>clearRunObservation(), captureSessionRecovery, editDefinition, editEditor, editDocument, endEditGroup, undo, redo, discard, canUndo: historyVersion >= 0 && timeline.current.past.length > 0, canRedo: timeline.current.future.length > 0, definitionDirty, inputDirty, inputInvalid, setInputInvalid: changeInputInvalid, submitUnknown, confirmSubmission, runPreparationFailure, runPreparationStage, awaitingRunRecord: Boolean(observedRunId) && !run && !historyExpired, dirty, busy, cancelPending: cancelPendingRunId !== null && cancelPendingRunId === run?.runId, error, saveConflict: failure.code === "REVISION_CONFLICT", notice:runNotice?.runId===observedRunId&&!terminal.has(run?.status??"")?runNotice.text:notice, setError, diagnostics, environments, initialLoadStatus, environmentError, environmentRef, setEnvironmentRef: changeEnvironment, tools, toolsLoading, input, setInput: changeInput, replaceInput, clearInvocationInput, inputResetVersion, run, runOrigin, runSnapshot, events, steps, observationComplete, history, refreshEnvironments, setVariableEnvironment, refreshTools, refreshEnvironmentResources, saveDocument, restoreDocument, rejectRunPreparation, validate, startRun, selectRun, resumeThread, cancel, discover, operation };
}
