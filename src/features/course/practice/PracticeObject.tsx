import {
  AlertTriangle, ArrowRight, Check, ChevronDown, FileText, GitBranch,
  Link2, Lock, Maximize2, Paperclip, Plus, RotateCcw, Search, Send, Upload, X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import type { MockSession } from "@/features/auth/types";
import { courseAssignmentEligibility } from "@/features/course/assignmentExperience";
import type { CourseAssignment } from "@/features/course/types";
import { workflowLaunchUrl } from "@/features/learning/progress/progressService";
import { workflowApiV2 } from "@/features/workflow/application/v2/useWorkflowV2Controller";
import type { WorkflowRevisionSummary, WorkflowSummaryV2 } from "@/features/workflow/domain/v2/types";
import { WorkflowCreateDialog } from "@/features/workflow/pages/WorkflowCreateDialog";
import { uploadEvidence } from "@/features/evidence/evidenceClient";
import { apiRequest } from "@/shared/api/apiClient";
import type { AssignmentAttemptResult, AssignmentResponse } from "@/shared/learning/assignmentAttempt";
import { ObjectShell, ObjectShellSection } from "@/shared/ui/ObjectShell";
import { Button } from "@/shared/ui/Button";
import { Pill } from "@/shared/ui/Pill";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import { Textarea, TextField } from "@/shared/ui/Field";
import {
  buildPracticeResponse, canSubmitPractice, evaluatorOptions, practiceAttemptKicker, practiceChecklist, practiceChecklistCounts,
  practiceCompatibility, practiceOutcomeView, practiceResultActions, practiceViewState, type PracticeDraft, type PracticeEvaluator
} from "./practiceModel";
import "./practice.css";

type LoadedResult = AssignmentAttemptResult & {
  attemptNumber?: number;
  accepted: boolean;
  feedback: { code: string; message: string };
  evaluatedAt: string;
  response: AssignmentResponse;
};

const emptyDraft: PracticeDraft = { note: "", link: "", attachmentIds: [], attachmentNames: [] };

export type PracticeObjectProps = {
  session: MockSession;
  courseId: string;
  assignmentId: string;
  size: "panel" | "immersive";
  onClose?: () => void;
  onOpenImmersive?: () => void;
  onReturn?: () => void;
};

/**
 * One practice object for the Home side panel and the assignment immersive
 * route. It keeps the real Attempt/PerformanceResult authorities: the client
 * never chooses pass/fail and the AI evaluator path never writes.
 */
export function PracticeObject({ session, courseId, assignmentId, size, onClose, onOpenImmersive, onReturn }: PracticeObjectProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const actionRunId = searchParams.get("actionRunId") || undefined;
  const repeatAttemptId = searchParams.get("repeatAttemptId") || undefined;
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
  const compatibility = practiceCompatibility(assignment);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<LoadedResult | null>(null);
  const [latestAttemptNumber, setLatestAttemptNumber] = useState<number | undefined>(undefined);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [resultError, setResultError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [evaluator, setEvaluator] = useState<PracticeEvaluator>("teacher");
  const [draft, setDraft] = useState<PracticeDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewResult, setPreviewResult] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submittedOpen, setSubmittedOpen] = useState(false);
  const [workPicker, setWorkPicker] = useState(false);
  const [works, setWorks] = useState<WorkflowSummaryV2[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [worksError, setWorksError] = useState("");
  const [workQuery, setWorkQuery] = useState("");
  const [workRefresh, setWorkRefresh] = useState(0);
  const [linkedWork, setLinkedWork] = useState<WorkflowSummaryV2 | null>(null);
  const [linkedVersion, setLinkedVersion] = useState("latest");
  const [revisions, setRevisions] = useState<Record<string, WorkflowRevisionSummary[]>>({});
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [pickerWorkId, setPickerWorkId] = useState<string | null>(null);
  const [pickerRevision, setPickerRevision] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedAt, setSavedAt] = useState(() => new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const submissionKey = useRef(crypto.randomUUID());
  const draftKey = `eduflow.practice-draft:${session.userId}:${courseId}:${assignmentId}`;

  useEffect(() => applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    let live = true;
    setResultLoaded(false); setResultError(""); setResult(null); setLatestAttemptNumber(undefined);
    void applicationServices.learnerStateService.getAssignmentResult(courseId, assignmentId, actionRunId)
      .then(({ result: value }) => {
        if (!live) return;
        const attemptNumber = typeof value?.attemptNumber === "number" ? value.attemptNumber : undefined;
        if (attemptNumber) setLatestAttemptNumber(attemptNumber);
        setResult(value && value.attemptId !== repeatAttemptId ? value as LoadedResult : null);
      })
      .catch(() => { if (live) setResultError("已保存的实践结果暂时无法读取，请重试。"); })
      .finally(() => { if (live) setResultLoaded(true); });
    return () => { live = false; };
  }, [courseId, assignmentId, actionRunId, repeatAttemptId, revision]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const value = JSON.parse(raw) as Partial<PracticeDraft>;
      if (typeof value.note !== "string" || typeof value.link !== "string") return;
      setDraft({ ...emptyDraft, ...value, attachmentIds: Array.isArray(value.attachmentIds) ? value.attachmentIds.slice(0, 4) : [], attachmentNames: Array.isArray(value.attachmentNames) ? value.attachmentNames.slice(0, 4) : [] });
    } catch { /* draft restore is best effort */ }
  }, [draftKey]);

  useEffect(() => {
    if (!resultLoaded) return;
    const timer = setTimeout(() => {
      try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* storage may be unavailable */ }
      setSavedAt(new Date());
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, draftKey, resultLoaded]);

  useEffect(() => {
    if (!workPicker || !works.length) return;
    let live = true;
    setRevisionsLoading(true);
    void Promise.all(works.slice(0, 8).map(async (work) => {
      try {
        const page = await workflowApiV2.revisions(work.workflowId);
        return [work.workflowId, page.items] as const;
      } catch {
        return [work.workflowId, [{ revision: work.revision, name: work.name, createdAt: work.updatedAt ?? "", definitionHash: "", availability: "available" as const }]] as const;
      }
    })).then((entries) => { if (live) setRevisions(Object.fromEntries(entries)); }).finally(() => { if (live) setRevisionsLoading(false); });
    return () => { live = false; };
  }, [workPicker, works]);

  useEffect(() => {
    if (!workPicker) return;
    const first = works[0];
    const selected = works.find((item) => item.workflowId === pickerWorkId);
    if (first && !selected) { setPickerWorkId(first.workflowId); setPickerRevision(first.revision); }
  }, [pickerWorkId, workPicker, works]);

  useEffect(() => {
    if (!confirming && !workPicker && !previewOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (confirming) setConfirming(false);
      else if (workPicker) setWorkPicker(false);
      else setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming, previewOpen, workPicker]);

  useEffect(() => {
    if (!repeatAttemptId || actionRunId) return;
    let live = true;
    void apiRequest("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-assignment", courseId, assignmentId, repeatAttemptId }) })
      .then(() => refreshLearnerState(session.userId))
      .catch(() => { if (live) setResultError("再次实践暂时无法启动，请稍后重试。"); });
    return () => { live = false; };
  }, [actionRunId, assignmentId, courseId, repeatAttemptId, session.userId]);

  useEffect(() => {
    if (!workPicker) return;
    let live = true;
    setWorksLoading(true); setWorksError("");
    void workflowApiV2.listPage({ search: workQuery, scope: "all", sort: "updated", page: 1, pageSize: 24 })
      .then((page) => { if (live) setWorks(page.items.filter((item) => !item.archived)); })
      .catch(() => { if (live) setWorksError("作品暂时无法加载，请重试。"); })
      .finally(() => { if (live) setWorksLoading(false); });
    return () => { live = false; };
  }, [workPicker, workQuery, workRefresh]);

  useEffect(() => {
    if (size !== "immersive" || typeof window === "undefined") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || confirming || workPicker || previewOpen) return;
      event.preventDefault();
      if (onReturn) onReturn(); else navigate(`/courses/${encodeURIComponent(courseId)}`);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming, courseId, navigate, onReturn, previewOpen, size, workPicker]);

  const knowledge = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const courseState = applicationServices.learningProgressRepository.getCourseState(session.userId, courseId);
  const eligibility = runtime && assignment ? courseAssignmentEligibility(runtime, assignment.id, knowledge, courseState) : null;
  const coverages = runtime?.assignmentCoverages.filter((item) => item.assignmentId === assignmentId) ?? [];
  const nodeTitle = useMemo(() => new Map(applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)).nodes.map((node) => [node.id, node.title])), [revision, session.userId]);
  const hasResult = Boolean(result) || previewResult;
  const viewState = practiceViewState({ compatibility, hasResult, confirming });
  const canSubmit = canSubmitPractice(compatibility);
  const response = buildPracticeResponse(compatibility, draft);
  const ready = Boolean(response);
  const submitting = busy || uploading;

  if (!runtime || !assignment) {
    return <ObjectShell size={size === "immersive" ? "immersive" : "panel"} title="实践不存在" kicker="实践" context="页面数据" stage={<p className="ef-practice-empty">当前课程或实践不存在，无法开始提交。</p>}><p className="ef-practice-empty">当前课程或实践不存在，无法开始提交。</p></ObjectShell>;
  }

  const courseTitle = runtime.course.title;
  const chapter = runtime.chapters.find((item) => coverages.some((coverage) => {
    const lesson = runtime.lessons.find((lessonItem) => lessonItem.id === runtime.curriculumCoverages.find((entry) => entry.nodeId === coverage.nodeId)?.lessonId);
    return lesson?.chapterId === item.id;
  }));
  const linkedVersionLabel = linkedWork ? `v${linkedVersion} · 提交时保存（预览）` : "";

  function pickWork(item: WorkflowSummaryV2) {
    const revision = pickerRevision ?? item.revision;
    setLinkedWork(item);
    setLinkedVersion(String(revision));
    setWorkPicker(false);
    setDraft((current) => ({ ...current, linkedWorkName: item.name, linkedWorkVersion: `v${revision} · 提交时保存（预览）` }));
  }

  async function attach(file: File) {
    if (draft.attachmentIds.length >= 4) { setError("每次实践最多选择 4 份附件。"); return; }
    setUploading(true); setError(""); setUploadProgress("正在上传…");
    try {
      const id = await uploadEvidence(file, { courseId, assignmentId, actionRunId });
      setDraft((current) => ({ ...current, attachmentIds: [...current.attachmentIds, id].slice(0, 4), attachmentNames: [...current.attachmentNames, file.name].slice(0, 4) }));
      setUploadProgress("已保存原始文件");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败，请重试。");
      setUploadProgress("");
    } finally { setUploading(false); }
  }

  function removeAttachment(index: number) {
    setDraft((current) => ({
      ...current,
      attachmentIds: current.attachmentIds.filter((_, itemIndex) => itemIndex !== index),
      attachmentNames: current.attachmentNames.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function submit() {
    if (submitting || !ready) return;
    if (evaluator === "ai") {
      setPreviewResult(true);
      setConfirming(false);
      return;
    }
    setBusy(true); setError("");
    try {
      if (!courseState.assignmentStates[assignmentId] && eligibility?.canStart) {
        await applicationServices.learnerStateService.startAssignment(courseId, assignmentId, actionRunId, true);
        await refreshLearnerState(session.userId);
      }
      const payload = response;
      if (!payload) throw new Error("请填写备注、链接或上传至少一份文件。");
      const submitted = await applicationServices.learnerStateService.submitAssignment(courseId, assignmentId, payload, submissionKey.current, actionRunId, true);
      setResult({ ...submitted, attemptNumber: (latestAttemptNumber ?? 0) + 1, response: payload, evaluatedAt: new Date().toISOString() } as LoadedResult);
      setConfirming(false);
      await refreshLearnerState(session.userId).catch(() => undefined);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败，未确认保存结果。请检查网络后重试。");
    } finally { setBusy(false); }
  }

  function practiceAgain() {
    if (previewResult) {
      setPreviewResult(false); setConfirming(false); setPreviewOpen(false); setDraft(emptyDraft); setError("");
      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      return;
    }
    if (actionRunId) {
      setBusy(true);
      void apiRequest<{ runs: import("@/features/actions/model").ActionRun[] }>(`/api/edge-actions?courseId=${encodeURIComponent(courseId)}`)
        .then(async (history) => {
          const old = history.runs.find((run) => run.id === actionRunId && run.status === "completed");
          if (!old) throw new Error("本次执行尚未完成，请重新读取正式结果。");
          const next = await apiRequest<{ run: import("@/features/actions/model").ActionRun }>("/api/edge-actions", { method: "POST", body: JSON.stringify({ action: "select", courseId, actionId: old.action_id, selectionKey: crypto.randomUUID(), repeatRunId: old.id }) });
          navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}?actionRunId=${encodeURIComponent(next.run.id)}`);
        })
        .catch((againError) => setError(againError instanceof Error ? againError.message : "再次实践暂未启动，请重试。"))
        .finally(() => setBusy(false));
      return;
    }
    const latest = result?.attemptId;
    if (!latest) return;
    setPreviewResult(false); setResult(null); setConfirming(false); setPreviewOpen(false); setDraft(emptyDraft); setError("");
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}?repeatAttemptId=${encodeURIComponent(latest)}`);
  }

  const checklist = practiceChecklist(draft);
  const checklistCounts = practiceChecklistCounts(checklist);
  const savedLabel = savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const pickerWork = works.find((item) => item.workflowId === pickerWorkId) ?? works[0] ?? null;

  const requirements = <div className="ef-practice-requirements">
    <ObjectShellSection icon={<FileText size={15} />} title="要求" description={`${coverages.length} 个关联知识`} actions={<Pill tone={checklistCounts.attached === checklistCounts.total ? "ok" : "quiet"}>{checklistCounts.attached} / {checklistCounts.total} 已附</Pill>}>
      <p className="ef-practice-goal">{assignment.description}</p>
      <div className="ef-practice-deliverables" aria-label="交付物检查清单">
        {checklist.filter((item) => item.required).map((item) => <div key={item.id} className={`ef-practice-deliverable ${item.done ? "is-done" : ""}`}>
          <span className="ef-practice-deliverable-check" aria-hidden="true">{item.done ? <Check size={12} /> : null}</span>
          <span className="ef-practice-deliverable-copy"><b>{item.label}</b><small>{item.detail}</small></span>
          <span className="ef-practice-deliverable-state">{item.done ? "已附" : item.required ? "必交" : "可选"}</span>
        </div>)}
      </div>
      {assignment.requirements.length ? <details className="ef-practice-req-more"><summary>任务要求 · {assignment.requirements.length} 条</summary><ul>{assignment.requirements.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
      <div className="ef-practice-score-line"><span>验收标准 {assignment.acceptanceCriteria.length || 1} 项</span><span aria-hidden="true">·</span><span>预期输出 {assignment.expectedOutput}</span></div>
    </ObjectShellSection>
    <details className="ef-practice-details" open={detailsOpen} onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary><ChevronDown size={14} aria-hidden="true" />详情</summary>
      <p>评估由教师完成；结果以老师给出的结论为准。</p>
      {chapter ? <p>课程章节：{chapter.title}</p> : null}
      <dl className="ef-practice-facts">
        <div><dt>预期输出</dt><dd>{assignment.expectedOutput}</dd></div>
        <div><dt>验收标准</dt><dd>{assignment.acceptanceCriteria.join("；") || "由评估者依据任务要求评价"}</dd></div>
        <div><dt>关联知识</dt><dd>{coverages.map((coverage) => nodeTitle.get(coverage.nodeId) ?? coverage.nodeId).join("、") || "无"}</dd></div>
      </dl>
    </details>
  </div>;

  const evaluatorSection = <fieldset className="ef-practice-evaluator">
    <legend>提交给</legend>
    {evaluatorOptions.map((option) => <label key={option.id} className={`ef-practice-evaluator-option ${evaluator === option.id ? "is-selected" : ""}`}>
      <input type="radio" name="practice-evaluator" value={option.id} checked={evaluator === option.id} onChange={() => setEvaluator(option.id)} />
      <span className="ef-practice-radio" aria-hidden="true" />
      <span className="ef-practice-evaluator-copy"><strong>{option.label}{option.preview ? <PreviewBadge /> : null}</strong><small>{option.detail}</small></span>
    </label>)}
  </fieldset>;

  const submissionItems = <ul className="ef-practice-submission-list">
    {linkedWork ? <li><GitBranch size={15} aria-hidden="true" /><span><strong>作品 · {linkedWork.name}</strong><small>{linkedVersionLabel} · 工作流 {linkedWork.nodeCount ?? 0} 个节点</small></span><Pill tone="quiet">已选</Pill></li> : null}
    {draft.attachmentNames.map((name, index) => <li key={`${name}:${index}`}><Paperclip size={15} aria-hidden="true" /><span><strong>{name}</strong><small>本人已上传原始文件</small></span><Pill tone="quiet">已附</Pill></li>)}
    {draft.link.trim() ? <li><Link2 size={15} aria-hidden="true" /><span><strong>{draft.link.trim()}</strong><small>外部链接会随这次尝试一起保存</small></span><Pill tone="quiet">已附</Pill></li> : null}
    {draft.note.trim() ? <li><FileText size={15} aria-hidden="true" /><span><strong>备注</strong><small>{draft.note.trim().slice(0, 160)}</small></span><Pill tone="quiet">已附</Pill></li> : null}
  </ul>;

  const confirmOverlay = <div className="ef-practice-confirm ef-practice-overlay-card" role="dialog" aria-modal="true" aria-labelledby="practice-confirm-title">
    <div className="ef-practice-confirm-head">
      <span className="ef-practice-overlay-kicker">提交确认 · 本次尝试</span>
      <h3 id="practice-confirm-title">确认提交这次实践？</h3>
      <p>以下内容会随这次尝试一起提交，提交后不可修改，也不能撤回。如需调整，请返回修改。</p>
    </div>
    {submissionItems}
    <p className="ef-practice-warning" role="note"><AlertTriangle size={15} aria-hidden="true" />提交后不可修改，也不能撤回。如需调整，只能开始新的尝试。</p>
    {evaluatorSection}
    {error ? <p className="ef-practice-error" role="alert">{error}</p> : null}
    <div className="ef-practice-overlay-actions">
      <Button variant="secondary" onClick={() => setConfirming(false)}>返回修改</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()} disabled={!ready}>确认提交<Send size={15} /></Button>
    </div>
  </div>;

  const workPickerOverlay = <div className="ef-practice-work-picker ef-practice-overlay-card" role="dialog" aria-modal="true" aria-labelledby="practice-pick-title">
    <div className="ef-practice-work-picker-head">
      <div><span className="ef-practice-overlay-kicker">{assignment.title} · 本次尝试</span><h3 id="practice-pick-title">从我的作品选择</h3></div>
      <button type="button" className="ef-home-icon" aria-label="关闭作品选择" onClick={() => setWorkPicker(false)}><X size={14} /></button>
    </div>
    <TextField aria-label="搜索作品" placeholder="搜索作品" value={workQuery} onChange={(event) => setWorkQuery(event.target.value)} icon={<Search size={15} />} />
    <div className="ef-practice-work-results">
      {worksLoading ? <p role="status">正在加载作品…</p> : worksError ? <p role="alert">{worksError}<button type="button" onClick={() => setWorkRefresh((value) => value + 1)}>重试</button></p> : works.map((item) => <article className={`ef-practice-pick-work ${item.workflowId === pickerWork?.workflowId ? "is-selected" : ""}`} key={item.workflowId}>
        <span className="ef-practice-pick-icon" aria-hidden="true"><GitBranch size={16} /></span>
        <div className="ef-practice-pick-main">
          <b title={item.name}>{item.name}</b>
          <span>工作流 · {item.nodeCount ?? 0} 个节点</span>
          <div className="ef-practice-versions" role="radiogroup" aria-label={`${item.name} 版本`}>
            {(revisions[item.workflowId] ?? [{ revision: item.revision, name: item.name, createdAt: item.updatedAt ?? "", definitionHash: "", availability: "available" as const }]).map((revision) => <label key={revision.revision} className={`ef-practice-version-option ${item.workflowId === pickerWork?.workflowId && revision.revision === pickerRevision ? "is-selected" : ""}`}>
              <input type="radio" name="practice-work-version" checked={item.workflowId === pickerWork?.workflowId && revision.revision === pickerRevision} onChange={() => { setPickerWorkId(item.workflowId); setPickerRevision(revision.revision); }} />
              <b>v{revision.revision}</b>
              <span>{formatTime(revision.createdAt)}</span>
            </label>)}
          </div>
        </div>
      </article>)}
      {!worksLoading && !worksError && !works.length ? <p>没有匹配的作品。可以新建一个工作流并关联。</p> : null}
    </div>
    <div className="ef-practice-pick-foot">
      <span>选中的版本会在提交时保存，之后修改作品不影响这次提交。<PreviewBadge />版本与保存为预览。</span>
      <Button variant="primary" size="32" disabled={!pickerWork || !pickerRevision} onClick={() => pickerWork && pickWork(pickerWork)}>选择 v{pickerRevision ?? pickerWork?.revision ?? 1}</Button>
    </div>
    {revisionsLoading ? <p className="ef-practice-note" role="status">正在读取作品版本…</p> : null}
  </div>;

  const previewOverlay = <div className="ef-practice-confirm ef-practice-overlay-card" role="dialog" aria-modal="true" aria-labelledby="practice-preview-title">
    <div className="ef-practice-confirm-head">
      <span className="ef-practice-overlay-kicker">预览 · 本次提交</span>
      <h3 id="practice-preview-title">提交内容预览</h3>
      <p>只读预览；确认提交后这些内容会保存为只读记录。</p>
    </div>
    {submissionItems}
    <div className="ef-practice-overlay-actions">
      <Button variant="secondary" onClick={() => setPreviewOpen(false)}>返回修改</Button>
    </div>
  </div>;

  const draftSection = <ObjectShellSection icon={<GitBranch size={15} />} title="我的提交草稿" description="只有你可见" actions={<Pill tone="quiet">草稿</Pill>}>
    <div className="ef-practice-work">
      {linkedWork ? <div className="ef-practice-linked-work">
        <GitBranch size={18} aria-hidden="true" />
        <div className="ef-practice-linked-copy"><strong>{linkedWork.name}</strong><small>工作流 · {linkedWork.nodeCount ?? 0} 个节点 · 已关联本次实践</small><span>{linkedVersionLabel}<PreviewBadge /></span></div>
        <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => setWorkPicker(true)}>更换</button>
      </div> : <div className="ef-practice-work-actions">
        <Button variant="primary" size="32" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setCreateOpen(true)}>新建工作流并关联</Button>
        <Button variant="secondary" size="32" icon={<Search size={15} aria-hidden="true" />} onClick={() => setWorkPicker(true)}>从我的作品选择</Button>
      </div>}
    </div>
    <div className="ef-practice-attachment-row">
      {draft.attachmentNames.map((name, index) => <span className="ef-practice-file" key={`${name}:${index}`}><Paperclip size={13} aria-hidden="true" /><span title={name}>{name}</span><button type="button" aria-label={`移除 ${name}`} onClick={() => removeAttachment(index)}><X size={12} /></button></span>)}
      <label className={`ef-practice-upload ${uploading ? "is-busy" : ""}`}><Upload size={14} aria-hidden="true" />{uploading ? "上传中…" : "添加附件"}<input type="file" accept=".txt,.md,.csv" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void attach(file); event.target.value = ""; }} /></label>
    </div>
    {uploadProgress ? <small role="status">{uploadProgress}</small> : null}
    <TextField label="作品 / 外部链接" placeholder="https://…（可选）" value={draft.link} onChange={(event) => setDraft((current) => ({ ...current, link: event.target.value }))} icon={<Link2 size={15} />} />
    <Textarea label="提交备注" placeholder="写下复现命令、结果与边界，或说明平台不能执行的部分…" value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} rows={3} />
    <p className="ef-practice-note"><Lock size={13} aria-hidden="true" />支持 UTF-8 的 .txt、.md、.csv，最多 4 份；正式提交后内容才会保存。</p>
    <div className="ef-practice-save"><RotateCcw size={13} aria-hidden="true" />自动保存于 {savedLabel}</div>
  </ObjectShellSection>;

  const draftBody = <div className="ef-practice-draft">
    {size === "panel" ? requirements : null}
    {draftSection}
  </div>;

  const disabledBody = <div className="ef-practice-disabled" role="status">
    <Lock size={20} aria-hidden="true" />
    <div><strong>该实践类型已停用</strong><p>问答类检查已属于微学习，不再作为成果实践。原有记录保持不变，本页只读展示任务说明。</p></div>
    <ObjectShellSection title="任务说明"><p>{assignment.description}</p></ObjectShellSection>
  </div>;

  const workflowBody = <div className="ef-practice-workflow">
    <GitBranch size={22} aria-hidden="true" />
    <h3>在作品画布中完成这次实践</h3>
    <p>这次实践由既有工作流执行环境承载；运行结果仍会保存，画布完成后回到课程路线查看正式结果。</p>
    {assignment.workflowTemplateId ? <Button variant="primary" icon={<ArrowRight size={16} aria-hidden="true" />} onClick={() => navigate(workflowLaunchUrl({ courseId, assignmentId, workflowTemplateId: assignment.workflowTemplateId! }))}>进入工作流画布</Button> : <p className="ef-practice-error">该实践尚未配置可用的工作流模板。</p>}
    {error ? <p className="ef-practice-error" role="alert">{error}</p> : null}
  </div>;

  const resultView = result || previewResult ? practiceOutcomeView({ outcome: result?.outcome, accepted: result?.accepted, preview: previewResult, feedback: result?.feedback.message }) : null;
  const attemptNumber = result?.attemptNumber ?? (repeatAttemptId && latestAttemptNumber ? latestAttemptNumber + 1 : latestAttemptNumber ?? 1);
  const evaluatedLabel = result?.evaluatedAt ? new Date(result.evaluatedAt).toLocaleString("zh-CN") : undefined;
  const submittedText = result ? (result.response.kind === "answer" ? result.response.text : result.response.kind === "code" ? result.response.code ?? result.response.fileName ?? "文件提交" : result.response.kind) : "";
  const attachmentCount = result?.response.attachmentSourceIds?.length ?? 0;
  const previewScore = 76;
  const previewDimensions = [{ label: "功能正确", score: 36, max: 40 }, { label: "可观测性", score: 25, max: 25 }, { label: "异常处理", score: 0, max: 20 }, { label: "代码质量", score: 15, max: 15 }];

  const resultBody = resultView ? <div className="ef-practice-result">
    <div className={`ef-practice-result-hero tone-${resultView.tone}`}>
      {previewResult ? <div className="ef-practice-score-ring" aria-label={`${previewScore} 分`}><div><b>{previewScore}</b><span>/ 100</span></div></div> : <span className="ef-practice-result-icon" aria-hidden="true">{resultView.tone === "accepted" ? <Check size={24} /> : <AlertTriangle size={22} />}</span>}
      <div className="ef-practice-result-copy">
        <div className="ef-practice-result-tags"><Pill tone={resultView.tone === "accepted" ? "ok" : resultView.tone === "revision" ? "warn" : "quiet"} dot>{resultView.label}</Pill>{previewResult ? <PreviewBadge /> : <span className="ef-practice-result-source">教师验收</span>}</div>
        <p>{resultView.detail}</p>
        <div className="ef-practice-result-meta"><span>{previewResult ? "AI 评估 · 预览" : "教师验收"}</span>{evaluatedLabel ? <><span aria-hidden="true">·</span><span>{evaluatedLabel} 返回</span></> : null}{result ? <><span aria-hidden="true">·</span><span>第 {attemptNumber} 次尝试</span></> : null}</div>
      </div>
    </div>
    {previewResult ? <ObjectShellSection icon={<FileText size={15} />} title="评分维度" description={`${previewDimensions.length} 项 · 预览`}>
      <div className="ef-practice-dim-list">{previewDimensions.map((dimension) => <div className="ef-practice-dim" key={dimension.label}>
        <span><b>{dimension.label}</b><em>{dimension.score} / {dimension.max}</em></span>
        <i aria-hidden="true"><b style={{ width: `${dimension.score / dimension.max * 100}%` }} /></i>
      </div>)}</div>
      <p className="ef-practice-note">预览结果只用于体验 AI 评估，不会保存，也不会改变学习记录；正式评估仍由老师完成。</p>
    </ObjectShellSection> : null}
    <ObjectShellSection icon={<FileText size={15} />} title="反馈" description={evaluatedLabel}>
      <p className="ef-practice-feedback">{previewResult ? "这是预览评价，不会保存到正式记录；正式评估仍由老师完成。" : result?.feedback.message ?? "结果已记录。"}</p>
    </ObjectShellSection>
    {result ? <ObjectShellSection icon={<Lock size={15} />} title="提交快照" description={`第 ${attemptNumber} 次尝试 · 只读`} actions={<Pill tone="quiet">只读</Pill>}>
      <dl className="ef-practice-snapshot">
        <div><dt>响应类型</dt><dd>{result.response.kind === "answer" ? "文字 / 附件提交" : result.response.kind === "code" ? "文件 / 链接提交" : result.response.kind}</dd></div>
        <div><dt>提交内容</dt><dd>{submittedText ? submittedText.slice(0, 240) : "仅附件"}</dd></div>
        <div><dt>附件</dt><dd>{attachmentCount ? `${attachmentCount} 份原始文件` : "无"}</dd></div>
        <div><dt>评估者</dt><dd>{previewResult ? "AI 评估（预览，未保存）" : "教师"} · {evaluatedLabel ?? "结果已保存"}</dd></div>
      </dl>
      {submittedOpen ? <p className="ef-practice-note">这次提交的内容已保存为只读记录；再次提交会生成新的尝试。</p> : null}
    </ObjectShellSection> : null}
    {resultError ? <p className="ef-practice-error" role="alert">{resultError}</p> : null}
    {error ? <p className="ef-practice-error" role="alert">{error}</p> : null}
  </div> : null;

  const overlay = workPicker ? workPickerOverlay : confirming ? confirmOverlay : previewOpen ? previewOverlay : undefined;

  let body: ReactNode;
  switch (viewState) {
    case "disabled": body = disabledBody; break;
    case "workflow": body = workflowBody; break;
    case "result": body = resultLoaded ? resultBody : <PracticeSkeleton />; break;
    case "confirm": body = draftBody; break;
    default: body = !resultLoaded ? <PracticeSkeleton /> : draftBody;
  }

  const footer = (() => {
    if (viewState === "disabled") return <div className="ef-practice-footer"><span>只读 · 不会保存</span><Button variant="secondary" onClick={onReturn ?? (() => navigate(`/courses/${encodeURIComponent(courseId)}`))}>返回课程</Button></div>;
    if (viewState === "workflow") return <div className="ef-practice-footer"><span>工作流执行</span><Button variant="secondary" onClick={onReturn ?? (() => navigate(`/courses/${encodeURIComponent(courseId)}`))}>返回课程</Button></div>;
    if (viewState === "result") {
      const actions = practiceResultActions(resultView?.tone ?? "pending", previewResult);
      return <div className="ef-practice-footer"><span>{previewResult ? "预览结果 · 未保存" : "正式结果 · 只读"}</span><div>{actions.showViewSubmission ? <Button variant="secondary" size="32" onClick={() => previewResult ? setPreviewOpen(true) : setSubmittedOpen(true)} disabled={!result && !previewResult}>查看提交</Button> : null}{actions.showPracticeAgain ? <Button variant="primary" size="32" onClick={practiceAgain} disabled={busy}>再次提交<ArrowRight size={14} /></Button> : null}</div></div>;
    }
    return <div className="ef-practice-footer"><span><RotateCcw size={13} aria-hidden="true" />自动保存于 {savedLabel}</span><div><Button variant="secondary" size="32" onClick={() => setPreviewOpen(true)} disabled={!ready}>预览</Button><Button variant="primary" size="32" disabled={!canSubmit || !ready || submitting || (eligibility ? !eligibility.canStart && !courseState.assignmentStates[assignmentId] : false)} onClick={() => setConfirming(true)}>提交<ArrowRight size={14} /></Button></div></div>;
  })();

  const tools = <div className="ef-practice-tools">
    <Pill tone={viewState === "result" ? "ok" : viewState === "disabled" ? "danger" : "quiet"}>{viewState === "result" ? "结果" : viewState === "confirm" ? "确认" : viewState === "disabled" ? "已停用" : viewState === "workflow" ? "画布" : "草稿"}</Pill>
    {size === "panel" && onOpenImmersive ? <button type="button" className="ef-home-icon" onClick={onOpenImmersive} aria-label="沉浸打开实践"><Maximize2 size={15} /></button> : null}
    {onClose ? <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭实践面板"><X size={15} /></button> : null}
  </div>;

  const kicker = <span>{practiceAttemptKicker(attemptNumber)}</span>;
  const context = <span>{courseTitle}{chapter ? ` · ${chapter.title}` : ""} · 约 {assignment.estimatedMinutes ?? 25} 分钟</span>;

  if (size === "immersive") {
    return <main className="ef-practice-page">
      <ObjectShell size="immersive" className="ef-practice-shell" title={assignment.title} kicker={kicker} context={context} tools={tools} overlay={overlay} stage={<>{body}{resultError ? <p className="ef-practice-error" role="alert">{resultError}</p> : null}</>} inspector={<>{requirements}{evaluatorSection}</>} inspectorTitle="任务与评估" footer={footer} />
      {createOpen ? <WorkflowCreateDialog onClose={() => setCreateOpen(false)} onCreated={(id) => {
        setCreateOpen(false);
        void workflowApiV2.listPage({ search: "", scope: "all", sort: "updated", page: 1, pageSize: 24 }).then((page) => {
          const created = page.items.find((item) => item.workflowId === id);
          if (created) pickWork(created);
          else setLinkedWork({ workflowId: id, revision: 1, name: "新建工作流", description: "" });
        }).catch(() => setLinkedWork({ workflowId: id, revision: 1, name: "新建工作流", description: "" }));
      }} /> : null}
    </main>;
  }

  return <ObjectShell size="panel" className="ef-practice-shell" title={assignment.title} kicker={kicker} context={context} tools={tools} footer={footer} overlay={overlay}>
    {body}
    {resultError ? <p className="ef-practice-error" role="alert">{resultError}</p> : null}
    {createOpen ? <WorkflowCreateDialog onClose={() => setCreateOpen(false)} onCreated={(id) => {
      setCreateOpen(false);
      void workflowApiV2.listPage({ search: "", scope: "all", sort: "updated", page: 1, pageSize: 24 }).then((page) => {
        const created = page.items.find((item) => item.workflowId === id);
        if (created) pickWork(created);
        else setLinkedWork({ workflowId: id, revision: 1, name: "新建工作流", description: "" });
      }).catch(() => setLinkedWork({ workflowId: id, revision: 1, name: "新建工作流", description: "" }));
    }} /> : null}
  </ObjectShell>;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未知";
}

function PracticeSkeleton() {
  return <div className="ef-practice-skeleton" role="status" aria-label="正在加载实践"><span /><span /><span /><span /></div>;
}
