import { describe,expect,it } from "vitest";
import { h5pCompletionPasses,nativeInteractionCorrect,parseH5PCompletion } from "./microInteraction.js";

describe("native Micro grading",()=>{
  it("grades an exact unordered Multiple Choice set",()=>{
    const interaction={type:"multiple-choice",options:["a","b","c"],correctIndexes:[0,2]};
    expect(nativeInteractionCorrect(interaction,[2,0])).toBe(true);
    expect(nativeInteractionCorrect(interaction,[0])).toBe(false);
    expect(nativeInteractionCorrect(interaction,[0,1,2])).toBe(false);
  });
  it("grades Fill Blank with trim and configurable case",()=>{
    expect(nativeInteractionCorrect({type:"fill-blank",answers:["Tool Call"]}," tool call ")).toBe(true);
    expect(nativeInteractionCorrect({type:"fill-blank",answers:["Tool Call"],caseSensitive:true},"tool call")).toBe(false);
  });
});

describe("H5P completion contract",()=>{
  const valid={kind:"h5p-result",contentRef:"content",eventId:"event:1",result:{completed:true,success:true,score:1,maxScore:1}};
  it("validates result shape and score range",()=>{
    expect(parseH5PCompletion(valid)).not.toBeNull();
    expect(parseH5PCompletion({...valid,result:{completed:true,score:2,maxScore:1}})).toBeNull();
    expect(parseH5PCompletion({...valid,eventId:"../bad"})).toBeNull();
  });
  it("applies explicit completion policies",()=>{
    const completion=parseH5PCompletion({...valid,result:{completed:true,success:false}})!;
    expect(h5pCompletionPasses(completion,"completed")).toBe(true);
    expect(h5pCompletionPasses(completion,"passed")).toBe(false);
  });
});
