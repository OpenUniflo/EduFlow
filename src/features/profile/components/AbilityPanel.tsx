import { Activity } from "lucide-react";
import { useState } from "react";
import type { ProfileAbility, ProfileSkillModule } from "@/features/profile/legacyTypes";
import { AbilityCard } from "./AbilityCard";
import { ProfileEmptyState } from "./ProfileEmptyState";

function skillsForAbility(modules: ProfileSkillModule[], abilityName: string) {
  return modules.flatMap((module) =>
    module.skills
      .filter((skill) => skill.relatedAbility === abilityName)
      .map((skill) => ({ ...skill, moduleTitle: module.title }))
  );
}

export function AbilityPanel({ abilities, skillModules }: { abilities: ProfileAbility[]; skillModules: ProfileSkillModule[] }) {
  const [expandedAbilityId, setExpandedAbilityId] = useState<string | null>(abilities[0]?.id ?? null);

  if (!abilities.length) {
    return (
      <section className="profile-section">
        <ProfileEmptyState message="还没有能力数据，完成课程章节后这里会自动更新。" />
      </section>
    );
  }

  return (
    <section className="profile-section profile-ability-section">
      <div className="profile-section-heading">
        <div className="panel-heading">
          <Activity size={18} />
          <h3>能力分布</h3>
        </div>
        <span>6 项核心能力</span>
      </div>
      <div className="profile-ability-layout">
        <div className="ability-list">
          {abilities.map((ability) => {
            const abilitySkills = skillsForAbility(skillModules, ability.name);
            const expanded = expandedAbilityId === ability.id;
            return (
              <AbilityCard
                ability={ability}
                expanded={expanded}
                key={ability.id}
                onToggle={() => setExpandedAbilityId(expanded ? null : ability.id)}
                skills={abilitySkills}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
