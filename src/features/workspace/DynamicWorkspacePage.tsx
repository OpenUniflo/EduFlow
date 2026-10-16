import { useState } from "react";
import { GlobalNav } from "@/app/components/GlobalNav";
import type { MockSession } from "@/features/auth/types";
import { graphFrameSrc, type GraphView } from "./graphFrame";
import "./dynamicWorkspace.css";

const views: Array<{ id: GraphView; label: string }> = [
  { id: "ability", label: "课程技能树" },
  { id: "world", label: "能力模型" },
  { id: "lane", label: "课程路线" },
];

export function DynamicWorkspacePage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const [view, setView] = useState<GraphView>("ability");
  const current = views.find((item) => item.id === view) ?? views[0];
  return <main className="dynamic-workspace">
    <GlobalNav active="workspace" session={session} onLogout={onLogout} />
    <section className="dynamic-workspace-stage">
      <header>
        <p>AI Agent 开发基础 · 同一批节点的三种排法</p>
        <nav className="dynamic-workspace-views" aria-label="图示">
          {views.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
        </nav>
      </header>
      <iframe className="dynamic-workspace-graph" title={current.label} src={graphFrameSrc(view)} />
      <p className="dynamic-workspace-note">布局演示。对话仍使用全局助手，这里不会另起一个模型。</p>
    </section>
  </main>;
}
