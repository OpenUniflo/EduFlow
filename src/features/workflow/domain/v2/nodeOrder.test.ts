import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2, stateBinding } from "./factory";
import { downstreamNodeIds, laterProducerFields } from "./nodeOrder";
import type { WorkflowDefinitionV2 } from "./types";

function graph(): WorkflowDefinitionV2 {
  const base = createWorkflowV2();
  const start = createNodeV2("core.start", "start");
  const search = createNodeV2("core.tool", "search");
  const summarize = createNodeV2("core.llm", "summarize");
  const end = createNodeV2("core.end", "end");
  search.writes = { hits: "/result/hits", query: "/result/query" };
  summarize.inputs = { hits: stateBinding("/hits") };
  summarize.writes = { answer: "/text" };
  return {
    ...base,
    nodes: [start, search, summarize, end],
    transitions: [
      { id: "a", from: "start", outlet: "next", to: "search" },
      { id: "b", from: "search", outlet: "next", to: "summarize" },
      { id: "c", from: "summarize", outlet: "next", to: "end" },
    ],
  };
}

it("finds downstream nodes transitively and keeps upstream/self producers available", () => {
  const definition = graph();
  expect([...downstreamNodeIds(definition, "search")!].sort()).toEqual(["end", "summarize"]);
  const producers = new Map([["hits", ["search"]], ["answer", ["summarize"]], ["query", ["search"]]]);
  expect([...laterProducerFields(definition, "search", producers)]).toEqual(["answer"]);
  expect([...laterProducerFields(definition, "summarize", producers)]).toEqual([]);
});

it("does not gray fields when a second producer is upstream or disconnected", () => {
  const definition = graph();
  const producers = new Map([["answer", ["summarize", "search"]], ["hits", ["summarize", "search"]], ["other", ["outside"]]]);
  expect([...laterProducerFields(definition, "search", producers)]).toEqual([]);
});

it("returns no downstream set for an unknown node or a cyclic graph", () => {
  const definition = graph();
  expect(downstreamNodeIds(definition, "missing")).toBeUndefined();
  const cyclic = { ...definition, transitions: [...definition.transitions, { id: "d", from: "end", outlet: "next", to: "search" }] };
  expect(downstreamNodeIds(cyclic, "search")).toBeUndefined();
  expect([...laterProducerFields(cyclic, "search", new Map([["answer", ["summarize"]]]))]).toEqual([]);
});
