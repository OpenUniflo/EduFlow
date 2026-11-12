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
 * card never calls the Assistant, never analyzes the open Workflow and never
 * edits the Workflow Definition.
 */
export function AssistantProposalCard({ proposal, position, onClose }: {
  proposal: AssistantProposalPreview;
  position: { left: number; top: number; width: number; maxHeight: number };
  onClose: () => void;
}) {
  return <div className="wf-assistant-preview-layer">
    <article className="wf-assistant-preview" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }} aria-label="助手建议示例预览" data-preview="sample">
      <header className="wf-assistant-preview-head">
        <span className="wf-assistant-preview-icon" aria-hidden="true"><Sparkles size={16} /></span>
        <div className="wf-assistant-preview-copy"><small>助手提议 · 只读示例</small><h3>{proposal.title}</h3></div>
        <button type="button" className="wf-assistant-preview-close" aria-label="关闭助手建议预览" onClick={onClose}><X size={15} /></button>
      </header>
      <div className="wf-assistant-preview-meta"><PreviewBadge label="预览 · 示例数据" description="预览：示例数据，只读，不会修改工作流" /><span>{proposal.changes.length} 项示例改动</span></div>
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
      <p className="wf-assistant-preview-disabled-note" role="note">这是尚未接入后端的示例预览；忽略与应用能力暂不可用。接入后仍需先预览、校验并确认，才会修改工作流。</p>
      <footer className="wf-assistant-preview-foot">
        <span>示例建议 · 不会修改工作流</span>
        <div className="wf-assistant-preview-actions">
          <button type="button" disabled>忽略</button>
          <button type="button" className="primary" disabled>应用</button>
        </div>
      </footer>
    </article>
  </div>;
}
