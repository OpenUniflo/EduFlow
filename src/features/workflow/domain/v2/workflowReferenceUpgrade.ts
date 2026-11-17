import type { Binding, JsonSchema, WorkflowDefinitionV2, WorkflowDocumentV2 } from "./types";
import { referenceInputFields, referenceMappingIssues, referenceOutputFields, referenceSchemaTypes, type ReferenceField, type ReferenceMappingIssue } from "./workflowReferenceMapping";

/**
 * Pure upgrade preview for one exact fixed reference target revision.
 *
 * This module only reports interface differences and mapping repair work. It
 * never chooses a revision, patches mappings, or fetches anything. Callers
 * must pass both immutable Definitions and keep the pinned target at exactly
 * the previewed `(workflowId, revision)`.
 */

export type ReferenceFieldChangeKind = "added" | "removed" | "changed";
export type ReferenceFieldChangeAttribute = "required" | "type" | "default";

export type ReferenceFieldChange = {
  name: string;
  kind: ReferenceFieldChangeKind;
  attributes: ReferenceFieldChangeAttribute[];
  previous?: ReferenceField;
  next?: ReferenceField;
};

export type ReferenceInterfaceChanges = {
  inputs: ReferenceFieldChange[];
  outputs: ReferenceFieldChange[];
  total: number;
};

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function defaultPresent(field: ReferenceField): boolean {
  return Object.prototype.hasOwnProperty.call(field.schema, "default");
}

function sameTypes(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.length === right.length && left.every(type => right.includes(type));
}

function changedAttributes(previous: ReferenceField, next: ReferenceField): ReferenceFieldChangeAttribute[] {
  const attributes: ReferenceFieldChangeAttribute[] = [];
  if (previous.required !== next.required) attributes.push("required");
  if (!sameTypes(referenceSchemaTypes(previous.schema), referenceSchemaTypes(next.schema))) attributes.push("type");
  const previousDefault = defaultPresent(previous);
  const nextDefault = defaultPresent(next);
  if (previousDefault !== nextDefault || previousDefault && nextDefault && !jsonEqual(previous.schema.default, next.schema.default)) attributes.push("default");
  return attributes;
}

function fieldChanges(previousFields: readonly ReferenceField[], nextFields: readonly ReferenceField[]): ReferenceFieldChange[] {
  const previous = new Map(previousFields.map(field => [field.name, field]));
  const next = new Map(nextFields.map(field => [field.name, field]));
  const changes: ReferenceFieldChange[] = [];
  // Keep the new declaration order first; removed fields follow in their old order.
  for (const field of nextFields) {
    const old = previous.get(field.name);
    if (!old) { changes.push({ name: field.name, kind: "added", attributes: [], next: field }); continue; }
    const attributes = changedAttributes(old, field);
    if (attributes.length) changes.push({ name: field.name, kind: "changed", attributes, previous: old, next: field });
  }
  for (const field of previousFields) {
    if (!next.has(field.name)) changes.push({ name: field.name, kind: "removed", attributes: [], previous: field });
  }
  return changes;
}

/** Added, removed, required/type/default changes for one old → new revision pair. */
export function referenceInterfaceChanges(previous: Pick<WorkflowDefinitionV2, "inputSchema" | "outputSchema">, next: Pick<WorkflowDefinitionV2, "inputSchema" | "outputSchema">): ReferenceInterfaceChanges {
  const inputs = fieldChanges(referenceInputFields(previous.inputSchema), referenceInputFields(next.inputSchema));
  const outputs = fieldChanges(referenceOutputFields(previous.outputSchema), referenceOutputFields(next.outputSchema));
  return { inputs, outputs, total: inputs.length + outputs.length };
}

export type ReferenceUpgradeAssessment = {
  changes: ReferenceInterfaceChanges;
  issues: ReferenceMappingIssue[];
  compatible: boolean;
};

/**
 * Mapping repair work against the exact new revision. Existing inputs/writes
 * are read only; the dialog and editor keep their original values.
 */
export function assessReferenceUpgrade(args: {
  previous: Pick<WorkflowDefinitionV2, "inputSchema" | "outputSchema">;
  next: Pick<WorkflowDefinitionV2, "inputSchema" | "outputSchema">;
  inputs: Readonly<Record<string, Binding>>;
  writes: Readonly<Record<string, string>>;
  inputSchema: JsonSchema;
  stateSchema: JsonSchema;
}): ReferenceUpgradeAssessment {
  const changes = referenceInterfaceChanges(args.previous, args.next);
  const issues = referenceMappingIssues(args.next, args.inputs, args.writes, { inputSchema: args.inputSchema, stateSchema: args.stateSchema });
  return { changes, issues, compatible: issues.length === 0 };
}

/** All conditions the explicit apply action needs; kept pure for stale-response tests. */
export function referenceUpgradeCanApply(args: {
  document: WorkflowDocumentV2 | null;
  selectedRevision: number;
  currentRevision: number;
  environmentAvailable: boolean;
  loading: boolean;
  error: string;
  applying: boolean;
}): boolean {
  const document = args.document;
  return Boolean(
    document
    && document.definition.revision === args.selectedRevision
    && args.selectedRevision !== args.currentRevision
    && !document.archived
    && args.environmentAvailable
    && !args.loading
    && !args.error
    && !args.applying,
  );
}

/**
 * The confirm action applies only the exact previewed revision. A deleted or
 * rewritten revision fails this check instead of silently using the latest.
 */
export function referenceUpgradeDocumentMatches(revision: number, preview: WorkflowDocumentV2, fetched: WorkflowDocumentV2): boolean {
  return fetched.definition.revision === revision
    && fetched.definition.workflowId === preview.definition.workflowId
    && jsonEqual(fetched.definition, preview.definition);
}
