import { describe, expect, it } from "vitest";
import { buildActiveLearningKnowledge } from "./todayQueue";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { KnowledgeGraph } from "@/features/knowledge/types";

const node = (id:string, title=id) => ({id,title,description:`${title} description`,type:"conceptual" as const,masteryCriteria:[],scope:"global" as const,provenance:[],currentRevisionId:`${id}-r1`,status:"active" as const});
const graph:KnowledgeGraph={nodes:[node("learning","Learning"),node("learned","Learned"),node("practicing","Practicing"),node("mastered","Mastered"),node("explore","Explore")],revisions:[],edges:[]};
const runtime:CourseRuntimeData={course:{id:"course",title:"Course",description:"",lifecycle:"published"},curriculum:{id:"curriculum",courseId:"course",generationMode:"manual"},chapters:[{id:"chapter",courseId:"course",title:"Chapter",description:"",order:1,color:"#fff",outcome:""}],lessons:[{id:"lesson",courseId:"course",chapterId:"chapter",title:"Lesson",order:1}],curriculumCoverages:[{id:"coverage",courseId:"course",lessonId:"lesson",nodeId:"learning",role:"introduce",order:0}],curriculumSequences:[],assignments:[],assignmentCoverages:[],assignmentDependencies:[],chapterOutcomes:[],assignmentOutcomeCompositions:[],finalProjects:[],finalProjectOutcomeCompositions:[],materials:[],materialKnowledgeCoverages:[],revision:"1"};
const state={userId:"u",courseId:"course",isActive:false,assignmentStates:{},materialStates:{},updatedAt:"2026-01-01"};
const microRepository={getPath:(id:string)=>["learning","learned"].includes(id)?{id:"global",knowledgeId:id,scope:"global",title:"Micro",estimatedMinutes:8,mode:"learn",required:true,status:"published",units:[]}:null,getPathProgress:()=>undefined} as any;

describe("Active Today Knowledge",()=>{
  it("includes only learning, learned, and practicing without inventing course candidates",()=>{
    const items=buildActiveLearningKnowledge({runtimes:[runtime],graph,userKnowledge:[{nodeId:"explore",status:"explore"},{nodeId:"mastered",status:"mastered"},{nodeId:"learning",status:"learning"},{nodeId:"learned",status:"learned"},{nodeId:"practicing",status:"practicing"}],courseStates:[state],microRepository});
    expect(items.map((item)=>item.knowledgeId).sort()).toEqual(["learned","learning","practicing"]);
  });
  it("sorts by recent learner activity with a stable title/id tie break",()=>{
    const items=buildActiveLearningKnowledge({runtimes:[runtime],graph,userKnowledge:[{nodeId:"learning",status:"learning",updatedAt:"2026-01-01"},{nodeId:"learned",status:"learned",updatedAt:"2026-02-01"},{nodeId:"practicing",status:"practicing",updatedAt:"2026-02-01"}],courseStates:[state],microRepository});
    expect(items.map((item)=>item.knowledgeId)).toEqual(["learned","practicing","learning"]);
  });
  it("keeps standalone Knowledge and resolves a global Micro independently of Course context",()=>{
    const [item]=buildActiveLearningKnowledge({runtimes:[runtime],graph,userKnowledge:[{nodeId:"learned",status:"learned"}],courseStates:[state],microRepository});
    expect(item.resources.standalone.micro).toMatchObject({available:true,source:"global"});
  });
  it("preserves every Course context for shared Knowledge",()=>{
    const second={...runtime,course:{...runtime.course,id:"second",title:"Second"},curriculum:{...runtime.curriculum,id:"second-curriculum",courseId:"second"},curriculumCoverages:runtime.curriculumCoverages.map((coverage)=>({...coverage,id:"second-coverage",courseId:"second"}))};
    const [item]=buildActiveLearningKnowledge({runtimes:[runtime,second],graph,userKnowledge:[{nodeId:"learning",status:"learning"}],courseStates:[state,{...state,courseId:"second",updatedAt:"2026-02-01"}],microRepository});
    expect(item.resources.courseContexts.map((course)=>course.courseId)).toEqual(["course","second"]);
  });
});
