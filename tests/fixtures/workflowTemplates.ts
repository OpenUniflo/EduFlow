import { createNodeV2, createWorkflowV2 } from "../../src/features/workflow/domain/v2/factory";
import type { WorkflowDefinitionV2 } from "../../src/features/workflow/domain/v2/types";

/**
 * Minimal synthetic starter used by tests only. It deliberately looks like a
 * search flow without copying any product prompt, title or description.
 */
export function syntheticStarterTemplate(): WorkflowDefinitionV2 {
  const template = createWorkflowV2("Synthetic starter");
  template.workflowId = "fixture-starter";
  template.revision = 0;
  template.description = "Synthetic starter description.";
  template.inputSchema = { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false };
  template.outputSchema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
  template.state = {
    schema: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, keywords: { type: "string" } }, additionalProperties: false },
    initial: { question: "", answer: "", keywords: "" },
    inputBindings: { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } },
    reducers: { question: { name: "replace", version: 1 }, answer: { name: "replace", version: 1 }, keywords: { name: "replace", version: 1 } },
  };
  const start = createNodeV2("core.start", "start");
  const keywords = createNodeV2("core.llm", "keywords");
  keywords.label = "Synthetic keywords";
  keywords.config = { providerRef: "", modelRef: "", modelParameters: {}, allowedToolRefs: [], prompt: { system: [], messages: [{ role: "user", content: [] }] } };
  keywords.inputs = { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } };
  keywords.writes = { keywords: "/text" };
  const search = createNodeV2("core.tool", "search");
  search.label = "Synthetic search";
  search.config = { toolRef: "", contractDigest: "" };
  search.inputs = { query: { source: "state", pointer: "/keywords", onMissing: { mode: "error" } } };
  search.writes = { hits: "/result/hits" };
  const answer = createNodeV2("core.llm", "answer");
  answer.label = "Synthetic answer";
  answer.config = { providerRef: "", modelRef: "", modelParameters: {}, allowedToolRefs: [], prompt: { system: [], messages: [{ role: "user", content: [] }] } };
  answer.inputs = { question: { source: "input", pointer: "/question", onMissing: { mode: "error" } } };
  answer.writes = { answer: "/text" };
  const end = createNodeV2("core.end", "end");
  template.nodes = [start, keywords, search, answer, end];
  template.transitions = [
    { id: "start:next:keywords", from: "start", outlet: "next", to: "keywords" },
    { id: "keywords:next:search", from: "keywords", outlet: "next", to: "search" },
    { id: "search:next:answer", from: "search", outlet: "next", to: "answer" },
    { id: "answer:next:end", from: "answer", outlet: "next", to: "end" },
  ];
  template.outputBindings = { answer: { source: "state", pointer: "/answer", onMissing: { mode: "error" } } };
  return template;
}
