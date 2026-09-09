import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import paths from "../data/gold-courses/ai-agents-in-depth-rich-content.json";
import { RichTextContent } from "@/shared/content/RichTextContent";
import { validateNativeMicroInteraction, type NativeMicroInteraction } from "@/shared/learning/nativeMicroInteraction";

const steps=paths.flatMap(path=>path.units.flatMap(unit=>unit.steps));
describe("reviewed Agent Course content",()=>{
  it("renders every reviewed body and feedback with stable step identities",()=>{
    expect(paths).toHaveLength(12);expect(steps).toHaveLength(65);
    expect(new Set(steps.map(step=>step.id)).size).toBe(65);
    for(const path of paths){expect(path.revision).toBe(path.fromRevision+1);for(const unit of path.units)expect(unit.steps.map(step=>step.position)).toEqual(unit.steps.map((_,index)=>index));}
    for(const step of steps){
      for(const body of [step.content,step.success_feedback,step.retry_feedback]) if(body){
        const html=renderToStaticMarkup(<RichTextContent body={body}/>);
        expect(html,step.id).toContain("rich-content");expect(html,step.id).not.toContain("内容暂不支持");
      }
      if(step.interaction) expect(validateNativeMicroInteraction(step.interaction as NativeMicroInteraction),step.id).toEqual([]);
    }
  });
  it("keeps the reviewed summaries as teaching and adds the bounded S02 result check",()=>{
    // Explicitly reviewed structures, not an unreliable prose keyword classifier.
    for(const id of ['aiad-l1-a02-s5','aiad-l1-r10-s5','aiad-l1-s03-s5','aiad-ctx01-summary','aiad-rt01-summary']){
      const step=steps.find(step=>step.id===id)!;expect(step.kind).toBe('summary');expect(step.interaction).toBeNull();
    }
    const step=steps.find(step=>step.id==='aiad-l1-s02-s4')!;
    expect(step.position).toBe(3);expect(step.kind).toBe('interaction');expect(step.interaction?.type).toBe('choice');
    expect(steps.filter(step=>step.id.startsWith('aiad-l1-s02-'))).toHaveLength(5);
  });
});
