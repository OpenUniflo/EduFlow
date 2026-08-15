import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { AssignmentCoverage, AssignmentDependency, ChapterOutcome, CourseAssignment, CurriculumChapter, CurriculumCoverage, CurriculumLesson, Material, MaterialKnowledgeCoverage } from "@/features/course/types";

export const GOLDEN_COURSE_ID = "agentic-ai-golden";
const chapterSeeds = [
  ["任务建模", "Agent 基础与任务建模", "最小任务 Agent", ["AG01","H02","H03","P01","P02"]],
  ["结构交互", "Context 与结构化交互", "上下文增强 Agent", ["C01","C02","C03","I01","I02"]],
  ["知识工具", "Tools、RAG 与 Memory", "知识工具 Agent", ["T11","T12","T03","K01","K14","K04"]],
  ["可靠运行", "Runtime 与可靠性", "可恢复 Agent", ["RT01","RT02","RT03","RT14","RT15"]],
  ["可信执行", "Evaluation、Guardrail 与可信执行", "可信 Agent", ["E12","E13","E14","S01","S02"]],
  ["多智能体", "Multi-Agent Workflow", "Multi-Agent Research System", ["MA02","MA12","MA04","WF03","W13"]]
] as const;
const colors = ["#78a7ee","#9a8ee6","#eca86c","#70c4a5","#77b7c8","#ec92aa"];
export const goldenChapters: CurriculumChapter[] = chapterSeeds.map((seed,index) => ({ id:`golden-chapter-${index+1}`,courseId:GOLDEN_COURSE_ID,title:seed[1],description:`以“${seed[2]}”为本篇章可复用工程成果。`,order:index+1,color:colors[index],outcome:seed[2] }));
export const goldenLessons: CurriculumLesson[] = chapterSeeds.map((seed,index) => ({ id:`golden-lesson-${index+1}`,courseId:GOLDEN_COURSE_ID,chapterId:goldenChapters[index].id,title:index===5?"并行执行、故障验证与终止":seed[1],order:index+1 }));
export const goldenCoverages: CurriculumCoverage[] = chapterSeeds.flatMap((seed,chapterIndex) => seed[3].map((nodeId,order) => ({ id:`golden-coverage-${chapterIndex+1}-${order+1}`,courseId:GOLDEN_COURSE_ID,lessonId:goldenLessons[chapterIndex].id,nodeId,role:"introduce" as const,order })));
const nodeIds = goldenCoverages.map((item) => item.nodeId);
const knowledgeAssignments: CourseAssignment[] = nodeIds.map((nodeId,index) => ({ id:`golden-knowledge-assignment-${nodeId}`,courseId:GOLDEN_COURSE_ID,order:index+1,title:`${nodeId} 知识点实训`,description:"使用当前阶段已有成果完成一次可复核的原子能力练习。",requirements:["加载前置实训成果","完成本知识点要求的设计或调试","保留可验收输出"],expectedOutput:`${nodeId.toLowerCase()}-artifact`,acceptanceCriteria:["输出可复核","与 Knowledge 学习目标一致","未把 Assignment 完成等同于 mastery"],mode:index%4===3?"workflow":"instruction",workflowTemplateId:index%4===3?"minimal":undefined,estimatedMinutes:25 }));
const chapterAssignments: CourseAssignment[] = goldenChapters.map((chapter,index) => ({ id:`golden-chapter-assignment-${index+1}`,courseId:GOLDEN_COURSE_ID,order:32+index,title:`篇章 ${index+1} 综合实训：${chapter.outcome}`,description:index===5?"汇合往期五个阶段成果，完成 Multi-Agent Research System。":"汇合本篇章原子实训，产出可被后续篇章继承的阶段成果。",requirements:index===5?["继承 Task Specification 与 Context Pack","继承 Knowledge & Tool Agent","继承 Runtime + Retry + Checkpoint","继承 Evaluator + Guardrail + Approval","修复验证后再取消 Worker 的终止路径"]:["汇合本篇章实训输出","记录成果接口与复用边界"],expectedOutput:chapter.outcome,acceptanceCriteria:["阶段成果完整","前置成果引用明确","可被下一篇章继续使用"],mode:"workflow",workflowTemplateId:index===5?"multi-agent-workflow":"showcase",estimatedMinutes:60,projectContribution:chapter.outcome }));
export const goldenAssignments = [...knowledgeAssignments,...chapterAssignments];
export const goldenAssignmentCoverages: AssignmentCoverage[] = [
  ...knowledgeAssignments.map((assignment,index) => ({ id:`golden-ac-${index+1}`,assignmentId:assignment.id,nodeId:nodeIds[index],role:"practice" as const })),
  ...chapterSeeds.flatMap((seed,chapterIndex) => seed[3].map((nodeId,index) => ({ id:`golden-chapter-ac-${chapterIndex+1}-${index+1}`,assignmentId:chapterAssignments[chapterIndex].id,nodeId,role:"assess" as const })))
];
export const goldenAssignmentDependencies: AssignmentDependency[] = chapterAssignments.slice(1).map((assignment,index) => ({ id:`golden-dependency-${index+1}`,courseId:GOLDEN_COURSE_ID,sourceAssignmentId:chapterAssignments[index].id,targetAssignmentId:assignment.id,strength:"hard" }));
export const goldenOutcomes: ChapterOutcome[] = goldenChapters.map((chapter,index) => ({ id:`golden-outcome-${index+1}`,courseId:GOLDEN_COURSE_ID,chapterId:chapter.id,title:chapter.outcome }));
const lesson6 = goldenLessons[5].id;
export const goldenMaterials: Material[] = [
  { id:"golden-parallel-lesson",courseId:GOLDEN_COURSE_ID,lessonId:lesson6,order:1,title:"并行执行与结果汇合",description:"AI Native Lesson",type:"article",duration:"35 分钟",segments:[
    {id:"parallel-problem",order:1,title:"Research Agent 的等待瓶颈",section:"Problem / Scenario",content:{lead:"同时查询 Web、Paper Database 与 Internal Knowledge Base。",bullets:["Research Agent","Search Tool","Paper Retriever","Internal RAG"]}},
    {id:"parallel-flow",order:2,title:"并行汇合结构",section:"Diagram / Flow",content:{code:"          ┌→ Web ──────┐\nPlanner ──┼→ Paper ────┼→ Merge\n          └→ RAG ──────┘",visual:"flow"}},
    {id:"parallel-trace",order:3,title:"模拟 Trace",section:"Trace",content:{code:"Planner start\nWeb start\nPaper start\nRAG start\nRAG finish\nWeb finish\nPaper finish\nMerge received 3/3",visual:"trace"}},
    {id:"parallel-practice",order:4,title:"进入实训",section:"Practice CTA",content:{lead:"连接、调整和扩展已加载的并行结构与 Merge。",visual:"practice"}}]},
  { id:"golden-failure-lesson",courseId:GOLDEN_COURSE_ID,lessonId:lesson6,order:2,title:"故障、验证与终止",description:"AI Native Lesson",type:"article",duration:"40 分钟",segments:[
    {id:"failure-case",order:1,title:"Candidate 不等于成功",section:"Warning / Failure Case",content:{code:"错误：Candidate → Cancel Others",visual:"decision"}},
    {id:"verified-settle",order:2,title:"可靠终止链路",section:"Explanation",content:{code:"Candidate → Verifier → Verified Success → Atomic Settle → Cancel Remaining Workers",bullets:["Worker timeout → Retry","重试耗尽 → Fallback","Verifier reject → 返回执行路径"],visual:"flow"}},
    {id:"source-reference",order:3,title:"来源",section:"Source Reference",content:{lead:"对应原教材 Runtime、Evaluation 与 Multi-Agent 主题；不复制原文。"}},
    {id:"failure-practice",order:4,title:"修复 Workflow",section:"Practice CTA",content:{lead:"继承 Parallel Workflow，补充 Timeout、Retry、Verifier 与 Cancel/Fallback。",visual:"practice"}}]}
];
export const goldenMaterialCoverages: MaterialKnowledgeCoverage[] = [["golden-parallel-lesson","parallel-problem","MA02","introduce"],["golden-parallel-lesson","parallel-flow","WF03","explain"],["golden-parallel-lesson","parallel-practice","W13","practice-reference"],["golden-failure-lesson","failure-case","E13","example"],["golden-failure-lesson","verified-settle","RT14","explain"],["golden-failure-lesson","failure-practice","WF03","practice-reference"]].map((x,index)=>({id:`golden-mc-${index+1}`,materialId:x[0],segmentId:x[1],nodeId:x[2],role:x[3] as MaterialKnowledgeCoverage["role"]}));

export const goldenAgenticAiRuntime: CourseRuntimeData = { course:{id:GOLDEN_COURSE_ID,title:"Agentic AI 工程实践：从单 Agent 到多智能体研究系统",subtitle:"从单 Agent 到多智能体研究系统",description:"真实教材驱动的固定 Golden 教学重构。",targetOutcome:"AI 科研调研与立项助手",accentColor:"#697ee6",generationStatus:"ready"},curriculum:{id:"golden-curriculum",courseId:GOLDEN_COURSE_ID,generationMode:"auto-fixed-count",requestedChapterCount:6},chapters:goldenChapters,lessons:goldenLessons,curriculumCoverages:goldenCoverages,curriculumSequences:goldenLessons.slice(1).map((lesson,index)=>({id:`golden-sequence-${index+1}`,courseId:GOLDEN_COURSE_ID,sourceLessonId:goldenLessons[index].id,targetLessonId:lesson.id})),assignments:goldenAssignments,assignmentCoverages:goldenAssignmentCoverages,assignmentDependencies:goldenAssignmentDependencies,chapterOutcomes:goldenOutcomes,assignmentOutcomeCompositions:chapterAssignments.map((assignment,index)=>({id:`golden-aoc-${index+1}`,assignmentId:assignment.id,outcomeId:goldenOutcomes[index].id})),finalProjects:[{id:"golden-final-project",courseId:GOLDEN_COURSE_ID,title:"AI 科研调研与立项助手",description:"汇合 6 个阶段成果形成最终研究系统。"}],finalProjectOutcomeCompositions:goldenOutcomes.map((outcome,index)=>({id:`golden-fpoc-${index+1}`,finalProjectId:"golden-final-project",outcomeId:outcome.id})),materials:goldenMaterials,materialKnowledgeCoverages:goldenMaterialCoverages,revision:"agentic-ai-golden-v1" };

export function validateGoldenAgenticAiRuntime(runtime = goldenAgenticAiRuntime) {
  const errors:string[]=[]; const courseNodes=new Set(runtime.curriculumCoverages.map(x=>x.nodeId));
  if(runtime.chapters.length!==6)errors.push("exactly 6 chapters required"); if(courseNodes.size!==31)errors.push("exactly 31 Knowledge targets required");
  if(runtime.assignments.length!==37)errors.push("31 Knowledge + 6 chapter Assignments required"); courseNodes.forEach(id=>{if(!runtime.assignmentCoverages.some(x=>x.nodeId===id))errors.push(`${id} missing AssignmentCoverage`)});
  if(runtime.chapterOutcomes.length!==6||runtime.finalProjects.length!==1||runtime.finalProjectOutcomeCompositions.length!==6)errors.push("Final Project composition invalid");
  if(errors.length)throw new Error(errors.join("; ")); return true;
}
