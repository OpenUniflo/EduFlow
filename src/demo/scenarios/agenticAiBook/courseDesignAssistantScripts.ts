import type { CourseDesignAssistantAction, CourseDesignAssistantContext, CourseDesignAssistantProvider, CourseDesignAssistantResponse } from "@/features/course/courseDesignAssistant";
import { GOLDEN_COURSE_ID } from "./goldenCourse.seed";

const actions:Record<CourseDesignAssistantContext["kind"],CourseDesignAssistantAction[]> = {
  course:[{id:"course-structure",label:"检查课程结构"},{id:"knowledge-dependencies",label:"检查知识依赖"},{id:"material-coverage",label:"检查课件覆盖"},{id:"assignment-coverage",label:"检查实训覆盖"}],
  chapter:[{id:"chapter-coverage",label:"检查篇章覆盖"},{id:"missing-knowledge",label:"检查遗漏知识"},{id:"chapter-assignment",label:"优化篇章实训"},{id:"difficulty-curve",label:"检查难度曲线"}],
  knowledge:[{id:"knowledge-dependencies",label:"检查前置依赖"},{id:"material-coverage",label:"检查课件覆盖"},{id:"link-material",label:"关联已有课件"},{id:"generate-material",label:"AI 生成课件"},{id:"assignment-coverage",label:"检查实训覆盖"},{id:"knowledge-design",label:"优化当前知识点教学设计"}],
  assignment:[{id:"assignment-copy",label:"优化任务说明"},{id:"inherited-outputs",label:"检查前置成果"},{id:"acceptance-criteria",label:"优化验收标准"},{id:"knowledge-mapping",label:"检查知识对应关系"}]
};
const fallback:CourseDesignAssistantResponse={fallback:true,message:"Prototype 当前支持课程结构、依赖、课件覆盖和实训设计等预设 AI 辅助能力。"};
const unavailable:CourseDesignAssistantResponse={fallback:true,message:"当前课程没有可用的 Demo Course Assistant 能力。"};
const list = (items:string[], empty:string) => items.length ? items.join("、") : empty;

function respond(context:CourseDesignAssistantContext, actionId:string):CourseDesignAssistantResponse {
  if(actionId === "course-structure") return {message:`课程已经形成 ${context.kind === "course" ? context.chapterCount : 6} 个递进阶段；第 6 篇章依赖前 5 个阶段成果。`};
  if(context.kind === "knowledge" && actionId === "material-coverage") return {message:`当前关联 ${context.relatedMaterials.length} 份课件：${list(context.relatedMaterials.map((item)=>item.title),"暂未关联课件")}。`};
  if(context.kind === "knowledge" && actionId === "knowledge-dependencies") return {message:`上游能力包括：${list(context.predecessors,"当前没有直接前置能力")}。后继能力：${list(context.successors,"暂无直接后继")}。`};
  if(context.kind === "knowledge" && actionId === "assignment-coverage") return {message:`当前 Knowledge 对应实训：${list(context.relatedAssignments,"暂未关联实训")}。`};
  if(context.kind === "assignment" && actionId === "inherited-outputs") return {message:`已继承成果：${list(context.inheritedOutputs,"当前 Assignment 没有显式 inherited outputs")}。`};
  if(context.kind === "assignment" && actionId === "acceptance-criteria") return {message:`建议保持验收标准可复核：${list(context.acceptanceCriteria,"请补充可验证的验收条件")}。`};
  if(context.kind === "assignment" && actionId === "knowledge-mapping") return {message:`当前 Assignment 覆盖：${list(context.coveredKnowledge,"暂未覆盖 Knowledge")}。`};
  if(context.kind === "chapter" && actionId === "chapter-coverage") return {message:`当前篇章覆盖 ${context.knowledgeCount} 个 Knowledge、${context.assignmentCount} 个 Assignment、${context.materialCoverageCount} 条 Segment coverage；阶段成果为 ${context.stageOutcome ?? "待定义"}。`};
  if(actionId.includes("material")) return {message:"课件覆盖已按 Material 聚合；建议继续检查关键 Knowledge 是否同时具备解释与实践引用。"};
  if(actionId.includes("assignment") || actionId.includes("acceptance")) return {message:"建议强化任务说明、前置成果和可复核验收标准之间的一致性。"};
  if(actionId.includes("dependencies") || actionId.includes("difficulty")) return {message:"知识依赖保持事实边界；建议复核先修关系与教学顺序是否一致。"};
  return {message:"当前结构完整，可继续检查覆盖、依赖与实训的一致性。"};
}

export const demoCourseDesignAssistantProvider:CourseDesignAssistantProvider={
  getActions(context){return context.courseId === GOLDEN_COURSE_ID ? actions[context.kind] : [];},
  resolveAction(context,actionId){return context.courseId === GOLDEN_COURSE_ID ? respond(context,actionId) : unavailable;},
  resolveText(context,input){
    if(context.courseId !== GOLDEN_COURSE_ID) return unavailable;
    const text=input.trim().toLowerCase();
    const actionId=text.includes("课件")||text.includes("材料")?"material-coverage":text.includes("前置")||text.includes("依赖")?context.kind === "assignment"?"inherited-outputs":"knowledge-dependencies":text.includes("实训")||text.includes("任务")?context.kind === "chapter"?"chapter-assignment":"assignment-coverage":text.includes("结构")||text.includes("篇章")?context.kind === "chapter"?"chapter-coverage":"course-structure":"";
    return actionId?respond(context,actionId):fallback;
  }
};
