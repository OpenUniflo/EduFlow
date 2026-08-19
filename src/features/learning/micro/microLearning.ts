export type MicroInteraction =
  | { type:"choice"; options:string[]; correctIndex:number }
  | { type:"ordering"; items:string[]; correctOrder:string[] }
  | { type:"matching"; pairs:Array<{left:string;right:string}> }
  | { type:"trace"; steps:Array<{id:string;label:string}>; correctStepId:string }
  | { type:"mini-workflow"; nodes:string[]; correctOrder:string[] };

export type MicroStep = {
  id:string;
  kind:"challenge"|"feedback"|"explanation"|"interaction"|"application"|"check";
  title:string;
  body:string;
  interaction?:MicroInteraction;
  successFeedback?:string;
  retryFeedback?:string;
};

export type MicroLesson = {
  id:string;
  knowledgeId:string;
  title:string;
  estimatedMinutes:number;
  mode:"learn"|"review"|"apply"|"transfer";
  steps:MicroStep[];
};

export interface MicroLearningProvider {
  getLesson(knowledgeId:string, context?:{courseId?:string; coverageRole?:string}):MicroLesson|null;
  listSupportedKnowledgeIds():string[];
}

export type MicroLearningActivity = { userId:string; knowledgeId:string; lessonId:string; courseId?:string; completedAt:string };
const KEY="eduflow:micro-learning-activities:v1";

export function readMicroLearningActivities(userId:string):MicroLearningActivity[] {
  if(typeof window==="undefined")return [];
  try { return (JSON.parse(window.localStorage.getItem(KEY)??"[]") as MicroLearningActivity[]).filter((item)=>item.userId===userId); } catch { return []; }
}

export function recordMicroLearningActivity(activity:MicroLearningActivity) {
  if(typeof window==="undefined")return;
  let all:MicroLearningActivity[]=[];
  try { all=JSON.parse(window.localStorage.getItem(KEY)??"[]") as MicroLearningActivity[]; } catch { all=[]; }
  window.localStorage.setItem(KEY,JSON.stringify([...all.filter((item)=>!(item.userId===activity.userId&&item.lessonId===activity.lessonId)),activity]));
  window.dispatchEvent(new CustomEvent("eduflow:micro-learning-activity"));
}
