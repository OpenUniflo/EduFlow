import type { JsonSchema, StructuredOutputField, StructuredOutputFieldType, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";
import { structuredOutputFields } from "./outputStructure";
import { pruneOrphanStateFields, renameStateField, stateFieldInitial, stateFieldNameIssue, withStateField } from "./stateAuthoring";
import { stateFieldConsumers, stateFieldProducers } from "./dataFlow";

/** Pure authoring operations for model structured output. */

function withNode(definition: WorkflowDefinitionV2, nodeId: string, update: (node: WorkflowNodeV2) => WorkflowNodeV2): WorkflowDefinitionV2 {
  return { ...definition, nodes: definition.nodes.map(node => node.id === nodeId ? update(node) : node) };
}

function configFields(node: WorkflowNodeV2): StructuredOutputField[] {
  return structuredOutputFields(node).map(field => ({ ...field }));
}

function withFields(node: WorkflowNodeV2, fields: StructuredOutputField[]): WorkflowNodeV2 {
  const config = { ...node.config };
  if (fields.length) config.structuredOutput = { fields: fields as unknown as import("./types").JsonValue };
  else delete config.structuredOutput;
  return { ...node, config };
}

/** Adds a structured field, its State field and the matching `/<name>` write once. */
export function withModelStructuredField(definition: WorkflowDefinitionV2, nodeId: string, field: StructuredOutputField): WorkflowDefinitionV2 {
  const name = field.name.trim();
  if (!name) return definition;
  const node = definition.nodes.find(item => item.id === nodeId);
  if (!node || node.type !== "core.llm") return definition;
  const fields = configFields(node);
  if (fields.some(item => item.name === name)) return definition;
  // The first structured field replaces the plain `/text` answer. Remove that
  // write only when no downstream node or workflow output reads it; a consumed
  // answer keeps its write and the panel explains why the row remains.
  const readers = fields.length ? undefined : stateFieldConsumers(definition);
  const nextField: StructuredOutputField = { name, type: field.type, ...(field.description?.trim() ? { description: field.description.trim() } : {}) };
  const withState = withStateField(definition, name, field.type, name);
  const removed: string[] = [];
  const next = withNode(withState, nodeId, current => {
    const writes = { ...current.writes };
    if (readers) {
      for (const [fieldName, pointer] of Object.entries(writes)) {
        if (pointer !== "/text") continue;
        const downstreamReaders = (readers.get(fieldName) ?? []).filter(reader => reader !== nodeId);
        if (!downstreamReaders.length) { delete writes[fieldName]; removed.push(fieldName); }
      }
    }
    writes[name] = `/${name}`;
    return { ...withFields(current, [...configFields(current), nextField]), writes };
  });
  return pruneOrphanStateFields(next, removed);
}

/** Removes a structured field definition, its write, and an otherwise unowned State field in one edit. */
export function removeModelStructuredField(definition: WorkflowDefinitionV2, nodeId: string, name: string): WorkflowDefinitionV2 {
  const next = withNode(definition, nodeId, node => {
    const writes = { ...node.writes };
    delete writes[name];
    return { ...withFields(node, configFields(node).filter(field => field.name !== name)), writes };
  });
  return pruneOrphanStateFields(next, [name]);
}

/**
 * Rewrites a structured field name and its output pointer. When the write still
 * targets the same-named State field, that field and every downstream reference
 * follow the rename; when the write destination was already separated from the
 * model key, only the pointer follows and the chosen destination stays intact.
 * Invalid/colliding names leave the definition untouched.
 */
export function renameModelStructuredField(definition: WorkflowDefinitionV2, nodeId: string, from: string, to: string): WorkflowDefinitionV2 {
  const name = to.trim();
  if (!name || name === from) return definition;
  const node = definition.nodes.find(item => item.id === nodeId);
  if (!node || node.type !== "core.llm") return definition;
  if (configFields(node).some(field => field.name === name)) return definition;
  // The write destination keeps its own name once it has been separated from the
  // model key, so State-field collision checks only apply while they are joined.
  const followsStateField = Object.prototype.hasOwnProperty.call(node.writes, from);
  if (followsStateField) {
    if (stateFieldNameIssue(definition.state.schema, name)) return definition;
    if (Object.prototype.hasOwnProperty.call(node.writes, name)) return definition;
    if ((stateFieldProducers(definition).get(name) ?? []).some(id => id !== nodeId)) return definition;
  }
  // Move the State field first so readers and prompt parameters follow the name.
  const stateRenamed = followsStateField ? renameStateField(definition, from, name) : definition;
  return withNode(stateRenamed, nodeId, current => {
    const fields = configFields(current).map(field => field.name === from ? { ...field, name } : field);
    const writes = { ...current.writes };
    if (followsStateField && Object.prototype.hasOwnProperty.call(writes, from) && !Object.prototype.hasOwnProperty.call(writes, name)) {
      const moved = writes[from];
      delete writes[from];
      writes[name] = moved;
    }
    for (const [writeField, pointer] of Object.entries(writes)) {
      if (pointer === `/${from}`) writes[writeField] = `/${name}`;
    }
    return { ...withFields(current, fields), writes };
  });
}

/**
 * Moves only the State write destination of one structured field. The model key
 * (structuredOutput field name) stays untouched and downstream readers follow
 * the destination exactly like a tool output rename.
 */
export function renameModelStructuredWriteField(definition: WorkflowDefinitionV2, nodeId: string, from: string, to: string): WorkflowDefinitionV2 {
  const node = definition.nodes.find(item => item.id === nodeId);
  if (!node || node.type !== "core.llm") return definition;
  if (!Object.prototype.hasOwnProperty.call(node.writes, from)) return definition;
  return renameStateField(definition, from, to);
}

/** Default initial value for a structured field type, exposed for the add form. */
export function structuredFieldInitial(type: StructuredOutputFieldType) {
  return stateFieldInitial(type);
}

/** New-fields added from one add-output menu share the same single definition edit. */
export function withNewStateFields(definition: WorkflowDefinitionV2, rows: readonly { field: string; type: StructuredOutputFieldType; pointer: string }[]): WorkflowDefinitionV2 {
  let next = definition;
  for (const row of rows) next = withStateField(next, row.field, row.type, row.field);
  return next;
}

/** Schema for a structured field's created State field. */
export function structuredFieldSchema(type: StructuredOutputFieldType, title?: string): JsonSchema {
  return { type, ...(title ? { title } : {}), ...(type === "array" ? { items: { type: "object" } } : {}) };
}
