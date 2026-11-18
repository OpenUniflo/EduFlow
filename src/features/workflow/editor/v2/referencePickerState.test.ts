import { describe, expect, it } from "vitest";
import type { WorkflowDocumentV2 } from "../../domain/v2/types";
import { referencePickerCanApply } from "./referencePickerState";

function documentFor(workflowId: string, revision: number, archived = false): WorkflowDocumentV2 {
  return {
    definition: { workflowId, revision, name: "目标" },
    editor: { workflowId, definitionRevision: revision, editorRevision: 1, schemaVersion: 1, nodes: {}, edges: {} },
    ...(archived ? { archived } : {}),
  } as unknown as WorkflowDocumentV2;
}

const valid = {
  document: documentFor("target", 2),
  selectedWorkflowId: "target",
  selectedRevision: 2,
  selectedEnvironment: "local",
  environmentAvailable: true,
  revisionLoading: false,
  revisionError: "",
  documentLoading: false,
  documentError: "",
  unchanged: false,
};

describe("reference picker confirmation state", () => {
  it("confirms only the exact workflow/revision shown with an available environment", () => {
    expect(referencePickerCanApply(valid)).toBe(true);
  });

  it("rejects a document that belongs to another workflow or revision while a slow request is replacing it", () => {
    expect(referencePickerCanApply({ ...valid, document: documentFor("target", 1) })).toBe(false);
    expect(referencePickerCanApply({ ...valid, document: documentFor("other", 2) })).toBe(false);
    expect(referencePickerCanApply({ ...valid, document: null })).toBe(false);
  });

  it("rejects an unavailable environment even when its ref is non-empty", () => {
    expect(referencePickerCanApply({ ...valid, environmentAvailable: false })).toBe(false);
    expect(referencePickerCanApply({ ...valid, selectedEnvironment: "" })).toBe(false);
  });

  it("rejects revision/document loading and error states", () => {
    expect(referencePickerCanApply({ ...valid, revisionLoading: true })).toBe(false);
    expect(referencePickerCanApply({ ...valid, revisionError: "版本读取失败" })).toBe(false);
    expect(referencePickerCanApply({ ...valid, documentLoading: true })).toBe(false);
    expect(referencePickerCanApply({ ...valid, documentError: "目标修订不存在" })).toBe(false);
    expect(referencePickerCanApply({ ...valid, document: documentFor("target", 2, true) })).toBe(false);
    expect(referencePickerCanApply({ ...valid, unchanged: true })).toBe(false);
  });
});
