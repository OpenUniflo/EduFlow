import { Trophy } from "lucide-react";
import type { ProfileAchievement } from "@/features/profile/legacyTypes";
import { AchievementBadge } from "./AchievementBadge";
import { ProfileEmptyState } from "./ProfileEmptyState";

export function AchievementWall({ achievements }: { achievements: ProfileAchievement[] }) {
  if (!achievements.length) {
    return <ProfileEmptyState message="还没有解锁徽章，完成一次任务提交后这里会自动更新。" />;
  }

  return (
    <section className="profile-section">
      <div className="profile-section-heading">
        <div className="panel-heading">
          <Trophy size={18} />
          <h3>成就徽章墙</h3>
        </div>
        <span>{achievements.filter((item) => item.status === "unlocked").length} / {achievements.length} 已解锁</span>
      </div>
      <div className="achievement-grid">
        {achievements.map((achievement) => (
          <AchievementBadge achievement={achievement} key={achievement.id} />
        ))}
      </div>
    </section>
  );
}
