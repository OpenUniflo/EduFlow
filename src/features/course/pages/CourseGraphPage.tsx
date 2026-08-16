import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, Clock3, Crosshair, FileText, Layers3, Maximize2, Minus, Network, Plus, Redo2, Search, Settings2, Sparkles, Target, Trash2, Undo2, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "@/features/course/courseSelection";
import { CourseGraph, type CourseGraphHandle } from "@/features/course/graph/CourseGraph";
import { CourseDesignAssistant } from "@/features/course/components/CourseDesignAssistant";
import { buildCourseDesignAssistantContext, type CourseDesignAssistantProvider, type CourseDesignAssistantResponse } from "@/features/course/courseDesignAssistant";
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
import { addDraftChapter, addDraftDependency, addExistingKnowledge, addGeneratedMaterial, addKnowledgeCandidate, addMaterialLink, applyCourseAuthoringDraft, clearManualNodePositions, createEditableKnowledgeGraph, createGeneratedArticleDraft, getCourseAuthoringHistoryStatus, moveCourseKnowledge, readCourseAuthoringDraft, redoCourseAuthoringDraft, removeCourseKnowledge, removeDraftChapter, removeDraftDependency, removeMaterialLink, reorderDraftChapter, setManualNodePosition, subscribeCourseAuthoringDraft, undoCourseAuthoringDraft, updateDraftChapter, validateDependencyAddition, writeCourseAuthoringDraft } from "@/features/course/authoring/courseAuthoringDraft";
import { validateCourseAuthoring } from "@/features/course/authoring/courseAuthoringValidation";
import { validateCourseAuthoringProposal } from "@/features/course/authoring/courseAuthoringProposal";
import { setCoursePresentationLifecycle } from "@/features/course/presentation/courseLifecycle";

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
  const draftState = useMemo(() => baseRuntime ? readCourseAuthoringDraft(baseRuntime.course.id) : null, [authoringRevision, baseRuntime]);
  const baseKnowledgeGraph = useMemo(() => knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)), [session.userId]);
  const editableKnowledgeGraph = useMemo(() => draftState ? createEditableKnowledgeGraph(baseKnowledgeGraph, draftState) : baseKnowledgeGraph, [baseKnowledgeGraph, draftState]);
  const runtime = useMemo(() => baseRuntime && draftState ? applyCourseAuthoringDraft(baseRuntime, draftState) : undefined, [baseRuntime, draftState]);
  const orderedMaterials = useMemo(() => runtime ? sortMaterials(runtime.materials, runtime.lessons) : [], [runtime]);
  const userCourseState = useUserCourseState(session.userId, courseId);
  const graphData = useMemo(() => runtime ? buildCourseGraphData(runtime, userCourseState, editableKnowledgeGraph, userKnowledgeRepository.getUserKnowledge(session.userId)) : null, [editableKnowledgeGraph, runtime, session.userId, userCourseState]);
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
  const [drawerVisible, setDrawerVisible] = useState(false);
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
  const [knowledgePickerOpen, setKnowledgePickerOpen] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [publishCheckOpen, setPublishCheckOpen] = useState(() => new URLSearchParams(window.location.search).has("publish"));
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const designEnabled = canUseCourseDesignFeatures(session,experience);
  const selectedChapter = selectedAnchor?.kind === "chapter" ? courseChapters.find((item) => item.id === selectedAnchor.id) ?? null : null;
  const selectedNode = selectedAnchor?.kind === "knowledge" ? courseSkillTreeNodes.find((item) => item.id === selectedAnchor.id) ?? null : null;
  const selectedFlowId = flowIdForAnchor(selectedAnchor);
  const assignmentProjection = selectedNode && detailFacet === "assignment" ? assignmentProjectionForNode(selectedNode, activeAssignmentId) : null;
  const chapterAssignment = selectedChapter && detailFacet === "assignment" ? buildChapterAssignmentProjection(selectedChapter, courseSkillTreeNodes) : null;
  const drawerOpen = Boolean((drawerVisible && selectedAnchor) || materialsOpen);
  const historyStatus = draftState ? getCourseAuthoringHistoryStatus(draftState.courseId) : { canUndo:false, canRedo:false };
  const validation = useMemo(() => baseRuntime && draftState ? validateCourseAuthoring(baseRuntime, baseKnowledgeGraph, draftState) : null, [baseKnowledgeGraph, baseRuntime, draftState]);
  const availableKnowledge = useMemo(() => {
    const covered=new Set(courseSkillTreeNodes.map((node)=>node.id)); const needle=knowledgeQuery.trim().toLowerCase();
    return baseKnowledgeGraph.nodes.filter((node)=>!covered.has(node.id)&&(!needle||`${node.id} ${node.title} ${node.description}`.toLowerCase().includes(needle))).slice(0,24);
  },[baseKnowledgeGraph.nodes,courseSkillTreeNodes,knowledgeQuery]);
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
    setDrawerVisible(true);
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
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (drawerOpen) { setDrawerVisible(false); setMaterialsOpen(false); }
        else if (view === "focused") changeView("overview");
        else if (searchExpanded) { setSearchExpanded(false); setQuery(""); setSearchMatch(null); }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!designEnabled || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || target?.matches("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      if (event.shiftKey) redoCourseAuthoringDraft(courseId); else undoCourseAuthoringDraft(courseId);
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [courseId, designEnabled, drawerOpen, searchExpanded, view]);

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
    setDrawerVisible(false);
    setActiveAssignmentId(null);
    setMaterialsOpen(false);
    setDrawerTab("detail");
    if (next !== "focused" && routeChapterId) navigate(`/courses/${courseId}`, { replace: true });
  }

  function focusChapter(chapter: CourseChapterProjection) { changeView("focused", chapter.id); navigate(`/courses/${courseId}/chapters/${chapter.id}`); setToast(true); }
  function selectAnchor(anchor: SelectedAnchor) { setMaterialsOpen(false); setDrawerVisible(true); setDrawerTab("detail"); setActiveAssignmentId(null); setSelectedAnchor(anchor); }
  function selectChapter(chapter: CourseChapterProjection) { selectAnchor({ kind: "chapter", id: chapter.id }); }
  function selectKnowledge(node: CourseSkillTreeNode) { selectAnchor({ kind: "knowledge", id: node.id }); }
  function switchMode() { setMode((current) => current === "knowledge" ? "assignment" : "knowledge"); setActiveAssignmentId(null); setDrawerTab("detail"); }

  function updateAuthoringDraft(update: (state: ReturnType<typeof readCourseAuthoringDraft>) => ReturnType<typeof readCourseAuthoringDraft>) {
    if (!baseRuntime) return;
    writeCourseAuthoringDraft(update(readCourseAuthoringDraft(baseRuntime.course.id)));
  }

  function createChapter() {
    if (!runtime) return;
    const title = window.prompt("新篇章名称", "Chapter 7");
    if (!title?.trim()) return;
    const id = `draft-chapter-${crypto.randomUUID()}`;
    updateAuthoringDraft((state) => addDraftChapter(state, { id, courseId:runtime.course.id, title:title.trim(), description:"课程设计中的草稿篇章。", outcome:"待定义篇章成果", color:"#8b75df", order:runtime.chapters.length + 1 }));
    setSelectedAnchor({kind:"chapter",id}); setDrawerVisible(true); setDesignActionNotice("已创建草稿篇章，可在 Drawer 中继续编辑。");
  }

  function renameSelectedChapter() {
    if (!selectedChapter) return;
    const title = window.prompt("篇章名称", selectedChapter.title);
    if (!title?.trim() || title.trim() === selectedChapter.title) return;
    updateAuthoringDraft((state) => updateDraftChapter(state, selectedChapter.id, {title:title.trim()}));
  }

  function moveSelectedChapter(offset:number) {
    if (!selectedChapter || !runtime) return;
    const ids=runtime.chapters.map((chapter)=>chapter.id); const index=ids.indexOf(selectedChapter.id); const target=index+offset;
    if(index<0||target<0||target>=ids.length)return;
    [ids[index],ids[target]]=[ids[target],ids[index]];
    updateAuthoringDraft((state)=>reorderDraftChapter(state,ids));
  }

  function deleteSelectedChapter() {
    if (!selectedChapter || !runtime || !baseRuntime) return;
    const outcomeIds=baseRuntime.chapterOutcomes.filter((outcome)=>outcome.chapterId===selectedChapter.id).map((outcome)=>outcome.id);
    if(baseRuntime.finalProjectOutcomeCompositions.some((composition)=>outcomeIds.includes(composition.outcomeId))){setDesignActionNotice("该篇章成果被 FinalProject 引用，Prototype 为避免静默破坏组合关系而禁止删除。");return;}
    const nodeIds=courseSkillTreeNodes.filter((node)=>node.chapterId===selectedChapter.id).map((node)=>node.id);
    if(!window.confirm(`删除“${selectedChapter.title}”？其中 ${nodeIds.length} 个 Knowledge 将移到“未分组”；全局 Knowledge 不会删除。`))return;
    updateAuthoringDraft((state)=>removeDraftChapter(state,selectedChapter.id,nodeIds));
    setDrawerVisible(false); setDesignActionNotice("篇章已从课程草稿移除，原 Knowledge 已移到未分组。");
  }

  function addExistingNode(nodeId:string) {
    if(!runtime)return;
    const chapterId=selectedChapter?.id ?? selectedNode?.chapterId ?? runtime.chapters[0]?.id;
    if(!chapterId)return;
    updateAuthoringDraft((state)=>addExistingKnowledge(state,nodeId,chapterId));
    setKnowledgePickerOpen(false); setKnowledgeQuery(""); setSelectedAnchor({kind:"knowledge",id:nodeId}); setDrawerVisible(true);
  }

  function createCandidate() {
    if(!runtime)return;
    const title=window.prompt("课程草稿知识点名称"); if(!title?.trim())return;
    const chapterId=selectedChapter?.id ?? selectedNode?.chapterId ?? runtime.chapters[0]?.id; if(!chapterId)return;
    const id=`draft-knowledge-${crypto.randomUUID()}`;
    updateAuthoringDraft((state)=>addKnowledgeCandidate(state,{id,title:title.trim(),description:`${title.trim()} 的课程局部教学目标。`,chapterId}));
    setSelectedAnchor({kind:"knowledge",id}); setDrawerVisible(true); setDesignActionNotice("已创建课程草稿知识点；未写入全局 Knowledge Atlas。");
  }

  function removeSelectedKnowledge() {
    if(!selectedNode||!runtime)return;
    const dependencyCount=courseSkillTreeEdges.filter((edge)=>edge.source===selectedNode.id||edge.target===selectedNode.id).length;
    const message=`从课程移除“${selectedNode.title}”？\n${dependencyCount} 条依赖 · ${selectedNode.assignmentContexts.length} 条 Assignment 覆盖 · ${selectedNode.materialContexts.length} 份课件。\n不会删除全局 Knowledge。`;
    if(!window.confirm(message))return;
    updateAuthoringDraft((state)=>removeCourseKnowledge(state,selectedNode.id)); setDrawerVisible(false); setDesignActionNotice("已移除课程覆盖及相关草稿依赖；全局 Knowledge 保持不变。");
  }

  function createDependency(sourceId:string,targetId:string) {
    if(!draftState)return;
    const ids=courseSkillTreeNodes.map((node)=>node.id); const edges=courseSkillTreeEdges.map((edge)=>({source:edge.source,target:edge.target}));
    const result=validateDependencyAddition(ids,edges,sourceId,targetId);
    if(!result.valid){setDesignActionNotice(result.reason==="cycle"?"无法创建依赖：该操作会形成循环依赖。":result.reason==="self"?"无法创建依赖：不能连接自身。":result.reason==="duplicate"?"无法创建依赖：该关系已存在。":"无法创建依赖：节点不在当前课程。 ");return;}
    updateAuthoringDraft((state)=>addDraftDependency(state,{id:`draft-edge:${sourceId}:${targetId}`,source:sourceId,target:targetId,relation:"prerequisite",strength:"hard",reason:"Teacher-authored Course dependency"}));
    setDesignActionNotice("已创建课程草稿依赖。");
  }

  function deleteSelectedDependency() {
    if(!selectedDependencyId)return;
    updateAuthoringDraft((state)=>removeDraftDependency(state,selectedDependencyId)); setSelectedDependencyId(null); setDesignActionNotice("依赖已从课程草稿移除。");
  }

  function applyAssistantProposal(response:CourseDesignAssistantResponse) {
    if(!response.proposal||!baseRuntime||!draftState)return;
    const result=validateCourseAuthoringProposal(baseRuntime,baseKnowledgeGraph,draftState,response.proposal);
    if(!result.valid){setDesignActionNotice(`AI Proposal 未应用：${result.validation.fatal[0]?.message ?? "校验失败"}`);return;}
    writeCourseAuthoringDraft(result.state); setDesignActionNotice("AI Proposal 已验证并应用，可使用 Undo 撤回。");
  }

  function publishCourse() {
    if(!runtime||!validation||validation.fatal.length)return;
    setCoursePresentationLifecycle(runtime.course.id,"published"); setPublishCheckOpen(false); setDesignActionNotice("课程已发布，Course Center 将显示当前浏览器中的 Editable View。");
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
      <section className="atlas-drawer-section"><h3>篇章设计</h3><p>{chapter.description}</p><div className="course-authoring-inline-actions"><button onClick={renameSelectedChapter}>重命名</button><button disabled={chapter.order<=1} onClick={()=>moveSelectedChapter(-1)}><ArrowUp size={13}/>上移</button><button disabled={chapter.order>=runtime!.chapters.length} onClick={()=>moveSelectedChapter(1)}><ArrowDown size={13}/>下移</button><button className="danger" onClick={deleteSelectedChapter}><Trash2 size={13}/>删除篇章</button></div></section>
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
      <section className="atlas-drawer-section"><h3>所属 Chapter / CurriculumCoverage</h3><label className="course-authoring-field"><span>移动到篇章</span><select value={node.chapterId} onChange={(event)=>updateAuthoringDraft((state)=>moveCourseKnowledge(state,node.id,event.target.value))}>{runtime!.chapters.map((chapter)=><option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><div className="atlas-requirement-list">{node.curriculumContexts.map((context) => <div className="atlas-requirement" key={context.id}><span className="atlas-requirement-icon ready">{context.lessonOrder}</span><span>{courseChapters.find((chapter) => chapter.id === context.chapterId)?.title}<small>{context.role} · order {context.order}</small></span></div>)}</div></section>
      <section className="atlas-drawer-section"><h3>前置 / 后继</h3><p>{courseSkillTreeEdges.filter((edge) => edge.target === node.id).length} 前置 · {courseSkillTreeEdges.filter((edge) => edge.source === node.id).length} 后继</p></section>
      <section className="atlas-drawer-section"><h3>MaterialCoverage / AssignmentCoverage</h3><p>{node.materialContexts.length} Material 映射 · {node.assignmentContexts.length} Assignment 映射</p></section>
      <section className="atlas-drawer-section"><h3>Mapping 状态</h3><div className="atlas-drawer-info-card"><Check size={15} /><span>课程、课件与实训覆盖完整</span></div></section>
      <section className="atlas-drawer-section"><h3>课程覆盖操作</h3><p>移除只影响本课程覆盖，不会删除 Global Knowledge。</p><button className="atlas-secondary danger" onClick={removeSelectedKnowledge}><Trash2 size={14}/>从课程移除</button></section>
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
    <main className="atlas-graph-page" data-experience={experience}>
      <GlobalNav active="courses" session={session} onLogout={onLogout} />
      <header className="atlas-skill-course-island glass-v2">
        <div className="atlas-skill-header-left"><button onClick={() => view === "overview" ? navigate("/courses") : changeView("overview")} aria-label="返回上一级"><ArrowLeft size={18} /></button><span className="atlas-skill-divider" /><div className="atlas-skill-title"><span>{runtime.course.title}</span><strong>{view === "overview" ? "课程篇章总览" : view === "focused" ? "聚焦篇章" : `完整课程${mode === "knowledge" ? "技能树" : "实训树"}`}</strong>{view === "focused" ? <small>/ {courseChapters.find((item) => item.id === focusedChapterId)?.title}</small> : null}</div></div>
        <div className="atlas-skill-header-center">{canDesignCourse(session) ? <ExperienceModeToggle value={experience} onChange={setExperience} /> : null}</div>
        <div className="atlas-skill-header-actions">{view !== "full" ? <button className="atlas-skill-focus" onClick={() => changeView("full")}>展开全部篇章 <ArrowRight size={12} /></button> : <button className="atlas-skill-focus" onClick={() => changeView("overview")}>折叠为篇章总览 <X size={12} /></button>}</div>
      </header>

      {designEnabled ? <div className={`course-authoring-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`}><button onClick={createChapter}><Plus size={14}/>新建篇章</button><button onClick={()=>setKnowledgePickerOpen(true)}><Plus size={14}/>添加知识点</button><button onClick={createCandidate}><Sparkles size={14}/>草稿知识点</button><span/><button disabled={!historyStatus.canUndo} onClick={()=>undoCourseAuthoringDraft(courseId)} title="Cmd/Ctrl + Z"><Undo2 size={14}/>Undo</button><button disabled={!historyStatus.canRedo} onClick={()=>redoCourseAuthoringDraft(courseId)} title="Cmd/Ctrl + Shift + Z"><Redo2 size={14}/>Redo</button><button onClick={()=>{if(Object.keys(draftState?.manualNodePositions??{}).length&&!window.confirm("自动整理会覆盖手动布局，继续吗？"))return;updateAuthoringDraft(clearManualNodePositions);window.setTimeout(()=>graphRef.current?.fit(),80);}}><WandSparkles size={14}/>自动整理</button><button className="publish" onClick={()=>setPublishCheckOpen(true)}>发布检查</button></div>:null}
      <div className={`atlas-graph-stage ${drawerOpen ? "drawer-open" : ""}`}><CourseGraph ref={graphRef} graphData={graphData} view={view} focusedChapterId={focusedChapterId} mode={mode} selectedId={selectedFlowId} searchMatchId={searchMatch} designEnabled={designEnabled} manualPositions={draftState?.manualNodePositions} onNodePositionChange={(nodeId,position)=>updateAuthoringDraft((state)=>setManualNodePosition(state,nodeId,position))} onDependencyCreate={createDependency} onDependencySelect={setSelectedDependencyId} onChapterClick={selectChapter} onChapterDoubleClick={focusChapter} onKnowledgeClick={selectKnowledge} onAssignmentClick={selectKnowledge} /></div>
      <div className={`atlas-graph-meta ${drawerOpen ? "drawer-open" : ""}`}><div className={`atlas-graph-search glass-v2 ${searchExpanded ? "expanded" : ""}`}><button onClick={() => { setSearchExpanded((value) => !value); window.setTimeout(() => searchRef.current?.focus(), 0); }} aria-label="搜索技能树"><Search size={20} /></button><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") executeSearch(); }} placeholder="搜索篇章、知识点或实训…" /></div></div>
      <div className={`atlas-graph-toolbar glass-v2 ${drawerOpen ? "drawer-open" : ""}`}><button onClick={() => graphRef.current?.zoomIn()} data-tip="放大" aria-label="放大"><Plus size={17} /></button><button onClick={() => graphRef.current?.zoomOut()} data-tip="缩小" aria-label="缩小"><Minus size={17} /></button><button onClick={() => graphRef.current?.fit()} data-tip="适配全图" aria-label="适配全图"><Maximize2 size={17} /></button><span /><button className={mode === "assignment" ? "active" : ""} onClick={switchMode} data-tip="切换技能树 / 实训树" aria-label="切换技能树与实训树"><Layers3 size={17} /></button><button onClick={() => setMaterialsOpen(true)} data-tip="查看全部关联课件" aria-label="查看关联课件"><BookOpen size={17} /></button><button disabled={!selectedAnchor} onClick={() => selectedFlowId && graphRef.current?.focus(selectedFlowId)} data-tip="定位当前节点" aria-label="定位当前节点"><Crosshair size={17} /></button><button onClick={() => changeView("overview")} data-tip="返回篇章总览" aria-label="返回篇章总览"><Network size={17} /></button></div>
      <button className={`atlas-graph-legend glass-v2 ${legendCollapsed ? "collapsed" : ""}`} onClick={() => setLegendCollapsed((value) => !value)}><strong>学习状态 <span>{legendCollapsed ? "＋" : "－"}</span></strong><div><span><i className="done" /> 已完成</span><span><i className="learning" /> 学习中</span><span><i className="available" /> 可学习</span><span><i className="locked" /> 未解锁</span><span><i className="sequence" /> 教学顺序补充</span></div></button>
      <div className="atlas-graph-help glass-v2">拖动画布 · 滚轮缩放 · 单击卡片查看 · 双击篇章原位展开</div>

      {drawerVisible && selectedAnchor && (selectedChapter || selectedNode) ? <aside className="atlas-detail-drawer open">
        <button className="atlas-panel-close" onClick={() => setDrawerVisible(false)} aria-label="关闭详情"><X size={17} /></button>
        <div className="atlas-drawer-head"><span>{experience === "design" ? "课程设计模式 · " : "学习模式 · "}{selectedChapter ? `课程篇章 · ${detailFacet === "knowledge" ? "Knowledge Facet" : "Assignment Aggregate"}` : `原子知识位置 · ${detailFacet === "knowledge" ? "Knowledge Facet" : "Assignment Facet"}`}</span><h2>{drawerTitle}</h2><div><i className="atlas-pill">{selectedChapter ? `${selectedChapter.lessonCount} 课` : selectedNode ? `第 ${selectedNode.lesson} 课` : ""}</i><i className="atlas-pill success">{drawerStatus}</i></div></div>
        {detailFacet === "knowledge" ? <div className="atlas-drawer-tabs"><button className={drawerTab === "detail" ? "active" : ""} onClick={() => setDrawerTab("detail")}>节点详情</button><button className={drawerTab === "materials" ? "active" : ""} onClick={() => setDrawerTab("materials")}>关联课件</button></div> : null}
        <div className="atlas-drawer-body">{detailFacet === "knowledge" && drawerTab === "materials" ? relatedMaterialsPanel() : selectedChapter ? detailFacet === "knowledge" ? chapterKnowledgeFacet(selectedChapter) : chapterAssignmentFacet(selectedChapter) : selectedNode ? detailFacet === "knowledge" ? atomicKnowledgeFacet(selectedNode) : assignmentProjection?.kind === "group" ? assignmentGroup(selectedNode) : assignmentProjection?.kind === "detail" ? assignmentDetail(assignmentProjection.context.assignment, assignmentProjection.context, selectedNode, assignmentProjection.canReturnToGroup) : null : null}</div>
        <div className="atlas-drawer-actions"><button className="atlas-secondary" onClick={() => selectedFlowId && graphRef.current?.focus(selectedFlowId)}><Target size={15} />定位节点</button>{detailFacet === "knowledge" && drawerTab === "materials" ? designEnabled && selectedNode ? <><button className="atlas-secondary" disabled={generatingMaterial} onClick={() => void generateMaterialForSelected()}><Sparkles size={14}/>{generatingMaterial ? "正在生成课件…" : "AI 生成课件"}</button><button className="atlas-primary" onClick={() => setMaterialPickerOpen(true)}>＋ 选择关联课件</button></> : null : selectedChapter ? <button className="atlas-primary" onClick={() => focusChapter(selectedChapter)}>原位展开篇章</button> : selectedNode && detailFacet === "knowledge" && drawerMaterialItems.length === 1 ? <button className="atlas-primary" onClick={() => navigate(materialLink(drawerMaterialItems[0].material.id))}><FileText size={15} />查看课件详情</button> : selectedNode && detailFacet === "knowledge" && drawerMaterialItems.length > 1 ? <button className="atlas-primary" onClick={() => setDrawerTab("materials")}><FileText size={15} />{designEnabled ? "管理关联课件" : "查看关联课件"}</button> : selectedNode && detailFacet === "knowledge" && !drawerMaterialItems.length && designEnabled ? <button className="atlas-primary" onClick={() => {setDrawerTab("materials");setMaterialPickerOpen(true);}}>＋ 选择关联课件</button> : assignmentProjection?.kind === "detail" ? <button className="atlas-primary" onClick={() => navigate(`/courses/${runtime.course.id}/assignments/${assignmentProjection.context.assignment.id}`)}><Settings2 size={15} />{experience === "design" ? "预览实训" : "开始 / 继续实训"}</button> : null}</div>
      </aside> : null}

      {materialPickerOpen && selectedNode && designEnabled ? <div className="atlas-material-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMaterialPickerOpen(false); }}><section className="atlas-material-picker glass-v2" role="dialog" aria-modal="true" aria-label="选择关联课件"><header><div><span className="atlas-kicker">MATERIAL AUTHORING</span><h2>选择关联课件</h2><p>为 {selectedNode.title} 关联当前课程中的课件。</p></div><button onClick={() => setMaterialPickerOpen(false)} aria-label="关闭课件选择器"><X size={17}/></button></header><div className="atlas-material-picker-list">{orderedMaterials.length ? orderedMaterials.map((material) => { const linked = runtime.materialKnowledgeCoverages.some((coverage) => coverage.nodeId === selectedNode.id && coverage.materialId === material.id); const lesson = runtime.lessons.find((item) => item.id === material.lessonId); const chapter = runtime.chapters.find((item) => item.id === lesson?.chapterId); return <button key={material.id} disabled={linked} onClick={() => linkMaterialToSelected(material.id)}><FileText size={18}/><span><strong>{material.title}</strong><small>{material.type.toUpperCase()} · {chapter?.title ?? "未分类篇章"} / {lesson?.title ?? "未分类课"} · {material.duration ?? "自定进度"}</small></span><i>{linked ? "已关联" : "关联"}</i></button>; }) : <div className="atlas-related-material-empty"><FileText size={22}/><strong>暂无可用课件</strong><span>可使用 AI 生成一份 Article 草稿。</span></div>}</div><footer><button className="atlas-secondary" disabled={generatingMaterial} onClick={() => void generateMaterialForSelected()}><Sparkles size={14}/>{generatingMaterial ? "Analyzing selected Knowledge…" : "AI 生成课件"}</button><button className="atlas-primary" onClick={() => setMaterialPickerOpen(false)}>完成</button></footer></section></div> : null}

      {knowledgePickerOpen&&designEnabled?<div className="atlas-material-picker-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setKnowledgePickerOpen(false);}}><section className="atlas-material-picker glass-v2" role="dialog" aria-modal="true" aria-label="添加已有 Knowledge"><header><div><span className="atlas-kicker">GLOBAL KNOWLEDGE</span><h2>添加已有 Knowledge</h2><p>创建课程覆盖，不修改全局 Knowledge。</p></div><button onClick={()=>setKnowledgePickerOpen(false)} aria-label="关闭 Knowledge 选择器"><X size={17}/></button></header><label className="course-authoring-search"><Search size={15}/><input autoFocus value={knowledgeQuery} onChange={(event)=>setKnowledgeQuery(event.target.value)} placeholder="搜索标题、描述或 ID…"/></label><div className="atlas-material-picker-list">{availableKnowledge.length?availableKnowledge.map((node)=><button key={node.id} onClick={()=>addExistingNode(node.id)}><Plus size={18}/><span><strong>{node.title}</strong><small>{node.id} · {node.scope} · {node.description}</small></span><i>加入课程</i></button>):<div className="atlas-related-material-empty"><Search size={22}/><strong>没有可添加的 Knowledge</strong><span>已覆盖节点不会重复出现。</span></div>}</div><footer><button className="atlas-primary" onClick={createCandidate}><Sparkles size={14}/>新建课程草稿知识点</button></footer></section></div>:null}

      {publishCheckOpen&&validation?<div className="atlas-material-picker-backdrop"><section className="atlas-material-picker course-publish-check glass-v2" role="dialog" aria-modal="true" aria-label="发布检查"><header><div><span className="atlas-kicker">PUBLICATION CHECK</span><h2>发布检查</h2><p>从当前 Base Runtime + Authoring Overlay 得到确定性结果。</p></div><button onClick={()=>setPublishCheckOpen(false)} aria-label="关闭发布检查"><X size={17}/></button></header><div className="course-publish-summary"><span><Check size={14}/>{validation.summary.chapterCount} 个篇章</span><span><Check size={14}/>{validation.summary.knowledgeCount} 个 Knowledge</span><span><Check size={14}/>{validation.summary.assignmentCoveredCount} 个 Knowledge 有 Assignment</span><span><Check size={14}/>{validation.summary.materialCoveredCount} 个 Knowledge 有课件</span><span><Check size={14}/>依赖图{validation.summary.dagValid?"无循环":"存在循环"}</span></div>{validation.fatal.length?<section className="course-publish-issues fatal"><strong>必须修复</strong>{validation.fatal.map((issue)=><p key={`${issue.code}:${issue.message}`}>× {issue.message}</p>)}</section>:<section className="course-publish-issues success"><strong>结构校验通过</strong><p>没有阻止发布的 broken reference 或 DAG 问题。</p></section>}{validation.warnings.length?<section className="course-publish-issues warning"><strong>发布警告</strong>{validation.warnings.map((issue)=><p key={`${issue.code}:${issue.message}`}>⚠ {issue.message}</p>)}</section>:null}<footer><button className="atlas-secondary" onClick={()=>setPublishCheckOpen(false)}>返回修改</button><button className="atlas-primary" disabled={validation.fatal.length>0} onClick={publishCourse}>{validation.warnings.length?"仍然发布":"发布课程"}</button></footer></section></div>:null}

      {materialsOpen ? <aside className="atlas-detail-drawer atlas-materials-drawer open"><button className="atlas-panel-close" onClick={() => setMaterialsOpen(false)} aria-label="关闭课件列表"><X size={17} /></button><div className="atlas-drawer-head"><span>课程资料</span><h2>全部关联课件</h2><div><i className="atlas-pill">{orderedMaterials.length} 份课件</i><i className="atlas-pill">课程级</i></div></div><div className="atlas-drawer-body"><p>课件、Knowledge 与 Assignment 通过覆盖数据动态关联。</p>{orderedMaterials.map((material) => <button className="atlas-material-card" key={material.id} onClick={() => navigate(materialLink(material.id, null))}><div><span>{material.type.toUpperCase()} · {material.segments.length} 个内容段</span><strong>{material.title}</strong><p>{material.description}</p></div><div className="atlas-course-meta"><span>{material.duration ?? "自定进度"}</span></div></button>)}</div>{orderedMaterials.length ? <div className="atlas-drawer-actions"><button className="atlas-primary" onClick={() => { const recent = Object.values(userCourseState.materialStates).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.materialId; const material = orderedMaterials.find((item) => item.id === recent) ?? orderedMaterials[0]; navigate(materialLink(material.id, null)); }}>打开最近课件 <ArrowRight size={15} /></button></div> : null}</aside> : null}
      {selectedDependencyId && designEnabled ? <div className="course-authoring-edge-action glass-v2"><span>已选择依赖</span><code>{selectedDependencyId}</code><button onClick={deleteSelectedDependency}><Trash2 size={13}/>删除依赖</button><button onClick={()=>setSelectedDependencyId(null)} aria-label="取消选择依赖"><X size={13}/></button></div>:null}
      {designEnabled && assistantContext ? <CourseDesignAssistant context={assistantContext} provider={courseDesignAssistantProvider} drawerOpen={drawerOpen} onAction={handleAssistantAction} onApplyProposal={applyAssistantProposal}/> : null}
      {toast ? <div className="atlas-toast"><Sparkles size={16} />{view === "focused" ? "篇章已在宏观位置展开，其他篇章保持折叠" : "课程图已更新"}</div> : null}
      {designActionNotice ? <div className="atlas-toast" role="status"><Sparkles size={16} />{designActionNotice}</div> : null}
    </main>
  );
}
