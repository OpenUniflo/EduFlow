import type {
  AssignmentCoverage,
  Course,
  CourseAssignment,
  CourseCurriculum,
  CurriculumChapter,
  CurriculumCoverage,
  CurriculumLesson,
  CurriculumSequence,
  Material,
  MaterialKnowledgeCoverage
} from "../../types";
import type { CourseRuntimeData } from "../../course/runtime/courseRuntime";

export const pythonEngineeringCourse: Course = {
  id: "python-engineering",
  title: "Python Engineering",
  subtitle: "从语言基础到可靠异步服务",
  description: "以类型、模块化、测试、HTTP、异步与可观测性为主线，构建可维护的 Python 服务。",
  accentColor: "#53B89A"
};

const chapter = (id: string, title: string, description: string, lessonIds: string[], order: number, color: string, outcome: string): CurriculumChapter => ({ id, courseId: pythonEngineeringCourse.id, title, description, lessonIds, order, color, progress: 0, outcome });
export const pythonEngineeringChapters: CurriculumChapter[] = [
  chapter("py-foundations", "运行时与语言基础", "理解对象、表达式、控制流、函数与作用域。", ["PY-L01", "PY-L02"], 1, "#53B89A", "可测试的函数模块"),
  chapter("py-modules", "模块化与质量", "用模块、类型与测试组织可靠项目。", ["PY-L03", "PY-L04"], 2, "#6F8FEA", "类型化 Python 包"),
  chapter("py-services", "HTTP 与 API 服务", "调用外部 API，并构建经过校验的异步服务。", ["PY-L05", "PY-L06"], 3, "#42AFC4", "可运行 API 服务"),
  chapter("py-production", "异步与生产化", "处理并发、超时、重试、可观测性与部署。", ["PY-L07", "PY-L08"], 4, "#9A7EDC", "可靠异步服务" )
];

const lesson = (id: string, chapterId: string, title: string, order: number): CurriculumLesson => ({ id, courseId: pythonEngineeringCourse.id, chapterId, title, order });
export const pythonEngineeringLessons: CurriculumLesson[] = [
  lesson("PY-L01", "py-foundations", "Python 运行时、对象与类型", 1),
  lesson("PY-L02", "py-foundations", "控制流、函数与作用域", 2),
  lesson("PY-L03", "py-modules", "模块、文件与项目结构", 3),
  lesson("PY-L04", "py-modules", "异常、类型与自动化测试", 4),
  lesson("PY-L05", "py-services", "HTTP Client 与数据校验", 5),
  lesson("PY-L06", "py-services", "FastAPI 与认证", 6),
  lesson("PY-L07", "py-production", "async/await、超时与重试", 7),
  lesson("PY-L08", "py-production", "可观测性与容器部署", 8)
];

const coverageSeed: Array<[string, CurriculumCoverage["role"], string[]]> = [
  ["PY-L01", "introduce", ["PY01", "PY02", "PY03", "PY04"]],
  ["PY-L02", "introduce", ["PY05", "PY06", "PY07"]],
  ["PY-L03", "reinforce", ["PY06"]],
  ["PY-L03", "introduce", ["PY08", "PY19", "PY34"]],
  ["PY-L04", "introduce", ["PY09", "PY27", "PY37", "PY85"]],
  ["PY-L05", "introduce", ["PY45", "PY46", "PY49"]],
  ["PY-L06", "introduce", ["PY50", "PY51", "PY94"]],
  ["PY-L06", "reinforce", ["T11"]],
  ["PY-L07", "introduce", ["PY56", "PY57", "PY58", "PY100", "PY63", "PY62"]],
  ["PY-L08", "introduce", ["PY89", "PY90", "PY91", "PY95"]]
];
export const pythonEngineeringCoverages: CurriculumCoverage[] = coverageSeed.flatMap(([lessonId, role, nodeIds]) => nodeIds.map((nodeId, index) => ({ id: `coverage-${lessonId}-${role}-${index + 1}`, courseId: pythonEngineeringCourse.id, lessonId, nodeId, role })));

type AssignmentSeed = CourseAssignment & { nodeIds: string[] };
const assignment = (id: string, title: string, description: string, nodeIds: string[], mode: CourseAssignment["mode"], workflowTemplateId?: string, projectContribution?: string): AssignmentSeed => ({
  id, courseId: pythonEngineeringCourse.id, title, description, nodeIds,
  requirements: ["实现可运行的最小版本", "覆盖失败路径", "记录关键设计决定"],
  expectedOutput: `${id}/`, acceptanceCriteria: ["结果可运行", "接口边界清晰", "至少一个测试验证失败路径"],
  mode, workflowTemplateId, estimatedMinutes: mode === "workflow" ? 50 : 30, projectContribution
});
const pythonAssignmentSeeds: AssignmentSeed[] = [
  assignment("py-runtime-model", "绘制 Python 运行时对象模型", "用可执行示例说明对象、引用、类型与表达式求值。", ["PY01", "PY02", "PY03", "PY04"], "instruction"),
  assignment("py-function-library", "构建函数式数据处理模块", "用控制流、函数和作用域实现可复用转换库。", ["PY05", "PY06", "PY07"], "instruction"),
  assignment("py-package-layout", "组织可发布 Python 包", "把脚本迁移为包含模块、文件接口和配置边界的工程。", ["PY08", "PY19", "PY34"], "instruction"),
  assignment("py-typed-quality", "为模块建立类型与测试防线", "加入异常契约、Type Hint、pytest 和单元测试。", ["PY09", "PY27", "PY37", "PY85", "PY06"], "instruction"),
  assignment("py-http-client", "实现健壮的 HTTP Client", "调用 JSON API，处理状态码、序列化和失败。", ["PY45", "PY46"], "instruction"),
  assignment("py-validated-api", "构建经过校验的 FastAPI 接口", "使用 Pydantic、认证、Tool Interface 和 ASGI 边界提供服务。", ["PY49", "PY50", "PY51", "PY94", "T11"], "workflow", "agent-loop", "形成综合项目的 API Layer。"),
  assignment("py-async-runtime", "实现有界异步任务运行器", "在事件循环中调度任务，并处理超时、取消和重试。", ["PY56", "PY57", "PY58", "PY100", "PY63", "PY62"], "workflow", "runtime-recovery", "形成综合项目的 Async Runtime。"),
  assignment("py-observability", "接入日志、指标与 Trace", "让一次 API 请求可以跨步骤追踪和诊断。", ["PY89", "PY90", "PY91"], "instruction"),
  assignment("py-container-delivery", "容器化 Python 服务", "使用 Docker 构建可重复部署的服务镜像。", ["PY95"], "instruction"),
  assignment("py-service-capstone", "交付可靠 Python 异步服务", "组合类型化 API、异步运行时、可观测性与容器部署。", ["PY06", "PY49", "PY50", "PY57", "PY62", "PY90", "PY95"], "workflow", "agent-loop", "课程综合项目最终交付。")
];
export const pythonEngineeringAssignments: CourseAssignment[] = pythonAssignmentSeeds.map(({ nodeIds: _nodeIds, ...item }) => item);
export const pythonEngineeringAssignmentCoverages: AssignmentCoverage[] = pythonAssignmentSeeds.flatMap((item) => item.nodeIds.map((nodeId, index) => ({ id: `assignment-coverage-${item.id}-${index + 1}`, assignmentId: item.id, nodeId, role: "assess" })));

export const pythonEngineeringMaterials: Material[] = [
  {
    id: "python-core-handbook", courseId: pythonEngineeringCourse.id, lessonId: "PY-L02", title: "Python 函数与模块工程手册", description: "从控制流到可测试模块。", type: "document", duration: "45 分钟",
    segments: [
      { id: "core-control", order: 1, title: "控制流与函数边界", section: "Core", content: { lead: "把分支与循环收束到可测试函数。", bullets: ["纯函数", "输入输出契约", "边界条件"] } },
      { id: "core-scope", order: 2, title: "作用域与引用", section: "Core", content: { lead: "识别局部状态、闭包与对象引用。", code: "def make_counter():\n    count = 0\n    ..." } },
      { id: "core-module", order: 3, title: "模块与项目结构", section: "Engineering", content: { lead: "把函数组织进稳定模块和包。", bullets: ["公开接口", "配置边界", "测试目录"] } },
      { id: "core-errors", order: 4, title: "异常契约", section: "Engineering", content: { lead: "让失败成为可观察、可测试的接口行为。" } }
    ]
  },
  {
    id: "python-async-service-guide", courseId: pythonEngineeringCourse.id, lessonId: "PY-L07", title: "异步 Python 服务实战", description: "构建具有超时、取消、重试和观测能力的服务。", type: "slides", duration: "60 分钟",
    segments: [
      { id: "async-event-loop", order: 1, title: "Event Loop 与 async/await", section: "Async", content: { lead: "事件循环调度协程与 I/O。", bullets: ["coroutine", "await", "task"] } },
      { id: "async-bounds", order: 2, title: "超时与取消", section: "Reliability", content: { lead: "为每个外部操作设置生命周期边界。" } },
      { id: "async-recovery", order: 3, title: "异常与有界重试", section: "Reliability", content: { lead: "只重试可恢复故障，并保留失败原因。" } },
      { id: "async-observe", order: 4, title: "日志、指标与 Trace", section: "Production", content: { lead: "关联一次请求的完整执行路径。" } }
    ]
  }
];

const materialCoverageSeed: Array<[string, string, string[], MaterialKnowledgeCoverage["role"]]> = [
  ["python-core-handbook", "core-control", ["PY05", "PY06"], "explain"],
  ["python-core-handbook", "core-scope", ["PY02", "PY06", "PY07"], "example"],
  ["python-core-handbook", "core-module", ["PY06", "PY08", "PY34"], "explain"],
  ["python-core-handbook", "core-errors", ["PY09"], "practice-reference"],
  ["python-async-service-guide", "async-event-loop", ["PY56", "PY57", "PY58"], "introduce"],
  ["python-async-service-guide", "async-bounds", ["PY100", "PY63"], "explain"],
  ["python-async-service-guide", "async-recovery", ["PY09", "PY62"], "practice-reference"],
  ["python-async-service-guide", "async-observe", ["PY89", "PY90", "PY91"], "example"]
];
export const pythonEngineeringMaterialKnowledgeCoverages: MaterialKnowledgeCoverage[] = materialCoverageSeed.flatMap(([materialId, segmentId, nodeIds, role]) => nodeIds.map((nodeId) => ({ id: `material-coverage-${materialId}-${segmentId}-${nodeId}`, materialId, segmentId, nodeId, role })));

export const pythonEngineeringCurriculum: CourseCurriculum = { id: "curriculum-python-engineering-v1", courseId: pythonEngineeringCourse.id, generationMode: "auto-fixed-count", requestedChapterCount: 4 };
export const pythonEngineeringSequences: CurriculumSequence[] = pythonEngineeringLessons.slice(1).map((item, index) => ({ id: `py-sequence-${index + 1}`, courseId: pythonEngineeringCourse.id, sourceLessonId: pythonEngineeringLessons[index].id, targetLessonId: item.id }));

export const pythonEngineeringRuntime: CourseRuntimeData = {
  course: pythonEngineeringCourse,
  curriculum: pythonEngineeringCurriculum,
  chapters: pythonEngineeringChapters,
  lessons: pythonEngineeringLessons,
  curriculumCoverages: pythonEngineeringCoverages,
  curriculumSequences: pythonEngineeringSequences,
  assignments: pythonEngineeringAssignments,
  assignmentCoverages: pythonEngineeringAssignmentCoverages,
  materials: pythonEngineeringMaterials,
  materialKnowledgeCoverages: pythonEngineeringMaterialKnowledgeCoverages,
  revision: "python-engineering-v1"
};
