import { Target } from "lucide-react";
import type { ProfileRecommendation } from "@/features/profile/legacyTypes";
import { ProfileEmptyState } from "./ProfileEmptyState";

export function RecommendationPanel({
  recommendations,
  onNavigate
}: {
  recommendations: ProfileRecommendation[];
  onNavigate: (targetUrl: string) => void;
}) {
  if (!recommendations.length) {
    return <ProfileEmptyState message="暂时没有新的推荐方向，保持当前学习节奏即可。" />;
  }

  return (
    <section className="profile-side-card glass">
      <div className="profile-section-heading compact">
        <div className="panel-heading">
          <Target size={18} />
          <h3>推荐提升</h3>
        </div>
      </div>
      <div className="recommendation-list">
        {recommendations.map((item) => (
          <article className="recommendation-card" key={item.id}>
            <span>{item.targetAbility}</span>
            <h4>{item.title}</h4>
            <p>{item.reason}</p>
            <button className="tool-button primary" onClick={() => onNavigate(item.targetUrl)}>
              {item.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
