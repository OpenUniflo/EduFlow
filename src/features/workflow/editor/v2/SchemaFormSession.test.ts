import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { JsonDraftStore } from "./JsonField";
import type { JsonSchema } from "../../domain/v2/types";

// Exercise the real form handlers, cache and remount behavior without a browser.
const host = vi.hoisted(() => ({ slots: [] as any[], index: 0, effects: [] as (() => void)[], context: { drafts: new Map() as JsonDraftStore, onPending: vi.fn() } }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: any) { const i = host.index++; if (!(i in host.slots)) host.slots[i] = typeof initial === "function" ? initial() : initial; return [host.slots[i], (update: any) => { host.slots[i] = typeof update === "function" ? update(host.slots[i]) : update; }]; },
  useRef(initial: any) { return host.slots[host.index++] ??= { current: initial }; },
  useMemo(create: () => unknown) { host.index++; return create(); },
  useEffect(effect: () => void, deps: unknown[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) { host.slots[i] = { deps }; host.effects.push(effect); } },
}));
vi.mock("./JsonField", () => ({ useJsonDraftContext: () => host.context }));
import { SchemaForm } from "./SchemaForm";

const input = { question: "last valid" };
const onChange = vi.fn(), onInvalid = vi.fn();
const ordinarySchema = { type: "object", properties: { question: { type: "string" } } };
function render(kind: "definition" | "run-input" = "run-input", schema: JsonSchema = ordinarySchema) {
  host.index = 0;
  const tree = SchemaForm({ schema, value: input, label: "运行输入", draftId: "runtime-input", draftKind: kind, onChange, onInvalid });
  host.effects.splice(0).forEach(effect => effect());
  return tree;
}
function find(tree: unknown, predicate: (node: ReactElement<any>) => boolean): ReactElement<any> {
  if (Array.isArray(tree)) { for (const child of tree) { try { return find(child, predicate); } catch { /* Continue to siblings. */ } } }
  else if (tree && typeof tree === "object" && "props" in tree) {
    const element = tree as ReactElement<any>;
    if (predicate(element)) return element;
    return find(element.props.children, predicate);
  }
  throw new Error("Requested form control not found");
}
function rawEditor(tree: unknown) { return find(tree, node => node.type === "textarea" && node.props["aria-label"] === "运行输入 JSON"); }
function editInvalidRaw(kind: "definition" | "run-input") {
  const initial = render(kind);
  find(initial, node => node.type === "button" && node.props.children === "高级 JSON").props.onClick();
  rawEditor(render(kind)).props.onChange({ target: { value: '{"question": unfinished' } });
}
beforeEach(() => { host.slots = []; host.index = 0; host.effects = []; host.context.drafts.clear(); host.context.onPending.mockClear(); onChange.mockClear(); onInvalid.mockClear(); });

it("recovers invalid raw input and JSON mode after unmount without blocking document Save or applying old values", () => {
  editInvalidRaw("run-input");
  expect(host.context.drafts.get("runtime-input")).toMatchObject({ text: '{"question": unfinished', baseline: JSON.stringify(input, null, 2), mode: "json" });
  expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining("JSON 格式有误"));
  expect(onChange).not.toHaveBeenCalled(); expect(host.context.onPending.mock.calls.every(([, pending]) => pending === false)).toBe(true);
  // A new component instance uses the same Feature-owned cache restored by the session checkpoint.
  host.slots = []; host.effects = [];
  const restored = rawEditor(render());
  expect(restored.props.value).toBe('{"question": unfinished'); expect(restored.props["aria-invalid"]).toBe(true);
  expect(host.context.onPending).toHaveBeenLastCalledWith("runtime-input", false);
});

it("keeps invalid Definition configuration pending across a remount", () => {
  editInvalidRaw("definition"); expect(host.context.onPending).toHaveBeenLastCalledWith("runtime-input", true);
  host.slots = []; host.effects = []; rawEditor(render("definition"));
  expect(host.context.onPending).toHaveBeenLastCalledWith("runtime-input", true); expect(onChange).not.toHaveBeenCalled();
});

it("keeps the raw input and its error when an unsupported recursive schema replaces the form", () => {
  editInvalidRaw("run-input");
  const cached = structuredClone(host.context.drafts.get("runtime-input"));
  const recursive = { $defs: { node: { type: "object", properties: { next: { $ref: "#/$defs/node" } }, required: ["next"] } }, $ref: "#/$defs/node" };
  const advanced = render("run-input", recursive);
  expect(rawEditor(advanced).props.value).toBe('{"question": unfinished');
  find(advanced, node => node.type === "button" && node.props.children === "表单").props.onClick();
  const form = render("run-input", recursive);
  expect(find(form, node => node.type === "p" && typeof node.props.children === "string" && node.props.children.includes("原输入已保留"))).toBeDefined();
  expect(host.context.drafts.get("runtime-input")).toEqual({ ...cached, mode: "form" });
  host.slots = []; host.effects = [];
  const remounted = render("run-input", recursive);
  find(remounted, node => node.type === "button" && node.props.children === "高级 JSON").props.onClick();
  const restored = rawEditor(render("run-input", recursive));
  expect(restored.props.value).toBe('{"question": unfinished'); expect(restored.props["aria-invalid"]).toBe(true);
  expect(onChange).not.toHaveBeenCalled(); expect(host.context.onPending.mock.calls.every(([, pending]) => pending === false)).toBe(true);
});
