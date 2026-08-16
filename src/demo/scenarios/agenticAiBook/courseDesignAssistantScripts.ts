import type { CourseDesignAssistantAction, CourseDesignAssistantContext, CourseDesignAssistantProvider, CourseDesignAssistantResponse } from "@/features/course/courseDesignAssistant";
import { GOLDEN_COURSE_ID } from "./goldenCourse.seed";

const actions:Record<CourseDesignAssistantContext["kind"],CourseDesignAssistantAction[]> = {
  course:[{id:"course-restructure",label:"AI 重构篇章"},{id:"course-structure",label:"检查课程结构"},{id:"knowledge-dependencies",label:"检查知识依赖"},{id:"material-coverage",label:"检查课件覆盖"},{id:"assignment-coverage",label:"检查实训覆盖"}],
  chapter:[{id:"chapter-restructure",label:"AI 重构篇章"},{id:"chapter-coverage",label:"检查篇章覆盖"},{id:"missing-knowledge",label:"检查遗漏知识"},{id:"chapter-assignment",label:"优化篇章实训"},{id:"difficulty-curve",label:"检查难度曲线"}],
  knowledge:[{id:"split-knowledge",label:"AI 拆解知识点"},{id:"merge-knowledge",label:"AI 合并知识点"},{id:"suggest-dependency",label:"AI 建议前置依赖"},{id:"knowledge-dependencies",label:"检查前置依赖"},{id:"material-coverage",label:"检查课件覆盖"},{id:"link-material",label:"关联已有课件"},{id:"generate-material",label:"AI 生成课件"},{id:"assignment-coverage",label:"检查实训覆盖"},{id:"knowledge-design",label:"优化当前知识点教学设计"}],
  assignment:[{id:"assignment-copy",label:"优化任务说明"},{id:"inherited-outputs",label:"检查前置成果"},{id:"acceptance-criteria",label:"优化验收标准"},{id:"knowledge-mapping",label:"检查知识对应关系"}]
};
const fallback:CourseDesignAssistantResponse={fallback:true,message:"Prototype 当前支持课程结构、依赖、课件覆盖和实训设计等预设 AI 辅助能力。"};
const unavailable:CourseDesignAssistantResponse={fallback:true,message:"当前课程没有可用的 Demo Course Assistant 能力。"};
const list = (items:string[], empty:string) => items.length ? items.join("、") : empty;

function respond(context:CourseDesignAssistantContext, actionId:string):CourseDesignAssistantResponse {
  const proposalId=(kind:string)=>`demo-proposal:${kind}:${context.key}`;
  if(context.kind === "knowledge" && actionId === "split-knowledge") {
    const prefix=`draft-knowledge-${context.nodeId.replace(/[^a-zA-Z0-9-]/g,"-")}`;
    const titles=context.label.toLowerCase().includes("orchestrator")||context.label.includes("编排")?["Orchestrator Pattern","Worker Contract","Task Dispatch","Result Aggregation"]:[`${context.label} · 核心概念`,`${context.label} · 应用边界`];
    const candidates=titles.map((title,index)=>({id:`${prefix}-${index+1}`,title,description:`由“${context.label}”拆解的课程草稿知识点。`,chapterId:context.chapterId ?? "authoring-unassigned"}));
    return {message:`建议把“${context.label}”拆成 ${titles.length} 个可独立教学的原子能力。`,proposal:{id:proposalId("split"),title:"拆解 Knowledge",summary:"原节点将从课程覆盖移除，新增草稿候选并建立依赖。",operations:[{type:"removeKnowledgeCoverage",nodeId:context.nodeId},...candidates.map((candidate)=>({type:"addKnowledgeCandidate" as const,candidate})),...candidates.slice(1).map((candidate,index)=>({type:"addDependency" as const,edge:{id:`draft-edge:${candidates[index].id}:${candidate.id}`,source:candidates[index].id,target:candidate.id,relation:"prerequisite" as const,strength:"hard" as const,reason:"Demo AI split proposal"}}))]}};
  }
  if(context.kind === "knowledge" && actionId === "merge-knowledge") { const neighbor=context.predecessorIds?.[0]; return neighbor?{message:"Prototype 将当前 Knowledge 与其直接前置合并为课程草稿候选；全局 Knowledge 不会被删除。",proposal:{id:proposalId("merge"),title:"合并相邻 Knowledge",summary:"创建一个课程局部候选，移除两项课程覆盖并保留全局事实。",operations:[{type:"addKnowledgeCandidate",candidate:{id:`draft-knowledge-merged-${context.nodeId}`,title:`${context.label} · 综合能力`,description:`合并 ${context.label} 与直接前置能力的课程级教学目标。`,chapterId:context.chapterId ?? "authoring-unassigned",mergedFrom:[neighbor,context.nodeId]}},{type:"removeKnowledgeCoverage",nodeId:neighbor},{type:"removeKnowledgeCoverage",nodeId:context.nodeId}]}}:{fallback:true,message:"当前 Knowledge 没有可合并的直接前置节点。"}; }
  if(context.kind === "knowledge" && actionId === "suggest-dependency") {
    const source="MA04";
    const target=context.nodeId;
    return {message:`建议保留 ${source} → ${target} 的直接前置关系；应用前会检查重复和循环。`,proposal:{id:proposalId("dependency"),title:"建议前置依赖",summary:"新增一条课程草稿依赖。",operations:[{type:"addDependency",edge:{id:`draft-edge:${source}:${target}`,source,target,relation:"prerequisite",strength:"hard",reason:"Demo AI dependency proposal"}}]}};
  }
  if((context.kind === "course" && actionId === "course-restructure")||(context.kind === "chapter"&&actionId === "chapter-restructure")) return {message:"建议增加一个 Advanced Multi-Agent 草稿篇章；应用前会运行确定性校验。",proposal:{id:proposalId("chapter"),title:"重构篇章",summary:"新增一个课程草稿篇章。",operations:[{type:"addChapter",chapter:{id:"draft-chapter-advanced-multi-agent",courseId:context.courseId,title:"Advanced Multi-Agent",description:"高级多智能体编排与恢复模式。",outcome:"能够设计可恢复的多智能体协作系统。",color:"#8b75df",order:99}}]}};
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
    const actionId=text.includes("拆")&&context.kind==="knowledge"?"split-knowledge":text.includes("合并")&&context.kind==="knowledge"?"merge-knowledge":text.includes("重构")?context.kind==="chapter"?"chapter-restructure":"course-restructure":text.includes("课件")||text.includes("材料")?"material-coverage":text.includes("前置")||text.includes("依赖")?context.kind === "assignment"?"inherited-outputs":"knowledge-dependencies":text.includes("实训")||text.includes("任务")?context.kind === "chapter"?"chapter-assignment":"assignment-coverage":text.includes("结构")||text.includes("篇章")?context.kind === "chapter"?"chapter-coverage":"course-structure":"";
    return actionId?respond(context,actionId):fallback;
  }
};
