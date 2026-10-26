import type { Binding, JsonSchema } from "../../domain/v2/types";
import { defaultParamName } from "../../domain/v2/dataFlow";
import { toolParamRows } from "../../domain/v2/toolParams";

export type WorkbenchBindingMode = "declared" | "schema";

export type WorkbenchBindingOptions = {
  mode: WorkbenchBindingMode;
  inputSchema: JsonSchema;
  target: string | null;
  binding: Binding;
  nodeLabel?: string;
};

export type WorkbenchBindingResult = {
  inputs: Record<string, Binding>;
  applied: boolean;
  name?: string;
  message: string;
};

const TOOL_DROP_HINT = "工具参数由工具定义，不能新增。请拖到要使用的参数行上。";

/**
 * Tool parameters come from the tool's Schema, so the workbench may only fill an existing row.
 * With exactly one unfilled parameter "使用" targets it; otherwise the user must drop on a row.
 * Declarative nodes keep the old behavior of creating a parameter from the dropped field.
 */
export function applyWorkbenchBinding(inputs: Record<string, Binding>, options: WorkbenchBindingOptions): WorkbenchBindingResult {
  const { mode, inputSchema, target, binding, nodeLabel } = options;

  if (mode === "declared") {
    const name = target ?? defaultParamName(binding, new Set(Object.keys(inputs)));
    return {
      inputs: { ...inputs, [name]: binding },
      applied: true,
      name,
      message: `已为「${nodeLabel ?? "节点"}」添加参数 ${name}。`,
    };
  }

  const rows = toolParamRows(inputSchema, inputs);
  if (target) {
    const row = rows.find(item => item.name === target);
    if (!row) return { inputs, applied: false, message: TOOL_DROP_HINT };
    return {
      inputs: { ...inputs, [target]: binding },
      applied: true,
      name: target,
      message: `已填入参数「${row.title || target}」。`,
    };
  }

  const unfilled = rows.filter(row => !row.binding);
  if (unfilled.length === 1) {
    const row = unfilled[0];
    return {
      inputs: { ...inputs, [row.name]: binding },
      applied: true,
      name: row.name,
      message: `已填入参数「${row.title || row.name}」。`,
    };
  }

  return {
    inputs,
    applied: false,
    message: rows.length ? TOOL_DROP_HINT : "这个工具没有可填写的参数。",
  };
}

/** Disable "使用" with a tooltip when the tool has no single obvious target row. */
export function workbenchUseHint(mode: WorkbenchBindingMode, inputSchema: JsonSchema, inputs: Record<string, Binding>): string {
  if (mode !== "schema") return "";
  const rows = toolParamRows(inputSchema, inputs);
  if (!rows.length) return "这个工具没有可填写的参数。";
  if (rows.filter(row => !row.binding).length === 1) return "";
  return TOOL_DROP_HINT;
}
