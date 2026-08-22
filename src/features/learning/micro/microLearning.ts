export type MicroInteraction =
  | { type:"choice"; options:string[]; correctIndex:number }
  | { type:"multiple-choice"; options:string[]; correctIndexes:number[] }
  | { type:"fill-blank"; answers:string[]; caseSensitive?:boolean }
  | { type:"ordering"; items:string[]; correctOrder:string[] }
  | { type:"trace"; steps:Array<{id:string;label:string}>; correctStepId:string }
  | { type:"mini-workflow"; nodes:string[]; correctOrder:string[] }
  | { type:"h5p"; contentRef:string; adapter?:"h5p-standalone"; completionPolicy?:"completed"|"passed" };

export type MicroLearningAnswer = string|string[]|number[];
export type H5PResult = { completed:boolean; success?:boolean; score?:number; maxScore?:number };
export type H5PCompletionSubmission = { kind:"h5p-result"; contentRef:string; eventId:string; result:H5PResult };
export type MicroLearningSubmission = MicroLearningAnswer|H5PCompletionSubmission;
export type H5PContentDescriptor = { id:string; title:string; contentType:string; libraryName:string; libraryVersion:string; contentUrl:string; completionPolicy:"completed"|"passed" };

const unique = <T,>(items:readonly T[]) => new Set(items).size === items.length;
const exactPermutation = (left:readonly string[],right:readonly string[]) => left.length===right.length&&unique(left)&&unique(right)&&left.every((item)=>right.includes(item));

export function validateMicroInteraction(interaction:MicroInteraction):string[] {
  if(interaction.type==="choice") return interaction.options.length>=2&&unique(interaction.options)&&Number.isInteger(interaction.correctIndex)&&interaction.correctIndex>=0&&interaction.correctIndex<interaction.options.length?[]:["Choice 至少需要两个唯一选项和一个有效正确索引。"];
  if(interaction.type==="multiple-choice") return interaction.options.length>=2&&unique(interaction.options)&&interaction.correctIndexes.length>0&&unique(interaction.correctIndexes)&&interaction.correctIndexes.every((index)=>Number.isInteger(index)&&index>=0&&index<interaction.options.length)?[]:["Multiple Choice 至少需要两个唯一选项和非空、去重、有效的正确索引。"];
  if(interaction.type==="fill-blank") return interaction.answers.length>0&&interaction.answers.every((answer)=>answer.trim().length>0)?[]:["Fill Blank 至少需要一个非空可接受答案。"];
  if(interaction.type==="ordering") return interaction.items.length>=2&&exactPermutation(interaction.items,interaction.correctOrder)?[]:["Ordering 的正确顺序必须是唯一题项的完整排列。"];
  if(interaction.type==="trace") return interaction.steps.length>=2&&unique(interaction.steps.map((step)=>step.id))&&interaction.steps.some((step)=>step.id===interaction.correctStepId)?[]:["Trace 需要唯一步骤 ID，且根因必须存在。"];
  if(interaction.type==="mini-workflow") return interaction.nodes.length>=2&&exactPermutation(interaction.nodes,interaction.correctOrder)?[]:["Mini Workflow 的期望结构必须覆盖全部唯一节点。"];
  return interaction.contentRef.trim()&&(!interaction.adapter||interaction.adapter==="h5p-standalone")?[]:["H5P 需要正式 contentRef 与受支持的 adapter。"];
}

export function isMicroInteractionCorrect(interaction:MicroInteraction, answer:MicroLearningAnswer) {
  if(interaction.type==="h5p") return false;
  if(interaction.type==="choice")return answer===interaction.options[interaction.correctIndex];
  if(interaction.type==="multiple-choice") {
    if(!Array.isArray(answer)||!answer.every((item)=>typeof item==="number"))return false;
    const selected=[...new Set(answer)].sort((a,b)=>a-b); const expected=[...interaction.correctIndexes].sort((a,b)=>a-b);
    return selected.length===expected.length&&selected.every((item,index)=>item===expected[index]);
  }
  if(interaction.type==="fill-blank") {
    if(typeof answer!=="string")return false;
    const normalize=(value:string)=>interaction.caseSensitive?value.trim():value.trim().toLocaleLowerCase();
    return interaction.answers.some((candidate)=>normalize(candidate)===normalize(answer));
  }
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
  resolveH5PContent(pathId:string,unitId:string,stepId:string,contentRef:string):Promise<H5PContentDescriptor>;
  completeStep(pathId:string, unitId:string, stepId:string, submission?:MicroLearningSubmission):Promise<{correct:boolean; completed:boolean}>;
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
