export type LearningIntentKnowledge = { id:string; title:string; reason:string };
export type LearningIntentCourse = { id:string; title:string; reason:string };
export type LearningIntentResult = {
  kind:"course"|"path"|"choice"|"material";
  goal:string;
  summary:string;
  knowledge:LearningIntentKnowledge[];
  courses:LearningIntentCourse[];
  pathKnowledgeIds?:string[];
  limitation?:string;
};
export interface LearningIntentResolver { resolve(goal:string):Promise<LearningIntentResult>; }
