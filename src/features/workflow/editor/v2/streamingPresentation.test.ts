import { expect, it } from "vitest";
import type { WorkflowEventV2 } from "../../domain/v2/types";
import { streamTextForStep } from "./streamingPresentation";
it("separates streamed task output and deduplicates reconnect deliveries in sequence order", () => {
  const event = (seq: number, stepId: string, text: string): WorkflowEventV2 => ({ protocolVersion: "1", eventId: `e-${seq}`, runId: "r", seq, type: "node.output.delta", occurredAt: "now", stepId, payload: { text } });
  const first = event(1, "s1", "hello");
  expect(streamTextForStep([event(3, "s1", " world"), event(2, "parallel", "other"), first, first], "s1")).toBe("hello world");
  expect(streamTextForStep([first], "retry-attempt-2")).toBe("");
});

it("keeps failed-attempt fragments separate and calibrates dropped deltas from the computed snapshot",()=>{
 const event=(seq:number,type:string,payload:WorkflowEventV2["payload"]):WorkflowEventV2=>({protocolVersion:"1",eventId:`e-${seq}`,runId:"r",seq,type,occurredAt:"now",stepId:"s",payload});
 const events=[event(1,"node.output.delta",{streamId:"old",text:"failed-half"}),event(2,"node.output.end",{streamId:"old",status:"interrupted"}),event(3,"node.attempt.started",{attempt:2}),event(4,"node.output.delta",{streamId:"new",text:"new"})];
 expect(streamTextForStep(events,"s")).toBe("new");
 events.push(event(5,"node.output.end",{streamId:"new",status:"computed",text:"new complete"}));
 expect(streamTextForStep(events,"s")).toBe("new complete");
});
