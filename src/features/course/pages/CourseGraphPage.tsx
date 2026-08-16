import { ArrowLeft, ArrowRight, BookOpen, Check, Clock3, Crosshair, FileText, Layers3, Maximize2, Minus, Network, Plus, Search, Settings2, Sparkles, Target, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "@/features/course/courseSelection";
import { CourseGraph, type CourseGraphHandle } from "@/features/course/graph/CourseGraph";
import { CourseDesignAssistant } from "@/features/course/components/CourseDesignAssistant";
import { buildCourseDesignAssistantContext, type CourseDesignAssistantProvider } from "@/features/course/courseDesignAssistant";
import type { CourseGraphView } from "@/features/course/graph/courseGraphProjection";
import { buildCourseGraphData } from "@/features/course/runtime/courseRuntime";
import { useUserCourseState } from "@/features/learning/progress/progressService";
import type { AssignmentContext, CourseAssignment, CourseChapterProjection, CourseSkillTreeNode } from "@/features/course/types";
import { applicationServices } from "@/app/services/applicationServices";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildMaterialDeepLink } from "@/features/material/materialNavigation";
import { sortMaterials } from "@/features/material/materialOrdering";
import { canDesignCourse, canUseCourseDesignFeatures } from "@/features/auth/capabilities";
import { ExperienceModeToggle } from "@/shared/components/ExperienceModeToggle";
import { addGeneratedMaterial, addMaterialLink, applyCourseAuthoringDraft, createGeneratedArticleDraft, readCourseAuthoringDraft, removeMaterialLink, subscribeCourseAuthoringDraft, writeCourseAuthoringDraft } from "@/features/course/authoring/courseAuthoringDraft";

const { courseRepository, knowledgeRepository, userKnowledgeRepository } = applicationServices;

const knowledgeStatusLabel = { completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" } as const;
const assignmentStatusLabel = { completed: "已完成", "in-progress": "进行中", "not-started": "未开始" } as const;

function lessonsForChapter(runtime: NonNullable<ReturnType<typeof courseRepository.getCourse>>, chapterId: string) {
  return runtime.lessons.filter((lesson) => lesson.chapterId === chapterId).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function CourseGraphPage({ session, onLogout, courseDesignAssistantProvider }: { session: MockSession; onLogout: () => void; courseDesignAssistantProvider?:CourseDesignAssistantProvider }) {
  const navigate = useNavigate();
  const { courseId = "", chapterId: routeChapterId } = useParams();
  const baseRuntime = courseRepository.getCourse(courseId);
  const [authoringRevision, setAuthoringRevision] = useState(0);
  const runtime = useMemo(() => baseRuntime ? applyCourseAuthoringDraft(baseRuntime, readCourseAuthoringDraft(baseRuntime.course.id)) : undefined, [authoringRevision, baseRuntime]);
  const orderedMaterials = useMemo(() => runtime ? sortMaterials(runtime.materials, runtime.lessons) : [], [runtime]);
  const userCourseState = useUserCourseState(session.userId, courseId);
  const graphData = useMemo(() => runtime ? buildCourseGraphData(runtime, userCourseState, knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)), userKnowledgeRepository.getUserKnowledge(session.userId)) : null, [runtime, session.userId, userCourseState]);
  const courseChapters = graphData?.chapters ?? [];
  const courseSkillTreeNodes = graphData?.knowledgeNodes ?? [];
  const courseSkillTreeEdges = graphData?.knowledgeEdges ?? [];
  const graphRef = useRef<CourseGraphHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<CourseGraphView>("overview");
  const [mode, setMode] = useState<"knowledge" | "assignment">("knowledge");
  const [experience, setExperience] = useState<"learn" | "design">("learn");
  const detailFacet = detailFacetForMode(mode);
  const [selectedAnchor, setSelectedAnchor] = useState<SelectedAnchor | null>(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchMatch, setSearchMatch] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"detail" | "materials">("detail");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [toast, setToast] = useState(() => new URLSearchParams(window.location.search).has("created"));
  const [designActionNotice, setDesignActionNotice] = useState<string | null>(null);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [generatingMaterial, setGeneratingMaterial] = useState(false);
  const designEnabled = canUseCourseDesignFeatures(session,experience);
  const selectedChapter = selectedAnchor?.kind === "chapter" ? courseChapters.find((item) => item.id === selectedAnchor.id) ?? null : null;
  const selectedNode = selectedAnchor?.kind === "knowledge" ? courseSkillTreeNodes.find((item) => item.id === selectedAnchor.id) ?? null : null;
  const selectedFlowId = flowIdForAnchor(selectedAnchor);
  const assignmentProjection = selectedNode && detailFacet === "assignment" ? assignmentProjectionForNode(selectedNode, activeAssignmentId) : null;
  const chapterAssignment = selectedChapter && detailFacet === "assignment" ? buildChapterAssignmentProjection(selectedChapter, courseSkillTreeNodes) : null;
  const drawerOpen = Boolean(selectedAnchor || materialsOpen);
  const drawerMaterialItems = useMemo(() => {
    if (!runtime) return [];
    if (selectedNode) return selectedNode.materialContexts.flatMap((context) => {
      const material = runtime.materials.find((item) => item.id === context.materialId);
      return material ? [{material,context}] : [];
    });
    if (selectedChapter) {
      const lessonIds = new Set(lessonsForChapter(runtime, selectedChapter.id).map((lesson) => lesson.id));
      return orderedMaterials.filter((material) => lessonIds.has(material.lessonId)).map((material) => ({material,context:undefined}));
    }
    return orderedMaterials.map((material) => ({material,context:undefined}));
  }, [orderedMaterials, runtime, selectedChapter, selectedNode]);
  const assistantContext = useMemo(() => runtime && graphData ? buildCourseDesignAssistantContext(runtime,graphData,selectedAnchor,detailFacet,activeAssignmentId) : null,[activeAssignmentId,detailFacet,graphData,runtime,selectedAnchor]);
  const routeChapter = routeChapterId ? courseChapters.find((chapter) => chapter.id === routeChapterId) : null;
  const invalidChapter = Boolean(runtime && routeChapterId && !routeChapter);

  useEffect(() => subscribeCourseAuthoringDraft(() => setAuthoringRevision((value) => value + 1)), []);

  useEffect(() => {
    if (!routeChapterId || !routeChapter) return;
    setView("focused");
    setFocusedChapterId(routeChapter.id);
    setSelectedAnchor({ kind: "chapter", id: routeChapter.id });
  }, [routeChapter, routeChapterId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!designActionNotice) return;
    const timer = window.setTimeout(() => setDesignActionNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [designActionNotice]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (drawerOpen) { setSelectedAnchor(null); setMaterialsOpen(false); setActiveAssignmentId(null); }
      else if (view === "focused") changeView("overview");
      else if (searchExpanded) { setSearchExpanded(false); setQuery(""); setSearchMatch(null); }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawerOpen, searchExpanded, view]);

  const searchResult = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const chapter = courseChapters.find((item) => [item.id, item.title, item.outcome, item.description].some((value) => value.toLowerCase().includes(needle)));
    if (chapter) return { kind: "chapter" as const, id: chapter.id };
    const knowledge = courseSkillTreeNodes.find((item) => [item.id, item.title, `第 ${item.lesson} 课`, item.description, ...item.assignmentContexts.map((context) => context.assignment.title)].some((value) => value.toLowerCase().includes(needle)));
    return knowledge ? { kind: "knowledge" as const, id: knowledge.id } : null;
  }, [courseChapters, courseSkillTreeNodes, query]);

  useEffect(() => setSearchMatch(flowIdForAnchor(searchResult)), [searchResult]);

  function changeView(next: CourseGraphView, chapterId: string | null = null) {
    setView(next);
    setFocusedChapterId(next === "focused" ? chapterId : null);
    setSelectedAnchor(null);
    setActiveAssignmentId(null);
    setMaterialsOpen(false);
    setDrawerTab("detail");
    if (next !== "focused" && routeChapterId) navigate(`/courses/${courseId}`, { replace: true });
  }

  function focusChapter(chapter: CourseChapterProjection) { changeView("focused", chapter.id); navigate(`/courses/${courseId}/chapters/${chapter.id}`); setToast(true); }
  function selectAnchor(anchor: SelectedAnchor) { setMaterialsOpen(false); setDrawerTab("detail"); setActiveAssignmentId(null); setSelectedAnchor(anchor); }
  function selectChapter(chapter: CourseChapterProjection) { selectAnchor({ kind: "chapter", id: chapter.id }); }
  function selectKnowledge(node: CourseSkillTreeNode) { selectAnchor({ kind: "knowledge", id: node.id }); }
  function switchMode() { setMode((current) => current === "knowledge" ? "assignment" : "knowledge"); setActiveAssignmentId(null); setDrawerTab("detail"); }

  function updateAuthoringDraft(update: (state: ReturnType<typeof readCourseAuthoringDraft>) => ReturnType<typeof readCourseAuthoringDraft>) {
    if (!runtime) return;
    writeCourseAuthoringDraft(update(readCourseAuthoringDraft(runtime.course.id)));
  }

  function linkMaterialToSelected(materialId: string) {
    if (!selectedNode || !runtime) return;
    updateAuthoringDraft((state) => addMaterialLink(state, { nodeId: selectedNode.id, materialId }));
    setDesignActionNotice("课件已关联到当前 Knowledge。");
  }

  function unlinkMaterialFromSelected(materialId: string) {
    if (!selectedNode || !runtime) return;
    updateAuthoringDraft((state) => removeMaterialLink(state, { nodeId: selectedNode.id, materialId }));
    setDesignActionNotice("已移除当前 Knowledge 的课件关联；课件本体未删除。");
  }

  async function generateMaterialForSelected() {
    if (!selectedNode || !runtime || generatingMaterial) return null;
    setGeneratingMaterial(true);
    setDrawerTab("materials");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const material = createGeneratedArticleDraft({ runtime, nodeId: selectedNode.id, nodeTitle: selectedNode.title });
    updateAuthoringDraft((state) => addGeneratedMaterial(state, material, selectedNode.id));
    setGeneratingMaterial(false);
    setDesignActionNotice("AI Article 草稿已生成并自动关联当前 Knowledge。");
    return { message: `已生成“${material.title}”，并自动关联到当前 Knowledge。` };
  }

  async function handleAssistantAction(actionId: string) {
    if (assistantContext?.kind !== "knowledge") return null;
    if (actionId === "link-material") {
      setDrawerTab("materials");
      setMaterialPickerOpen(true);
      return { message: "已打开课程课件选择器；已关联项会被禁用。" };
    }
    if (actionId === "generate-material") return generateMaterialForSelected();
    return null;
  }

  function executeSearch() {
    if (!searchResult) return;
    if (searchResult.kind === "knowledge") {
      const node = courseSkillTreeNodes.find((item) => item.id === searchResult.id);
      if (!node) return;
      if (view === "overview" || (view === "focused" && focusedChapterId !== node.chapterId)) changeView("focused", node.chapterId);
      setSelectedAnchor(searchResult);
      setActiveAssignmentId(null);
      window.setTimeout(() => graphRef.current?.focus(`knowledge:${node.id}`), 650);
    } else {
      setSelectedAnchor(searchResult);
      setActiveAssignmentId(null);
      window.setTimeout(() => graphRef.current?.focus(`chapter:${searchResult.id}`), 80);
    }
  }

  function selectPrerequisite(id: string) {
    const target = courseSkillTreeNodes.find((item) => item.id === id);
    if (!target) return;
    if (view !== "full" && focusedChapterId !== target.chapterId) changeView("focused", target.chapterId);
    setSelectedAnchor({ kind: "knowledge", id: target.id });
    setActiveAssignmentId(null);
    window.setTimeout(() => graphRef.current?.focus(`knowledge:${id}`), 620);
  }

  function assignmentDetail(assignment: CourseAssignment, context: AssignmentContext, node: CourseSkillTreeNode, canReturnToGroup: boolean) {
    const incomingDependencies = runtime!.assignmentDependencies.filter((dependency) => dependency.targetAssignmentId === assignment.id).flatMap((dependency) => {
      const source = runtime!.assignments.find((item) => item.id === dependency.sourceAssignmentId);
      return source ? [source] : [];
    });
    return <>
      {canReturnToGroup ? <button className="atlas-assignment-back" onClick={() => setActiveAssignmentId(null)}><ArrowLeft size={14} />返回该节点全部实训</button> : null}
      {experience === "design" ? <>
        <section className="atlas-drawer-section"><h3>Assignment Mapping</h3><div className="atlas-drawer-info-card"><Settings2 size={15} /><span>{assignment.experience?.type ?? assignment.mode} renderer · {context.role} coverage</span></div></section>
        <section className="atlas-drawer-section"><h3>AssignmentDependency</h3>{incomingDependencies.length ? <div className="atlas-requirement-list">{incomingDependencies.map((item) => <div className="atlas-requirement" key={item.id}><span className="atlas-requirement-icon ready">→</span><span>{item.title}</span></div>)}</div> : <p>无直接前置 Assignment。</p>}</section>
        <section className="atlas-drawer-section"><h3>AI 教学建议</h3><p>{assignment.experience?.type === "trace" ? "建议让学生先定位错误步骤，再解释恢复和终止顺序。" : "当前实训覆盖、预期输出和验收标准完整，可继续优化任务措辞。"}</p><button className="atlas-secondary" onClick={() => setDesignActionNotice("Prototype · AI 建议：强化验收标准中对可复核输出的要求。")}>AI 优化任务说明</button></section>
      </> : null}
      <section className="atlas-drawer-section"><h3>任务说明</h3><p>{assignment.description}</p></section>
      {assignment.inheritedOutputs?.length ? <section className="atlas-drawer-section"><h3>已加载前置实训成果</h3><div className="atlas-assignment-criteria">{assignment.inheritedOutputs.map((item) => <span key={item}><Check size={14} />{item}</span>)}</div>{assignment.dependencyRationale ? <p>{assignment.dependencyRationale}</p> : null}</section> : null}
      <section className="atlas-drawer-section"><h3>任务要求</h3><ol className="atlas-assignment-list">{assignment.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ol></section>
      <section className="atlas-drawer-section"><h3>预期成果</h3><div className="atlas-drawer-info-card"><FileText size={15} /><span>{assignment.expectedOutput}</span></div></section>
      <section className="atlas-drawer-section"><h3>验收标准</h3><div className="atlas-assignment-criteria">{assignment.acceptanceCriteria.map((criterion) => <span key={criterion}><Check size={14} />{criterion}</span>)}</div></section>
      {assignment.estimatedMinutes ? <section className="atlas-drawer-section"><h3>预计时间</h3><div className="atlas-drawer-info-card"><Clock3 size={15} /><span>{assignment.estimatedMinutes} 分钟</span></div></section> : null}
      {assignment.projectContribution ? <section className="atlas-drawer-section"><h3>课程中的作用</h3><p>{assignment.projectContribution}</p></section> : null}
      {assignment.mode === "workflow" && assignment.workflowTemplateId ? <section className="atlas-drawer-section"><h3>执行环境</h3><div className="atlas-drawer-info-card"><Settings2 size={15} /><span>工作流画布</span></div></section> : null}
      <section className="atlas-drawer-section"><h3>关联 Knowledge</h3><div className="atlas-requirement-list"><div className="atlas-requirement"><span className="atlas-requirement-icon ready">◆</span><span>{node.title} · {context.role}</span></div></div></section>
    </>;
  }

  function materialLink(materialId: string, node = selectedNode) {
    const segmentId = node?.materialContexts.find((context) => context.materialId === materialId)?.primarySegmentId
      ?? userCourseState.materialStates[materialId]?.recentSegmentId;
    return buildMaterialDeepLink({ courseId: runtime!.course.id, materialId, segmentId });
  }

  function relatedMaterialsPanel() {
    if (!drawerMaterialItems.length) return <div className="atlas-related-material-empty"><FileText size={22}/><strong>{designEnabled ? "暂未关联课件" : "暂未关联学习材料"}</strong>{designEnabled ? <span>可使用下方 Prototype 操作选择课程课件。</span> : null}</div>;
    return <div className={`atlas-related-material-list ${designEnabled ? "design" : "learn"}`}>{drawerMaterialItems.map(({material,context}) => {
      const mappings = selectedNode ? runtime!.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === selectedNode.id && coverage.materialId === material.id).map((coverage) => ({...coverage,segment:material.segments.find((segment) => segment.id === coverage.segmentId)})) : [];
      return <article className="atlas-related-material-card" key={material.id}>
        <FileText size={19}/><div className="atlas-related-material-copy"><strong>{material.title}</strong>{material.description ? <p>{material.description}</p> : null}<small>{material.duration ?? "自定进度"}</small>
          {designEnabled ? <div className="atlas-related-material-mapping"><span>Material · {material.type}</span>{selectedNode ? <><span>关联段落 · {context?.segmentIds.length ?? mappings.length}</span>{mappings.map((mapping) => <code key={mapping.id}>{mapping.segment?.title ?? mapping.segmentId} · {mapping.role}</code>)}</> : <span>内容段落 · {material.segments.length}</span>}</div> : null}
        </div><div className="atlas-related-material-actions">{material.id.startsWith("draft-material-") ? <span className="atlas-material-draft-badge">草稿</span> : null}<button onClick={() => navigate(materialLink(material.id))}>查看 <ArrowRight size={13}/></button>{designEnabled && selectedNode ? <button onClick={() => unlinkMaterialFromSelected(material.id)}>取消关联</button> : null}</div>
      </article>;
    })}</div>;
  }

  function assignmentGroup(node: CourseSkillTreeNode) {
    return <><section className="atlas-drawer-section atlas-assignment-group"><h3>{node.title} · 实训</h3><div className="atlas-drawer-progress-meta"><span>{node.assignmentCount} 项实训</span><strong>{node.assignmentStateSummary.progress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${node.assignmentStateSummary.progress}%` }} /></div><div className="atlas-assignment-switcher">{node.assignmentContexts.map((context, index) => <button key={context.assignmentId} onClick={() => setActiveAssignmentId(context.assignmentId)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{context.assignment.title}</strong><small>{assignmentStatusLabel[context.state?.status ?? "not-started"]}</small><ArrowRight size={13} /></button>)}</div></section></>;
  }

  function chapterKnowledgeFacet(chapter: CourseChapterProjection) {
    const nodes = courseSkillTreeNodes.filter((node) => node.chapterId === chapter.id);
    const lessons = lessonsForChapter(runtime!, chapter.id);
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    if (experience === "design") return <>
      <section className="atlas-drawer-section"><h3>篇章设计概览</h3><p>{chapter.description}</p></section>
      <section className="atlas-drawer-section"><h3>Coverage Completeness</h3><div className="atlas-drawer-progress-meta"><span>{nodes.length} Knowledge · {chapter.assignmentSummary.assignmentCount} Assignments · {runtime!.materials.filter((material) => lessonIds.has(material.lessonId)).length} Materials</span><strong>完整</strong></div><div className="atlas-drawer-progress"><i style={{width:"100%"}} /></div></section>
      <section className="atlas-drawer-section"><h3>Stage Outcome</h3><p>{chapter.outcome}</p></section>
      <section className="atlas-drawer-section"><h3>CurriculumCoverage</h3><div className="atlas-tag-list">{nodes.map((node) => <span key={node.id}>{node.id} · {node.curriculumContexts[0]?.role}</span>)}</div></section>
      <section className="atlas-drawer-section"><h3>AI 教学建议</h3><p>覆盖与阶段成果一致。建议在综合实训中明确本篇章成果如何被后续篇章继承。</p><button className="atlas-secondary" onClick={() => setDesignActionNotice("Prototype · AI 建议：在篇章目标中明确阶段成果的后续复用接口。")}>优化篇章教学设计</button></section>
    </>;
    return <>
      <section className="atlas-drawer-section"><h3>篇章简介</h3><p>{chapter.description}</p></section>
      <section className="atlas-drawer-section"><h3>Knowledge Progress</h3><div className="atlas-drawer-progress-meta"><span>{lessons.length} 课 · {chapter.knowledgeEvidenceCount}/{nodes.length} 个节点有掌握证据</span><strong>{chapter.knowledgeProgress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${chapter.knowledgeProgress}%` }} /></div></section>
      <section className="atlas-drawer-section"><h3>课程覆盖</h3><div className="atlas-requirement-list">{lessons.map((lesson) => <div className="atlas-requirement" key={lesson.id}><span className="atlas-requirement-icon ready">{lesson.order}</span><span><strong>第 {lesson.order} 课</strong><small>{nodes.filter((node) => node.lessonId === lesson.id).length} 个 KnowledgeNodes</small></span></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>主要 Atomic KnowledgeNodes</h3><div className="atlas-tag-list">{nodes.slice(0, 12).map((node) => <span key={node.id}>{node.title}</span>)}</div></section>
      <section className="atlas-drawer-section"><h3>关联课件</h3><p>{runtime!.materials.filter((material) => lessonIds.has(material.lessonId)).length} 份篇章课件与课程覆盖保持关联。</p></section>
      <section className="atlas-drawer-section"><h3>对应实训</h3><p>{chapter.assignmentSummary.assignmentCount} 项对应实训，可切换到实训树查看聚合详情。</p></section>
    </>;
  }

  function chapterAssignmentFacet(chapter: CourseChapterProjection) {
    const projection = chapterAssignment!;
    const summary = chapter.assignmentSummary;
    if (experience === "design") return <>
      <section className="atlas-drawer-section"><h3>Chapter Assignment Design</h3><div className="atlas-chapter-assignment-stats"><span><strong>{summary.assignmentCount}</strong>Assignments</span><span><strong>{projection.projectContributions.length}</strong>成果映射</span></div></section>
      <section className="atlas-drawer-section"><h3>覆盖与依赖</h3><p>{projection.assignments.length} 个 Assignment 覆盖本篇章 Knowledge；直接依赖由稳定 Assignment ID 定义。</p><div className="atlas-assignment-switcher">{projection.assignments.map(({assignment}) => <div className="atlas-assignment-row" key={assignment.id}><strong>{assignment.title}</strong><small>{assignment.experience?.type ?? assignment.mode}</small></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>Stage Outcome</h3><p>{summary.outcome}</p></section>
      <section className="atlas-drawer-section"><h3>Issues / AI Suggestion</h3><p>当前覆盖完整。建议复核 inherited outputs 是否足以支持下一篇章，无需创建展示用依赖。</p><button className="atlas-secondary" onClick={() => setDesignActionNotice("Prototype · AI 建议：补充 inherited outputs 的验收边界和复用说明。")}>AI 优化篇章实训</button></section>
    </>;
    return <>
      <section className="atlas-drawer-section"><h3>{chapter.title} · 实训</h3><div className="atlas-chapter-assignment-stats"><span><strong>{summary.assignmentCount}</strong>项实训</span><span><strong>{summary.completedCount}</strong>已完成</span><span><strong>{summary.inProgressCount}</strong>进行中</span><span><strong>{summary.notStartedCount}</strong>未开始</span></div><div className="atlas-drawer-progress-meta"><span>完成度</span><strong>{summary.progress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${summary.progress}%` }} /></div></section>
      <section className="atlas-drawer-section"><h3>篇章成果</h3><p>{summary.outcome}</p></section>
      <section className="atlas-drawer-section"><h3>本篇章实训</h3><div className="atlas-assignment-switcher">{projection.assignments.map(({ assignment, context }, index) => <div className="atlas-assignment-row" key={assignment.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{assignment.title}</strong><small>{assignmentStatusLabel[context.state?.status ?? "not-started"]}</small></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>综合项目贡献</h3>{projection.projectContributions.length ? <div className="atlas-requirement-list">{projection.projectContributions.map((item) => <div className="atlas-requirement" key={item}><span className="atlas-requirement-icon ready"><Check size={13} /></span><span>{item}</span></div>)}</div> : <p>本篇章 Assignment 输出将汇入篇章成果。</p>}</section>
    </>;
  }

  function atomicKnowledgeFacet(node: CourseSkillTreeNode) {
    if (experience === "design") return <>
      <section className="atlas-drawer-section"><h3>Knowledge Metadata</h3><p><strong>{node.id}</strong> · {node.knowledge.type} · {node.knowledge.scope}</p><p>{node.description}</p></section>
      <section className="atlas-drawer-section"><h3>所属 Chapter / CurriculumCoverage</h3><div className="atlas-requirement-list">{node.curriculumContexts.map((context) => <div className="atlas-requirement" key={context.id}><span className="atlas-requirement-icon ready">{context.lessonOrder}</span><span>{courseChapters.find((chapter) => chapter.id === context.chapterId)?.title}<small>{context.role} · order {context.order}</small></span></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>前置 / 后继</h3><p>{courseSkillTreeEdges.filter((edge) => edge.target === node.id).length} 前置 · {courseSkillTreeEdges.filter((edge) => edge.source === node.id).length} 后继</p></section>
      <section className="atlas-drawer-section"><h3>MaterialCoverage / AssignmentCoverage</h3><p>{node.materialContexts.length} Material 映射 · {node.assignmentContexts.length} Assignment 映射</p></section>
      <section className="atlas-drawer-section"><h3>Mapping 状态</h3><div className="atlas-drawer-info-card"><Check size={15} /><span>课程、课件与实训覆盖完整</span></div></section>
      <section className="atlas-drawer-section"><h3>AI 教学建议</h3><p>保持该 Knowledge 的原子目标，并在实训验收标准中要求可复核证据。</p><button className="atlas-secondary" onClick={() => setDesignActionNotice("Prototype · 映射编辑将在正式课程编辑器中持久化；当前 Demo 仅展示 mapping inspection。")}>编辑映射</button></section>
    </>;
    return <>
      <section className="atlas-drawer-section"><h3>简介</h3><p>{node.description}</p></section>
      <section className="atlas-drawer-section"><h3>Knowledge Progress</h3><div className="atlas-drawer-progress-meta"><span>{node.hasKnowledgeEvidence ? "来自 UserKnowledgeState" : "暂无掌握证据"}</span><strong>{node.knowledgeProgress}%</strong></div><div className="atlas-drawer-progress"><i style={{ width: `${node.knowledgeProgress}%` }} /></div></section>
      <section className="atlas-drawer-section"><h3>课程覆盖</h3><div className="atlas-requirement-list">{node.curriculumContexts.map((context) => <div className="atlas-requirement" key={context.id}><span className="atlas-requirement-icon ready">{context.lessonOrder}</span><span><strong>第 {context.lessonOrder} 课 · {context.role}</strong><small>{courseChapters.find((chapter) => chapter.id === context.chapterId)?.title}</small></span></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>对应实训</h3><p>{node.assignmentCount} 项对应实训；切换到实训树查看任务详情。</p></section>
      <section className="atlas-drawer-section"><h3>前置要求</h3><div className="atlas-requirement-list">{courseSkillTreeEdges.some((edge) => edge.relation === "prerequisite" && edge.target === node.id) ? courseSkillTreeEdges.filter((edge) => edge.relation === "prerequisite" && edge.target === node.id).map((edge) => courseSkillTreeNodes.find((item) => item.id === edge.source)).map((item) => item ? <button className="atlas-requirement interactive" key={item.id} onClick={() => selectPrerequisite(item.id)}><span className={`atlas-requirement-icon ${item.status === "locked" ? "waiting" : "ready"}`}>{item.status === "locked" ? "!" : <Check size={14} />}</span><span><strong>{item.title}</strong><small>第 {item.lesson} 课 · {knowledgeStatusLabel[item.status]}</small></span><ArrowRight size={14} /></button> : null) : <div className="atlas-requirement"><span className="atlas-requirement-icon ready"><Check size={14} /></span><span>当前节点可开始学习</span></div>}</div></section>
    </>;
  }

  const drawerTitle = selectedChapter ? `${selectedChapter.title}${detailFacet === "assignment" ? " · 实训" : ""}` : selectedNode ? `${selectedNode.title}${detailFacet === "assignment" && assignmentProjection?.kind === "group" ? " · 实训" : assignmentProjection?.kind === "detail" ? assignmentProjection.context.assignment.title : ""}` : "";
  const drawerStatus = selectedChapter ? detailFacet === "assignment" ? `${selectedChapter.assignmentSummary.progress}%` : selectedChapter.assignmentSummary.progress >= 100 ? "阶段已完成" : selectedChapter.assignmentSummary.progress ? "当前学习" : "可学习" : selectedNode ? detailFacet === "knowledge" ? knowledgeStatusLabel[selectedNode.status] : assignmentProjection?.kind === "detail" ? assignmentStatusLabel[assignmentProjection.context.state?.status ?? "not-started"] : `${selectedNode.assignmentCount} 项` : "";

  if (!runtime || !graphData || invalidChapter) {
    return <main className="atlas-graph-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>{invalidChapter ? "篇章不存在" : "课程不存在"}</h1><p>{invalidChapter ? `课程 “${courseId}” 中没有篇章 “${routeChapterId}”。` : `没有找到课程 “${courseId}”。`}</p><button className="atlas-primary" onClick={() => navigate(invalidChapter ? `/courses/${courseId}` : "/courses")}>返回课程</button></section></main>;
  }

  return (
    <main className="atlas-graph-page">
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-skill-course-island glass-v2">
        <div className="atlas-skill-header-left"><button onClick={() => view === "overview" ? navigate("/courses") : changeView("overview")} aria-label="返回上一级"><ArrowLeft size={18} /></button><span className="atlas-skill-divider" /><div className="atlas-skill-title"><span>{runtime.course.title}</span><strong>{view === "overview" ? "课程篇章总览" : view === "focused" ? "聚焦篇章" : `完整课程${mode === "knowledge" ? "技能树" : "实训树"}`}</strong>{view === "focused" ? <small>/ {courseChapters.find((item) => item.id === focusedChapterId)?.title}</small> : null}</div></div>
        <div className="atlas-skill-header-center">{canDesignCourse(session) ? <ExperienceModeToggle value={experience} onChange={setExperience} /> : null}</div>
        <div className="atlas-skill-header-actions">{view !== "full" ? <button className="atlas-skill-focus" onClick={() => changeView("full")}>展开全部篇章 <ArrowRight size={12} /></button> : <button className="atlas-skill-focus" onClick={() => changeView("overview")}>折叠为篇章总览 <X size={12} /></button>}</div>
      </header>

      <div className={`atlas-graph-stage ${drawerOpen ? "drawer-open" : ""}`}><CourseGraph ref={graphRef} graphData={graphData} view={view} focusedChapterId={focusedChapterId} mode={mode} selectedId={selectedFlowId} searchMatchId={searchMatch} onChapterClick={selectChapter} onChapterDoubleClick={focusChapter} onKnowledgeClick={selectKnowledge} onAssignmentClick={selectKnowledge} /></div>
      <div className={`atlas-graph-meta ${drawerOpen ? "drawer-open" : ""}`}><div className={`atlas-graph-search glass-v2 ${searchExpanded ? "expanded" : ""}`}><button onClick={() => { setSearchExpanded((value) => !value); window.setTimeout(() => searchRef.current?.focus(), 0); }} aria-label="搜索技能树"><Search size={20} /></button><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") executeSearch(); }} placeholder="搜索篇章、知识点或实训…" /></div></div>
      <div className={`atlas-graph-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`}><button onClick={() => graphRef.current?.zoomIn()} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => graphRef.current?.zoomOut()} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => graphRef.current?.fit()} data-tip="适配全图" aria-label="适配全图"><Maximize2 size={17} /></button><span /><button className={mode === "assignment" ? "active" : ""} onClick={switchMode} data-tip="切换技能树 / 实训树" aria-label="切换技能树与实训树"><Layers3 size={17} /></button><button onClick={() => setMaterialsOpen(true)} data-tip="查看全部关联课件" aria-label="查看关联课件"><BookOpen size={17} /></button><button disabled={!selectedAnchor} onClick={() => selectedFlowId && graphRef.current?.focus(selectedFlowId)} data-tip="定位当前节点" aria-label="定位当前节点"><Crosshair size={17} /></button><button onClick={() => changeView("overview")} data-tip="返回篇章总览" aria-label="返回篇章总览"><Network size={17} /></button></div>
      <button className={`atlas-graph-legend glass-v2 ${legendCollapsed ? "collapsed" : ""}`} onClick={() => setLegendCollapsed((value) => !value)}><strong>学习状态 <span>{legendCollapsed ? "＋" : "－"}</span></strong><div><span><i className="done" /> 已完成</span><span><i className="learning" /> 学习中</span><span><i className="available" /> 可学习</span><span><i className="locked" /> 未解锁</span><span><i className="sequence" /> 教学顺序补充</span></div></button>
      <div className="atlas-graph-help glass-v2">拖动画布 · 滚轮缩放 · 单击卡片查看 · 双击篇章原位展开</div>

      {selectedAnchor && (selectedChapter || selectedNode) ? <aside className="atlas-detail-drawer open">
        <button className="atlas-panel-close" onClick={() => { setSelectedAnchor(null); setActiveAssignmentId(null); }} aria-label="关闭详情"><X size={17} /></button>
        <div className="atlas-drawer-head"><span>{experience === "design" ? "课程设计模式 · " : "学习模式 · "}{selectedChapter ? `课程篇章 · ${detailFacet === "knowledge" ? "Knowledge Facet" : "Assignment Aggregate"}` : `原子知识位置 · ${detailFacet === "knowledge" ? "Knowledge Facet" : "Assignment Facet"}`}</span><h2>{drawerTitle}</h2><div><i className="atlas-pill">{selectedChapter ? `${selectedChapter.lessonCount} 课` : selectedNode ? `第 ${selectedNode.lesson} 课` : ""}</i><i className="atlas-pill success">{drawerStatus}</i></div></div>
        {detailFacet === "knowledge" ? <div className="atlas-drawer-tabs"><button className={drawerTab === "detail" ? "active" : ""} onClick={() => setDrawerTab("detail")}>节点详情</button><button className={drawerTab === "materials" ? "active" : ""} onClick={() => setDrawerTab("materials")}>关联课件</button></div> : null}
        <div className="atlas-drawer-body">{detailFacet === "knowledge" && drawerTab === "materials" ? relatedMaterialsPanel() : selectedChapter ? detailFacet === "knowledge" ? chapterKnowledgeFacet(selectedChapter) : chapterAssignmentFacet(selectedChapter) : selectedNode ? detailFacet === "knowledge" ? atomicKnowledgeFacet(selectedNode) : assignmentProjection?.kind === "group" ? assignmentGroup(selectedNode) : assignmentProjection?.kind === "detail" ? assignmentDetail(assignmentProjection.context.assignment, assignmentProjection.context, selectedNode, assignmentProjection.canReturnToGroup) : null : null}</div>
        <div className="atlas-drawer-actions"><button className="atlas-secondary" onClick={() => selectedFlowId && graphRef.current?.focus(selectedFlowId)}><Target size={15} />定位节点</button>{detailFacet === "knowledge" && drawerTab === "materials" ? designEnabled && selectedNode ? <><button className="atlas-secondary" disabled={generatingMaterial} onClick={() => void generateMaterialForSelected()}><Sparkles size={14}/>{generatingMaterial ? "正在生成课件…" : "AI 生成课件"}</button><button className="atlas-primary" onClick={() => setMaterialPickerOpen(true)}>＋ 选择关联课件</button></> : null : selectedChapter ? <button className="atlas-primary" onClick={() => focusChapter(selectedChapter)}>原位展开篇章</button> : selectedNode && detailFacet === "knowledge" && drawerMaterialItems.length === 1 ? <button className="atlas-primary" onClick={() => navigate(materialLink(drawerMaterialItems[0].material.id))}><FileText size={15} />查看课件详情</button> : selectedNode && detailFacet === "knowledge" && drawerMaterialItems.length > 1 ? <button className="atlas-primary" onClick={() => setDrawerTab("materials")}><FileText size={15} />{designEnabled ? "管理关联课件" : "查看关联课件"}</button> : selectedNode && detailFacet === "knowledge" && !drawerMaterialItems.length && designEnabled ? <button className="atlas-primary" onClick={() => {setDrawerTab("materials");setMaterialPickerOpen(true);}}>＋ 选择关联课件</button> : assignmentProjection?.kind === "detail" ? <button className="atlas-primary" onClick={() => navigate(`/courses/${runtime.course.id}/assignments/${assignmentProjection.context.assignment.id}`)}><Settings2 size={15} />{experience === "design" ? "预览实训" : "开始 / 继续实训"}</button> : null}</div>
      </aside> : null}

      {materialPickerOpen && selectedNode && designEnabled ? <div className="atlas-material-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMaterialPickerOpen(false); }}><section className="atlas-material-picker glass-v2" role="dialog" aria-modal="true" aria-label="选择关联课件"><header><div><span className="atlas-kicker">MATERIAL AUTHORING</span><h2>选择关联课件</h2><p>为 {selectedNode.title} 关联当前课程中的课件。</p></div><button onClick={() => setMaterialPickerOpen(false)} aria-label="关闭课件选择器"><X size={17}/></button></header><div className="atlas-material-picker-list">{orderedMaterials.length ? orderedMaterials.map((material) => { const linked = runtime.materialKnowledgeCoverages.some((coverage) => coverage.nodeId === selectedNode.id && coverage.materialId === material.id); const lesson = runtime.lessons.find((item) => item.id === material.lessonId); const chapter = runtime.chapters.find((item) => item.id === lesson?.chapterId); return <button key={material.id} disabled={linked} onClick={() => linkMaterialToSelected(material.id)}><FileText size={18}/><span><strong>{material.title}</strong><small>{material.type.toUpperCase()} · {chapter?.title ?? "未分类篇章"} / {lesson?.title ?? "未分类课"} · {material.duration ?? "自定进度"}</small></span><i>{linked ? "已关联" : "关联"}</i></button>; }) : <div className="atlas-related-material-empty"><FileText size={22}/><strong>暂无可用课件</strong><span>可使用 AI 生成一份 Article 草稿。</span></div>}</div><footer><button className="atlas-secondary" disabled={generatingMaterial} onClick={() => void generateMaterialForSelected()}><Sparkles size={14}/>{generatingMaterial ? "Analyzing selected Knowledge…" : "AI 生成课件"}</button><button className="atlas-primary" onClick={() => setMaterialPickerOpen(false)}>完成</button></footer></section></div> : null}

      {materialsOpen ? <aside className="atlas-detail-drawer atlas-materials-drawer open"><button className="atlas-panel-close" onClick={() => setMaterialsOpen(false)} aria-label="关闭课件列表"><X size={17} /></button><div className="atlas-drawer-head"><span>课程资料</span><h2>全部关联课件</h2><div><i className="atlas-pill">{orderedMaterials.length} 份课件</i><i className="atlas-pill">课程级</i></div></div><div className="atlas-drawer-body"><p>课件、Knowledge 与 Assignment 通过覆盖数据动态关联。</p>{orderedMaterials.map((material) => <button className="atlas-material-card" key={material.id} onClick={() => navigate(materialLink(material.id, null))}><div><span>{material.type.toUpperCase()} · {material.segments.length} 个内容段</span><strong>{material.title}</strong><p>{material.description}</p></div><div className="atlas-course-meta"><span>{material.duration ?? "自定进度"}</span></div></button>)}</div>{orderedMaterials.length ? <div className="atlas-drawer-actions"><button className="atlas-primary" onClick={() => { const recent = Object.values(userCourseState.materialStates).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.materialId; const material = orderedMaterials.find((item) => item.id === recent) ?? orderedMaterials[0]; navigate(materialLink(material.id, null)); }}>打开最近课件 <ArrowRight size={15} /></button></div> : null}</aside> : null}
      {designEnabled && assistantContext ? <CourseDesignAssistant context={assistantContext} provider={courseDesignAssistantProvider} drawerOpen={drawerOpen} onAction={handleAssistantAction}/> : null}
      {toast ? <div className="atlas-toast"><Sparkles size={16} />{view === "focused" ? "篇章已在宏观位置展开，其他篇章保持折叠" : "课程图已更新"}</div> : null}
      {designActionNotice ? <div className="atlas-toast" role="status"><Sparkles size={16} />{designActionNotice}</div> : null}
    </main>
  );
}
