import { isNativeMicroInteractionCorrect, validateNativeMicroInteraction, type NativeMicroAnswer, type NativeMicroInteraction } from "@/shared/learning/nativeMicroInteraction";

export type MicroInteraction = NativeMicroInteraction
  | { type:"h5p"; contentRef:string; adapter?:"h5p-standalone"; completionPolicy?:"completed"|"passed" };

export type MicroLearningAnswer = NativeMicroAnswer;
export type H5PResult = { completed:boolean; success?:boolean; score?:number; maxScore?:number };
export type H5PCompletionSubmission = { kind:"h5p-result"; contentRef:string; eventId:string; result:H5PResult };
export type MicroLearningSubmission = MicroLearningAnswer|H5PCompletionSubmission;
export type H5PContentDescriptor = { id:string; title:string; contentType:string; libraryName:string; libraryVersion:string; contentUrl:string; completionPolicy:"completed"|"passed" };

export function validateMicroInteraction(interaction:MicroInteraction):string[] {
  return interaction.type === "h5p"
    ? interaction.contentRef.trim()&&(!interaction.adapter||interaction.adapter==="h5p-standalone")?[]:["H5P 需要正式 contentRef 与受支持的 adapter。"]
    : validateNativeMicroInteraction(interaction);
}

export function isMicroInteractionCorrect(interaction:MicroInteraction, answer:MicroLearningAnswer) {
  if(interaction.type==="h5p") return false;
  return isNativeMicroInteractionCorrect(interaction, answer);
}

export type MicroReviewCursor = { unitId:string; stepId:string };

export function microReviewSteps(path:MicroLearningPath):MicroReviewCursor[] {
  const requiredUnits=path.units.filter((unit)=>unit.required&&unit.steps.length);
  return (requiredUnits.length?requiredUnits:path.units.filter((unit)=>unit.steps.length)).flatMap((unit)=>unit.steps.map((step)=>({unitId:unit.id,stepId:step.id})));
}

export function firstMicroReviewStep(path:MicroLearningPath) {
  return microReviewSteps(path)[0]??null;
}

export function nextMicroReviewStep(path:MicroLearningPath,current:MicroReviewCursor) {
  const steps=microReviewSteps(path); const index=steps.findIndex((item)=>item.unitId===current.unitId&&item.stepId===current.stepId);
  return index>=0?steps[index+1]??null:null;
}

export function isMicroReviewSubmissionCorrect(interaction:MicroInteraction|undefined,submission:MicroLearningSubmission|undefined) {
  if(!interaction)return true;
  if(interaction.type!=="h5p")return isMicroInteractionCorrect(interaction,(submission??"") as MicroLearningAnswer);
  if(!submission||typeof submission!=="object"||Array.isArray(submission)||submission.kind!=="h5p-result"||submission.contentRef!==interaction.contentRef)return false;
  return submission.result.completed&&(interaction.completionPolicy!=="passed"||submission.result.success===true);
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
  resolveH5PContent(pathId:string,unitId:string,stepId:string,contentRef:string):Promise<H5PContentDescriptor>;
  completeStep(pathId:string, unitId:string, stepId:string, submission?:MicroLearningSubmission,contextCourseId?:string):Promise<{correct:boolean; completed:boolean}>;
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
