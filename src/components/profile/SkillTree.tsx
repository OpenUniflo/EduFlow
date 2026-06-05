import { GitBranch } from "lucide-react";
import type { ProfileSkillModule } from "../../types/profile";
import { ProfileEmptyState } from "./ProfileEmptyState";
import { SkillTreeModule } from "./SkillTreeModule";

export function SkillTree({ modules }: { modules: ProfileSkillModule[] }) {
  if (!modules.length) {
    return <ProfileEmptyState message="还没有技能树数据，完成一个实训任务后这里会自动更新。" />;
  }

  return (
    <section className="profile-section">
      <div className="profile-section-heading">
        <div className="panel-heading">
          <GitBranch size={18} />
          <h3>技能树</h3>
        </div>
        <span>点击技能点查看详情</span>
      </div>
      <div className="skill-tree-grid">
        {modules.map((module) => (
          <SkillTreeModule module={module} key={module.id} />
        ))}
      </div>
    </section>
  );
}
