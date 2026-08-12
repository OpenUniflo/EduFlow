import { describe, expect, it } from "vitest";
import { createBlankWorkflow } from "../domain/workflowFactory";
import { LocalStorageWorkflowPersistence, workflowSettingsStorageKey, workflowStorageKey, type StorageLike } from "./LocalStorageWorkflowPersistence";
import type { PersistedWorkflowSettings } from "./WorkflowPersistence";
import type { WorkflowRunRecord } from "../runtime/types";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const settings: PersistedWorkflowSettings = {
  dailyReminder: true,
  compactMode: false,
  emailDigest: true,
  environments: [{ id: "dev", name: "Dev", baseUrl: "", apiKey: "", model: "model", searchApiUrl: "", searchApiKey: "", databaseUrl: "", fileStoragePath: "", note: "" }],
  activeEnvironmentId: "dev"
};

function runRecord(id: string, assignment?: { courseId: string; assignmentId: string }): WorkflowRunRecord {
  return {
    id,
    workflowId: "agent-loop",
    workflowTemplateId: "agent-loop",
    workflowName: "Agent Loop",
    createdAt: "2026-08-12T00:00:00.000Z",
    status: "success",
    nodeCount: 2,
    outputSummary: "done",
    finalState: { final_answer: "done" },
    nodes: [{ id: "agent", label: "Agent", input: { query: "q" }, output: { answer: "done" } }],
    ...assignment
  };
}

describe("LocalStorage Workflow persistence", () => {
  it("keeps v2 keys and roundtrips workflow, positions, state, and run history", () => {
    const storage = new MemoryStorage();
    const builtin = createBlankWorkflow("Builtin", 1);
    const persistence = new LocalStorageWorkflowPersistence(storage, [builtin], settings);
    const state = { workflows: [builtin], activeTemplateId: builtin.id, schemaSaved: true, nodePositions: { start: { x: 1, y: 2 } }, stateValues: { [builtin.id]: { query: "q" } }, runHistory: { [builtin.id]: [] } };
    persistence.writeState(state);
    persistence.writeSettings(settings);
    expect(storage.values.has("knowledge-atlas.workflow-state.v2")).toBe(true);
    expect(storage.values.has("knowledge-atlas.workflow-settings.v2")).toBe(true);
    expect(workflowStorageKey).toBe("knowledge-atlas.workflow-state.v2");
    expect(workflowSettingsStorageKey).toBe("knowledge-atlas.workflow-settings.v2");
    expect(persistence.readState()).toMatchObject(state);
    expect(persistence.readSettings()).toEqual(settings);
  });

  it("reads legacy v2 records, preserves custom workflows, and merges missing builtins", () => {
    const storage = new MemoryStorage();
    const showcase = { ...createBlankWorkflow("Builtin", 1), id: "showcase" };
    const addedBuiltin = { ...createBlankWorkflow("Added", 2), id: "added" };
    const custom = createBlankWorkflow("Custom", 3);
    storage.setItem(workflowStorageKey, JSON.stringify({ workflows: [{ ...showcase, name: "EduFlow LangGraph 示例" }, custom], activeTemplateId: custom.id }));
    const state = new LocalStorageWorkflowPersistence(storage, [showcase, addedBuiltin], settings).readState();
    expect(state.workflows?.map((item) => item.id)).toEqual(["added", "showcase", custom.id]);
    expect(state.workflows?.find((item) => item.id === "showcase")?.name).toBe("知序 LangGraph 示例");
  });

  it("roundtrips Assignment and independent Run History metadata without inventing identity", () => {
    const storage = new MemoryStorage();
    const builtin = createBlankWorkflow("Builtin", 1);
    const assignmentRun = runRecord("assignment-run", { courseId: "course-a", assignmentId: "assignment-a" });
    const independentRun = runRecord("independent-run");
    const persistence = new LocalStorageWorkflowPersistence(storage, [builtin], settings);
    persistence.writeState({ workflows: [builtin], runHistory: { "agent-loop": [assignmentRun, independentRun] } });

    const restored = new LocalStorageWorkflowPersistence(storage, [builtin], settings).readState().runHistory?.["agent-loop"];
    expect(restored?.[0]).toEqual(assignmentRun);
    expect(restored?.[0]).toMatchObject({ id: "assignment-run", workflowTemplateId: "agent-loop", courseId: "course-a", assignmentId: "assignment-a", finalState: { final_answer: "done" } });
    expect(restored?.[1]).toEqual(independentRun);
    expect(restored?.[1]).not.toHaveProperty("courseId");
    expect(restored?.[1]).not.toHaveProperty("assignmentId");
  });

  it("falls back safely for invalid workflow and settings JSON", () => {
    const storage = new MemoryStorage();
    const builtin = createBlankWorkflow("Builtin", 1);
    storage.setItem(workflowStorageKey, "{");
    storage.setItem(workflowSettingsStorageKey, "{");
    const persistence = new LocalStorageWorkflowPersistence(storage, [builtin], settings);
    expect(persistence.readState().workflows).toEqual([builtin]);
    expect(persistence.readSettings()).toEqual(settings);
  });
});
