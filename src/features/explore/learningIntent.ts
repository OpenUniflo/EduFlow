export type LearningIntentKnowledge = { id:string; title:string; reason:string };
export type LearningIntentCourse = { id:string; title:string; reason:string };
export type LearningIntentResult = {
  kind:"course"|"knowledge"|"choice"|"material";
  goal:string;
  summary:string;
  knowledge:LearningIntentKnowledge[];
  courses:LearningIntentCourse[];
  limitation?:string;
};
export interface LearningIntentResolver { resolve(goal:string):Promise<LearningIntentResult>; }
