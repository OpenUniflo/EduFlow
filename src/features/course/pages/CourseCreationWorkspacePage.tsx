import { ArrowLeft, Bot, Check, ChevronRight, FileText, GitCompare, Network, Rocket, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { getAssistantTimelineMessage, proposeCourseCreatorAdjustment } from "@/features/assistant/assistantClient";
import type { CourseCreationBrief } from "@/features/assistant/assistantContract";
import type { CourseCreationScenario, CourseCreationScenarioResolver } from "@/features/course/creation/demoScenario";
import { applyCourseCreatorProposal, courseCreatorMetadata, courseCreatorStages, createCoursePreviewRuntime, createInitialCourseDesign, includedCourseKnowledgeIds, invalidateConfirmedThrough, restoreCourseCreatorDesign, validateCourseCreatorDesign, type CourseCreatorDesign, type CourseCreatorOperation, type CourseCreatorProposal, type CourseCreatorStage } from "@/features/course/creation/courseCreator";
import { buildCourseGraphData, type CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { CourseGraph } from "@/features/course/graph/CourseGraph";
import { auditCourseAssetCoverage } from "@/features/course/runtime/courseAssetCoverage";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { ApiRequestError, apiRequest } from "@/shared/api/apiClient";

const stageLabels = ["学习需求", "要学什么", "课程结构", "内容准备", "课程草稿", "最后检查"];
const stageOutputLabels = ["需求卡", "学习范围", "课程结构预览", "学习内容计划", "已保存的草稿", "最终课程预览"];

function proposalFor(stage: CourseCreatorStage, title: string, operations: CourseCreatorOperation[]): CourseCreatorProposal {
  return { id: crypto.randomUUID(), stage, title, summary: "手动修改与 AI 修改使用同一个 Proposal / Validation / Apply 路径。", operations };
}
function operationLabel(operation: CourseCreatorOperation, titleById: Map<string, string>) {
  if (operation.type === "setRequirement") return `修改 ${operation.field}：${operation.value}`;
  if (operation.type === "setPreferences") return `学习偏好：${operation.values.join("、") || "未指定"}`;
  if (operation.type === "includeKnowledge") return `加入 ${titleById.get(operation.nodeId) ?? operation.nodeId}（${operation.role}）`;
  if (operation.type === "excludeKnowledge") return `移除 ${titleById.get(operation.nodeId) ?? operation.nodeId}`;
  if (operation.type === "setDesiredAsset") return `${operation.desired ? "希望安排" : "取消计划"} ${titleById.get(operation.nodeId) ?? operation.nodeId} · ${{ material: "学习资料", micro: "快速学习", assignment: "实践任务" }[operation.assetType]}`;
  if (operation.type === "moveKnowledge") return `移动 ${titleById.get(operation.nodeId) ?? operation.nodeId} → ${operation.chapterId}`;
  return `调整教学顺序：${operation.orderedKnowledgeIds.map((id) => titleById.get(id) ?? id).join(" → ")}`;
}
const graphCallbacks = { onChapterClick: () => {}, onChapterDoubleClick: () => {}, onKnowledgeClick: () => {}, onAssignmentClick: () => {} };

export function CourseCreationWorkspacePage({ session, onLogout, resolver }: { session: MockSession; onLogout(): void; resolver: CourseCreationScenarioResolver }) {
  const navigate = useNavigate();
  const location = useLocation();
  const briefMessageId = new URLSearchParams(location.search).get("briefId");
  const initialFiles = ((location.state as { files?: File[] } | null)?.files ?? []);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [goldenReference, setGoldenReference] = useState<CourseCreationScenario | null>(null);
  const [brief, setBrief] = useState<CourseCreationBrief | null>(null);
  const [design, setDesign] = useState<CourseCreatorDesign | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [confirmedThrough, setConfirmedThrough] = useState(-1);
  const [pendingProposal, setPendingProposal] = useState<CourseCreatorProposal | null>(null);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [briefError, setBriefError] = useState("");
  const [draftCourseId, setDraftCourseId] = useState<string | null>(null);
  const [persistedRuntime, setPersistedRuntime] = useState<CourseRuntimeData | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [publishValidation, setPublishValidation] = useState<{ valid: boolean; knowledgeCount: number; materialCovered: number; assignmentCovered: number; warnings: { missingMaterial: number; missingAssignment: number; microCoverageAvailable: boolean } } | null>(null);
  const [manualGoal, setManualGoal] = useState("");
  const [manualFoundation, setManualFoundation] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualPreferences, setManualPreferences] = useState("");

  const access = useMemo(() => userKnowledgeAccess(session.userId), [session.userId]);
  const graph = applicationServices.knowledgeRepository.getVisibleGraph(access);
  const titleById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.title])), [graph.nodes]);
  const sourceRuntime = brief?.sourceCourseId ? applicationServices.courseRepository.getCourse(brief.sourceCourseId) : null;

  useEffect(() => {
    let alive = true;
    if (!briefMessageId) { setBriefError("请从 Assistant 的 Course Creation Brief 进入创建流程。"); return; }
    void getAssistantTimelineMessage(briefMessageId).then((message) => {
      if (!alive) return;
      if (message.structuredContent?.type !== "course_creation_brief") throw new Error("该 Assistant timeline 项不是 Course Creation Brief");
      setBrief(message.structuredContent);
    }).catch((error) => { if (alive) setBriefError(error instanceof Error ? error.message : "Course Creation Brief 加载失败"); });
    return () => { alive = false; };
  }, [briefMessageId]);
  useEffect(() => {
    if (!draftCourseId) { setPublishValidation(null); return; }
    void apiRequest<{ validation: NonNullable<typeof publishValidation> }>(`/api/courses?publishCheckCourseId=${encodeURIComponent(draftCourseId)}`).then((result) => setPublishValidation(result.validation)).catch((error) => setAssistantError(error instanceof Error ? error.message : "课程结构检查失败"));
  }, [draftCourseId]);
  useEffect(() => {
    let alive = true;
    if (!briefMessageId) return;
    void apiRequest<{ course: CourseRuntimeData; courseId: string; lifecycle: "draft" | "published" }>(`/api/courses?creationBriefMessageId=${encodeURIComponent(briefMessageId)}`).then((result) => {
      if (!alive) return;
      setDraftCourseId(result.courseId); setPersistedRuntime(result.course);
      if (result.lifecycle === "published") { setPublished(true); setConfirmedThrough(5); setStageIndex(5); }
      else { setConfirmedThrough(3); setStageIndex(4); }
      setRecoveryChecked(true);
    }).catch((error) => {
      if (!alive) return;
      if (!(error instanceof ApiRequestError && error.status === 404)) setBriefError(error instanceof Error ? error.message : "课程草稿恢复失败");
      setRecoveryChecked(true);
    });
    return () => { alive = false; };
  }, [briefMessageId]);
  useEffect(() => {
    let alive = true;
    void resolver.resolve(files).then((scenario) => { if (alive) setGoldenReference(scenario); });
    return () => { alive = false; };
  }, [files, resolver]);
  useEffect(() => {
    if (!brief || design || !recoveryChecked) return;
    const base = createInitialCourseDesign(brief, graph, sourceRuntime, files.map((file) => file.name));
    const initial = persistedRuntime ? restoreCourseCreatorDesign(base, persistedRuntime, graph) : base;
    setDesign(initial); setManualGoal(initial.requirements.goal); setManualFoundation(initial.requirements.learnerFoundation); setManualTime(initial.requirements.timeConstraint); setManualPreferences(initial.requirements.preferences.join("，"));
  }, [brief, design, files, graph, persistedRuntime, recoveryChecked, sourceRuntime]);
  useEffect(() => {
    const referenceMaterialNames = files.map((file) => file.name);
    setDesign((current) => current ? {
      ...current,
      requirements: { ...current.requirements, referenceMaterialNames },
      assets: { ...current.assets, referenceMaterialNames }
    } : current);
  }, [files]);

  const validation = useMemo(() => design ? validateCourseCreatorDesign(design, graph) : { fatal: [], warnings: [], valid: false }, [design, graph]);
  const proposedDesign = useMemo(() => design && pendingProposal ? applyCourseCreatorProposal(design, pendingProposal, graph) : null, [design, graph, pendingProposal]);
  const proposedValidation = useMemo(() => proposedDesign ? validateCourseCreatorDesign(proposedDesign, graph) : null, [proposedDesign, graph]);
  const previewRuntime = useMemo(() => design ? createCoursePreviewRuntime(design) : null, [design]);
  const graphData = useMemo(() => previewRuntime ? buildCourseGraphData(previewRuntime, undefined, graph) : null, [graph, previewRuntime]);
  const sourceIds = useMemo(() => new Set(sourceRuntime?.curriculumCoverages.map((coverage) => coverage.nodeId) ?? []), [sourceRuntime]);
  const includedIds = design ? includedCourseKnowledgeIds(design.scope) : [];
  const sourceDiff = design ? { keep: includedIds.filter((id) => sourceIds.has(id)), remove: [...sourceIds].filter((id) => !includedIds.includes(id)), add: includedIds.filter((id) => !sourceIds.has(id)) } : { keep: [], remove: [], add: [] };
  const assetAudit = persistedRuntime ? auditCourseAssetCoverage(persistedRuntime) : previewRuntime ? auditCourseAssetCoverage(previewRuntime) : null;

  function queueManualRequirements() {
    setPendingProposal(proposalFor("requirements", "需求手动调整", [
      { type: "setRequirement", field: "goal", value: manualGoal.trim() }, { type: "setRequirement", field: "learnerFoundation", value: manualFoundation.trim() },
      { type: "setRequirement", field: "timeConstraint", value: manualTime.trim() }, { type: "setPreferences", values: manualPreferences.split(/[，,；;\n]/).map((item) => item.trim()).filter(Boolean) }
    ]));
  }
  function applyPending() {
    if (!pendingProposal || !proposedDesign || !proposedValidation?.valid) return;
    setDesign(proposedDesign); setPendingProposal(null); setConfirmedThrough((value) => invalidateConfirmedThrough(value, stageIndex));
  }
  async function askAssistant() {
    if (!design || !briefMessageId || !assistantInput.trim()) return;
    setAssistantBusy(true); setAssistantError("");
    try {
      const result = await proposeCourseCreatorAdjustment({ briefMessageId, stage: courseCreatorStages[stageIndex], instruction: assistantInput.trim(), current: design, context: { workspace: "courses", experienceMode: "design", courseId: draftCourseId ?? undefined, selectedObject: `course-creator:${courseCreatorStages[stageIndex]}` } });
      setPendingProposal(result.proposal);
      setAssistantInput("");
    } catch (error) { setAssistantError(error instanceof Error ? error.message : "Assistant Proposal 生成失败"); }
    finally { setAssistantBusy(false); }
  }
  function confirmAndContinue() {
    if (!validation.valid) return;
    setConfirmedThrough((value) => Math.max(value, stageIndex)); setStageIndex((value) => Math.min(5, value + 1)); setPendingProposal(null);
  }
  async function createDraft() {
    if (!design || !briefMessageId || !validation.valid) return;
    setPublishing(true); setAssistantError("");
    try {
      const result = await apiRequest<{ courseId: string; lifecycle: "draft" | "published" }>("/api/courses", { method: "POST", body: JSON.stringify({ creationBriefMessageId: briefMessageId, requirements: design.requirements, scope: design.scope, curriculum: design.curriculum, creatorMetadata: courseCreatorMetadata(design) }) });
      const [loaded, check] = await Promise.all([
        apiRequest<{ course: CourseRuntimeData }>(`/api/courses?id=${encodeURIComponent(result.courseId)}`),
        apiRequest<{ validation: NonNullable<typeof publishValidation> }>(`/api/courses?publishCheckCourseId=${encodeURIComponent(result.courseId)}`)
      ]);
      setDraftCourseId(result.courseId); setPersistedRuntime(loaded.course);
      setPublishValidation(check.validation);
      if (result.lifecycle === "published") { setPublished(true); setConfirmedThrough(5); setStageIndex(5); }
      else { setConfirmedThrough(3); setStageIndex(4); }
    } catch (error) { setAssistantError(error instanceof Error ? error.message : "Course Draft 创建失败"); }
    finally { setPublishing(false); }
  }
  async function publishCourse() {
    if (!draftCourseId || published) return;
    setPublishing(true); setAssistantError("");
    try {
      await apiRequest("/api/courses", { method: "PATCH", body: JSON.stringify({ courseId: draftCourseId, lifecycle: "published" }) });
      const loaded = await apiRequest<{ course: CourseRuntimeData }>(`/api/courses?id=${encodeURIComponent(draftCourseId)}`);
      setPersistedRuntime(loaded.course); setPublished(true); setConfirmedThrough(5);
    } catch (error) { setAssistantError(error instanceof Error ? error.message : "Course Publish 失败"); }
    finally { setPublishing(false); }
  }

  if (briefError) return <main className="atlas-page-shell creator-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="creator-error glass-v2"><h1>无法开始 Course Creator</h1><p>{briefError}</p><button className="atlas-primary" onClick={() => navigate("/messages")}>返回 Assistant</button></section></main>;
  if (!design || !brief) return <main className="atlas-page-shell creator-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="creator-error glass-v2"><Sparkles/><h1>正在读取 Course Creation Brief…</h1></section></main>;

  const stage = courseCreatorStages[stageIndex];
  const displayRuntime = persistedRuntime ?? previewRuntime!;
  const displayGraphData = persistedRuntime ? buildCourseGraphData(persistedRuntime, undefined, graph) : graphData!;

  return <main className="atlas-page-shell creator-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><div className="creator-shell">
    <header className="creator-heading"><div><span className="atlas-kicker">六步课程创建</span><h1>{design.requirements.goal}</h1><p>参考课程和资料只帮助你做决定，不会改变六步流程；没有资料也可以完成创建。</p></div>{draftCourseId ? <span className={`creator-lifecycle ${published ? "published" : "draft"}`}>{published ? "已完成" : "课程草稿"} · {draftCourseId}</span> : null}</header>
    <nav className="creator-stepper" aria-label="Course Creator stages">{stageLabels.map((label, index) => <button key={label} className={`${index === stageIndex ? "active" : ""} ${index <= confirmedThrough ? "done" : ""}`} disabled={index > Math.max(stageIndex, confirmedThrough + 1)} onClick={() => { setStageIndex(index); setPendingProposal(null); }}><i>{index <= confirmedThrough ? <Check size={13}/> : index + 1}</i><span>{label}<small>{stageOutputLabels[index]}</small></span>{index < 5 ? <ChevronRight size={14}/> : null}</button>)}</nav>
    <div className="creator-workspace"><section className="creator-result glass-v2">
      {stage === "requirements" ? <RequirementsResult design={design} sourceTitle={sourceRuntime?.course.title} files={files} goldenReference={goldenReference} manual={{ goal: manualGoal, foundation: manualFoundation, time: manualTime, preferences: manualPreferences }} setManual={{ goal: setManualGoal, foundation: setManualFoundation, time: setManualTime, preferences: setManualPreferences }} queue={queueManualRequirements} setFiles={setFiles}/> : null}
      {stage === "scope" ? <ScopeResult design={design} sourceRuntime={sourceRuntime} sourceDiff={sourceDiff} sourceCount={sourceIds.size} titleById={titleById} setProposal={setPendingProposal}/> : null}
      {stage === "structure" ? <StructureResult design={design} graphData={graphData!} titleById={titleById} setProposal={setPendingProposal}/> : null}
      {stage === "assets" ? <AssetsResult design={design} includedIds={includedIds} titleById={titleById} files={files} sourceRuntime={sourceRuntime} setProposal={setPendingProposal}/> : null}
      {stage === "draft" ? <DraftResult design={design} includedCount={includedIds.length} validation={validation} graphData={draftCourseId ? displayGraphData : graphData!} runtime={persistedRuntime} assetAudit={assetAudit}/> : null}
      {stage === "publish" ? <PublishResult runtime={displayRuntime} graphData={displayGraphData} assetAudit={assetAudit} validation={publishValidation}/> : null}
      {pendingProposal && proposedValidation ? <ProposalPreview proposal={pendingProposal} validation={proposedValidation} titleById={titleById} cancel={() => setPendingProposal(null)} apply={applyPending}/> : null}
    </section>
    <aside className="creator-assistant glass-v2"><header><Bot/><span><strong>EduFlow Assistant</strong><small>同一个 Global Assistant · {stageLabels[stageIndex]} Context</small></span></header><div className="creator-assistant-context"><span>当前产物</span><strong>{stageOutputLabels[stageIndex]}</strong><small>Assistant → Proposal → Preview → Validation → Confirm → Apply</small></div><p>{["澄清 Goal、基础、限制与偏好。", "缩放 Knowledge 范围；只引用真实可见 Knowledge。", "调整章节与教学顺序；不修改 Knowledge prerequisite facts。", "解释 asset gap；缺失资源不阻止创建。", "检查 Draft 与 validation；不能自行落库。", "解释 Publish warning；不能自行发布。"][stageIndex]}</p><textarea value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} placeholder={stageIndex === 1 ? "例如：内容太多，只保留做出第一个模型必须学的" : stageIndex === 2 ? "例如：不要先讲太多理论，早点让我完成第一次实践" : "告诉 Assistant 你想怎样微调当前阶段"}/><button className="atlas-primary" disabled={assistantBusy || !assistantInput.trim()} onClick={() => void askAssistant()}>{assistantBusy ? "正在生成 Proposal…" : "生成结构化 Proposal"}</button>{assistantError ? <p role="alert" className="creator-assistant-error">{assistantError}</p> : null}<small>AI 不直接修改数据库，也不能替你 Publish。</small></aside></div>
    <footer className="creator-footer"><button className="atlas-secondary" disabled={stageIndex === 0 || published} onClick={() => { setStageIndex((value) => Math.max(0, value - 1)); setPendingProposal(null); }}><ArrowLeft size={15}/>返回修改</button><span>{validation.fatal[0] ?? validation.warnings[0] ?? "当前阶段通过确定性检查"}</span>{stageIndex < 4 ? <button className="atlas-primary" disabled={!validation.valid || Boolean(pendingProposal)} onClick={confirmAndContinue}>确认{stageLabels[stageIndex]}并继续<ChevronRight size={15}/></button> : stageIndex === 4 ? draftCourseId ? <><button className="atlas-secondary" onClick={() => window.location.assign(`/courses/${draftCourseId}`)}>打开课程草稿</button><button className="atlas-secondary" disabled={publishing || !validation.valid} onClick={() => void createDraft()}>{publishing ? "正在保存…" : "保存当前修改"}</button><button className="atlas-primary" onClick={() => { setConfirmedThrough(4); setStageIndex(5); }}>确认草稿，进入最后检查<ChevronRight size={15}/></button></> : <button className="atlas-primary" disabled={publishing || !validation.valid} onClick={() => void createDraft()}>{publishing ? "正在创建课程草稿…" : "创建课程草稿"}</button> : published ? <button className="atlas-primary" onClick={() => window.location.assign(`/courses/${draftCourseId}`)}>打开我的课程</button> : <><button className="atlas-secondary" onClick={() => window.location.assign(`/courses/${draftCourseId}`)}>打开草稿预览</button><button className="atlas-primary" disabled={publishing || !draftCourseId || !publishValidation?.valid} onClick={() => void publishCourse()}>{publishing ? "正在完成…" : "完成创建"}</button></>}</footer>
  </div></main>;
}

function ResultTitle({ icon, step, title }: { icon: React.ReactNode; step: string; title: string }) { return <div className="creator-section-title">{icon}<span><small>{step}</small><h2>{title}</h2></span></div>; }
function RequirementsResult({ design, sourceTitle, files, goldenReference, manual, setManual, queue, setFiles }: any) {
  return <><ResultTitle icon={<FileText/>} step="STEP 1 RESULT" title="Course Blueprint Card"/><div className="creator-blueprint"><span className="atlas-kicker">COURSE GOAL</span><h3>{design.requirements.goal}</h3><dl><div><dt>学习者基础</dt><dd>{design.requirements.learnerFoundation}</dd></div><div><dt>时间约束</dt><dd>{design.requirements.timeConstraint}</dd></div><div><dt>学习偏好</dt><dd>{design.requirements.preferences.join(" · ") || "未指定"}</dd></div>{design.requirements.requestedAdjustments ? <div><dt>补充要求（原文）</dt><dd>{design.requirements.requestedAdjustments}</dd></div> : null}<div><dt>Reference Course</dt><dd>{sourceTitle ?? "无"}</dd></div><div><dt>Reference Material</dt><dd>{files.map((file: File) => file.name).join("、") || "无（可完整创建）"}</dd></div></dl>{goldenReference ? <p className="creator-reference-note"><Sparkles size={14}/>已识别 Golden reference「{goldenReference.sourceLabel}」；它只辅助 Proposal，不会绕过六步确认。</p> : null}</div><details className="creator-manual"><summary>手动修改需求</summary><label>课程目标<textarea value={manual.goal} onChange={(event) => setManual.goal(event.target.value)}/></label><label>学习者基础<input value={manual.foundation} onChange={(event) => setManual.foundation(event.target.value)}/></label><label>时间约束<input value={manual.time} onChange={(event) => setManual.time(event.target.value)}/></label><label>学习偏好<input value={manual.preferences} onChange={(event) => setManual.preferences(event.target.value)}/></label><label className="atlas-secondary creator-upload"><Upload size={14}/>添加可选 PDF<input hidden type="file" accept=".pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFiles([file]); }}/></label><button className="atlas-secondary" onClick={queue}>生成修改 Proposal</button></details></>;
}
function ScopeResult({ design, sourceRuntime, sourceDiff, sourceCount, titleById, setProposal }: any) {
  return <><ResultTitle icon={<Network/>} step="STEP 2 RESULT" title="这门课要学什么"/>{sourceRuntime ? <div className="creator-scope-diff"><span>参考课程<strong>{sourceCount} 项学习内容</strong></span><span className="keep">保留<strong>{sourceDiff.keep.length}</strong></span><span className="remove">暂不学习<strong>{sourceDiff.remove.length}</strong></span><span className="add">新增<strong>{sourceDiff.add.length}</strong></span></div> : null}<div className="creator-scope-map">{(["targetKnowledgeIds", "prerequisiteKnowledgeIds", "optionalKnowledgeIds", "excludedKnowledgeIds"] as const).map((key) => <ScopeBucket key={key} bucketKey={key} ids={design.scope[key]} titleById={titleById} setProposal={setProposal}/>)}</div></>;
}
function ScopeBucket({ bucketKey, ids, titleById, setProposal }: { bucketKey: "targetKnowledgeIds" | "prerequisiteKnowledgeIds" | "optionalKnowledgeIds" | "excludedKnowledgeIds"; ids: string[]; titleById: Map<string, string>; setProposal(value: CourseCreatorProposal): void }) {
  const [expanded, setExpanded] = useState(false); const visible = expanded ? ids : ids.slice(0, 8); const derived = bucketKey === "prerequisiteKnowledgeIds";
  const labels = { targetKnowledgeIds: "核心目标", prerequisiteKnowledgeIds: "必要基础", optionalKnowledgeIds: "可选扩展", excludedKnowledgeIds: "暂不学习" };
  return <section className={bucketKey}><h3>{labels[bucketKey]}<small>{ids.length}</small></h3>{derived ? <p>由事实前置关系自动整理，不能手工指定。</p> : null}{visible.map((id) => derived ? <span key={id}><strong>{titleById.get(id) ?? id}</strong></span> : <button key={id} onClick={() => bucketKey === "excludedKnowledgeIds" ? setProposal(proposalFor("scope", "加入学习内容", [{ type: "includeKnowledge", nodeId: id, role: "optional" }])) : setProposal(proposalFor("scope", "移除学习内容", [{ type: "excludeKnowledge", nodeId: id }]))}><strong>{titleById.get(id) ?? id}</strong>{bucketKey === "excludedKnowledgeIds" ? "+" : "×"}</button>)}{ids.length > 8 ? <button className="atlas-secondary" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : `展开全部（${ids.length}）`}</button> : null}{!ids.length ? <p>无</p> : null}</section>;
}
function StructureResult({ design, graphData, titleById, setProposal }: any) {
  return <><ResultTitle icon={<GitCompare/>} step="STEP 3 RESULT · LEFT → RIGHT" title="Horizontal Course Skill Tree Draft"/><div className="creator-graph"><CourseGraph graphData={graphData} view="full" focusedChapterId={null} mode="knowledge" selectedId={null} searchMatchId={null} {...graphCallbacks}/></div><div className="creator-chapter-summary">{design.curriculum.chapters.map((chapter: any, index: number) => <article key={chapter.id}><small>CHAPTER {index + 1}</small><strong>{chapter.title}</strong><span>{chapter.knowledgeIds.length} Knowledge</span>{chapter.knowledgeIds.map((id: string) => <label key={id}>{titleById.get(id) ?? id}<select value={chapter.id} onChange={(event) => setProposal(proposalFor("structure", "移动 Knowledge", [{ type: "moveKnowledge", nodeId: id, chapterId: event.target.value }]))}>{design.curriculum.chapters.map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>)}</article>)}</div></>;
}
function AssetsResult({ design, includedIds, titleById, files, sourceRuntime, setProposal }: any) {
  const a = design.assets;
  const desired = (id: string, type: "material" | "micro" | "assignment") => a[type === "material" ? "desiredMaterialKnowledgeIds" : type === "micro" ? "desiredMicroKnowledgeIds" : "desiredAssignmentKnowledgeIds"].includes(id);
  const toggle = (id: string, assetType: "material" | "micro" | "assignment") => setProposal(proposalFor("assets", "调整学习内容计划", [{ type: "setDesiredAsset", nodeId: id, assetType, desired: !desired(id, assetType) }]));
  return <><ResultTitle icon={<FileText/>} step="STEP 4 RESULT" title="学习内容准备情况"/><div className="creator-asset-stats"><span>当前学习资料<strong>{a.materialKnowledgeIds.length} / {includedIds.length}</strong><small>可复用 {a.availableMaterialKnowledgeIds.length}</small></span><span>当前快速学习<strong>{a.microKnowledgeIds.length} / {includedIds.length}</strong><small>可复用 {a.availableMicroKnowledgeIds.length}</small></span><span>当前实践任务<strong>{a.assignmentKnowledgeIds.length} / {includedIds.length}</strong><small>可复用 {a.availableAssignmentKnowledgeIds.length}</small></span></div><div className="creator-coverage-table"><div className="head"><b>学习内容</b><b>学习资料</b><b>快速学习</b><b>实践任务</b></div>{includedIds.map((id: string) => <div key={id}><strong>{titleById.get(id) ?? id}</strong>{(["material", "micro", "assignment"] as const).map((type) => { const current = a[`${type}KnowledgeIds`].includes(id); const available = a[`available${type[0].toUpperCase()}${type.slice(1)}KnowledgeIds`].includes(id); const planned = desired(id, type); return <button type="button" key={type} onClick={() => toggle(id, type)} title="调整希望安排的学习内容">{current ? "已包含" : available ? "可复用" : planned ? "希望安排" : "缺少"}</button>; })}</div>)}</div><div className="creator-warning"><strong>缺少学习内容不会阻止课程草稿创建</strong><p>{includedIds.length - a.materialKnowledgeIds.length} 项缺学习资料 · {includedIds.length - a.microKnowledgeIds.length} 项缺快速学习 · {includedIds.length - a.assignmentKnowledgeIds.length} 项缺实践任务</p>{files.length ? <p><Upload size={14}/>已选择本次参考资料；当前版本不会自动解析其内容，也不会伪造覆盖关系。</p> : null}{sourceRuntime ? <p>参考课程现有 {sourceRuntime.materials.length} 份学习资料、{sourceRuntime.assignments.length} 个实践任务；上表只把真实映射显示为“可复用”，不会默认复制。</p> : null}</div></>;
}
function DraftResult({ design, includedCount, validation, graphData, runtime, assetAudit }: any) {
  const chapterCount = runtime?.chapters.length ?? design.curriculum.chapters.length; const knowledgeCount = runtime?.curriculumCoverages.length ?? includedCount;
  return <><ResultTitle icon={<FileText/>} step="STEP 5 RESULT" title={runtime ? "已保存的课程草稿" : "课程草稿设计预览"}/><div className="creator-draft-hero"><span className="creator-lifecycle draft">{runtime ? "COURSE DRAFT" : "DESIGN PREVIEW"}</span><h2>{runtime?.course.title ?? design.requirements.goal}</h2><p>{chapterCount} 个篇章 · {knowledgeCount} 个学习内容 · {runtime?.materials.length ?? 0} 份学习资料 · {runtime?.assignments.length ?? 0} 个实践任务</p>{runtime ? <small>课程 ID：{runtime.course.id}</small> : null}<div className="creator-validation"><span className={validation.valid ? "pass" : "fatal"}>课程结构 <strong>{validation.valid ? "正常" : "需要修正"}</strong></span><span>学习内容准备 <strong>{assetAudit?.issues.some((item: any) => item.severity === "warning") ? "有缺口提醒" : "正常"}</strong></span></div></div><div className="creator-mini-graph"><CourseGraph graphData={graphData} view="full" focusedChapterId={null} mode="knowledge" selectedId={null} searchMatchId={null} {...graphCallbacks}/></div></>;
}
function PublishResult({ runtime, graphData, assetAudit, validation }: any) {
  return <><ResultTitle icon={<Rocket/>} step="STEP 6 RESULT" title="最终预览与完成检查"/><div className="creator-learner-preview"><header><span className="atlas-kicker">课程预览</span><h2>{runtime.course.title}</h2><p>{runtime.course.description}</p></header><div className="creator-mini-graph"><CourseGraph graphData={graphData} view="full" focusedChapterId={null} mode="knowledge" selectedId={null} searchMatchId={null} {...graphCallbacks}/></div></div><div className="creator-publish-check"><h3>服务端课程检查</h3>{validation?.valid ? <><p className="pass"><Check size={15}/>课程结构正常</p><p className="pass"><Check size={15}/>{validation.knowledgeCount} 个学习内容身份与课程关系有效</p><p className="pass"><Check size={15}/>没有失效的课程关系</p></> : <p>正在读取服务端检查结果…</p>}{assetAudit?.issues.filter((issue: any) => issue.severity === "warning").map((issue: any) => <p className="warn" key={issue.code}>提醒 · {issue.message}</p>)}<small>学习资料、快速学习或实践任务缺失只会提醒，不阻止完成创建。</small></div></>;
}
function ProposalPreview({ proposal, validation, titleById, cancel, apply }: any) {
  const explanation = proposal.kind === "explain" || !proposal.operations.length;
  return <section className="creator-proposal"><header><Sparkles/><span><small>{explanation ? "EXPLANATION · NO CHANGES" : "PROPOSAL · NOT APPLIED"}</small><h3>{proposal.title}</h3></span><button onClick={cancel} aria-label="关闭"><X size={16}/></button></header><p>{proposal.summary}</p>{explanation ? null : <><div className="creator-proposal-diff">{proposal.operations.map((operation: CourseCreatorOperation, index: number) => <span key={index}>{operationLabel(operation, titleById)}</span>)}</div><div className={validation.valid ? "creator-validation pass" : "creator-validation fatal"}><strong>确定性检查：{validation.valid ? "通过" : "未通过"}</strong>{validation.fatal.map((item: string) => <small key={item}>{item}</small>)}</div></>}<div className="creator-actions"><button className="atlas-secondary" onClick={cancel}>{explanation ? "知道了" : "取消"}</button>{explanation ? null : <button className="atlas-primary" disabled={!validation.valid} onClick={apply}>确认并应用</button>}</div></section>;
}
