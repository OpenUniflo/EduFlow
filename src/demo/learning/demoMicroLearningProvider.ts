import type { MicroLearningProvider, MicroLesson, MicroStep } from "@/features/learning/micro/microLearning";

const titles:Record<string,string>={AG01:"Agent",H02:"Workflow",H03:"Automation System",A01:"Classical Agent Architecture",R03:"Planning",RT01:"Agent Loop",MA02:"Supervisor",WF03:"Orchestrator-Worker Workflow",RT14:"Failure Recovery",E13:"Outcome Evaluation"};
function steps(title:string):MicroStep[]{return [
  {id:"challenge",kind:"challenge",title:"先做判断",body:`一个系统正在使用${title}。先判断最容易被忽略的设计边界。`,interaction:{type:"choice",options:["先明确目标与可验证边界","先增加更多 Agent","先隐藏失败路径"],correctIndex:0},successFeedback:"正确：先建立可验证边界，再决定结构复杂度。",retryFeedback:"数量和界面都不是第一约束，回到目标与验证。"},
  {id:"explain",kind:"explanation",title:"把判断变成结构",body:`${title} 的价值来自清晰输入、输出、失败边界与可复核证据，而不是结构本身更复杂。`},
  {id:"interaction",kind:"interaction",title:"重排可靠执行顺序",body:"按点击顺序组装最小可靠链路。",interaction:{type:"mini-workflow",nodes:["Candidate","Verifier","Atomic Settle","Cancel Remaining"],correctOrder:["Candidate","Verifier","Atomic Settle","Cancel Remaining"]},successFeedback:"顺序正确：验证发生在结算和取消之前。"},
  {id:"application",kind:"application",title:"迁移到当前课程",body:"把同一规则应用到课程中的 Assignment 或 Workflow：说明输入、验证点、失败恢复和最终输出。"},
  {id:"check",kind:"check",title:"最后检查",body:"哪个陈述最准确？",interaction:{type:"choice",options:["完成 Assignment 就等于掌握 Knowledge","运行成功只是证据之一，mastery 仍需独立证据","节点位置决定学习顺序"],correctIndex:1},successFeedback:"正确：学习、实训和掌握保持独立。"}
];}
const lessons=new Map(Object.entries(titles).map(([knowledgeId,title])=>[knowledgeId,{id:`golden-micro-${knowledgeId}`,knowledgeId,title,estimatedMinutes:8,mode:"learn" as const,steps:steps(title)} satisfies MicroLesson]));
export const demoMicroLearningProvider:MicroLearningProvider={getLesson(knowledgeId){return lessons.get(knowledgeId)??null;},listSupportedKnowledgeIds(){return [...lessons.keys()];}};
