import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Lock, Minus, Sparkles } from "lucide-react";
import type { ProfileAbility, ProfileSkill } from "@/features/profile/legacyTypes";

function trendLabel(trend: ProfileAbility["trend"]) {
  if (trend === "up") return "上升";
  if (trend === "down") return "需关注";
  return "稳定";
}

function TrendIcon({ trend }: { trend: ProfileAbility["trend"] }) {
  if (trend === "up") return <ArrowUpRight size={15} />;
  if (trend === "down") return <ArrowDownRight size={15} />;
  return <Minus size={15} />;
}

function skillStatusIcon(status: ProfileSkill["status"]) {
  if (status === "mastered") return <Check size={14} />;
  if (status === "locked") return <Lock size={14} />;
  return <Sparkles size={14} />;
}

function skillStatusLabel(status: ProfileSkill["status"]) {
  if (status === "mastered") return "已掌握";
  if (status === "locked") return "未解锁";
  return "已解锁";
}

type AbilitySkill = ProfileSkill & { moduleTitle: string };

export function AbilityCard({
  ability,
  expanded,
  onToggle,
  skills
}: {
  ability: ProfileAbility;
  expanded: boolean;
  onToggle: () => void;
  skills: AbilitySkill[];
}) {
  const valuePercent = Math.min(100, Math.round((ability.value / ability.maxValue) * 100));
  const expPercent = Math.min(100, Math.round((ability.exp / ability.nextExp) * 100));

  return (
    <article className={`ability-card glass trend-${ability.trend} ${expanded ? "expanded" : ""}`} title={`来源：${ability.sourceCourses.join("、")}；${ability.recentGain}`}>
      <div className="ability-card-head">
        <div>
          <span>Lv. {ability.level}</span>
          <h4>{ability.name}</h4>
        </div>
        <div className="ability-trend">
          <TrendIcon trend={ability.trend} />
          {trendLabel(ability.trend)}
        </div>
      </div>
      <p>{ability.description}</p>
      <div className="ability-value-row">
        <strong>{ability.value} / {ability.maxValue}</strong>
        <span>{ability.recentGain}</span>
      </div>
      <div className="course-progress ability-progress">
        <span style={{ width: `${valuePercent}%` }} />
      </div>
      <div className="ability-exp-row">
        <span>经验 {ability.exp} / {ability.nextExp}</span>
        <span>{expPercent}%</span>
      </div>
      <div className="tag-row ability-source-row">
        {ability.sourceCourses.map((course) => (
          <span key={course}>{course}</span>
        ))}
      </div>
      <button className="ability-expand-button" onClick={onToggle} aria-expanded={expanded}>
        <span>{expanded ? "收起技能树" : `展开技能树 · ${skills.length}`}</span>
        <ChevronDown size={16} />
      </button>
      {expanded ? (
        <div className="ability-skill-tree">
          {skills.length ? (
            skills.map((skill) => (
              <div className={`ability-skill-node ${skill.status}`} key={skill.id}>
                <div className="ability-skill-head">
                  <span>{skillStatusIcon(skill.status)}</span>
                  <div>
                    <strong>{skill.title}</strong>
                    <small>{skill.moduleTitle} · {skillStatusLabel(skill.status)} · Lv. {skill.requiredLevel}</small>
                  </div>
                </div>
                <p>{skill.description}</p>
                <div className="course-progress skill-progress">
                  <span style={{ width: `${skill.progress}%` }} />
                </div>
              </div>
            ))
          ) : (
            <div className="ability-skill-empty">这个能力暂时没有关联技能点。</div>
          )}
        </div>
      ) : null}
    </article>
  );
}
