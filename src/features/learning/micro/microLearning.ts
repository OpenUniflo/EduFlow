export type MicroInteraction =
  | { type:"choice"; options:string[]; correctIndex:number }
  | { type:"ordering"; items:string[]; correctOrder:string[] }
  | { type:"trace"; steps:Array<{id:string;label:string}>; correctStepId:string }
  | { type:"mini-workflow"; nodes:string[]; correctOrder:string[] };

export type MicroLearningAnswer = string|string[];

export function isMicroInteractionCorrect(interaction:MicroInteraction, answer:MicroLearningAnswer) {
  if(interaction.type==="choice")return answer===interaction.options[interaction.correctIndex];
  if(interaction.type==="ordering"||interaction.type==="mini-workflow")return Array.isArray(answer)&&answer.join("|")===interaction.correctOrder.join("|");
  return answer===interaction.correctStepId;
}

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

export function canCompleteMicroLesson(steps:readonly MicroStep[], completedStepIds:ReadonlySet<string>) {
  return steps.length>0&&steps.every((step)=>completedStepIds.has(step.id));
}

export function createMicroLearningNavigation(knowledgeId:string, options:{courseId?:string;returnTo:string}) {
  const params=new URLSearchParams();
  if(options.courseId)params.set("courseId",options.courseId);
  const search=params.toString();
  return {to:`/learn/micro/${encodeURIComponent(knowledgeId)}${search?`?${search}`:""}`,state:{returnTo:options.returnTo}};
}

function safeInternalPath(value:unknown) {
  if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//"))return null;
  try {
    const base=new URL("https://eduflow.local");
    const target=new URL(value,base);
    return target.origin===base.origin?`${target.pathname}${target.search}${target.hash}`:null;
  } catch { return null; }
}

export function resolveMicroLearningReturnTarget(state:unknown, courseId?:string) {
  const returnTo=state&&typeof state==="object"&&"returnTo" in state?(state as {returnTo?:unknown}).returnTo:undefined;
  return safeInternalPath(returnTo)??(courseId?`/courses/${encodeURIComponent(courseId)}`:"/");
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
