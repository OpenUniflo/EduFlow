export type MicroInteraction =
  | { type:"choice"; options:string[]; correctIndex:number }
  | { type:"ordering"; items:string[]; correctOrder:string[] }
  | { type:"trace"; steps:Array<{id:string;label:string}>; correctStepId:string }
  | { type:"mini-workflow"; nodes:string[]; correctOrder:string[] }
  | { type:"h5p"; contentRef:string; adapter?:string };

export type MicroLearningAnswer = string|string[];

export function isMicroInteractionCorrect(interaction:MicroInteraction, answer:MicroLearningAnswer) {
  if(interaction.type==="h5p") return false;
  if(interaction.type==="choice")return answer===interaction.options[interaction.correctIndex];
  if(interaction.type==="ordering"||interaction.type==="mini-workflow")return Array.isArray(answer)&&answer.join("|")===interaction.correctOrder.join("|");
  return answer===interaction.correctStepId;
}

export type MicroStep = {
  id:string;
  kind:"challenge"|"feedback"|"explanation"|"interaction"|"application"|"check"|"summary";
  title:string;
  body:string;
  interaction?:MicroInteraction;
  successFeedback?:string;
  retryFeedback?:string;
  transition?: { nextStepId?:string; retryStepId?:string };
};

export type MicroUnit = {
  id:string;
  pathId:string;
  title:string;
  description?:string;
  position:number;
  estimatedMinutes:number;
  required:boolean;
  steps:MicroStep[];
};

export type MicroLearningPath = {
  id:string;
  knowledgeId:string;
  courseId?:string;
  scope:"global"|"course";
  title:string;
  description?:string;
  estimatedMinutes:number;
  mode:"learn"|"review"|"apply"|"transfer";
  required:boolean;
  status:"draft"|"published"|"archived";
  units:MicroUnit[];
};

/** Compatibility alias for non-persistent demo adapters; production uses paths. */
export type MicroLesson = {
  id:string; knowledgeId:string; title:string; estimatedMinutes:number; mode:"learn"|"review"|"apply"|"transfer"; steps:MicroStep[];
};

export type MicroUnitProgress = { unitId:string; pathId:string; status:"not_started"|"in_progress"|"completed"; currentStepId?:string; completedStepIds:string[]; startedAt?:string; completedAt?:string; updatedAt:string };
export type MicroPathProgress = { pathId:string; status:"not_started"|"in_progress"|"completed"; currentUnitId?:string; currentStepId?:string; startedAt?:string; completedAt?:string; updatedAt:string };

export interface MicroLearningProvider {
  getLesson(knowledgeId:string, context?:{courseId?:string; coverageRole?:string}):MicroLesson|null;
  listSupportedKnowledgeIds():string[];
}

export interface MicroLearningRepository extends MicroLearningProvider {
  hydrate(userId:string):Promise<void>;
  getPath(knowledgeId:string, context?:{courseId?:string; mode?:MicroLearningPath["mode"]}):MicroLearningPath|null;
  getPathProgress(pathId:string):MicroPathProgress|undefined;
  getUnitProgress(unitId:string):MicroUnitProgress|undefined;
  start(pathId:string, contextCourseId?:string):Promise<void>;
  completeStep(pathId:string, unitId:string, stepId:string, answer?:MicroLearningAnswer):Promise<{correct:boolean; completed:boolean}>;
  subscribe(listener:()=>void):()=>void;
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
