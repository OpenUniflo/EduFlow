import { graphAtPath } from "../../domain/v2/authoring";
import type { WorkflowDefinitionV2 } from "../../domain/v2/types";
import { referenceMappingIssues, type ReferenceMappingIssue } from "../../domain/v2/workflowReferenceMapping";
import { workflowReferenceUsages, type WorkflowReferenceUsage } from "../../domain/v2/workflowReferences";
import { referenceDocumentKey, type ReferenceDocumentState } from "./referenceDocuments";

/**
 * Whole-document validation for fixed Workflow references.
 *
 * A reference's input bindings and output writes belong to the graph that
 * directly contains the call node (`usage.graphPath`), never to whichever graph
 * happens to be on screen. The root Definition is therefore required here;
 * loading/error decisions are made for every reachable usage independently of
 * node selection or graph navigation.
 */

export type WorkflowReferenceMappingBlocker = {
  usage: WorkflowReferenceUsage;
  issues: ReferenceMappingIssue[];
};

export type WorkflowReferenceDocumentPlan = {
  key: string;
  workflowId: string;
  revision: number;
};

export type WorkflowReferenceValidation = {
  usages: WorkflowReferenceUsage[];
  loading: boolean;
  unavailable: WorkflowReferenceUsage[];
  mapping: WorkflowReferenceMappingBlocker[];
  saveBlocked: boolean;
};

/** Deduplicated exact documents a Definition needs before save can be validated. */
export function referenceDocumentPlan(usages: readonly WorkflowReferenceUsage[]): WorkflowReferenceDocumentPlan[] {
  const plan = new Map<string, WorkflowReferenceDocumentPlan>();
  for (const usage of usages) {
    const key = referenceDocumentKey(usage.workflowId, usage.revision);
    if (!plan.has(key)) plan.set(key, { key, workflowId: usage.workflowId, revision: usage.revision });
  }
  return [...plan.values()];
}

/** Convenience for callers that start from the document rather than a usage list. */
export function workflowReferenceDocumentPlan(definition: WorkflowDefinitionV2): WorkflowReferenceDocumentPlan[] {
  return referenceDocumentPlan(workflowReferenceUsages(definition));
}

export function validateWorkflowReferenceUsages(
  usages: readonly WorkflowReferenceUsage[],
  definition: WorkflowDefinitionV2,
  documents: Readonly<Record<string, ReferenceDocumentState>>,
): WorkflowReferenceValidation {
  let loading = false;
  const unavailable: WorkflowReferenceUsage[] = [];
  const mapping: WorkflowReferenceMappingBlocker[] = [];
  for (const usage of usages) {
    const state = documents[referenceDocumentKey(usage.workflowId, usage.revision)];
    if (!state || state.status === "loading") { loading = true; continue; }
    if (state.status === "error") { unavailable.push(usage); continue; }
    const scope = referenceScope(definition, usage);
    if (!scope) continue;
    const issues = referenceMappingIssues(state.document.definition, usage.inputs, usage.writes, {
      inputSchema: scope.inputSchema,
      stateSchema: scope.state.schema,
    });
    if (issues.length) mapping.push({ usage, issues });
  }
  return { usages: [...usages], loading, unavailable, mapping, saveBlocked: loading || unavailable.length > 0 || mapping.length > 0 };
}

export function validateWorkflowReferences(
  definition: WorkflowDefinitionV2,
  documents: Readonly<Record<string, ReferenceDocumentState>>,
): WorkflowReferenceValidation {
  return validateWorkflowReferenceUsages(workflowReferenceUsages(definition), definition, documents);
}

/** First issue to open; an unavailable target is more urgent than a mapping repair. */
export function firstBlockingReferenceUsage(validation: WorkflowReferenceValidation): WorkflowReferenceUsage | undefined {
  return validation.unavailable[0] ?? validation.mapping[0]?.usage;
}

function referenceScope(definition: WorkflowDefinitionV2, usage: WorkflowReferenceUsage): WorkflowDefinitionV2 | undefined {
  try { return graphAtPath(definition, usage.graphPath); } catch { return undefined; }
}
