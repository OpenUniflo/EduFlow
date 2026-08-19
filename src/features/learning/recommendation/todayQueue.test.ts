import { describe, expect, it } from "vitest";
import { buildTodayQueue } from "./todayQueue";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { KnowledgeGraph } from "@/features/knowledge/types";

const node = (id:string, title=id) => ({id,title,description:title,type:"conceptual" as const,masteryCriteria:[],scope:"global" as const,provenance:[],currentRevisionId:`${id}-r1`,status:"active" as const});
const graph:KnowledgeGraph={nodes:[node("pre"),node("z-new"),node("a-later")],revisions:[],edges:[{id:"edge",source:"pre",target:"z-new",relation:"prerequisite",strength:"hard",reason:"required"}]};
const runtime = (coverages:CourseRuntimeData["curriculumCoverages"]):CourseRuntimeData => ({course:{id:"course",title:"Course",description:""},curriculum:{id:"curriculum",courseId:"course",generationMode:"manual"},chapters:[{id:"chapter",courseId:"course",title:"Chapter",description:"",order:1,color:"#fff",outcome:""}],lessons:[{id:"later",courseId:"course",chapterId:"chapter",title:"Later",order:2},{id:"first",courseId:"course",chapterId:"chapter",title:"First",order:1}],curriculumCoverages:coverages,curriculumSequences:[],assignments:[],assignmentCoverages:[],assignmentDependencies:[],chapterOutcomes:[],assignmentOutcomeCompositions:[],finalProjects:[],finalProjectOutcomeCompositions:[],materials:[],materialKnowledgeCoverages:[],revision:"1"});
const state={userId:"u",courseId:"course",assignmentStates:{},materialStates:{},updatedAt:"2026-01-01"};

describe("Today Queue",()=>{
  it("uses curriculum order rather than ids or fixture order",()=>{
    const queue=buildTodayQueue({runtimes:[runtime([{id:"c2",courseId:"course",lessonId:"later",nodeId:"a-later",role:"introduce",order:0},{id:"c1",courseId:"course",lessonId:"first",nodeId:"z-new",role:"introduce",order:0}])],graph,userKnowledge:[{nodeId:"pre",status:"mastered"}],courseStates:[state]});
    expect(queue.map((item)=>item.knowledgeId)).toEqual(["z-new","a-later"]);
  });
  it("blocks new learning until prerequisites are mastered",()=>{
    const queue=buildTodayQueue({runtimes:[runtime([{id:"c1",courseId:"course",lessonId:"first",nodeId:"z-new",role:"introduce",order:0}])],graph,userKnowledge:[],courseStates:[state]});
    expect(queue).toEqual([]);
  });
  it("does not treat Assignment completion as Knowledge mastery",()=>{
    const queue=buildTodayQueue({runtimes:[runtime([{id:"c1",courseId:"course",lessonId:"first",nodeId:"z-new",role:"introduce",order:0}])],graph,userKnowledge:[{nodeId:"pre",status:"mastered"}],courseStates:[{...state,assignmentStates:{a:{assignmentId:"a",status:"completed"}}}]});
    expect(queue[0]?.knowledgeId).toBe("z-new");
  });
});
