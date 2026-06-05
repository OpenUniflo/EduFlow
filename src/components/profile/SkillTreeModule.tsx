import { Check, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ProfileSkillModule as ProfileSkillModuleType } from "../../types/profile";

function statusIcon(status: string) {
  if (status === "mastered") return <Check size={15} />;
  if (status === "locked") return <Lock size={15} />;
  return <Sparkles size={15} />;
}

function statusLabel(status: string) {
  if (status === "mastered") return "已掌握";
  if (status === "locked") return "未解锁";
  return "已解锁";
}

export function SkillTreeModule({ module }: { module: ProfileSkillModuleType }) {
  const [openSkillId, setOpenSkillId] = useState<string | null>(module.skills[0]?.id ?? null);

  return (
    <article className="skill-module glass">
      <h4>{module.title}</h4>
      <div className="skill-list">
        {module.skills.map((skill) => {
          const open = openSkillId === skill.id;
          return (
            <button
              type="button"
              className={`skill-node ${skill.status} ${open ? "open" : ""}`}
              key={skill.id}
              onClick={() => setOpenSkillId(open ? null : skill.id)}
              aria-expanded={open}
            >
              <div className="skill-node-main">
                <span>{statusIcon(skill.status)}</span>
                <div>
                  <strong>{skill.title}</strong>
                  <small>{statusLabel(skill.status)} · Lv. {skill.requiredLevel} · {skill.relatedAbility}</small>
                </div>
              </div>
              <div className="course-progress skill-progress">
                <span style={{ width: `${skill.progress}%` }} />
              </div>
              {open ? (
                <div className="skill-detail">
                  <p>{skill.description}</p>
                  <span>推荐：{skill.recommendation}</span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </article>
  );
}
