export type PersonalLearningPlan = { id:string; userId:string; goal:string; knowledgeIds:string[]; createdAt:string };
const KEY="eduflow:personal-learning-plans:v1";

function readAll():PersonalLearningPlan[]{
  if(typeof window==="undefined")return [];
  try{return JSON.parse(window.localStorage.getItem(KEY)??"[]") as PersonalLearningPlan[];}catch{return [];}
}
export function listPersonalLearningPlans(userId:string){return readAll().filter((plan)=>plan.userId===userId);}
export function addPersonalLearningPlan(plan:PersonalLearningPlan){
  if(typeof window==="undefined")return;
  const all=readAll(); window.localStorage.setItem(KEY,JSON.stringify([...all.filter((item)=>item.id!==plan.id),plan]));
  window.dispatchEvent(new CustomEvent("eduflow:personal-learning-plan"));
}
