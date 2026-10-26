import { useMemo, useState, type ReactNode } from "react";
import { Bot, Boxes, Braces, CheckCircle2, ChevronRight, Code2, Combine, GitBranch, GitFork, Search, Send, Wrench, X, Gauge, Database } from "lucide-react";

type ComponentItem = { type: string; label: string; description: string; group: string; tone: string; icon: typeof Bot };
type ComponentGroup = { title: string; items: ComponentItem[] };

const groups: ComponentGroup[] = [
  { title: "AI", items: [{ type: "core.llm", label: "模型", description: "让 AI 根据提示词生成回答", group: "AI", tone: "violet", icon: Bot }] },
  { title: "获取数据", items: [{ type: "core.tool", label: "工具", description: "调用搜索、网页等外部服务", group: "获取数据", tone: "slate", icon: Wrench }] },
  {
    title: "流程控制",
    items: [
      { type: "core.router", label: "条件路由", description: "按条件走不同分支", group: "流程控制", tone: "green", icon: GitBranch },
      { type: "core.end", label: "结束", description: "输出最终结果", group: "流程控制", tone: "grey", icon: CheckCircle2 },
    ],
  },
  { title: "处理数据", items: [{ type: "core.transform", label: "数据转换", description: "整理、改写字段", group: "处理数据", tone: "amber", icon: Braces }] },
];

const moreGroups: ComponentGroup[] = [
  { title: "高级执行", items: [
    { type: "core.function", label: "函数", description: "运行一小段代码处理数据", group: "高级执行", tone: "blue", icon: Code2 },
    { type: "core.subgraph", label: "子图", description: "把一组节点收进独立流程", group: "高级执行", tone: "blue", icon: Boxes },
    { type: "control.fork", label: "并行分支", description: "同时执行多条分支", group: "高级执行", tone: "blue", icon: GitFork },
    { type: "control.join", label: "等待汇合", description: "等所有分支结束后继续", group: "高级执行", tone: "blue", icon: Combine },
    { type: "core.tool_dispatch", label: "工具调用批次", description: "一次执行模型要求的多个工具", group: "高级执行", tone: "blue", icon: Send },
    { type: "core.progress", label: "过程进度", description: "记录当前处理阶段", group: "高级执行", tone: "blue", icon: Gauge },
    { type: "core.memory", label: "长期记忆", description: "跨运行保存少量信息", group: "高级执行", tone: "blue", icon: Database },
  ] },
];

export function ComponentLibrary({ readOnly, onAdd, onClose, footer }: { readOnly: boolean; onAdd: (type: string) => void; onClose: () => void; footer?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const search = query.trim().toLowerCase();
  const all = useMemo(() => [...groups.flatMap(group => group.items), ...moreGroups.flatMap(group => group.items)], []);
  const matches = search ? all.filter(item => `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(search)) : [];
  function itemButton(item: ComponentItem) {
    const Icon = item.icon;
    return <button type="button" className="wf-component-item" disabled={readOnly} draggable={!readOnly} key={item.type} onDragStart={event => { event.dataTransfer.setData("application/x-eduflow-node", item.type); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => onAdd(item.type)}>
      <span className={`wf-component-icon ${item.tone}`} aria-hidden="true"><Icon size={16}/></span>
      <span className="wf-component-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
    </button>;
  }
  return <aside className="wf-v2-palette wf-component-library" aria-label="组件库">
    <header className="wf-component-library-head">
      <div className="wf-panel-heading"><h2>添加组件</h2><small>拖到画布</small><button type="button" aria-label="关闭组件库" onClick={onClose}><X size={15}/></button></div>
      <div className="wf-component-search"><Search size={14} aria-hidden="true"/><input aria-label="搜索组件" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索组件…" /></div>
    </header>
    <div className="wf-component-library-body">
      {search ? (matches.length ? <div className="wf-component-results">{matches.map(itemButton)}</div> : <p className="wf-component-empty">没有找到匹配的组件。</p>) : <>
        {groups.map(group => <section className="wf-component-group" key={group.title}><h3>{group.title}</h3>{group.items.map(itemButton)}</section>)}
        <section className={`wf-component-more ${moreOpen ? "open" : ""}`}>
          <button type="button" className="wf-component-more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>
            <ChevronRight size={14} aria-hidden="true"/>
            <span><strong>更多组件</strong><small>函数、子图、并行、长期记忆…</small></span>
            <small>{moreGroups.flatMap(group => group.items).length} 个</small>
          </button>
          {moreOpen ? <div className="wf-component-more-body">{moreGroups.map(group => <div key={group.title}>{group.items.map(itemButton)}</div>)}</div> : null}
        </section>
      </>}
      {footer ? <div className="wf-component-library-footer">{footer}</div> : null}
    </div>
  </aside>;
}
