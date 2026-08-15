import type { MaterialSegment } from "@/features/course/types";
import type { LessonAssistantProvider, LessonAssistantResult } from "@/features/material/lessonAssistant";

type Script = { label:string; keywords:string[]; message:string; title:string; lead:string; section:string; code?:string };
const scripts: Record<string,Script> = {
  simplify:{label:"解释得简单一点",keywords:["简单","通俗","解释","好懂"],message:"建议先用“三位研究助理同时查不同资料源”的类比建立直觉，再回到工程定义。",title:"一句话理解",lead:"并行像三位研究员同时查资料；Merge 像主编等待带来源的证据到齐。",section:"Example"},
  example:{label:"增加案例",keywords:["案例","例子","举例"],message:"已准备三路科研资料检索案例，可预览后应用。",title:"案例：三路证据汇合",lead:"Web、Paper 与 RAG 可以乱序完成，Merge 按来源身份收齐 3/3。",section:"Example"},
  timeout:{label:"增加 Worker 超时案例",keywords:["超时","worker","失败","故障"],message:"已准备 Paper Researcher 超时与有界恢复案例。",title:"Worker 超时与 Partial Failure",lead:"单个 Worker 超时后执行有界 Retry；耗尽后走 Fallback，并由 Verifier 决定证据是否足够结算。",section:"Warning / Failure Case",code:"Candidate → Verifier → Verified Success → Atomic Settle → Cancel Remaining Workers"},
  alignment:{label:"检查课件与实训是否一致",keywords:["实训","覆盖","一致","对齐"],message:"检测到实训要求 Partial Failure，但课件解释不足；建议补充 Worker timeout、Retry、Fallback 与 Verifier。",title:"实训对齐：Partial Failure",lead:"Merge 必须标记缺失结果，并且只有 Verifier 通过后才能 Atomic Settle 与取消剩余 Worker。",section:"Warning / Failure Case",code:"Timeout → Retry → Fallback → Verifier → Atomic Settle → Cancel"}
};
const fallback: LessonAssistantResult = {fallback:true,message:"Prototype 当前支持若干预设 AI 课程修改能力，请尝试简化解释、补充案例、加入故障场景或检查实训对齐。"};
function result(id:string, script:Script):LessonAssistantResult {
  const segment:MaterialSegment={id:`session-${id}`,order:999,title:script.title,section:script.section,content:{lead:script.lead,code:script.code,visual:script.code?"decision":"overview"}};
  return {message:script.message,mutation:{id,segment}};
}
export const demoLessonAssistantProvider: LessonAssistantProvider = {
  listActions(material){return material.type === "article" ? Object.entries(scripts).map(([id,script])=>({id,label:script.label})) : [];},
  resolveAction(_material,actionId){const script=scripts[actionId];return script?result(actionId,script):fallback;},
  resolveText(_material,input){const normalized=input.trim().toLowerCase();const match=["alignment","timeout","example","simplify"].map((id)=>[id,scripts[id]] as const).find(([,script])=>script.keywords.some((keyword)=>normalized.includes(keyword)));return match?result(match[0],match[1]):fallback;}
};
