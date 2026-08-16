import { describe, expect, it } from "vitest";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { Material } from "@/features/course/types";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import { addDraftChapter, addDraftDependency, addExistingKnowledge, addGeneratedMaterial, addKnowledgeCandidate, addMaterialLink, applyCourseAuthoringDraft, createGeneratedArticleDraft, emptyCourseAuthoringDraft, moveCourseKnowledge, readCourseAuthoringDraft, redoCourseAuthoringDraft, removeCourseKnowledge, removeDraftChapter, removeDraftDependency, removeMaterialLink, setManualNodePosition, undoCourseAuthoringDraft, updateDraftChapter, validateDependencyAddition, writeCourseAuthoringDraft } from "./courseAuthoringDraft";
import { validateCourseAuthoring } from "./courseAuthoringValidation";
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
  it("validates and applies AI proposals while rejecting a cyclic patch",()=>{
    const valid:CourseAuthoringProposal={id:"valid",title:"Add B",summary:"Add",operations:[{type:"addKnowledgeCandidate",candidate:{id:"draft-b",title:"B",description:"B",chapterId:"chapter-a"}}]}; const applied=validateCourseAuthoringProposal(runtime,graph,emptyCourseAuthoringDraft("course"),valid); expect(applied.valid).toBe(true); expect(applied.state.addedKnowledgeCandidates).toHaveLength(1);
    const courseState=addExistingKnowledge(addExistingKnowledge(emptyCourseAuthoringDraft("course"),"b","chapter-a"),"c","chapter-a"); const invalid:CourseAuthoringProposal={id:"invalid",title:"Cycle",summary:"Cycle",operations:[{type:"addDependency",edge:{id:"c-a",source:"c",target:"a",relation:"prerequisite",strength:"hard",reason:"cycle"}}]}; expect(validateCourseAuthoringProposal(runtime,graph,courseState,invalid).valid).toBe(false); expect(reduceCourseAuthoringProposal(emptyCourseAuthoringDraft("course"),valid).addedKnowledgeCandidates).toHaveLength(1);
  });
  it("reports warnings as publishable and cycles as fatal",()=>{
    const warning=validateCourseAuthoring(runtime,graph,addKnowledgeCandidate(emptyCourseAuthoringDraft("course"),{id:"draft-b",title:"B",description:"B",chapterId:"chapter-a"})); expect(warning.fatal).toHaveLength(0); expect(warning.warnings.length).toBeGreaterThan(0);
    const state=addDraftDependency(addExistingKnowledge(addExistingKnowledge(emptyCourseAuthoringDraft("course"),"b","chapter-a"),"c","chapter-a"),{id:"c-a",source:"c",target:"a",relation:"prerequisite",strength:"hard",reason:"cycle"}); expect(validateCourseAuthoring(runtime,graph,state).fatal.some((issue)=>issue.code==="dependency-cycle")).toBe(true);
  });
});
