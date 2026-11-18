import { Check } from "lucide-react";
import type { MicroLearningPath, MicroLearningRepository, MicroStep } from "./microLearning";
import "./microStepList.css";

const kindLabel: Record<MicroStep["kind"], string> = {
  challenge: "挑战",
  feedback: "反馈",
  explanation: "讲解",
  interaction: "互动",
  application: "应用",
  check: "检查",
  summary: "小结"
};

/**
 * The real step list of a completed Micro. Learned steps get the green check
 * and open the same content in review mode; review never writes progress.
 */
export function MicroStepList({ path, repository, onSelect, title = "学习步骤", completedStepIds }: {
  path: MicroLearningPath;
  repository: MicroLearningRepository;
  onSelect(unitId: string, stepId: string): void;
  title?: string;
  /** Action-run progress lives outside the formal repository cursor. */
  completedStepIds?: ReadonlySet<string>;
}) {
  const total = path.units.reduce((sum, unit) => sum + unit.steps.length, 0);
  return <section className="ef-micro-step-list" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <span>{total} 步 · 已完成</span>
    </header>
    <div className="ef-micro-step-units">
      {path.units.map((unit) => {
        const progress = repository.getUnitProgress(unit.id);
        const unitDone = progress?.status === "completed";
        return <section className="ef-micro-step-unit" key={unit.id}>
          <h3><span>第 {unit.position + 1} 单元</span>{unit.title}</h3>
          <ol>
            {unit.steps.map((step) => {
              const learned = completedStepIds ? completedStepIds.has(step.id) : (unitDone || Boolean(progress?.completedStepIds.includes(step.id)));
              return <li key={step.id}>
                <button
                  type="button"
                  className={`ef-micro-step-row${learned ? " is-learned" : ""}`}
                  disabled={!learned}
                  onClick={() => { if (learned) onSelect(unit.id, step.id); }}
                  aria-label={`${step.title}${learned ? "，已学，点击回看" : "，未学"}`}
                >
                  <span className="ef-micro-step-check" aria-hidden="true">{learned ? <Check size={13} /> : null}</span>
                  <span className="ef-micro-step-copy"><strong>{step.title}</strong><small>{kindLabel[step.kind]}{learned ? " · 已学，点击回看" : " · 未学"}</small></span>
                </button>
              </li>;
            })}
          </ol>
        </section>;
      })}
    </div>
  </section>;
}
