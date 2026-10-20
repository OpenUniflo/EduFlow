import { editorAtPath, graphAtPath, replaceGraph, replaceGraphEditor } from "../../domain/v2/authoring";
import type { useWorkflowV2Controller } from "./useWorkflowV2Controller";
type Controller = ReturnType<typeof useWorkflowV2Controller>;
/** Focus changes only the projection. Save, run and undo always own the entire document. */
export function scopedWorkflow(root: Controller, path: string[]): Controller {
  if (!path.length) return root;
  const definition = graphAtPath(root.definition, path);
  const editor = editorAtPath(root.editor, path, definition);
  const editDocument: Controller["editDocument"] = (update, group) => root.editDocument(current => {
    const graph = graphAtPath(current.definition, path);
    const next = update({ definition: graph, editor: editorAtPath(current.editor, path, graph) });
    return { definition: replaceGraph(current.definition, path, next.definition), editor: replaceGraphEditor(current.editor, path, next.editor) };
  }, group);
  return { ...root, definition, editor, editDocument,
    editDefinition: (update, group) => editDocument(current => ({ ...current, definition: typeof update === "function" ? update(current.definition) : update }), group),
    editEditor: (update, group) => editDocument(current => ({ ...current, editor: typeof update === "function" ? update(current.editor) : update }), group) };
}
