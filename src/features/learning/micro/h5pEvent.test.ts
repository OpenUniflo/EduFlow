import { describe, expect, it } from "vitest";
import { resultFromEvent } from "./h5pEvent";
const iri="urn:eduflow:h5p:cds525-h5p-k001-rule-vs-learning";
const statement={id:"event-1",object:{id:iri},verb:{id:"http://adlnet.gov/expapi/verbs/passed"},result:{completion:true,success:true,score:{raw:6,max:6}}};
describe("H5P root event integration",()=>{
  it("accepts only the exact active root object, never missing/wrong/nested IDs",()=>{
    expect(resultFromEvent({data:{statement}},iri)?.result).toEqual({completed:true,success:true,score:6,maxScore:6});
    for(const object of [undefined,{}, {id:3},{id:"other"},{id:`${iri}/child`}])expect(resultFromEvent({data:{statement:{...statement,object}}},iri)).toBeNull();
  });
  it("maps duplicates deterministically and retains failed completion",()=>{
    expect(resultFromEvent({data:{statement}},iri)?.id).toBe(resultFromEvent({statement},iri)?.id);
    expect(resultFromEvent({statement:{...statement,verb:{id:"http://adlnet.gov/expapi/verbs/failed"},result:{completion:true,success:false}}},iri)?.result.success).toBe(false);
  });
});
