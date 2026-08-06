import { globalKnowledgeGraph } from "./knowledge/graph";
import { assertDirectedAcyclic, buildLayeredDagLayout, transitiveReduction } from "./knowledge/graphAlgorithms";
import type {
  AcceptanceSpec,
  CourseChapterEdge,
  CourseChapterProjection,
  CourseCurriculum,
  CourseSkillTreeEdge,
  CourseSkillTreeNode,
  CurriculumChapter,
  CurriculumCoverage,
  CurriculumLesson,
  CurriculumOutcome,
  CurriculumSequence,
  Practice,
  PracticeCoverage
} from "./types";

export const COURSE_ID = "agentic-ai";
export const MATERIAL_ID = "lesson-04";

export const agenticCurriculum: CourseCurriculum = {
  id: "curriculum-agentic-ai-v1",
  courseId: COURSE_ID,
  generationMode: "auto-fixed-count",
  requestedChapterCount: 7
};

export const curriculumChapters: CurriculumChapter[] = [
  { id: "foundations", courseId: COURSE_ID, title: "概念与问题建模", description: "建立智能体概念、任务环境和问题形式化基础。", lessonIds: ["L01", "L02"], order: 1, color: "#78a7ee", progress: 100, outcome: "任务环境说明书" },
  { id: "paradigms", courseId: COURSE_ID, title: "架构与推理范式", description: "比较经典架构、ReAct、Planning、Replanning 与反思范式。", lessonIds: ["L03", "L04", "L05"], order: 2, color: "#9a8ee6", progress: 72, outcome: "范式选择报告" },
  { id: "system", courseId: COURSE_ID, title: "Agent 系统构成", description: "理解输入、模型、上下文、状态与结构化输出。", lessonIds: ["L06", "L07"], order: 3, color: "#eca86c", progress: 46, outcome: "最小 Agent MVP" },
  { id: "capabilities", courseId: COURSE_ID, title: "工具、知识与记忆", description: "让 Agent 使用工具、检索知识并维护工作状态与记忆。", lessonIds: ["L08", "L09", "L10"], order: 4, color: "#70c4a5", progress: 28, outcome: "受控单 Agent" },
  { id: "workflows", courseId: COURSE_ID, title: "工作流与多智能体", description: "构造路由、评估、人工协作与多智能体工作流。", lessonIds: ["L11", "L12"], order: 5, color: "#77b7c8", progress: 8, outcome: "完整 Agentic Workflow" },
  { id: "production", courseId: COURSE_ID, title: "评测、安全与生产化", description: "建立评测、可观测性、Guardrail、权限与部署能力。", lessonIds: ["L13", "L14"], order: 6, color: "#ec92aa", progress: 0, outcome: "可信生产系统" },
  { id: "frontier", courseId: COURSE_ID, title: "综合项目", description: "综合运用课程覆盖的原子能力完成系统项目。", lessonIds: ["L15"], order: 7, color: "#697ee6", progress: 0, outcome: "Agentic AI 综合项目" }
];

const lessonTitles = [
  "Agent、Workflow 与自动化", "任务环境与完成条件", "Agent 架构演进", "推理、规划与反思", "Human-in-the-loop",
  "最小 Agent 构成", "结构化输出与上下文", "工具使用", "知识与记忆", "Agent Runtime",
  "Agentic Workflow", "多智能体与能力协议", "评测与可观测性", "安全与生产服务", "综合系统项目"
];

export const curriculumLessons: CurriculumLesson[] = lessonTitles.map((title, index) => {
  const id = `L${String(index + 1).padStart(2, "0")}`;
  const chapter = curriculumChapters.find((item) => item.lessonIds.includes(id));
  if (!chapter) throw new Error(`Lesson ${id} has no curriculum chapter.`);
  return { id, courseId: COURSE_ID, chapterId: chapter.id, title, order: index + 1 };
});

export const curriculumOutcomes: CurriculumOutcome[] = [
  {
    id: "outcome-agentic-ai-capstone",
    courseId: COURSE_ID,
    title: "Agentic AI 综合系统与答辩",
    description: "综合系统实现、架构决策、评测、安全报告与答辩，是课程成果而非知识节点。",
    kind: "project",
    lessonId: "L15",
    legacySourceNodeId: "F06"
  }
];

const coverageSeed: Array<[lessonId: string, role: CurriculumCoverage["role"], nodeIds: string[]]> = [
  ["L01", "introduce", ["AG01", "H02", "H03"]],
  ["L02", "introduce", ["P01", "P02", "P03", "P05"]],
  ["L03", "introduce", ["A01", "A02", "R01"]],
  ["L04", "introduce", ["R10", "R03", "R04", "R11", "R06", "R07", "R08", "R09"]],
  ["L05", "introduce", ["W01", "W02"]],
  ["L06", "introduce", ["C01", "C02", "C03", "C04"]],
  ["L07", "introduce", ["I01", "I02", "I05", "I04"]],
  ["L08", "introduce", ["T11", "T12", "T03", "T14", "T15", "T06", "T07", "T08", "T09", "T10"]],
  ["L09", "introduce", ["K01", "K12", "K13", "K14", "K15", "K16", "K04", "K05"]],
  ["L10", "introduce", ["RT01", "RT02", "RT03", "RT14", "RT15", "RT06", "BR01"]],
  ["L11", "introduce", ["W13", "W04", "WF03", "WF05"]],
  ["L11", "apply", ["R06", "R09", "W02"]],
  ["L12", "introduce", ["MA02", "MA12", "MA03", "MA04", "MA15", "MA06", "MA07"]],
  ["L13", "introduce", ["E12", "E13", "E14", "E05", "E06", "E07"]],
  ["L14", "introduce", ["S01", "S02", "S03", "S14", "S15", "S06", "S07", "S08"]],
  ["L15", "assess", ["P05", "R06", "I05", "T15", "K14", "RT15", "WF05", "MA12", "E13", "S01", "S08"]]
];

export const curriculumCoverages: CurriculumCoverage[] = coverageSeed.flatMap(([lessonId, role, nodeIds]) =>
  nodeIds.map((nodeId, index) => ({ id: `coverage-${lessonId}-${role}-${String(index + 1).padStart(2, "0")}`, courseId: COURSE_ID, lessonId, nodeId, role }))
);

export const curriculumSequences: CurriculumSequence[] = curriculumLessons.slice(1).map((lesson, index) => ({
  id: `sequence-${String(index + 1).padStart(2, "0")}`,
  courseId: COURSE_ID,
  sourceLessonId: curriculumLessons[index].id,
  targetLessonId: lesson.id
}));

export const practices: Practice[] = [
  { id: "lesson-04-direct", title: "Direct 基线实验", paradigm: "Direct", description: "一次生成政策简报，观察速度、成本与信息缺口。", templateId: "lesson-04-direct", acceptanceSpecId: "lesson-04-comparison", estimatedMinutes: 5 },
  { id: "lesson-04-react", title: "ReAct 工具循环", paradigm: "ReAct", description: "通过搜索、观察和停止条件完成开放式资料任务。", templateId: "lesson-04-react", acceptanceSpecId: "lesson-04-comparison", estimatedMinutes: 7 },
  { id: "lesson-04-plan", title: "Plan-and-Execute", paradigm: "Plan-and-Execute", description: "先生成可检查计划，再逐项收集、比较和验证。", templateId: "lesson-04-plan", acceptanceSpecId: "lesson-04-comparison", estimatedMinutes: 7 },
  { id: "lesson-04-replan", title: "Replanning", paradigm: "Replanning", description: "遇到搜索超时或新增隐私要求时，仅修改剩余计划。", templateId: "lesson-04-replan", acceptanceSpecId: "lesson-04-comparison", estimatedMinutes: 6 },
  { id: "lesson-04-evaluator", title: "Evaluator-Optimizer", paradigm: "Evaluator-Optimizer", description: "使用结构化 Rubric 检查覆盖、引用、风险和建议。", templateId: "lesson-04-evaluator", acceptanceSpecId: "lesson-04-comparison", estimatedMinutes: 5 }
];

export const practiceCoverages: PracticeCoverage[] = [
  { id: "practice-coverage-direct", practiceId: "lesson-04-direct", nodeId: "R01", role: "practice" },
  { id: "practice-coverage-react", practiceId: "lesson-04-react", nodeId: "R10", role: "assess" },
  { id: "practice-coverage-plan", practiceId: "lesson-04-plan", nodeId: "R04", role: "assess" },
  { id: "practice-coverage-replan", practiceId: "lesson-04-replan", nodeId: "R06", role: "assess" },
  { id: "practice-coverage-evaluator", practiceId: "lesson-04-evaluator", nodeId: "R09", role: "assess" }
];

export const acceptanceSpec: AcceptanceSpec = {
  id: "lesson-04-comparison",
  title: "同一任务下的推理范式比较",
  checks: [
    { id: "structure", label: "结构完整", weight: 25 },
    { id: "behavior", label: "行为符合范式", weight: 25 },
    { id: "result", label: "结果满足约束", weight: 30 },
    { id: "trace", label: "轨迹可审计", weight: 20 }
  ]
};

const nodeById = new Map(globalKnowledgeGraph.nodes.map((node) => [node.id, node]));
const lessonById = new Map(curriculumLessons.map((lesson) => [lesson.id, lesson]));
const chapterById = new Map(curriculumChapters.map((chapter) => [chapter.id, chapter]));
const courseNodeIds = new Set(curriculumCoverages.map((coverage) => coverage.nodeId).filter((id) => nodeById.get(id)?.status === "active"));
export const courseSkillTreeEdges: CourseSkillTreeEdge[] = globalKnowledgeGraph.edges
  .filter((edge) => courseNodeIds.has(edge.source) && courseNodeIds.has(edge.target))
  .map((edge) => ({ ...edge }));

function coverageOrder(coverage?: CurriculumCoverage) {
  return coverage ? lessonById.get(coverage.lessonId)?.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
}

function primaryCoverageFor(nodeId: string) {
  const coverages = curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId);
  const introduced = coverages.filter((coverage) => coverage.role === "introduce");
  return [...(introduced.length ? introduced : coverages)].sort((left, right) => coverageOrder(left) - coverageOrder(right) || left.id.localeCompare(right.id))[0];
}

const primaryCoverageByNode = new Map(Array.from(courseNodeIds, (nodeId) => [nodeId, primaryCoverageFor(nodeId)]));
const primaryChapterByNode = new Map(Array.from(primaryCoverageByNode, ([nodeId, coverage]) => [nodeId, lessonById.get(coverage.lessonId)?.chapterId]));
const mainCourseEdges = courseSkillTreeEdges.filter((edge) => edge.relation !== "related");
const fullLayout = buildLayeredDagLayout(courseNodeIds, mainCourseEdges, (id) => coverageOrder(primaryCoverageByNode.get(id)), {
  layerGap: 272,
  rowGap: 134,
  marginX: 48,
  marginY: 54,
  sweeps: 6
});

export const courseSkillTreeNodes: CourseSkillTreeNode[] = Array.from(courseNodeIds).sort().map((nodeId) => {
  const knowledge = nodeById.get(nodeId);
  const primaryCoverage = primaryCoverageByNode.get(nodeId);
  const lesson = primaryCoverage ? lessonById.get(primaryCoverage.lessonId) : undefined;
  const chapter = lesson ? chapterById.get(lesson.chapterId) : undefined;
  if (!knowledge || !primaryCoverage || !lesson || !chapter) throw new Error(`Cannot project curriculum node: ${nodeId}`);
  const curriculumContexts = curriculumCoverages.filter((coverage) => coverage.nodeId === nodeId).map((coverage) => {
    const contextLesson = lessonById.get(coverage.lessonId);
    if (!contextLesson) throw new Error(`Unknown lesson for coverage: ${coverage.id}`);
    return { ...coverage, lessonOrder: contextLesson.order, chapterId: contextLesson.chapterId };
  }).sort((left, right) => left.lessonOrder - right.lessonOrder || left.id.localeCompare(right.id));
  const practiceContexts = practiceCoverages.filter((coverage) => coverage.nodeId === nodeId).flatMap((coverage) => {
    const practice = practices.find((item) => item.id === coverage.practiceId);
    return practice ? [{ ...coverage, title: practice.title, templateId: practice.templateId }] : [];
  });
  const practiceIds = practiceContexts.map((context) => context.practiceId);
  const status = lesson.order <= 3 ? "completed" : lesson.order === 4 ? "learning" : lesson.order <= 7 ? "available" : "locked";
  return {
    id: knowledge.id,
    knowledge,
    title: knowledge.title,
    description: knowledge.description,
    scope: knowledge.scope,
    primaryCoverage: { ...primaryCoverage, lessonOrder: lesson.order, chapterId: chapter.id },
    curriculumContexts,
    practiceContexts,
    lessonId: lesson.id,
    lesson: lesson.order,
    chapterId: chapter.id,
    coverageRoles: Array.from(new Set(curriculumContexts.map((coverage) => coverage.role))),
    materialIds: curriculumContexts.flatMap((coverage) => coverage.lessonId === "L04" ? [MATERIAL_ID] : []),
    practiceIds,
    practiceTitle: practiceContexts[0]?.title ?? `${knowledge.title} 学习活动`,
    status,
    x: fullLayout[nodeId].x,
    y: fullLayout[nodeId].y,
    color: chapter.color
  };
});

const NODE_WIDTH = 196;
const NODE_HEIGHT = 104;
courseSkillTreeNodes.forEach((node, index) => courseSkillTreeNodes.slice(index + 1).forEach((other) => {
  if (node.x === other.x && node.y === other.y) throw new Error(`Course nodes share coordinates: ${node.id}, ${other.id}`);
  const overlaps = node.x < other.x + NODE_WIDTH && node.x + NODE_WIDTH > other.x && node.y < other.y + NODE_HEIGHT && node.y + NODE_HEIGHT > other.y;
  if (overlaps) throw new Error(`Course nodes overlap: ${node.id}, ${other.id}`);
}));
if (courseSkillTreeNodes.reduce((sum, node) => sum + node.curriculumContexts.length, 0) !== curriculumCoverages.filter((coverage) => courseNodeIds.has(coverage.nodeId)).length) {
  throw new Error("Course curriculum N:M projection lost coverage records");
}
if (courseSkillTreeNodes.reduce((sum, node) => sum + node.practiceContexts.length, 0) !== practiceCoverages.filter((coverage) => courseNodeIds.has(coverage.nodeId)).length) {
  throw new Error("Course practice N:M projection lost coverage records");
}

const chapterEdgeByPair = new Map<string, CourseChapterEdge>();
mainCourseEdges.forEach((edge) => {
  const source = primaryChapterByNode.get(edge.source);
  const target = primaryChapterByNode.get(edge.target);
  if (!source || !target || source === target) return;
  const key = `${source}:${target}`;
  const current = chapterEdgeByPair.get(key) ?? {
    id: `chapter-projection-${source}-${target}`,
    source,
    target,
    primaryRelation: edge.relation === "prerequisite" ? "prerequisite" as const : "enables" as const,
    sourceKind: "knowledge" as const,
    prerequisiteCount: 0,
    enablesCount: 0,
    supportCount: 0
  };
  if (edge.relation === "prerequisite") current.prerequisiteCount += 1;
  else current.enablesCount += 1;
  current.supportCount += 1;
  current.primaryRelation = current.prerequisiteCount > 0 ? "prerequisite" : "enables";
  chapterEdgeByPair.set(key, current);
});

const incidentChapterIds = new Set(Array.from(chapterEdgeByPair.values()).flatMap((edge) => [edge.source, edge.target]));
curriculumChapters.filter((chapter) => chapter.order > 1 && !incidentChapterIds.has(chapter.id)).forEach((chapter) => {
  const sequence = [...curriculumSequences].reverse().find((item) => lessonById.get(item.targetLessonId)?.chapterId === chapter.id && lessonById.get(item.sourceLessonId)?.chapterId !== chapter.id);
  const source = sequence ? lessonById.get(sequence.sourceLessonId)?.chapterId : undefined;
  if (!source) return;
  chapterEdgeByPair.set(`${source}:${chapter.id}`, {
    id: `chapter-sequence-${source}-${chapter.id}`,
    source,
    target: chapter.id,
    primaryRelation: "sequence",
    sourceKind: "curriculum-sequence",
    prerequisiteCount: 0,
    enablesCount: 0,
    supportCount: 0
  });
});

const aggregatedChapterEdges = Array.from(chapterEdgeByPair.values()).sort((left, right) => left.source.localeCompare(right.source) || left.target.localeCompare(right.target));
assertDirectedAcyclic(curriculumChapters.map((chapter) => chapter.id), aggregatedChapterEdges);
export const courseChapterEdges: CourseChapterEdge[] = transitiveReduction(curriculumChapters.map((chapter) => chapter.id), aggregatedChapterEdges);
const chapterLayout = buildLayeredDagLayout(curriculumChapters.map((chapter) => chapter.id), courseChapterEdges, (id) => chapterById.get(id)?.order ?? 0, {
  layerGap: 300,
  rowGap: 178,
  marginX: 80,
  marginY: 100,
  sweeps: 6
});
export const courseChapters: CourseChapterProjection[] = curriculumChapters.map((chapter) => ({ ...chapter, ...chapterLayout[chapter.id] }));

/** Deleting a course removes only curriculum associations; knowledge is intentionally not accepted as input. */
export function deleteCourseCurriculum(courseId: string) {
  return {
    curricula: agenticCurriculum.courseId === courseId ? [] : [agenticCurriculum],
    chapters: curriculumChapters.filter((chapter) => chapter.courseId !== courseId),
    lessons: curriculumLessons.filter((lesson) => lesson.courseId !== courseId),
    curriculumCoverages: curriculumCoverages.filter((coverage) => coverage.courseId !== courseId),
    curriculumSequences: curriculumSequences.filter((sequence) => sequence.courseId !== courseId),
    practiceCoverages
  };
}
