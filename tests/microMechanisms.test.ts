import { resolveMicroResumeStep } from "@/features/learning/micro/microLearning";
import { describe, expect, it, vi } from "vitest";
import { microV2References } from "@/demo/learning/microV2References";
import { isNativeMicroInteractionCorrect, validateNativeMicroInteraction } from "@/shared/learning/nativeMicroInteraction";
import { scheduleTimelineTick, flowAdvance, mechanismFeedback, simulationTrajectory, timelineReducer, transformationCells, transformationEvents, type FlowDefinition, type SimulationDefinition, type TransformationDefinition } from "@/shared/learning/microMechanisms";
const interactions = microV2References.flatMap((path) => path.units.flatMap((unit) => unit.steps.flatMap((step) => step.interaction ? [step.interaction] : [])));
const flow = interactions.find((item) => item.type === "flow-execution") as FlowDefinition;
const simulation = interactions.find((item) => item.type === "simulation") as SimulationDefinition;
const matrix = interactions.find((item) => item.type === "data-transform") as TransformationDefinition;

describe("Micro V2 instructional definitions", () => {
  it.each(microV2References)("$knowledgeId teaches before practice, has feedback and a summary", (path) => {
    const steps = path.units.flatMap((unit) => unit.steps);
    expect(steps[0].kind).toBe("explanation");
    expect(steps[steps.length - 1].kind).toBe("summary");
    expect(steps.findIndex((step) => step.kind === "application")).toBeGreaterThan(steps.findIndex((step) => step.kind === "interaction"));
    for (const step of steps) if (step.interaction) { expect(validateNativeMicroInteraction(step.interaction as Exclude<typeof step.interaction, {type:"h5p"}>)).toEqual([]); expect(step.retryFeedback?.length).toBeGreaterThan(10); }
  });
  it("rejects malformed definitions without throwing and preserves Fill Blank", () => {
    for (const malformed of [null, {}, {type:"simulation"}, {...simulation, model:{...simulation.model, curvature:100,steps:60},parameter:{...simulation.parameter,max:10}}, {...flow, events:[{nodeId:"missing"}]}]) expect(validateNativeMicroInteraction(malformed as never).length).toBeGreaterThan(0);
    expect(isNativeMicroInteractionCorrect({type:"fill-blank",answers:["eta"]}, " ETA ")).toBe(true);
  });
});
describe("causal execution and grading", () => {
  it("fails at the missing result connection and requires actual complete replay", () => {
    expect(flowAdvance(flow, ["request","call"], 3).error).toContain("回传");
    expect(flowAdvance(flow, flow.correctEdgeIds, 3).executed).toBe(4);
    expect(mechanismFeedback(flow, {kind:"flow",edgeIds:flow.correctEdgeIds,executed:2}).correct).toBe(false);
    expect(mechanismFeedback(flow, {kind:"flow",edgeIds:flow.correctEdgeIds,executed:5}).correct).toBe(true);
    expect(mechanismFeedback({...flow,mode:"challenge"}, {kind:"flow",edgeIds:[...flow.correctEdgeIds,"shortcut"],executed:5}).message).toContain("工具直接结束");
    expect(mechanismFeedback(flow, {kind:"flow",edgeIds:[...flow.correctEdgeIds,"request"],executed:5}).correct).toBe(false);
  });
  it("computes gradient, update and loss rather than testing an eta interval", () => {
    const result=simulationTrajectory(simulation,.1);
    expect(result.trajectory[0]).toEqual({index:0,value:4,gradient:8,loss:16,delta:-.8});
    expect(result.trajectory[1].value).toBeCloseTo(3.2);
    expect(result.trajectory[1].loss).toBeCloseTo(10.24);
    expect(simulationTrajectory(simulation,.02).behavior).toBe("slow");
    expect(simulationTrajectory(simulation,.3).behavior).toBe("converged");
    expect(simulationTrajectory(simulation,.8).oscillating).toBe(true);
    expect(simulationTrajectory(simulation,1.2).behavior).toBe("diverging");
    const steeper={...simulation,mode:"challenge" as const,model:{...simulation.model,curvature:4,optimum:1,initial:5}};
    expect(mechanismFeedback(steeper,{kind:"simulation",parameter:.8,executed:13}).message).toContain("过大");
    expect(mechanismFeedback(steeper,{kind:"simulation",parameter:.2,executed:13}).correct).toBe(true);
    expect(mechanismFeedback(steeper,{kind:"simulation",parameter:.2,executed:1}).correct).toBe(false);
  });
  it("derives directional neighbor events without crossing sentences", () => {
    const events=transformationEvents(matrix), cells=transformationCells(matrix,events.length);
    expect(events).toHaveLength(14);
    expect(cells[0*6+1]).toBe(2);
    expect(cells[1*6+0]).toBe(2);
    expect(cells[0*6+2]).toBe(0);
    expect(cells[5*6+4]).toBe(1);
    expect(mechanismFeedback(matrix,{kind:"transformation",cells,executed:14}).correct).toBe(true);
    expect(mechanismFeedback(matrix,{kind:"transformation",cells:cells.map(()=>0),executed:14}).correct).toBe(false);
    expect(transformationCells(matrix,0).every((value)=>value===0)).toBe(true);
  });
  it("bounds rapid steps, pauses, resets, and cannot play after completion", () => {
    let state=timelineReducer({cursor:0,playing:false},{type:"play",length:3});
    for(let count=0;count<8;count++)state=timelineReducer(state,{type:"step",length:3});
    expect(state).toEqual({cursor:3,playing:false});
    expect(timelineReducer(state,{type:"play",length:3}).playing).toBe(false);
    expect(timelineReducer(state,{type:"reset"})).toEqual({cursor:0,playing:false});
    expect(timelineReducer({cursor:1,playing:true},{type:"pause"})).toEqual({cursor:1,playing:false});
  });
});

it("cancels scheduled callbacks on Pause, Reset, or unmount; does not leave late ticks",()=>{
  vi.useFakeTimers();
  try {
    const step=vi.fn();
    const cancel=scheduleTimelineTick({cursor:1,playing:true},false,step);
    vi.advanceTimersByTime(1000); expect(step).not.toHaveBeenCalled();
    cancel(); vi.advanceTimersByTime(5000); expect(step).not.toHaveBeenCalled();
    scheduleTimelineTick({cursor:0,playing:false},false,step);vi.advanceTimersByTime(5000);expect(step).not.toHaveBeenCalled();
    scheduleTimelineTick({cursor:0,playing:true},true,step);vi.advanceTimersByTime(5000);expect(step).not.toHaveBeenCalled();
    scheduleTimelineTick({cursor:0,playing:true},false,step);vi.advanceTimersByTime(1100);expect(step).toHaveBeenCalledOnce();
  } finally {vi.useRealTimers();}
});

it("resumes revised in-progress content at the earliest new teaching step without resetting completed identities",()=>{const unit=microV2References[0].units[0];const completed=["aiad-rt01-trace"];const progress={unitId:unit.id,pathId:unit.pathId,status:"in_progress" as const,completedStepIds:completed,currentStepId:"aiad-rt01-structure",updatedAt:"2026-09-05"};expect(resolveMicroResumeStep(unit,progress,progress.currentStepId)?.id).toBe("aiad-rt01-explain");expect(progress.completedStepIds).toEqual(completed);});
