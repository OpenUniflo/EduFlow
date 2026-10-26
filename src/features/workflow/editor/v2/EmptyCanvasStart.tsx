import { Bot, GitBranch, Wrench } from "lucide-react";
import { startingTemplateCards, type StartingTemplateKind } from "../../domain/v2/startingTemplates";

const icons = { assistant: Bot, search: Wrench, triage: GitBranch } as const;
const tones = { assistant: "violet", search: "slate", triage: "green" } as const;

export function EmptyCanvasStart({ hasModel, onPick, onBlank }: { hasModel: boolean; onPick: (kind: StartingTemplateKind) => void; onBlank: () => void }) {
  return <div className="wf-empty-start" role="region" aria-label="从起步流程开始">
    <div className="wf-empty-start-inner">
      <h2>从一个想法开始</h2>
      <p>选一个起点，节点和连接会自动放好</p>
      <div className="wf-empty-start-cards">{startingTemplateCards.map(card => {
        const Icon = icons[card.kind];
        return <button type="button" className="wf-start-card" key={card.kind} onClick={() => onPick(card.kind)}>
          <span className={`wf-component-icon ${tones[card.kind]}`} aria-hidden="true"><Icon size={16}/></span>
          <strong>{card.title}</strong>
          <span className="wf-start-chain">{card.chain}</span>
          <small>{card.description}</small>
        </button>;
      })}</div>
      <button type="button" className="wf-start-blank" onClick={onBlank}>从空白开始</button>
      {hasModel ? null : <p className="wf-empty-start-note">还没有模型连接。生成后可在模型节点直接添加。</p>}
    </div>
  </div>;
}
