import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import paths from "../data/gold-courses/ai-agents-in-depth-rich-content.json";
import { RichTextContent } from "@/shared/content/RichTextContent";
import { validateNativeMicroInteraction, type NativeMicroInteraction } from "@/shared/learning/nativeMicroInteraction";

const steps=paths.flatMap(path=>path.units.flatMap(unit=>unit.steps));
// Join adjacent Tiptap text nodes so formatting cannot hide a reviewed phrase.
const visibleText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(visibleText).join("");
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  return node.type === "text" ? String(node.text) : visibleText(node.type === "doc" ? node.content : Object.values(node));
};
describe("reviewed Agent Course content",()=>{
  it("keeps this reviewed course free of source, production and course-route prose",()=>{
    // Course-specific regression only: not an authoritative global prose classifier.
    for (const step of steps) expect(visibleText(step),step.id).not.toMatch(/来源[：:]|教材|原书|PDF|教学改编|跨节教学改编|下一项|下一知识点|下一节|接下来学习|后续课程|上一项|前一项|学习活动完成|掌握证明|不代表已经能独立开发/);
  });
  it("preserves reviewed example and simulation boundaries",()=>{
    const body=(id:string)=>visibleText(steps.find(step=>step.id===id));
    expect(body('aiad-l1-h02-s1')).toContain('不是所有订票系统的通用事实');
    expect(body('aiad-l1-wf05-s2')).toContain('具体关口取决于任务规则');
    expect(body('aiad-l1-r10-s2')).toContain('预设轨迹，不调用真实服务');
    expect(body('aiad-l1-r10-s3')).toContain('不能据此推断所有系统的报错方式');
    expect(body('aiad-ctx01-order')).toContain('不要求独立并行工具结果之间存在固定先后');
    for(const id of ['aiad-ctx01-explain','aiad-ctx01-demo','aiad-rt01-explain','aiad-rt01-demo']) expect(body(id)).toContain('这是示意数据，并非实时天气查询');
    expect(body('aiad-l1-a02-s4')).toContain('这里的 Harness 指');
  });
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
