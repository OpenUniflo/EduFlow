import { ArrowLeft, Bot, Check, ChevronRight, FileText, GitCompare, Network, Rocket, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { getAssistantTimelineMessage, proposeCourseCreatorAdjustment } from "@/features/assistant/assistantClient";
import type { CourseCreationBrief } from "@/features/assistant/assistantContract";
import type { CourseCreationScenario, CourseCreationScenarioResolver } from "@/features/course/creation/demoScenario";
import { applyCourseCreatorProposal, courseCreatorStages, createCoursePreviewRuntime, createInitialCourseDesign, includedCourseKnowledgeIds, invalidateConfirmedThrough, validateCourseCreatorDesign, type CourseCreatorDesign, type CourseCreatorOperation, type CourseCreatorProposal, type CourseCreatorStage } from "@/features/course/creation/courseCreator";
import { buildCourseGraphData, type CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { CourseGraph } from "@/features/course/graph/CourseGraph";
import { auditCourseAssetCoverage } from "@/features/course/runtime/courseAssetCoverage";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { apiRequest } from "@/shared/api/apiClient";

const stageLabels = ["需求", "Knowledge 范围", "课程结构", "学习资源", "Course Draft", "Preview / Publish"];
const stageOutputLabels = ["Course Blueprint", "Course Scope Map", "Horizontal Skill Tree Draft", "Asset Coverage Board", "Persisted Draft", "Learner Preview"];

function proposalFor(stage: CourseCreatorStage, title: string, operations: CourseCreatorOperation[]): CourseCreatorProposal {
  return { id: crypto.randomUUID(), stage, title, summary: "手动修改与 AI 修改使用同一个 Proposal / Validation / Apply 路径。", operations };
}
function operationLabel(operation: CourseCreatorOperation, titleById: Map<string, string>) {
  if (operation.type === "setRequirement") return `修改 ${operation.field}：${operation.value}`;
  if (operation.type === "setPreferences") return `学习偏好：${operation.values.join("、") || "未指定"}`;
  if (operation.type === "includeKnowledge") return `加入 ${titleById.get(operation.nodeId) ?? operation.nodeId}（${operation.role}）`;
  if (operation.type === "excludeKnowledge") return `移除 ${titleById.get(operation.nodeId) ?? operation.nodeId}`;
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
    let alive = true;
    void resolver.resolve(files).then((scenario) => { if (alive) setGoldenReference(scenario); });
    return () => { alive = false; };
  }, [files, resolver]);
  useEffect(() => {
    if (!brief || design) return;
    const initial = createInitialCourseDesign(brief, graph, sourceRuntime, files.map((file) => file.name));
    setDesign(initial); setManualGoal(initial.requirements.goal); setManualFoundation(initial.requirements.learnerFoundation); setManualTime(initial.requirements.timeConstraint); setManualPreferences(initial.requirements.preferences.join("，"));
  }, [brief, design, files, graph, sourceRuntime]);
  useEffect(() => {
    const referenceMaterialNames = files.map((file) => file.name);
    setDesign((current) => current ? {
      ...current,
      requirements: { ...current.requirements, referenceMaterialNames },
      assets: { ...current.assets, referenceMaterialNames }
    } : current);
  }, [files]);

  const validation = useMemo(() => design ? validateCourseCreatorDesign(design, graph) : { fatal: [], warnings: [], valid: false }, [design, graph]);
  const proposedDesign = useMemo(() => design && pendingProposal ? applyCourseCreatorProposal(design, pendingProposal) : null, [design, pendingProposal]);
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
      setPendingProposal(result.proposal); setAssistantInput("");
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
      const result = await apiRequest<{ courseId: string; lifecycle: "draft" }>("/api/courses", { method: "POST", body: JSON.stringify({ creationBriefMessageId: briefMessageId, requirements: design.requirements, scope: design.scope, curriculum: design.curriculum }) });
      const loaded = await apiRequest<{ course: CourseRuntimeData }>(`/api/courses?id=${encodeURIComponent(result.courseId)}`);
      setDraftCourseId(result.courseId); setPersistedRuntime(loaded.course); setConfirmedThrough(4); setStageIndex(5);
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
    <header className="creator-heading"><div><span className="atlas-kicker">ONE FIXED COURSE CREATION PIPELINE</span><h1>{design.requirements.goal}</h1><p>Reference 只帮助决策，不改变建课流程。没有资料也可以完成创建。</p></div>{draftCourseId ? <span className={`creator-lifecycle ${published ? "published" : "draft"}`}>{published ? "PUBLISHED" : "DRAFT"} · {draftCourseId}</span> : null}</header>
    <nav className="creator-stepper" aria-label="Course Creator stages">{stageLabels.map((label, index) => <button key={label} className={`${index === stageIndex ? "active" : ""} ${index <= confirmedThrough ? "done" : ""}`} disabled={index > Math.max(stageIndex, confirmedThrough + 1)} onClick={() => { setStageIndex(index); setPendingProposal(null); }}><i>{index <= confirmedThrough ? <Check size={13}/> : index + 1}</i><span>{label}<small>{stageOutputLabels[index]}</small></span>{index < 5 ? <ChevronRight size={14}/> : null}</button>)}</nav>
    <div className="creator-workspace"><section className="creator-result glass-v2">
      {stage === "requirements" ? <RequirementsResult design={design} sourceTitle={sourceRuntime?.course.title} files={files} goldenReference={goldenReference} manual={{ goal: manualGoal, foundation: manualFoundation, time: manualTime, preferences: manualPreferences }} setManual={{ goal: setManualGoal, foundation: setManualFoundation, time: setManualTime, preferences: setManualPreferences }} queue={queueManualRequirements} setFiles={setFiles}/> : null}
      {stage === "scope" ? <ScopeResult design={design} sourceRuntime={sourceRuntime} sourceDiff={sourceDiff} sourceCount={sourceIds.size} titleById={titleById} setProposal={setPendingProposal}/> : null}
      {stage === "structure" ? <StructureResult design={design} graphData={graphData!} titleById={titleById} setProposal={setPendingProposal}/> : null}
      {stage === "assets" ? <AssetsResult design={design} includedIds={includedIds} titleById={titleById} files={files} sourceRuntime={sourceRuntime}/> : null}
      {stage === "draft" ? <DraftResult design={design} includedCount={includedIds.length} validation={validation} graphData={graphData!}/> : null}
      {stage === "publish" ? <PublishResult runtime={displayRuntime} graphData={displayGraphData} assetAudit={assetAudit}/> : null}
      {pendingProposal && proposedValidation ? <ProposalPreview proposal={pendingProposal} validation={proposedValidation} titleById={titleById} cancel={() => setPendingProposal(null)} apply={applyPending}/> : null}
    </section>
    <aside className="creator-assistant glass-v2"><header><Bot/><span><strong>EduFlow Assistant</strong><small>同一个 Global Assistant · {stageLabels[stageIndex]} Context</small></span></header><div className="creator-assistant-context"><span>当前产物</span><strong>{stageOutputLabels[stageIndex]}</strong><small>Assistant → Proposal → Preview → Validation → Confirm → Apply</small></div><p>{["澄清 Goal、基础、限制与偏好。", "缩放 Knowledge 范围；只引用真实可见 Knowledge。", "调整章节与教学顺序；不修改 Knowledge prerequisite facts。", "解释 asset gap；缺失资源不阻止创建。", "检查 Draft 与 validation；不能自行落库。", "解释 Publish warning；不能自行发布。"][stageIndex]}</p><textarea value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} placeholder={stageIndex === 1 ? "例如：内容太多，只保留做出第一个模型必须学的" : stageIndex === 2 ? "例如：不要先讲太多理论，早点让我完成第一次实践" : "告诉 Assistant 你想怎样微调当前阶段"}/><button className="atlas-primary" disabled={assistantBusy || !assistantInput.trim()} onClick={() => void askAssistant()}>{assistantBusy ? "正在生成 Proposal…" : "生成结构化 Proposal"}</button>{assistantError ? <p role="alert" className="creator-assistant-error">{assistantError}</p> : null}<small>AI 不直接修改数据库，也不能替你 Publish。</small></aside></div>
    <footer className="creator-footer"><button className="atlas-secondary" disabled={stageIndex === 0 || published} onClick={() => { setStageIndex((value) => Math.max(0, value - 1)); setPendingProposal(null); }}><ArrowLeft size={15}/>返回修改</button><span>{validation.fatal[0] ?? validation.warnings[0] ?? "当前阶段通过确定性检查"}</span>{stageIndex < 4 ? <button className="atlas-primary" disabled={!validation.valid || Boolean(pendingProposal)} onClick={confirmAndContinue}>确认{stageLabels[stageIndex]}并继续<ChevronRight size={15}/></button> : stageIndex === 4 ? <button className="atlas-primary" disabled={publishing || !validation.valid || Boolean(draftCourseId)} onClick={() => void createDraft()}>{publishing ? "正在创建真实 Draft…" : draftCourseId ? "Draft 已创建" : "确认并创建 Course Draft"}</button> : published ? <button className="atlas-primary" onClick={() => window.location.assign(`/courses/${draftCourseId}`)}>打开最终 Course</button> : <><button className="atlas-secondary" onClick={() => window.location.assign(`/courses/${draftCourseId}`)}>打开 Draft Preview</button><button className="atlas-primary" disabled={publishing || !draftCourseId} onClick={() => void publishCourse()}>{publishing ? "正在发布…" : "发布课程"}</button></>}</footer>
  </div></main>;
}

function ResultTitle({ icon, step, title }: { icon: React.ReactNode; step: string; title: string }) { return <div className="creator-section-title">{icon}<span><small>{step}</small><h2>{title}</h2></span></div>; }
function RequirementsResult({ design, sourceTitle, files, goldenReference, manual, setManual, queue, setFiles }: any) {
  return <><ResultTitle icon={<FileText/>} step="STEP 1 RESULT" title="Course Blueprint Card"/><div className="creator-blueprint"><span className="atlas-kicker">COURSE GOAL</span><h3>{design.requirements.goal}</h3><dl><div><dt>学习者基础</dt><dd>{design.requirements.learnerFoundation}</dd></div><div><dt>时间约束</dt><dd>{design.requirements.timeConstraint}</dd></div><div><dt>学习偏好</dt><dd>{design.requirements.preferences.join(" · ") || "未指定"}</dd></div><div><dt>Reference Course</dt><dd>{sourceTitle ?? "无"}</dd></div><div><dt>Reference Material</dt><dd>{files.map((file: File) => file.name).join("、") || "无（可完整创建）"}</dd></div></dl>{goldenReference ? <p className="creator-reference-note"><Sparkles size={14}/>已识别 Golden reference「{goldenReference.sourceLabel}」；它只辅助 Proposal，不会绕过六步确认。</p> : null}</div><details className="creator-manual"><summary>手动修改需求</summary><label>课程目标<textarea value={manual.goal} onChange={(event) => setManual.goal(event.target.value)}/></label><label>学习者基础<input value={manual.foundation} onChange={(event) => setManual.foundation(event.target.value)}/></label><label>时间约束<input value={manual.time} onChange={(event) => setManual.time(event.target.value)}/></label><label>学习偏好<input value={manual.preferences} onChange={(event) => setManual.preferences(event.target.value)}/></label><label className="atlas-secondary creator-upload"><Upload size={14}/>添加可选 PDF<input hidden type="file" accept=".pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFiles([file]); }}/></label><button className="atlas-secondary" onClick={queue}>生成修改 Proposal</button></details></>;
}
function ScopeResult({ design, sourceRuntime, sourceDiff, sourceCount, titleById, setProposal }: any) {
  return <><ResultTitle icon={<Network/>} step="STEP 2 RESULT" title="Course Scope Map"/>{sourceRuntime ? <div className="creator-scope-diff"><span>Reference Course<strong>{sourceCount} Knowledge</strong></span><span className="keep">Keep<strong>{sourceDiff.keep.length}</strong></span><span className="remove">Remove<strong>{sourceDiff.remove.length}</strong></span><span className="add">Add<strong>{sourceDiff.add.length}</strong></span></div> : null}<div className="creator-scope-map">{(["targetKnowledgeIds", "prerequisiteKnowledgeIds", "optionalKnowledgeIds", "excludedKnowledgeIds"] as const).map((key) => <section key={key} className={key}><h3>{{ targetKnowledgeIds: "Target", prerequisiteKnowledgeIds: "Required prerequisite", optionalKnowledgeIds: "Optional / recommended", excludedKnowledgeIds: "Candidate excluded" }[key]}<small>{design.scope[key].length}</small></h3>{design.scope[key].map((id: string) => <button key={id} onClick={() => key === "excludedKnowledgeIds" ? setProposal(proposalFor("scope", "加入 Knowledge", [{ type: "includeKnowledge", nodeId: id, role: "optional" }])) : setProposal(proposalFor("scope", "移除 Knowledge", [{ type: "excludeKnowledge", nodeId: id }]))}><strong>{titleById.get(id) ?? id}</strong><small>{id}</small>{key === "excludedKnowledgeIds" ? "+" : "×"}</button>)}{!design.scope[key].length ? <p>无</p> : null}</section>)}</div></>;
}
function StructureResult({ design, graphData, titleById, setProposal }: any) {
  return <><ResultTitle icon={<GitCompare/>} step="STEP 3 RESULT · LEFT → RIGHT" title="Horizontal Course Skill Tree Draft"/><div className="creator-graph"><CourseGraph graphData={graphData} view="full" focusedChapterId={null} mode="knowledge" selectedId={null} searchMatchId={null} {...graphCallbacks}/></div><div className="creator-chapter-summary">{design.curriculum.chapters.map((chapter: any, index: number) => <article key={chapter.id}><small>CHAPTER {index + 1}</small><strong>{chapter.title}</strong><span>{chapter.knowledgeIds.length} Knowledge</span>{chapter.knowledgeIds.map((id: string) => <label key={id}>{titleById.get(id) ?? id}<select value={chapter.id} onChange={(event) => setProposal(proposalFor("structure", "移动 Knowledge", [{ type: "moveKnowledge", nodeId: id, chapterId: event.target.value }]))}>{design.curriculum.chapters.map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>)}</article>)}</div></>;
}
function AssetsResult({ design, includedIds, titleById, files, sourceRuntime }: any) {
  return <><ResultTitle icon={<FileText/>} step="STEP 4 RESULT" title="Learning Asset Coverage Board"/><div className="creator-asset-stats"><span>Material<strong>{design.assets.materialKnowledgeIds.length} / {includedIds.length}</strong></span><span>Micro<strong>{design.assets.microKnowledgeIds.length} / {includedIds.length}</strong></span><span>Assignment<strong>{design.assets.assignmentKnowledgeIds.length} / {includedIds.length}</strong></span></div><div className="creator-coverage-table"><div className="head"><b>Knowledge</b><b>Material</b><b>Micro</b><b>Assignment</b></div>{includedIds.map((id: string) => <div key={id}><strong>{titleById.get(id) ?? id}</strong><span>{design.assets.materialKnowledgeIds.includes(id) ? "✓" : "—"}</span><span>{design.assets.microKnowledgeIds.includes(id) ? "✓" : "—"}</span><span>{design.assets.assignmentKnowledgeIds.includes(id) ? "✓" : "—"}</span></div>)}</div><div className="creator-warning"><strong>WARN · Asset gaps do not block Course creation</strong><p>{includedIds.length} Knowledge no Material · {includedIds.length} no Micro · {includedIds.length} no Assignment</p>{files.length ? <p><Upload size={14}/>Reference Material 已记录；当前没有可靠 mapping，因此不会伪造 coverage。</p> : null}{sourceRuntime ? <p>Reference Course 有 {sourceRuntime.materials.length} Material、{sourceRuntime.assignments.length} Assignment；仅作复用候选，不默认复制。</p> : null}</div></>;
}
function DraftResult({ design, includedCount, validation, graphData }: any) {
  return <><ResultTitle icon={<FileText/>} step="STEP 5 RESULT" title="Course Draft Preview"/><div className="creator-draft-hero"><span className="creator-lifecycle draft">DESIGN PREVIEW</span><h2>{design.requirements.goal}</h2><p>{design.curriculum.chapters.length} Chapters · {includedCount} Knowledge · 0 Materials · 0 Assignments</p><div className="creator-validation"><span className={validation.valid ? "pass" : "fatal"}>Graph Validation <strong>{validation.valid ? "PASS" : "FAIL"}</strong></span><span>Asset Coverage <strong>0% · WARN</strong></span></div></div><div className="creator-mini-graph"><CourseGraph graphData={graphData} view="full" focusedChapterId={null} mode="knowledge" selectedId={null} searchMatchId={null} {...graphCallbacks}/></div></>;
}
function PublishResult({ runtime, graphData, assetAudit }: any) {
  return <><ResultTitle icon={<Rocket/>} step="STEP 6 RESULT" title="Learner Preview + Publish Check"/><div className="creator-learner-preview"><header><span className="atlas-kicker">LEARNER VIEW</span><h2>{runtime.course.title}</h2><p>{runtime.course.description}</p></header><div className="creator-mini-graph"><CourseGraph graphData={graphData} view="full" focusedChapterId={null} mode="knowledge" selectedId={null} searchMatchId={null} {...graphCallbacks}/></div></div><div className="creator-publish-check"><h3>Publish Check</h3><p className="pass"><Check size={15}/>Course Graph valid</p><p className="pass"><Check size={15}/>Knowledge / Curriculum references valid</p><p className="pass"><Check size={15}/>No dangling Course relations</p>{assetAudit?.issues.filter((issue: any) => issue.severity === "warning").map((issue: any) => <p className="warn" key={issue.code}>WARN · {issue.message}</p>)}<small>Asset Warning ≠ structural failure</small></div></>;
}
function ProposalPreview({ proposal, validation, titleById, cancel, apply }: any) {
  return <section className="creator-proposal"><header><Sparkles/><span><small>PROPOSAL · NOT APPLIED</small><h3>{proposal.title}</h3></span><button onClick={cancel} aria-label="取消 Proposal"><X size={16}/></button></header><p>{proposal.summary}</p><div className="creator-proposal-diff">{proposal.operations.length ? proposal.operations.map((operation: CourseCreatorOperation, index: number) => <span key={index}>{operationLabel(operation, titleById)}</span>) : <span>说明型 Proposal：不修改 Course authority data。</span>}</div><div className={validation.valid ? "creator-validation pass" : "creator-validation fatal"}><strong>Deterministic Validation: {validation.valid ? "PASS" : "FAIL"}</strong>{validation.fatal.map((item: string) => <small key={item}>{item}</small>)}</div><div className="creator-actions"><button className="atlas-secondary" onClick={cancel}>取消</button><button className="atlas-primary" disabled={!validation.valid || !proposal.operations.length} onClick={apply}>确认并 Apply</button></div></section>;
}
