import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { Material } from "@/features/course/types";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import { addDraftChapter, addDraftDependency, addExistingKnowledge, addGeneratedMaterial, addKnowledgeCandidate, addMaterialLink, applyCourseAuthoringDraft, createGeneratedArticleDraft, emptyCourseAuthoringDraft, moveCourseKnowledge, readCourseAuthoringDraft, redoCourseAuthoringDraft, removeCourseKnowledge, removeDraftChapter, removeDraftDependency, removeMaterialLink, setManualNodePosition, undoCourseAuthoringDraft, updateDraftChapter, validateDependencyAddition, writeCourseAuthoringDraft, type CourseAuthoringDraftState } from "./courseAuthoringDraft";
import { isDraftCompletenessIssue, validateCourseAuthoring } from "./courseAuthoringValidation";
import { reduceCourseAuthoringProposal, validateCourseAuthoringProposal, type CourseAuthoringProposal } from "./courseAuthoringProposal";

const baseMaterial: Material = { id: "base", courseId: "course", lessonId: "lesson-a", order: 0, title: "Base", type: "article", segments: [{ id: "base-segment", order: 0 }] };
const runtime: CourseRuntimeData = {
  course:{id:"course",title:"Course",description:"Course"}, curriculum:{id:"curriculum",courseId:"course",generationMode:"manual"}, revision:"1",
  chapters:[{id:"chapter-a",courseId:"course",title:"A",description:"A",outcome:"A outcome",color:"#123",order:0}], lessons:[{id:"lesson-a",courseId:"course",chapterId:"chapter-a",title:"A",order:0}], curriculumCoverages:[{id:"coverage-a",courseId:"course",lessonId:"lesson-a",nodeId:"a",order:0,role:"introduce"}], curriculumSequences:[],
  assignments:[{id:"assignment-a",courseId:"course",order:0,title:"A",description:"A",requirements:[],expectedOutput:"A",acceptanceCriteria:[],mode:"instruction"}], assignmentCoverages:[{id:"assignment-coverage-a",assignmentId:"assignment-a",nodeId:"a",role:"practice"}], assignmentDependencies:[], chapterOutcomes:[{id:"outcome-a",courseId:"course",chapterId:"chapter-a",title:"A"}], assignmentOutcomeCompositions:[], finalProjects:[{id:"final",courseId:"course",title:"Final",description:"Final"}], finalProjectOutcomeCompositions:[], materials:[baseMaterial], materialKnowledgeCoverages:[{id:"base-link",materialId:"base",segmentId:"base-segment",nodeId:"a",role:"explain"}]
};
const graph={nodes:["a","b","c"].map((id)=>({id,title:id,description:id,type:"conceptual",masteryCriteria:[],scope:"global",provenance:[],currentRevisionId:`r-${id}`,status:"active"})),revisions:[],edges:[{id:"a-b",source:"a",target:"b",relation:"prerequisite",strength:"hard",reason:"test"},{id:"b-c",source:"b",target:"c",relation:"prerequisite",strength:"hard",reason:"test"}]} as KnowledgeGraph;
function memoryStorage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}

describe("Course authoring draft overlay", () => {
  it("adds, removes, and re-adds a Material link without duplicates", () => {
    const link = { nodeId: "a", materialId: "base" }; const removed = removeMaterialLink(emptyCourseAuthoringDraft("course"), link);
    expect(applyCourseAuthoringDraft(runtime, removed).materialKnowledgeCoverages).toHaveLength(0);
    const readded = addMaterialLink(removed, link); expect(applyCourseAuthoringDraft(runtime, readded).materialKnowledgeCoverages).toHaveLength(1); expect(addMaterialLink(readded, link)).toBe(readded);
  });
  it("creates a stable Article draft and automatically links it", () => {
    const generated = createGeneratedArticleDraft({ runtime, nodeId: "a", nodeTitle: "并行汇合", createId: () => "fixed" }); expect(generated.id).toBe("draft-material-fixed"); expect(generated.segments).toHaveLength(3);
    const overlay = applyCourseAuthoringDraft(runtime, addGeneratedMaterial(emptyCourseAuthoringDraft("course"), generated, "a")); expect(overlay.materials.map((item) => item.id)).toContain(generated.id); expect(overlay.materialKnowledgeCoverages.some((coverage) => coverage.materialId === generated.id && coverage.nodeId === "a")).toBe(true);
  });
  it("authors chapters and course Knowledge usage without mutating base definitions",()=>{
    let state=emptyCourseAuthoringDraft("course"); state=addDraftChapter(state,{id:"chapter-b",courseId:"course",title:"B",description:"B",outcome:"B",color:"#456",order:1}); state=updateDraftChapter(state,"chapter-b",{title:"Renamed"}); state=addExistingKnowledge(state,"b","chapter-b"); state=addKnowledgeCandidate(state,{id:"draft-knowledge-candidate",title:"Candidate",description:"Candidate",chapterId:"chapter-b"}); state=moveCourseKnowledge(state,"a","chapter-b"); state=setManualNodePosition(state,"a",{x:42,y:84});
    const editable=applyCourseAuthoringDraft(runtime,state); expect(editable.chapters.find((chapter)=>chapter.id==="chapter-b")?.title).toBe("Renamed"); expect(editable.curriculumCoverages.map((coverage)=>coverage.nodeId)).toEqual(expect.arrayContaining(["a","b","draft-knowledge-candidate"])); expect(state.manualNodePositions.a).toEqual({x:42,y:84}); expect(runtime.chapters).toHaveLength(1);
    state=removeCourseKnowledge(state,"b"); state=removeDraftChapter(state,"chapter-b",["a","draft-knowledge-candidate"]); expect(applyCourseAuthoringDraft(runtime,state).curriculumCoverages.some((coverage)=>coverage.nodeId==="b")).toBe(false);
  });
  it("rejects self, duplicate, and cyclic dependencies and supports deletion",()=>{
    const ids=["a","b","c"]; const edges=graph.edges.map(({source,target})=>({source,target})); expect(validateDependencyAddition(ids,edges,"a","a")).toEqual({valid:false,reason:"self"}); expect(validateDependencyAddition(ids,edges,"a","b")).toEqual({valid:false,reason:"duplicate"}); expect(validateDependencyAddition(ids,edges,"c","a")).toEqual({valid:false,reason:"cycle"}); expect(validateDependencyAddition(ids,edges,"a","c")).toEqual({valid:true});
    const edge={id:"draft-edge:a:c",source:"a",target:"c",relation:"prerequisite",strength:"hard",reason:"test"} as const; const added=addDraftDependency(emptyCourseAuthoringDraft("course"),edge); expect(removeDraftDependency(added,edge.id).addedDependencies).toHaveLength(0);
  });
  it("serializes safely and supports snapshot undo/redo",()=>{
    const storage=memoryStorage(); const initial=emptyCourseAuthoringDraft("course"); const changed=addDraftChapter(initial,{id:"chapter-b",courseId:"course",title:"B",description:"B",outcome:"B",color:"#456",order:1}); expect(writeCourseAuthoringDraft(changed,storage)).toBe(true); expect(readCourseAuthoringDraft("course",storage).addedChapters[0].id).toBe("chapter-b"); expect(undoCourseAuthoringDraft("course",storage)).toBe(true); expect(readCourseAuthoringDraft("course",storage).addedChapters).toHaveLength(0); expect(redoCourseAuthoringDraft("course",storage)).toBe(true); expect(readCourseAuthoringDraft("course",storage).addedChapters).toHaveLength(1);
  });
  it("persists a cross-Chapter move as one undoable and redoable overlay snapshot",()=>{
    const storage=memoryStorage(); let state=addDraftChapter(emptyCourseAuthoringDraft("course"),{id:"chapter-b",courseId:"course",title:"B",description:"B",outcome:"B",color:"#456",order:1}); writeCourseAuthoringDraft(state,storage);
    state=setManualNodePosition(moveCourseKnowledge(state,"a","chapter-b"),"a",{x:40,y:120}); writeCourseAuthoringDraft(state,storage);
    expect(readCourseAuthoringDraft("course",storage).knowledgeChapterOverrides.a).toBe("chapter-b"); expect(readCourseAuthoringDraft("course",storage).manualNodePositions.a).toEqual({x:40,y:120});
    undoCourseAuthoringDraft("course",storage); expect(readCourseAuthoringDraft("course",storage).knowledgeChapterOverrides.a).toBeUndefined();
    redoCourseAuthoringDraft("course",storage); expect(readCourseAuthoringDraft("course",storage).knowledgeChapterOverrides.a).toBe("chapter-b");
  });
  it("persists dependency add/delete with undo and redo",()=>{
    const storage=memoryStorage(); const edge={id:"draft-edge:a:c",source:"a",target:"c",relation:"prerequisite",strength:"hard",reason:"test"} as const; let state=addDraftDependency(emptyCourseAuthoringDraft("course"),edge); writeCourseAuthoringDraft(state,storage); expect(readCourseAuthoringDraft("course",storage).addedDependencies).toHaveLength(1);
    state=removeDraftDependency(state,edge.id); writeCourseAuthoringDraft(state,storage); expect(readCourseAuthoringDraft("course",storage).addedDependencies).toHaveLength(0);
    undoCourseAuthoringDraft("course",storage); expect(readCourseAuthoringDraft("course",storage).addedDependencies).toHaveLength(1);
    redoCourseAuthoringDraft("course",storage); expect(readCourseAuthoringDraft("course",storage).addedDependencies).toHaveLength(0);
  });
  it("validates and applies AI proposals while rejecting a cyclic patch",()=>{
    const valid:CourseAuthoringProposal={id:"valid",title:"Add B",summary:"Add",operations:[{type:"addKnowledgeCandidate",candidate:{id:"draft-b",title:"B",description:"B",chapterId:"chapter-a"}}]}; const applied=validateCourseAuthoringProposal(runtime,graph,emptyCourseAuthoringDraft("course"),valid); expect(applied.valid).toBe(true); expect(applied.state.addedKnowledgeCandidates).toHaveLength(1);
    const courseState=addExistingKnowledge(addExistingKnowledge(emptyCourseAuthoringDraft("course"),"b","chapter-a"),"c","chapter-a"); const invalid:CourseAuthoringProposal={id:"invalid",title:"Cycle",summary:"Cycle",operations:[{type:"addDependency",edge:{id:"c-a",source:"c",target:"a",relation:"prerequisite",strength:"hard",reason:"cycle"}}]}; expect(validateCourseAuthoringProposal(runtime,graph,courseState,invalid).valid).toBe(false); expect(reduceCourseAuthoringProposal(emptyCourseAuthoringDraft("course"),valid).addedKnowledgeCandidates).toHaveLength(1);
  });
  it("reports warnings as publishable and cycles as fatal",()=>{
    const warning=validateCourseAuthoring(runtime,graph,addKnowledgeCandidate(emptyCourseAuthoringDraft("course"),{id:"draft-b",title:"B",description:"B",chapterId:"chapter-a"})); expect(warning.fatal).toHaveLength(0); expect(warning.warnings.length).toBeGreaterThan(0);
    const state=addDraftDependency(addExistingKnowledge(addExistingKnowledge(emptyCourseAuthoringDraft("course"),"b","chapter-a"),"c","chapter-a"),{id:"c-a",source:"c",target:"a",relation:"prerequisite",strength:"hard",reason:"cycle"}); expect(validateCourseAuthoring(runtime,graph,state).fatal.some((issue)=>issue.code==="dependency-cycle")).toBe(true);
  });
  it("keeps an empty Course editable but blocks it in Publish Check",()=>{
    const emptyRuntime={...runtime,course:{...runtime.course,lifecycle:"draft" as const,targetOutcome:undefined},curriculumCoverages:[],assignments:[],assignmentCoverages:[],chapterOutcomes:[],finalProjects:[],materials:[],materialKnowledgeCoverages:[]};
    const result=validateCourseAuthoring(emptyRuntime,graph,emptyCourseAuthoringDraft("course"));
    expect(result.fatal).toContainEqual(expect.objectContaining({code:"missing-learning-route"}));
    expect(result.summary.knowledgeCount).toBe(0);
  });
  it("saves incomplete nested Micro drafts while keeping them publish-blocking",()=>{
    const state:CourseAuthoringDraftState={...emptyCourseAuthoringDraft("course"),microPathsEdited:true,microPaths:[{id:"micro",knowledgeId:"a",courseId:"course",scope:"course",title:"Draft Micro",mode:"learn",estimatedMinutes:5,required:true,status:"draft",units:[]}]};
    const result=validateCourseAuthoring(runtime,graph,state);
    const issue=result.fatal.find((candidate)=>candidate.code==="required-micro-without-unit");
    expect(issue).toBeDefined();
    expect(isDraftCompletenessIssue(issue!)).toBe(true);
  });
  it("rejects multiple required Learn Micro paths for one Knowledge and context",()=>{
    const micro=(id:string)=>({id,knowledgeId:"a",courseId:"course",scope:"course" as const,title:id,mode:"learn" as const,estimatedMinutes:5,required:true,status:"draft" as const,units:[{id:`${id}-unit`,pathId:id,title:"Unit",position:0,estimatedMinutes:5,required:true,steps:[{id:`${id}-step`,kind:"explanation" as const,title:"Step",body:"Body"}]}]});
    const state:CourseAuthoringDraftState={...emptyCourseAuthoringDraft("course"),microPathsEdited:true,microPaths:[micro("one"),micro("two")]};
    expect(validateCourseAuthoring(runtime,graph,state).fatal.some((issue)=>issue.code==="duplicate-required-learn-micro")).toBe(true);
  });
  it("rejects a cross-Chapter move that would make the Chapter projection cyclic",()=>{
    let state=addDraftChapter(emptyCourseAuthoringDraft("course"),{id:"chapter-b",courseId:"course",title:"B",description:"B",outcome:"B",color:"#456",order:1});
    state=addExistingKnowledge(state,"b","chapter-a");
    state=addExistingKnowledge(state,"c","chapter-b");
    state=moveCourseKnowledge(state,"a","chapter-b");
    const result=validateCourseAuthoring(runtime,graph,state);
    expect(result.fatal.some((issue)=>issue.code==="chapter-dependency-cycle")).toBe(true);
    expect(result.summary.dagValid).toBe(false);
  });
});
