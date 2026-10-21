import { replaceInterfaceSchema } from "../../domain/v2/graphInterfaceAuthoring";
import type { WorkflowDefinitionV2 } from "../../domain/v2/types";
import { InterfaceSchema } from "./GraphInterfaceFields";

export function StartInputFields({ definition, onChange }: { definition: WorkflowDefinitionV2; onChange: (definition: WorkflowDefinitionV2) => void }) {
  const stateFields = Object.keys(definition.state.schema.properties ?? {});
  const direct = definition.nodes.flatMap(node => Object.entries(node.inputs).flatMap(([name, binding]) => binding.source === "input" ? [{ node: node.label, name, pointer: binding.pointer }] : []));
  const init = Object.entries(definition.state.inputBindings).flatMap(([field, binding]) => binding.source === "input" ? [{ field, pointer: binding.pointer }] : []);
  const indirect = [...new Set(init.flatMap(({ field }) => definition.nodes.filter(node => Object.values(node.inputs).some(binding => binding.source === "state" && binding.pointer === `/${field}`)).map(node => node.label)))];
  return <section className="wf-config-section wf-start-input">
    <h3>启动输入契约</h3>
    <p className="wf-field-note">Start 只声明调用方输入；本次运行值不随定义保存。读取来源为“启动输入”的节点和初始化 State 的映射会显示在下方。</p>
    <InterfaceSchema label="启动输入" schema={definition.inputSchema} onChange={schema => onChange(replaceInterfaceSchema(definition, "input", schema))} />
    <h4>初始化共享状态</h4>
    {stateFields.length ? stateFields.map(field => {
      const binding = definition.state.inputBindings[field];
      return <label key={field}>State · {field}<select value={binding?.source === "input" ? binding.pointer : ""} onChange={event => { const inputBindings = { ...definition.state.inputBindings }; if (event.target.value) inputBindings[field] = { source: "input", pointer: event.target.value, onMissing: { mode: "error" } }; else delete inputBindings[field]; onChange({ ...definition, state: { ...definition.state, inputBindings } }); }}><option value="">保留 State 初始值</option>{Object.keys(definition.inputSchema.properties ?? {}).map(key => <option key={key} value={`/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`}>{key}</option>)}</select></label>;
    }) : <p>当前没有 State 字段。</p>}
    <h4>谁在使用启动输入</h4>
    {direct.length ? <ul className="wf-data-list wf-start-consumers">{direct.map((item, index) => <li key={`${item.node}-${item.name}-${index}`}>{item.node} · {item.name} ← {item.pointer}</li>)}</ul> : <p>暂无节点直接读取启动输入。</p>}
    {init.length ? <p className="wf-field-note">初始化：{init.map(item => `State.${item.field} ← ${item.pointer}`).join("；")}</p> : <p className="wf-field-note">启动输入不会初始化 State；节点可以直接读取原始启动输入。</p>}
    {indirect.length ? <p className="wf-field-note">通过 State 间接读取的节点：{indirect.join("、")}</p> : null}
  </section>;
}
