import { Bot, GitBranch, Loader2, Wrench } from "lucide-react";
import { startingTemplateChain, startingTemplateVisual } from "../../domain/v2/startingTemplates";
import type { WorkflowTemplateSummary } from "../../domain/v2/types";

const icons = { assistant: Bot, search: Wrench, triage: GitBranch, flow: GitBranch } as const;
const tones = { assistant: "violet", search: "slate", triage: "green", flow: "violet" } as const;

export function EmptyCanvasStart({ templates, loading, error, hasModel, onPick, onBlank, onRetry }: {
  templates: WorkflowTemplateSummary[];
  loading: boolean;
  error: string;
  hasModel: boolean;
  onPick: (template: WorkflowTemplateSummary) => void;
  onBlank: () => void;
  onRetry: () => void;
}) {
  return <div className="wf-empty-start" role="region" aria-label="从起步流程开始">
    <div className="wf-empty-start-inner">
      <h2>从一个想法开始</h2>
      <p>选一个起点，节点和连接会自动放好</p>
      {loading ? <p className="wf-empty-start-status" role="status"><Loader2 size={15} aria-hidden="true" className="wf-spin" />正在加载起步模板…</p> : error ? <div className="wf-empty-start-status is-error" role="alert"><p>起步模板暂时无法加载。</p><button type="button" onClick={onRetry}>重新加载模板</button><small>仍可从空白开始。</small></div> : templates.length ? <div className="wf-empty-start-cards">{templates.map(template => {
        const visual = startingTemplateVisual(template.definition);
        const Icon = icons[visual];
        return <button type="button" className="wf-start-card" key={template.workflowId} onClick={() => onPick(template)}>
          <span className={`wf-component-icon ${tones[visual]}`} aria-hidden="true"><Icon size={16}/></span>
          <strong>{template.name}</strong>
          <span className="wf-start-chain">{startingTemplateChain(template.definition)}</span>
          <small>{template.description}</small>
        </button>;
      })}</div> : <p className="wf-empty-start-status" role="status">暂时没有起步模板，可从空白开始。</p>}
      <button type="button" className="wf-start-blank" onClick={onBlank}>从空白开始</button>
      {hasModel ? null : <p className="wf-empty-start-note">还没有模型连接。生成后可在模型节点直接添加。</p>}
    </div>
  </div>;
}
