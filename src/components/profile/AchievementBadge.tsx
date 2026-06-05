import type { ProfileAchievement } from "../../types/profile";

export function AchievementBadge({ achievement }: { achievement: ProfileAchievement }) {
  return (
    <article
      className={`achievement-badge glass ${achievement.status} rarity-${achievement.rarity}`}
      title={`${achievement.description} 来源：${achievement.source}`}
      tabIndex={0}
    >
      <div className="achievement-icon">{achievement.icon}</div>
      <div>
        <h4>{achievement.title}</h4>
        <p>{achievement.description}</p>
        <span>{achievement.status === "unlocked" ? achievement.unlockedAt : "未解锁"} · {achievement.rarity}</span>
      </div>
    </article>
  );
}
