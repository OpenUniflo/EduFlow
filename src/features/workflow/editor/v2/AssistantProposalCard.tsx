import { Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";
import type { AssistantProposalChangeKind, AssistantProposalPreview } from "./assistantProposalPreview";

const kindMeta: Record<AssistantProposalChangeKind, { label: string; icon: typeof Plus }> = {
  add: { label: "新增", icon: Plus },
  modify: { label: "修改", icon: Pencil },
  delete: { label: "删除", icon: Trash2 },
};

/**
 * N12 assistant proposal preview. This is a deliberately disabled sample: the
 * card never calls the Assistant and never edits the Workflow Definition.
 */
export function AssistantProposalCard({ proposal, nodeLabel, position, onClose }: {
  proposal: AssistantProposalPreview;
  nodeLabel: string;
  position: { left: number; top: number; width: number; maxHeight: number };
  onClose: () => void;
}) {
  return <div className="wf-assistant-preview-layer">
    <article className="wf-assistant-preview" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }} aria-label="助手建议预览" data-preview="unavailable">
      <header className="wf-assistant-preview-head">
        <span className="wf-assistant-preview-icon" aria-hidden="true"><Sparkles size={16} /></span>
        <div className="wf-assistant-preview-copy"><small>助手建议 · 选中「{nodeLabel}」</small><h3>{proposal.title}</h3></div>
        <button type="button" className="wf-assistant-preview-close" aria-label="关闭助手建议预览" onClick={onClose}><X size={15} /></button>
      </header>
      <div className="wf-assistant-preview-meta"><PreviewBadge label="预览 · 暂不可用" description="预览：暂不可用，只读，不会修改工作流" /><span>{proposal.changes.length} 项改动</span></div>
      <p className="wf-assistant-preview-summary">{proposal.summary}</p>
      <ul className="wf-assistant-preview-changes">
        {proposal.changes.map(change => {
          const meta = kindMeta[change.kind];
          const Icon = meta.icon;
          return <li key={`${change.kind}:${change.title}`} data-change={change.kind}>
            <span className="wf-assistant-preview-change-icon" aria-hidden="true"><Icon size={13} /></span>
            <span className="wf-assistant-preview-change-copy"><strong>{meta.label} · {change.title}</strong><small>{change.detail}</small></span>
          </li>;
        })}
      </ul>
      <p className="wf-assistant-preview-impact"><strong>影响范围</strong><span>{proposal.impact}</span></p>
      <footer className="wf-assistant-preview-foot">
        <span>示例建议 · 不会修改工作流</span>
        <div className="wf-assistant-preview-actions">
          <button type="button" disabled title="预览 · 暂不可用，忽略能力尚未开放">忽略</button>
          <button type="button" className="primary" disabled title="预览 · 暂不可用，应用能力尚未开放">应用</button>
        </div>
      </footer>
    </article>
  </div>;
}
