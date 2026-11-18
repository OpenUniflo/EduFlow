import { ATTACHMENT_LIMIT } from "@/shared/assistant/attachments";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Clock, FileText, GitBranch, PenLine,
  Link2, LoaderCircle, Lock, Paperclip, Plus, RefreshCw, RotateCcw, Search, Send, Upload, Wrench, X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices, refreshLearnerState } from "@/app/services/applicationServices";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import type { MockSession } from "@/features/auth/types";
import { courseAssignmentEligibility } from "@/features/course/assignmentExperience";
import { createMicroLearningNavigation } from "@/features/learning/micro/microLearning";
import type { CourseAssignment } from "@/features/course/types";
import { workflowLaunchUrl } from "@/features/learning/progress/progressService";
import { workflowApiV2 } from "@/features/workflow/application/v2/useWorkflowV2Controller";
import type { WorkflowRevisionSummary, WorkflowSummaryV2 } from "@/features/workflow/domain/v2/types";
import { WorkflowCreateDialog } from "@/features/workflow/pages/WorkflowCreateDialog";
import { uploadEvidence } from "@/features/evidence/evidenceClient";
import { apiRequest } from "@/shared/api/apiClient";
import { applyAttemptEvaluation, summarizeAssignmentAttempts, type AssignmentAttemptHistoryItem, type AssignmentFeedback, type AssignmentResult } from "@/shared/learning/assignmentAttempt";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { shouldHandleShellEscape } from "@/shared/ui/escapeLayer";
import { ObjectShell, ObjectShellSection } from "@/shared/ui/ObjectShell";
import { Button } from "@/shared/ui/Button";
import { Pill } from "@/shared/ui/Pill";
import { PanelActions } from "@/features/home/PanelActions";
import { Textarea, TextField } from "@/shared/ui/Field";
import {
  aiEvaluationAvailable, buildPracticeResponse, canSubmitPractice, draftFromPracticeResult, evaluatorOptions, practiceAttemptKicker,
  practiceChecklist, practiceChecklistCounts, practiceCompatibility, practiceEvaluatorLabel, practiceOutcomeView, practiceWithdrawConfirmation,
  isLearnerFacingExpectedOutput, learnerAcceptanceCriteria, practiceResultActions, practiceViewState, shouldStartPracticeOnInput,
  type PracticeDraft, type PracticeEvaluator
} from "./practiceModel";
import "./practice.css";

type LoadedResult = AssignmentResult;

const emptyDraft: PracticeDraft = { note: "", link: "", attachmentIds: [], attachmentNames: [] };
type EvaluationPhase = "idle" | "evaluating" | "done" | "failed" | "handed_off";
type NextStep = { title: string; minutes?: number; nodeId?: string; resourceKind: string; resourceId?: string; microPathId?: string };

export type PracticeObjectProps = {
  session: MockSession;
  courseId: string;
  assignmentId: string;
  /** Open one historical submission while keeping the same task panel. */
  attemptId?: string;
  size: "panel" | "immersive";
  onClose?: () => void;
  onReturn?: () => void;
  /** Conversation thread that should receive the submission / result. */
  assistantSessionId?: string;
  onSubmitted?: (attemptId: string) => void;
  /** First-segment / chapter completion is a template conversation event, never a model call. */
  onResultPassed?: (attemptId: string) => void;
  /** The Home panel keeps Micro in the conversation card instead of navigating to immersive. */
  onOpenNextStep?: (step: { nodeId?: string; resourceKind: string; resourceId?: string; microPathId?: string; title: string }) => void;
};

/** Shared confirmation overlay used by submit and withdraw in this object. */
function PracticeConfirmDialog({ titleId, kicker, title, description, children, cancelLabel, confirmLabel, confirmIcon, busy = false, confirmDisabled = false, onCancel, onConfirm }: {
  titleId: string;
  kicker: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  busy?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="ef-practice-confirm ef-practice-overlay-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="ef-practice-confirm-head">
      <span className="ef-practice-overlay-kicker">{kicker}</span>
      <h3 id={titleId}>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
    {children}
    <div className="ef-practice-overlay-actions">
      <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
      <Button variant="primary" loading={busy} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}{confirmIcon}</Button>
    </div>
  </div>;
}

/**
 * One practice object for the Home side panel and the assignment immersive
 * route. It keeps the real Attempt/PerformanceResult authorities: the client
 * never chooses pass/fail and the AI evaluator path never writes.
 */
export function PracticeObject({ session, courseId, assignmentId, attemptId: requestedAttemptProp, size, onClose, onReturn, assistantSessionId, onSubmitted, onResultPassed, onOpenNextStep }: PracticeObjectProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const actionRunId = searchParams.get("actionRunId") || undefined;
  const repeatAttemptId = searchParams.get("repeatAttemptId") || undefined;
  const requestedAttemptId = requestedAttemptProp || searchParams.get("attemptId") || undefined;
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
  const compatibility = practiceCompatibility(assignment);
  const isInstruction = assignment?.mode === "instruction";
  const aiAvailable = aiEvaluationAvailable(compatibility, assignment?.acceptanceCriteria);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<LoadedResult | null>(null);
  const [attemptHistory, setAttemptHistory] = useState<AssignmentAttemptHistoryItem[]>([]);
  const [withdrawingAttemptId, setWithdrawingAttemptId] = useState<string | null>(null);
  const [withdrawCandidateId, setWithdrawCandidateId] = useState<string | null>(null);
  const [latestAttemptNumber, setLatestAttemptNumber] = useState<number | undefined>(undefined);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [resultError, setResultError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [evaluator, setEvaluator] = useState<PracticeEvaluator>(aiAvailable ? "ai" : "teacher");
  const [draft, setDraft] = useState<PracticeDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [evaluationPhase, setEvaluationPhase] = useState<EvaluationPhase>("idle");
  const [evaluationError, setEvaluationError] = useState("");
  const [evaluationElapsed, setEvaluationElapsed] = useState(0);
  const [revisionBase, setRevisionBase] = useState<LoadedResult | null>(null);
  const [editingAttemptNumber, setEditingAttemptNumber] = useState<number | undefined>(undefined);
  const [startingRevision, setStartingRevision] = useState(false);
  const [nextStep, setNextStep] = useState<NextStep | null>(null);
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
  const snapshotRef = useRef<HTMLDivElement | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const evaluationToken = useRef(0);
  const evaluationStartedFor = useRef<string | null>(null);
  const draftKey = `eduflow.practice-draft:${session.userId}:${courseId}:${assignmentId}`;
  const historySummary = useMemo(() => summarizeAssignmentAttempts(attemptHistory), [attemptHistory]);

  useEffect(() => applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => { if (!aiAvailable) setEvaluator("teacher"); }, [aiAvailable]);
  useEffect(() => {
    let live = true;
    setResultLoaded(false); setResultError(""); setResult(null); setAttemptHistory([]); setLatestAttemptNumber(undefined);
    setEvaluationPhase("idle"); setEvaluationError(""); setEvaluationElapsed(0);
    evaluationStartedFor.current = null;
    void applicationServices.learnerStateService.getAssignmentResult(courseId, assignmentId, actionRunId, requestedAttemptId)
      .then(({ result: value, history }) => {
        if (!live) return;
        const historyItems = Array.isArray(history) ? history : [];
        setAttemptHistory(historyItems);
        const attemptNumber = typeof value?.attemptNumber === "number" ? value.attemptNumber : undefined;
        const historyNumber = historyItems.reduce((maximum, item) => Math.max(maximum, item.attemptNumber), 0);
        if (attemptNumber) setLatestAttemptNumber(attemptNumber);
        else if (historyNumber) setLatestAttemptNumber(historyNumber);
        const loaded = value && value.attemptId !== repeatAttemptId ? value as LoadedResult : null;
        setResult(loaded);
        if (loaded?.feedback?.evaluator === "ai" || loaded?.feedback?.requestedEvaluator === "ai") {
          setEvaluator("ai");
          if (loaded.evaluation?.status === "failed") { setEvaluationPhase("failed"); setEvaluationError(evaluationFailureCopy(loaded.evaluation.errorCode)); }
          else if (loaded.evaluation?.status === "handed_off") setEvaluationPhase("handed_off");
          else if (loaded.outcome === "pending") setEvaluationPhase("evaluating");
        }
      })
      .catch(() => { if (live) setResultError("已保存的动手任务结果暂时无法读取，请重试。"); })
      .finally(() => { if (live) setResultLoaded(true); });
    return () => { live = false; };
  }, [courseId, assignmentId, actionRunId, repeatAttemptId, requestedAttemptId]);

  useEffect(() => {
    function onWriteResult(event: Event) {
      const detail = (event as CustomEvent<{ card?: { courseId?: string; assignmentId?: string } }>).detail ?? {};
      const card = detail.card;
      if (card?.courseId && card.courseId !== courseId) return;
      if (card?.assignmentId && card.assignmentId !== assignmentId) return;
      submissionKey.current = crypto.randomUUID();
      void applicationServices.learnerStateService.getAssignmentResult(courseId, assignmentId, actionRunId, requestedAttemptId)
        .then((loaded) => {
          const historyItems = loaded.history ?? [];
          setAttemptHistory(historyItems);
          setResult((loaded.result as LoadedResult | null) ?? null);
          const historyNumber = historyItems.reduce((maximum, item) => Math.max(maximum, item.attemptNumber), 0);
          setLatestAttemptNumber(loaded.result?.attemptNumber ?? (historyNumber || undefined));
          if (!loaded.result) { setEvaluationPhase("idle"); setEvaluationError(""); setNextStep(null); }
        })
        .catch(() => undefined);
    }
    window.addEventListener("eduflow:write-result", onWriteResult);
    return () => window.removeEventListener("eduflow:write-result", onWriteResult);
  }, [actionRunId, assignmentId, courseId, requestedAttemptId]);

  useEffect(() => {
    submissionKey.current = crypto.randomUUID();
  }, [actionRunId, repeatAttemptId]);

  useEffect(() => {
    if (evaluationPhase !== "evaluating") { setEvaluationElapsed(0); return; }
    const startedAt = Date.now();
    setEvaluationElapsed(0);
    const timer = setInterval(() => setEvaluationElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1_000);
    return () => clearInterval(timer);
  }, [evaluationPhase]);

  useEffect(() => {
    if (evaluationPhase !== "evaluating" || !result || result.outcome !== "pending") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const tick = async () => {
      if (!live) return;
      try {
        const { result: latest, history: latestHistory } = await applicationServices.learnerStateService.getAssignmentResult(courseId, assignmentId, actionRunId, requestedAttemptId);
        if (!live) return;
        if (latest && latest.attemptId === result.attemptId) {
          if (latest.outcome !== "pending") {
            setResult(latest);
            setAttemptHistory(latestHistory);
            setEvaluationPhase("done");
            await refreshLearnerState(session.userId).catch(() => undefined);
            return;
          }
          if (latest.evaluation?.status === "failed") { setResult(latest); setEvaluationPhase("failed"); setEvaluationError(evaluationFailureCopy(latest.evaluation.errorCode)); return; }
          if (latest.evaluation?.status === "handed_off") { setResult(latest); setEvaluationPhase("handed_off"); return; }
        }
      } catch { /* transient poll failure is retried */ }
      if (Date.now() - startedAt > 180_000) { setEvaluationPhase("failed"); return; }
      timer = setTimeout(tick, 2_500);
    };
    timer = setTimeout(tick, 2_500);
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [actionRunId, assignmentId, courseId, evaluationPhase, result?.attemptId, result?.outcome, session.userId]);

  const passedNotified = useRef<string | null>(null);
  useEffect(() => {
    if (!result || result.outcome !== "passed" || result.attemptId === passedNotified.current) return;
    passedNotified.current = result.attemptId;
    onResultPassed?.(result.attemptId);
  }, [onResultPassed, result?.attemptId, result?.outcome]);

  useEffect(() => {
    if (!result || result.outcome !== "pending") return;
    const feedback = result.feedback;
    if (feedback?.evaluator !== "ai" && feedback?.requestedEvaluator !== "ai") return;
    if (evaluationPhase === "failed" || evaluationPhase === "handed_off") return;
    if (evaluationStartedFor.current === result.attemptId) return;
    evaluationStartedFor.current = result.attemptId;
    void runEvaluation(result.attemptId);
  }, [evaluationPhase, result?.attemptId, result?.outcome, result?.evaluation?.status, result?.feedback?.evaluator, result?.feedback?.requestedEvaluator]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const value = JSON.parse(raw) as Partial<PracticeDraft>;
      if (typeof value.note !== "string" || typeof value.link !== "string") return;
      setDraft({ ...emptyDraft, ...value, attachmentIds: Array.isArray(value.attachmentIds) ? value.attachmentIds.slice(0, ATTACHMENT_LIMIT) : [], attachmentNames: Array.isArray(value.attachmentNames) ? value.attachmentNames.slice(0, ATTACHMENT_LIMIT) : [] });
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
    if (!confirming && !workPicker && !previewOpen && !withdrawCandidateId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      // Match the overlay render priority so Escape closes the layer on top.
      if (workPicker) setWorkPicker(false);
      else if (confirming) setConfirming(false);
      else if (withdrawCandidateId) setWithdrawCandidateId(null);
      else setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming, previewOpen, withdrawCandidateId, workPicker]);

  useEffect(() => {
    if (!repeatAttemptId || actionRunId) return;
    window.dispatchEvent(new Event("eduflow:learner-action-start"));
    let live = true;
    void apiRequest("/api/learning", { method: "POST", body: JSON.stringify({ action: "start-assignment", courseId, assignmentId, repeatAttemptId }) })
      .then(() => refreshLearnerState(session.userId))
      .catch(() => { if (live) setResultError("再次动手任务暂时无法启动，请稍后重试。"); });
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
      if (!shouldHandleShellEscape(event)) return;
      if (confirming || workPicker || previewOpen || withdrawCandidateId) return;
      event.preventDefault();
      if (onReturn) onReturn(); else navigate(`/courses/${encodeURIComponent(courseId)}`);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming, courseId, navigate, onReturn, previewOpen, size, withdrawCandidateId, workPicker]);

  const knowledge = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const courseState = applicationServices.learningProgressRepository.getCourseState(session.userId, courseId);
  const eligibility = runtime && assignment ? courseAssignmentEligibility(runtime, assignment.id, knowledge, courseState) : null;
  const coverages = runtime?.assignmentCoverages.filter((item) => item.assignmentId === assignmentId) ?? [];
  const visibleGraph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)), [revision, session.userId]);
  const nodeTitle = useMemo(() => new Map(visibleGraph.nodes.map((node) => [node.id, node.title])), [visibleGraph]);
  const nodeMastery = useMemo(() => new Map(visibleGraph.nodes.map((node) => [node.id, node.masteryCriteria])), [visibleGraph]);
  const missingKnowledgeIds = useMemo(() => {
    const statusByNode = new Map(knowledge.map((record) => [record.nodeId, record.status]));
    return [...new Set(coverages.map((coverage) => coverage.nodeId))].filter((nodeId) => !satisfiesTeachingPrerequisite(statusByNode.get(nodeId)));
  }, [coverages, knowledge]);
  const assignmentStatus = courseState.assignmentStates[assignmentId]?.status;
  const blocked = Boolean(eligibility && !eligibility.canStart && !eligibility.viewOnly);

  useEffect(() => {
    if (!runtime || !result || result.outcome !== "passed") { setNextStep(null); return; }
    let live = true;
    void applicationServices.learnerStateService.getNavigation(courseId).then((decision) => {
      if (!live) return;
      const action = decision.nextAction;
      const micro = action.nodeId ? applicationServices.microLearningRepository.getPath(action.nodeId, { courseId, mode: "learn" }) : null;
      const targetAssignment = action.resourceKind === "assignment" && action.resourceId ? runtime.assignments.find((item) => item.id === action.resourceId) : null;
      const title = micro?.title ?? (action.nodeId ? nodeTitle.get(action.nodeId) : undefined) ?? targetAssignment?.title ?? (action.resourceKind === "course" ? runtime.course.title : undefined);
      if (!title) { setNextStep(null); return; }
      setNextStep({
        title,
        minutes: micro?.estimatedMinutes ?? targetAssignment?.estimatedMinutes,
        nodeId: action.nodeId,
        resourceKind: action.resourceKind,
        resourceId: action.resourceId,
        microPathId: micro?.id
      });
    }).catch(() => { if (live) setNextStep(null); });
    return () => { live = false; };
  }, [courseId, nodeTitle, result?.attemptId, result?.outcome, revision, runtime]);
  const hasResult = Boolean(result);
  const viewState = practiceViewState({ compatibility, hasResult, confirming });
  const canSubmit = canSubmitPractice(compatibility);
  const response = buildPracticeResponse(compatibility, draft);
  const ready = Boolean(response);
  const submitting = busy || uploading;

  if (!runtime || !assignment) {
    return <ObjectShell size={size === "immersive" ? "immersive" : "panel"} title="动手任务不存在" kicker="动手任务" context="页面数据" stage={<p className="ef-practice-empty">当前课程或动手任务不存在，无法开始提交。</p>}><p className="ef-practice-empty">当前课程或动手任务不存在，无法开始提交。</p></ObjectShell>;
  }

  const courseTitle = runtime.course.title;
  const learnerExpectedOutput = isLearnerFacingExpectedOutput(assignment.expectedOutput) ? assignment.expectedOutput.trim() : undefined;
  const displayAcceptanceCriteria = learnerAcceptanceCriteria(
    assignment.acceptanceCriteria,
    coverages.map((coverage) => ({ id: coverage.nodeId, masteryCriteria: nodeMastery.get(coverage.nodeId) ?? [] }))
  );
  const chapter = runtime.chapters.find((item) => coverages.some((coverage) => {
    const lesson = runtime.lessons.find((lessonItem) => lessonItem.id === runtime.curriculumCoverages.find((entry) => entry.nodeId === coverage.nodeId)?.lessonId);
    return lesson?.chapterId === item.id;
  }));
  const linkedVersionLabel = linkedWork ? `v${linkedVersion} · 提交时保存` : "";

  function ensurePracticeStarted(): Promise<void> {
    if (startPromiseRef.current) return startPromiseRef.current;
    if (!shouldStartPracticeOnInput({ status: assignmentStatus, canStart: Boolean(eligibility?.canStart), alreadyRequested: false })) return Promise.resolve();
    const request = applicationServices.learnerStateService
      .startAssignment(courseId, assignmentId, actionRunId, true)
      .then(() => refreshLearnerState(session.userId))
      .catch(() => { startPromiseRef.current = null; });
    startPromiseRef.current = request;
    return request;
  }

  function beginPracticeOnInput() {
    void ensurePracticeStarted();
  }

  function pickWork(item: WorkflowSummaryV2) {
    beginPracticeOnInput();
    const revision = pickerRevision ?? item.revision;
    setLinkedWork(item);
    setLinkedVersion(String(revision));
    setWorkPicker(false);
    setDraft((current) => ({ ...current, linkedWorkName: item.name, linkedWorkVersion: `v${revision} · 提交时保存` }));
  }

  async function attach(file: File) {
    beginPracticeOnInput();
    if (draft.attachmentIds.length >= ATTACHMENT_LIMIT) { setError(`每次动手任务最多选择 ${ATTACHMENT_LIMIT} 份附件。`); return; }
    setUploading(true); setError(""); setUploadProgress("正在上传…");
    try {
      const id = await uploadEvidence(file, { courseId, assignmentId, actionRunId });
      setDraft((current) => ({ ...current, attachmentIds: [...current.attachmentIds, id].slice(0, ATTACHMENT_LIMIT), attachmentNames: [...current.attachmentNames, file.name].slice(0, ATTACHMENT_LIMIT) }));
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

  async function runEvaluation(attemptId: string) {
    const token = ++evaluationToken.current;
    setEvaluationPhase("evaluating"); setEvaluationError("");
    try {
      const evaluated = await applicationServices.learnerStateService.evaluateAssignment(courseId, assignmentId, attemptId, session.userId);
      if (token !== evaluationToken.current) return;
      if (evaluated.status === "evaluating") { setEvaluationPhase("evaluating"); return; }
      if (evaluated.status === "handed_off") { setEvaluationPhase("handed_off"); return; }
      const outcome = evaluated.outcome ?? (evaluated.status === "accepted" ? "passed" : evaluated.status === "needs_revision" ? "failed" : undefined);
      setResult((current) => current && current.attemptId === attemptId ? {
        ...current,
        resultId: evaluated.resultId ?? current.resultId,
        outcome: outcome ?? current.outcome,
        accepted: Boolean(evaluated.accepted),
        feedback: evaluated.feedback ?? current.feedback,
        evaluatorKind: "ai",
        evaluatedAt: new Date().toISOString(),
        evaluation: { status: "succeeded" }
      } : current);
      if (outcome) setAttemptHistory((current) => applyAttemptEvaluation(current, attemptId, {
        outcome,
        ...(evaluated.resultId ? { resultId: evaluated.resultId } : {}),
      }));
      setEvaluationPhase("done");
    } catch (evaluationFailure) {
      if (token !== evaluationToken.current) return;
      setEvaluationPhase("failed");
      setEvaluationError(evaluationFailure instanceof Error ? evaluationFailure.message : "AI 评价暂时不可用，本次提交仍然保留。可以重试或改交老师。");
    }
  }

  async function handOffEvaluation() {
    if (!result || busy) return;
    setBusy(true); setEvaluationError("");
    try {
      await applicationServices.learnerStateService.handoffAssignmentEvaluation(courseId, assignmentId, result.attemptId);
      setEvaluationPhase("handed_off");
      setResult((current) => current ? { ...current, evaluation: { status: "handed_off" } } : current);
    } catch (handoffFailure) {
      setEvaluationError(handoffFailure instanceof Error ? handoffFailure.message : "暂时无法改交老师，请稍后重试。");
    } finally { setBusy(false); }
  }

  function seedRevisionDraft() {
    if (!result) return;
    const next = draftFromPracticeResult(result.response, result.attachments);
    setDraft(next);
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  }

  async function submit() {
    if (submitting || !ready) return;
    setBusy(true); setError("");
    try {
      await ensurePracticeStarted();
      const payload = response;
      if (!payload) throw new Error("请填写备注、链接或上传至少一份文件。");
      const submitted = await applicationServices.learnerStateService.submitAssignment(
        courseId, assignmentId, payload, submissionKey.current, actionRunId, true, evaluator, assistantSessionId
      );
      onSubmitted?.(submitted.attemptId);
      const attachments = (payload.attachmentSourceIds ?? []).map((id, index) => ({ id, title: draft.attachmentNames[index] ?? `附件 ${index + 1}` }));
      const nextAttemptNumber = editingAttemptNumber ?? ((latestAttemptNumber ?? 0) + 1);
      const nowIso = new Date().toISOString();
      setLatestAttemptNumber(nextAttemptNumber);
      setAttemptHistory((current) => [{
        attemptId: submitted.attemptId, attemptNumber: nextAttemptNumber, submittedAt: nowIso, withdrawn: false,
        resultId: submitted.resultId, outcome: submitted.outcome,
        ...(submitted.evaluatorKind ? { evaluatorKind: submitted.evaluatorKind } : {})
      }, ...current.filter((item) => item.attemptId !== submitted.attemptId)]);
      const loaded: LoadedResult = {
        ...submitted,
        attemptNumber: nextAttemptNumber,
        accepted: false,
        feedback: submitted.feedback,
        evaluatorKind: submitted.evaluatorKind,
        evaluatedAt: nowIso,
        response: payload,
        attachments,
        ...(evaluator === "ai" ? { evaluation: { status: "running" } } : {})
      };
      evaluationStartedFor.current = evaluator === "ai" ? submitted.attemptId : null;
      setResult(loaded);
      setRevisionBase(null);
      setEditingAttemptNumber(undefined);
      setConfirming(false);
      setEvaluationPhase(evaluator === "ai" ? "evaluating" : "idle");
      await refreshLearnerState(session.userId).catch(() => undefined);
      if (evaluator === "ai") await runEvaluation(submitted.attemptId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败，未确认保存结果。请检查网络后重试。");
    } finally { setBusy(false); }
  }

  async function withdrawSubmission(attemptId: string) {
    if (withdrawingAttemptId) return;
    setWithdrawingAttemptId(attemptId); setError("");
    try {
      await applicationServices.learnerStateService.withdrawAssignmentAttempt(courseId, assignmentId, attemptId, "panel");
      submissionKey.current = crypto.randomUUID();
      const loaded = await applicationServices.learnerStateService.getAssignmentResult(courseId, assignmentId, actionRunId, requestedAttemptId);
      const historyItems = loaded.history ?? [];
      setAttemptHistory(historyItems);
      setResult((loaded.result as LoadedResult | null) ?? null);
      const historyNumber = historyItems.reduce((maximum, item) => Math.max(maximum, item.attemptNumber), 0);
      setLatestAttemptNumber(loaded.result?.attemptNumber ?? (historyNumber || undefined));
      if (!loaded.result) { setEvaluationPhase("idle"); setNextStep(null); }
      await refreshLearnerState(session.userId).catch(() => undefined);
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "这次提交暂时无法撤回，请稍后重试。");
    } finally {
      setWithdrawingAttemptId(null);
      setWithdrawCandidateId(null);
    }
  }

  async function practiceAgain() {
    const previous = result;
    if (!previous || startingRevision) return;
    window.dispatchEvent(new Event("eduflow:learner-action-start"));
    const previousEvaluator: PracticeEvaluator = previous.feedback?.evaluator === "ai" ? "ai" : "teacher";
    setStartingRevision(true); setError("");
    try {
      if (actionRunId) {
        seedRevisionDraft();
        setBusy(true);
        const history = await apiRequest<{ runs: import("@/features/actions/model").ActionRun[] }>(`/api/edge-actions?courseId=${encodeURIComponent(courseId)}`);
        const old = history.runs.find((run) => run.id === actionRunId && run.status === "completed");
        if (!old) throw new Error("本次执行尚未完成，请重新读取正式结果。");
        const next = await apiRequest<{ run: import("@/features/actions/model").ActionRun }>("/api/edge-actions", { method: "POST", body: JSON.stringify({ action: "select", courseId, actionId: old.action_id, selectionKey: crypto.randomUUID(), repeatRunId: old.id }) });
        navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}?actionRunId=${encodeURIComponent(next.run.id)}`, { state: location.state });
        return;
      }
      await applicationServices.learnerStateService.startAssignment(courseId, assignmentId, undefined, true, previous.attemptId);
      startPromiseRef.current = Promise.resolve();
      submissionKey.current = crypto.randomUUID();
      const nextDraft = draftFromPracticeResult(previous.response, previous.attachments);
      setDraft(nextDraft);
      try { sessionStorage.setItem(draftKey, JSON.stringify(nextDraft)); } catch { /* storage may be unavailable */ }
      setRevisionBase(previous);
      setEditingAttemptNumber((previous.attemptNumber ?? latestAttemptNumber ?? 1) + 1);
      setEvaluator(previousEvaluator);
      setResult(null); setResultError(""); setConfirming(false); setPreviewOpen(false);
      setEvaluationPhase("idle"); setEvaluationError(""); setEvaluationElapsed(0); setNextStep(null);
    } catch (againError) {
      setError(againError instanceof Error ? againError.message : "再次动手任务暂未启动，请重试。");
    } finally {
      setStartingRevision(false); setBusy(false);
    }
  }

  const checklistDraft = result ? draftFromPracticeResult(result.response, result.attachments) : draft;
  const checklist = practiceChecklist(checklistDraft);
  const checklistCounts = practiceChecklistCounts(checklist);
  const savedLabel = savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const pickerWork = works.find((item) => item.workflowId === pickerWorkId) ?? works[0] ?? null;

  const requirements = <div className="ef-practice-requirements">
    <ObjectShellSection icon={<FileText size={15} />} title="要求" description={`${coverages.length} 个关联知识点点`} actions={<Pill tone={checklistCounts.attached === checklistCounts.total ? "ok" : "quiet"}>{checklistCounts.attached} / {checklistCounts.total} 已附</Pill>}>
      <p className="ef-practice-goal">{assignment.description}</p>
      <div className="ef-practice-deliverables" aria-label="交付物检查清单">
        {checklist.map((item) => <div key={item.id} className={`ef-practice-deliverable ${item.done ? "is-done" : ""} ${item.required ? "" : "is-optional"}`}>
          <span className="ef-practice-deliverable-check" aria-hidden="true">{item.done ? <Check size={12} /> : null}</span>
          <span className="ef-practice-deliverable-copy"><b>{item.label}</b><small>{item.detail}</small></span>
          <span className="ef-practice-deliverable-state">{item.done ? "已提供" : item.required ? "至少一项" : "可选"}</span>
        </div>)}
      </div>
      {assignment.requirements.length ? <details className="ef-practice-req-more"><summary>任务要求 · {assignment.requirements.length} 条</summary><ul>{assignment.requirements.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
      <div className="ef-practice-score-line"><span>验收标准 {displayAcceptanceCriteria.length || 1} 项</span>{learnerExpectedOutput ? <><span aria-hidden="true">·</span><span>预期输出 {learnerExpectedOutput}</span></> : null}</div>
    </ObjectShellSection>
    <details className="ef-practice-details" open={detailsOpen} onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary><ChevronDown size={14} aria-hidden="true" />详情</summary>
      <p>{aiAvailable ? "可交给老师验收，也可交给 AI 评估者逐条核对；两种结果的效力相同。" : "本次动手任务由老师验收；当前提交类型或验收标准不支持 AI 评估者。"}</p>
      {chapter ? <p>课程章节：{chapter.title}</p> : null}
      <dl className="ef-practice-facts">
        {learnerExpectedOutput ? <div><dt>预期输出</dt><dd>{learnerExpectedOutput}</dd></div> : null}
        <div><dt>验收标准</dt><dd>{displayAcceptanceCriteria.join("；") || "由评估者依据任务要求评价"}</dd></div>
        <div><dt>关联知识点</dt><dd>{coverages.map((coverage) => nodeTitle.get(coverage.nodeId) ?? coverage.nodeId).join("、") || "无"}</dd></div>
      </dl>
    </details>
  </div>;

  const evaluatorSection = <fieldset className="ef-practice-evaluator">
    <legend>提交给</legend>
    {evaluatorOptions.filter((option) => option.id === "teacher" || aiAvailable).map((option) => <label key={option.id} className={`ef-practice-evaluator-option ${evaluator === option.id ? "is-selected" : ""}`}>
      <input type="radio" name="practice-evaluator" value={option.id} checked={evaluator === option.id} onChange={() => setEvaluator(option.id)} />
      <span className="ef-practice-radio" aria-hidden="true" />
      <span className="ef-practice-evaluator-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
    </label>)}
    {!aiAvailable ? <p className="ef-practice-note">这个动手任务没有可用的验收标准，或提交类型需要老师验收；请交给老师。</p> : null}
  </fieldset>;

  const submissionItems = <ul className="ef-practice-submission-list">
    {linkedWork ? <li><GitBranch size={15} aria-hidden="true" /><span><strong>作品 · {linkedWork.name}</strong><small>{linkedVersionLabel} · 工作流 {linkedWork.nodeCount ?? 0} 个节点</small></span><Pill tone="quiet">已选</Pill></li> : null}
    {draft.attachmentNames.map((name, index) => <li key={`${name}:${index}`}><Paperclip size={15} aria-hidden="true" /><span><strong>{name}</strong><small>本人已上传原始文件</small></span><Pill tone="quiet">已附</Pill></li>)}
    {draft.link.trim() ? <li><Link2 size={15} aria-hidden="true" /><span><strong>{draft.link.trim()}</strong><small>外部链接会随这次尝试一起保存</small></span><Pill tone="quiet">已附</Pill></li> : null}
    {draft.note.trim() ? <li><FileText size={15} aria-hidden="true" /><span><strong>备注</strong><small>{draft.note.trim().slice(0, 160)}</small></span><Pill tone="quiet">已附</Pill></li> : null}
  </ul>;

  const confirmOverlay = <PracticeConfirmDialog titleId="practice-confirm-title" kicker="提交确认 · 本次尝试" title="确认提交这次动手任务？" description="以下内容会随这次尝试一起提交，提交后不可修改；如果交错了，可以在提交记录里撤回。" cancelLabel="返回修改" confirmLabel="确认提交" confirmIcon={<Send size={15} />} busy={busy} confirmDisabled={!ready} onCancel={() => setConfirming(false)} onConfirm={() => void submit()}>
    {submissionItems}
    <p className="ef-practice-warning" role="note"><AlertTriangle size={15} aria-hidden="true" />提交内容会保存为只读记录；交错了可以撤回这次提交，再重新提交。</p>
    {evaluatorSection}
    {error ? <p className="ef-practice-error" role="alert">{error}</p> : null}
  </PracticeConfirmDialog>;

  const withdrawAttempt = attemptHistory.find((attempt) => attempt.attemptId === withdrawCandidateId);
  const withdrawConfirmation = practiceWithdrawConfirmation(withdrawAttempt?.attemptNumber);
  const withdrawOverlay = withdrawCandidateId ? <PracticeConfirmDialog titleId="practice-withdraw-title" kicker={withdrawConfirmation.kicker} title={withdrawConfirmation.title} description={withdrawConfirmation.description} cancelLabel="保留提交" confirmLabel="确认撤回" busy={withdrawingAttemptId === withdrawCandidateId} onCancel={() => setWithdrawCandidateId(null)} onConfirm={() => void withdrawSubmission(withdrawCandidateId)} /> : null;

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
      <span>选中的版本会在提交时保存，之后修改作品不影响这次提交。</span>
      <Button variant="primary" size="32" disabled={!pickerWork || !pickerRevision} onClick={() => pickerWork && pickWork(pickerWork)}>选择 v{pickerRevision ?? pickerWork?.revision ?? 1}</Button>
    </div>
    {revisionsLoading ? <p className="ef-practice-note" role="status">正在读取作品版本…</p> : null}
  </div>;

  const previewOverlay = <div className="ef-practice-confirm ef-practice-overlay-card" role="dialog" aria-modal="true" aria-labelledby="practice-preview-title">
    <div className="ef-practice-confirm-head">
      <span className="ef-practice-overlay-kicker">查看 · 本次提交</span>
      <h3 id="practice-preview-title">本次提交内容</h3>
      <p>只读查看；确认提交后这些内容会保存为只读记录。</p>
    </div>
    {submissionItems}
    <div className="ef-practice-overlay-actions">
      <Button variant="secondary" onClick={() => setPreviewOpen(false)}>返回修改</Button>
    </div>
  </div>;

  const eligibilityNotice = blocked && eligibility ? <section className="ef-practice-eligibility" role="status" aria-label="动手任务开始条件">
    <AlertTriangle size={18} aria-hidden="true" />
    <div className="ef-practice-eligibility-copy">
      <strong>还不能开始这次动手任务</strong>
      <p>{eligibility.reason}</p>
      {missingKnowledgeIds.length ? <div className="ef-practice-eligibility-actions">{missingKnowledgeIds.map((nodeId) => <button key={nodeId} type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => learnMissingKnowledge(nodeId)}>去学习「{nodeTitle.get(nodeId) ?? nodeId}」<ArrowRight size={14} aria-hidden="true" /></button>)}</div> : null}
    </div>
  </section> : null;

  function updateNote(value: string) {
    beginPracticeOnInput();
    setDraft((current) => ({ ...current, note: value }));
  }

  function updateLink(value: string) {
    beginPracticeOnInput();
    setDraft((current) => ({ ...current, link: value }));
  }

  const noteField = <Textarea label="提交备注" placeholder={isInstruction ? "写下你的完成过程、关键状态和验证结果…" : "写下复现命令、结果与边界，或说明平台不能执行的部分…"} value={draft.note} onChange={(event) => updateNote(event.target.value)} rows={isInstruction ? 5 : 3} />;
  const linkField = <TextField label="作品 / 外部链接" placeholder="https://…（可选）" value={draft.link} onChange={(event) => updateLink(event.target.value)} icon={<Link2 size={15} />} />;
  const attachmentBlock = <>
    <div className="ef-practice-attachment-row">
      {draft.attachmentNames.map((name, index) => <span className="ef-practice-file" key={`${name}:${index}`}><Paperclip size={13} aria-hidden="true" /><span title={name}>{name}</span><button type="button" aria-label={`移除 ${name}`} onClick={() => removeAttachment(index)}><X size={12} /></button></span>)}
      <label className={`ef-practice-upload ${uploading ? "is-busy" : ""}`}><Upload size={14} aria-hidden="true" />{uploading ? "上传中…" : "添加附件"}<input type="file" accept=".txt,.md,.csv" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void attach(file); event.target.value = ""; }} /></label>
    </div>
    {uploadProgress ? <small role="status">{uploadProgress}</small> : null}
  </>;
  const workBlock = <div className="ef-practice-work">
    {linkedWork ? <div className="ef-practice-linked-work">
      <GitBranch size={18} aria-hidden="true" />
      <div className="ef-practice-linked-copy"><strong>{linkedWork.name}</strong><small>工作流 · {linkedWork.nodeCount ?? 0} 个节点 · 已关联本次动手任务</small><span>{linkedVersionLabel}</span></div>
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => setWorkPicker(true)}>更换</button>
    </div> : <div className="ef-practice-work-actions">
      <Button variant={isInstruction ? "secondary" : "primary"} size="32" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setCreateOpen(true)}>新建工作流并关联</Button>
      <Button variant="secondary" size="32" icon={<Search size={15} aria-hidden="true" />} onClick={() => setWorkPicker(true)}>从我的作品选择</Button>
    </div>}
  </div>;
  const draftHint = <p className="ef-practice-note"><Lock size={13} aria-hidden="true" />备注、链接、附件或关联作品至少提供一项；支持 UTF-8 的 .txt、.md、.csv，最多 {ATTACHMENT_LIMIT} 份。草稿会自动保存在当前浏览器会话；正式提交后才会成为可评价的提交记录。</p>;

  const draftSection = <ObjectShellSection icon={<PenLine size={15} />} title="我的提交草稿" description="只有你可见" actions={<Pill tone="quiet">草稿</Pill>}>
    {isInstruction ? <>
      {noteField}
      {linkField}
      {attachmentBlock}
      <details className="ef-practice-work-secondary">
        <summary>关联作品（可选）</summary>
        {workBlock}
      </details>
    </> : <>
      {workBlock}
      {attachmentBlock}
      {linkField}
      {noteField}
    </>}
    {draftHint}
  </ObjectShellSection>;

  const revisionFeedback = revisionBase?.feedback;
  const revisionCriteria = revisionFeedback?.criteria ?? [];
  const revisionFailedCount = revisionCriteria.filter((criterion) => !criterion.passed).length;
  const revisionView = revisionBase && revisionCriteria.length ? <ObjectShellSection icon={<FileText size={15} />} title="上次评价" description={revisionFailedCount ? `${revisionFailedCount} 项需要修改` : "已通过"}>
    <details className="ef-practice-previous" open={revisionFailedCount > 0}>
      <summary>{revisionFailedCount ? "展开 / 收起上次未通过项与原因" : "查看上次评价"}</summary>
      <div className="ef-practice-criteria">
        {[...revisionCriteria].sort((left, right) => Number(left.passed) - Number(right.passed)).map((criterion) => <article key={criterion.index} className={`ef-practice-criterion ${criterion.passed ? "is-pass" : "is-fail"}`}>
          <header>
            <span className="ef-practice-criterion-state"><span aria-hidden="true">{criterion.passed ? <Check size={12} /> : <AlertTriangle size={12} />}</span>{criterion.passed ? "通过" : "需要修改"}</span>
            <b>{criterion.criterion}</b>
          </header>
          <p>{criterion.reason}</p>
          {criterion.quote ? <blockquote>“{criterion.quote}”</blockquote> : null}
        </article>)}
      </div>
    </details>
  </ObjectShellSection> : revisionBase ? <ObjectShellSection icon={<FileText size={15} />} title="上次评价" description="未通过">
    <p className="ef-practice-feedback">{revisionFeedback?.message || "上次提交未通过，请根据反馈补充后再交。"}</p>
  </ObjectShellSection> : null;

  const requirementsBlock = <details className="ef-practice-requirements-details" open>
    <summary>要求与交付 <span>先看清要交什么，再开始写</span></summary>
    {requirements}
  </details>;
  const historyDescription = `${historySummary.totalSubmissions} 次提交 · ${historySummary.withdrawnSubmissions} 次已撤回 · ${historySummary.countingSubmissions} 次计入`;
  const historySection = attemptHistory.length ? <ObjectShellSection icon={<Clock size={15} />} title="提交记录" description={historyDescription}>
    <ul className="ef-practice-attempt-history">
      {attemptHistory.map((attempt) => {
        const withdrawn = Boolean(attempt.withdrawnAt);
        return <li key={attempt.attemptId} className={withdrawn ? "is-withdrawn" : ""}>
          <span className="ef-practice-attempt-number">第 {attempt.attemptNumber} 次</span>
          <span className="ef-practice-attempt-meta">{formatTime(attempt.submittedAt)}{withdrawn ? ` · 已撤回 · ${attempt.withdrawalSource === "assistant" ? "对话撤回" : "面板撤回"}` : attempt.outcome === "passed" ? " · 已通过" : attempt.outcome === "failed" ? " · 需要修改" : attempt.outcome === "pending" ? " · 待评价" : ""}</span>
          {withdrawn
            ? <Pill tone="quiet">已撤回</Pill>
            : <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" disabled={Boolean(withdrawingAttemptId)} onClick={() => setWithdrawCandidateId(attempt.attemptId)}>{withdrawingAttemptId === attempt.attemptId ? "撤回中…" : "撤回"}</button>}
        </li>;
      })}
    </ul>
    <p className="ef-practice-note">撤回后这次提交会保留在记录里，但不再计入完成、评价或掌握度。</p>
  </ObjectShellSection> : null;

  const draftBody = <div className="ef-practice-draft">
    {eligibilityNotice}
    {historySection}
    {revisionView}
    {size === "panel" ? requirementsBlock : null}
    {blocked ? <fieldset disabled className="ef-practice-draft-fieldset">{draftSection}</fieldset> : draftSection}
  </div>;

  const disabledBody = <div className="ef-practice-disabled" role="status">
    <Lock size={20} aria-hidden="true" />
    <div><strong>该动手任务类型已停用</strong><p>问答类检查已属于小练习，不再作为成果任务。原有记录保持不变，本页只读展示任务说明。</p></div>
    <ObjectShellSection title="任务说明"><p>{assignment.description}</p></ObjectShellSection>
  </div>;

  const workflowBody = <div className="ef-practice-workflow">
    {eligibilityNotice}
    <GitBranch size={22} aria-hidden="true" />
    <h3>在作品画布中完成这次动手任务</h3>
    <p>这次动手任务由既有工作流执行环境承载；运行结果仍会保存，画布完成后回到课程路线查看正式结果。</p>
    {assignment.workflowTemplateId ? <Button variant="primary" icon={<ArrowRight size={16} aria-hidden="true" />} disabled={blocked} onClick={() => navigate(workflowLaunchUrl({ courseId, assignmentId, workflowTemplateId: assignment.workflowTemplateId! }))}>进入工作流画布</Button> : <p className="ef-practice-error">该动手任务尚未配置可用的工作流模板。</p>}
    {error ? <p className="ef-practice-error" role="alert">{error}</p> : null}
  </div>;

  const feedback: AssignmentFeedback | undefined = result?.feedback;
  const aiEvaluator = feedback?.evaluator === "ai" || feedback?.evaluatorKind === "ai" || result?.evaluatorKind === "ai";
  const criteria = feedback?.criteria ?? [];
  const passedCriteria = criteria.filter((criterion) => criterion.passed).length;
  const evaluationFailed = evaluationPhase === "failed" || result?.evaluation?.status === "failed";
  const evaluationHandedOff = evaluationPhase === "handed_off" || result?.evaluation?.status === "handed_off";
  const evaluationRunning = Boolean(result && result.outcome === "pending" && aiEvaluator && !evaluationFailed && !evaluationHandedOff);
  const evaluationStatus = evaluationFailed ? "failed" : evaluationHandedOff ? "handed_off" : result?.evaluation?.status;
  const resultView = result ? practiceOutcomeView({
    outcome: result.outcome,
    accepted: result.accepted,
    feedbackCode: feedback?.code,
    feedbackMessage: feedback?.message,
    evaluator: aiEvaluator ? "ai" : "teacher",
    evaluationStatus
  }) : null;
  const returnToLearning = onReturn ?? (() => navigate(`/courses/${encodeURIComponent(courseId)}`));
  function learnMissingKnowledge(nodeId: string) {
    const micro = applicationServices.microLearningRepository.getPath(nodeId, { courseId, mode: "learn" });
    if (micro) {
      const target = createMicroLearningNavigation(nodeId, { courseId, returnTo: `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}` });
      navigate(target.to, { state: target.state });
      return;
    }
    navigate(`/courses/${encodeURIComponent(courseId)}?focus=knowledge:${encodeURIComponent(nodeId)}`);
  }
  function goToNextStep() {
    if (!nextStep) return;
    if (size === "panel" && onOpenNextStep) { onOpenNextStep(nextStep); return; }
    if (nextStep.nodeId) {
      const micro = applicationServices.microLearningRepository.getPath(nextStep.nodeId, { courseId, mode: "learn" });
      if (micro) {
        const target = createMicroLearningNavigation(nextStep.nodeId, { courseId, returnTo: size === "panel" ? "/" : `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}` });
        navigate(target.to, { state: target.state });
        return;
      }
    }
    if (nextStep.resourceKind === "assignment" && nextStep.resourceId) {
      navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(nextStep.resourceId)}`, { state: { returnTo: "/" } });
      return;
    }
    returnToLearning();
  }
  function revealSubmission() {
    setSubmittedOpen(true);
    window.requestAnimationFrame(() => snapshotRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  const attemptNumber = editingAttemptNumber ?? result?.attemptNumber ?? (repeatAttemptId && latestAttemptNumber ? latestAttemptNumber + 1 : latestAttemptNumber ?? 1);
  const evaluatedLabel = result?.evaluatedAt ? new Date(result.evaluatedAt).toLocaleString("zh-CN") : undefined;
  const submittedText = result ? (result.response.kind === "answer" ? result.response.text : result.response.kind === "code" ? result.response.code ?? result.response.fileName ?? "文件提交" : result.response.kind) : "";
  const attachmentCount = result?.response.attachmentSourceIds?.length ?? 0;
  const evaluatorLabel = practiceEvaluatorLabel(feedback);

  const resultBody = result && resultView ? <div className="ef-practice-result">
    <div className={`ef-practice-result-hero tone-${resultView.tone}`}>
      <span className="ef-practice-result-icon" aria-hidden="true">
        {evaluationRunning ? <LoaderCircle size={24} className="ef-practice-spin" /> : resultView.tone === "accepted" ? <Check size={24} /> : resultView.tone === "handed_off" ? <Clock size={22} /> : <AlertTriangle size={22} />}
      </span>
      <div className="ef-practice-result-copy">
        <div className="ef-practice-result-tags">
          <Pill tone={resultView.tone === "accepted" ? "ok" : resultView.tone === "revision" || resultView.tone === "unavailable" ? "warn" : "quiet"} dot>{resultView.label}</Pill>
          <span className="ef-practice-result-source">{evaluatorLabel}</span>
        </div>
        <div className="ef-practice-result-meta">{evaluatedLabel ? <><span>{evaluatedLabel}</span><span aria-hidden="true">·</span></> : null}<span>当前计入：第 {attemptNumber} 次尝试</span></div>
      </div>
    </div>
    {historySection}
    {nextStep ? <ObjectShellSection icon={<ArrowRight size={15} />} title="下一步" description={nextStep.minutes ? `约 ${nextStep.minutes} 分钟` : undefined}>
      <div className="ef-practice-next-step">
        <strong>{nextStep.title}</strong>
        <Button variant="primary" size="32" onClick={goToNextStep}>继续学习<ArrowRight size={14} /></Button>
      </div>
    </ObjectShellSection> : null}
    {evaluationRunning ? <ObjectShellSection icon={<LoaderCircle size={15} className="ef-practice-spin" />} title="评价中" description={evaluationElapsed > 0 ? `已用时 ${evaluationElapsed} 秒` : "正在评价"}>
      <div className="ef-practice-evaluation-progress" role="status" aria-live="polite">
        <div className="ef-practice-evaluation-bar" aria-hidden="true"><span /></div>
        <p>AI 评估者正在逐条核对验收标准。你可以先离开，结果会保存在这次提交里，回来即可查看。</p>
      </div>
    </ObjectShellSection> : null}
    {evaluationFailed ? <ObjectShellSection icon={<AlertTriangle size={15} />} title="评价暂时不可用" description="提交已保留">
      <p className="ef-practice-feedback">{evaluationError || "AI 评估者暂时无法完成评价，本次提交仍然保留。"}</p>
      <div className="ef-practice-result-actions">
        <Button variant="primary" size="32" icon={<RefreshCw size={14} />} loading={busy} onClick={() => void runEvaluation(result!.attemptId)}>重试 AI 评价</Button>
        <Button variant="secondary" size="32" icon={<Send size={14} />} loading={busy} onClick={() => void handOffEvaluation()}>改交老师</Button>
      </div>
    </ObjectShellSection> : null}
    {evaluationHandedOff ? <ObjectShellSection icon={<Clock size={15} />} title="已改交老师" description="等待老师验收">
      <p className="ef-practice-feedback">这次提交已转给老师，结果会保存在同一条提交里。你可以先离开，回来即可查看。</p>
    </ObjectShellSection> : null}
    {criteria.length ? <ObjectShellSection icon={<FileText size={15} />} title="逐条验收标准" description={`${passedCriteria} / ${criteria.length} 项通过`}>
      <div className="ef-practice-criteria">
        {criteria.map((criterion) => <article key={criterion.index} className={`ef-practice-criterion ${criterion.passed ? "is-pass" : "is-fail"}`}>
          <header>
            <span className="ef-practice-criterion-state"><span aria-hidden="true">{criterion.passed ? <Check size={12} /> : <AlertTriangle size={12} />}</span>{criterion.passed ? "通过" : "需要修改"}</span>
            <b>{criterion.criterion}</b>
          </header>
          <p>{criterion.reason}</p>
          {criterion.quote ? <blockquote>“{criterion.quote}”</blockquote> : null}
          {!criterion.validated ? <small>这条判断的依据未能在提交内容中核对到，按未通过处理。</small> : null}
        </article>)}
      </div>
    </ObjectShellSection> : null}
    {!evaluationRunning && !evaluationFailed && !evaluationHandedOff ? <ObjectShellSection icon={<FileText size={15} />} title="反馈" description={evaluatedLabel}>
      <p className="ef-practice-feedback">{resultView.detail}</p>
    </ObjectShellSection> : null}
    <div ref={snapshotRef}>
      <ObjectShellSection icon={<Lock size={15} />} title="提交快照" description={`第 ${attemptNumber} 次尝试 · 只读`} actions={<Pill tone="quiet">只读</Pill>}>
        <dl className="ef-practice-snapshot">
          <div><dt>响应类型</dt><dd>{result.response.kind === "answer" ? "文字 / 附件提交" : result.response.kind === "code" ? "文件 / 链接提交" : result.response.kind}</dd></div>
          <div><dt>提交内容</dt><dd>{submittedText ? submittedText.slice(0, 240) : "仅附件"}</dd></div>
          <div><dt>附件</dt><dd>{attachmentCount ? `${attachmentCount} 份原始文件` : "无"}</dd></div>
          <div><dt>评估者</dt><dd>{evaluatorLabel} · {evaluatedLabel ?? "结果已保存"}</dd></div>
        </dl>
        {submittedOpen ? <p className="ef-practice-note">这次提交的内容已保存为只读记录；再次提交会生成新的尝试。</p> : null}
      </ObjectShellSection>
    </div>
    {resultError ? <p className="ef-practice-error" role="alert">{resultError}</p> : null}
    {error ? <p className="ef-practice-error" role="alert">{error}</p> : null}
  </div> : null;

  const overlay = workPicker ? workPickerOverlay : confirming ? confirmOverlay : withdrawOverlay ?? (previewOpen ? previewOverlay : undefined);

  let body: ReactNode;
  switch (viewState) {
    case "disabled": body = disabledBody; break;
    case "workflow": body = workflowBody; break;
    case "result": body = resultLoaded ? resultBody : <PracticeSkeleton />; break;
    case "confirm": body = draftBody; break;
    default: body = !resultLoaded ? <PracticeSkeleton /> : draftBody;
  }

  const panelExpand = size === "panel"
    ? <PanelActions expand={{ kind: "page", href: `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}${requestedAttemptId ? `?attemptId=${encodeURIComponent(requestedAttemptId)}` : ""}` }} />
    : null;
  const footer = (() => {
    if (viewState === "disabled") return <div className="ef-practice-footer"><span>只读 · 不会保存</span><div><Button variant="secondary" onClick={onReturn ?? (() => navigate(`/courses/${encodeURIComponent(courseId)}`))}>返回课程</Button></div></div>;
    if (viewState === "workflow") return <div className="ef-practice-footer"><span>工作流执行</span><div><Button variant="secondary" onClick={onReturn ?? (() => navigate(`/courses/${encodeURIComponent(courseId)}`))}>返回课程</Button></div></div>;
    if (viewState === "result") {
      const actions = practiceResultActions(resultView?.tone ?? "pending");
      const resultStatus = evaluationRunning ? "正式结果 · 评价中" : evaluationFailed ? "正式结果 · 待重试" : evaluationHandedOff ? "正式结果 · 待老师验收" : "正式结果 · 只读";
      return <div className="ef-practice-footer"><span>{resultStatus}</span><div>{panelExpand}<Button variant="secondary" size="32" onClick={returnToLearning}><ArrowLeft size={14} />回到学习</Button>{actions.showViewSubmission ? <Button variant="secondary" size="32" onClick={revealSubmission} disabled={!result}>查看提交</Button> : null}{actions.showPracticeAgain ? <Button variant="primary" size="32" onClick={practiceAgain} loading={startingRevision} disabled={busy}>补充后再交<ArrowRight size={14} /></Button> : null}</div></div>;
    }
    return <div className="ef-practice-footer"><span>{blocked && eligibility ? <><AlertTriangle size={13} aria-hidden="true" />{eligibility.reason}</> : <><RotateCcw size={13} aria-hidden="true" />自动保存于 {savedLabel}</>}</span><div>{panelExpand}<Button variant="secondary" size="32" onClick={() => setPreviewOpen(true)} disabled={!ready || blocked}>查看提交</Button><Button variant="primary" size="32" disabled={!canSubmit || !ready || submitting || blocked || (eligibility ? !eligibility.canStart && !assignmentStatus : false)} onClick={() => setConfirming(true)}>提交<ArrowRight size={14} /></Button></div></div>;
  })();

  const identityStatus = result?.outcome === "passed" ? { label: "已通过", tone: "ok" as const }
    : result?.outcome === "failed" ? { label: "需要修改", tone: "warn" as const }
    : result?.outcome === "pending" ? { label: "待评价", tone: "warn" as const }
    : assignmentStatus === "accepted" || assignmentStatus === "completed" ? { label: "已通过", tone: "ok" as const }
    : assignmentStatus === "needs_revision" ? { label: "需要修改", tone: "warn" as const }
    : assignmentStatus === "submitted" ? { label: "待评价", tone: "warn" as const }
    : assignmentStatus === "started" ? { label: "进行中", tone: "brand" as const }
    : viewState === "disabled" ? { label: "已停用", tone: "danger" as const }
    : { label: "未开始", tone: "quiet" as const };
  const tools = <div className="ef-practice-tools">
    {size === "immersive" ? <button type="button" className="ef-home-icon" onClick={returnToLearning} aria-label="返回学习来源" title="返回学习来源"><ArrowLeft size={15} /></button> : null}
    {onClose ? <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭动手任务面板"><X size={15} /></button> : null}
  </div>;

  const kicker = <span>{result?.attemptNumber ? `动手任务 · 计入评价：第 ${result.attemptNumber} 次尝试` : practiceAttemptKicker(attemptNumber)}</span>;
  const context = <span>{courseTitle}{chapter ? ` · ${chapter.title}` : ""} · 约 {assignment.estimatedMinutes ?? 25} 分钟</span>;

  if (size === "immersive") {
    return <main className="ef-practice-page">
      <ObjectShell size="immersive" className="ef-practice-shell" title={assignment.title} kicker={kicker} context={context} icon={<Wrench size={17} />} badge={<Pill tone={identityStatus.tone} dot>{identityStatus.label}</Pill>} tools={tools} overlay={overlay} stage={<>{body}{resultError ? <p className="ef-practice-error" role="alert">{resultError}</p> : null}</>} inspector={<>{requirements}{result ? <div className="ef-practice-evaluator-readonly"><span>评估者</span><strong>{evaluatorLabel}</strong></div> : evaluatorSection}</>} inspectorTitle="任务与评估" footer={footer} />
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

  return <ObjectShell size="panel" className="ef-practice-shell" title={assignment.title} kicker={kicker} context={context} icon={<Wrench size={17} />} badge={<Pill tone={identityStatus.tone} dot>{identityStatus.label}</Pill>} tools={tools} footer={footer} overlay={overlay}>
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

function evaluationFailureCopy(errorCode?: string) {
  return errorCode === "model_output_invalid"
    ? "AI 评价结果未通过校验，本次提交仍然保留。可以重试或改交老师。"
    : "AI 评估者暂时无法完成评价，本次提交仍然保留。可以重试或改交老师。";
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未知";
}

function PracticeSkeleton() {
  return <div className="ef-practice-skeleton" role="status" aria-label="正在加载动手任务"><span /><span /><span /><span /></div>;
}
