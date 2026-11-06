import { Check } from "lucide-react";
import type { MicroLearningPath, MicroLearningRepository } from "./microLearning";
import "./microImmersive.css";

/** Read-only unit rail. It mirrors persisted progress; it never writes completion. */
export function MicroUnitRail({ path, currentUnitId, repository }: {
  path: MicroLearningPath;
  currentUnitId?: string;
  repository: MicroLearningRepository;
}) {
  return (
    <nav className="ef-micro-rail" aria-label="单元路径">
      <div className="ef-micro-rail-head">
        <span>{path.title}</span>
        <small>{path.units.length} 个单元 · 约 {path.estimatedMinutes} 分钟</small>
      </div>
      <ol>
        {path.units.map((unit) => {
          const progress = repository.getUnitProgress(unit.id);
          const complete = progress?.status === "completed";
          const current = unit.id === currentUnitId;
          return (
            <li key={unit.id} className={current ? "is-current" : complete ? "is-done" : ""}>
              <span className="ef-micro-rail-index" aria-hidden="true">{complete ? <Check size={13} /> : unit.position + 1}</span>
              <span className="ef-micro-rail-copy">
                <strong>{unit.title}</strong>
                <small>{complete ? "已完成" : current ? "进行中" : "未开始"} · {unit.estimatedMinutes} 分钟</small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="ef-micro-rail-note">关闭工作区不会丢进度。已完成。</p>
    </nav>
  );
}
