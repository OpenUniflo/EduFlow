import { ArrowRight, ClipboardList, Play, Sparkles } from "lucide-react";
import type { StudentProfile } from "../../types/profile";
import { AbilityRadar } from "./AbilityRadar";

export function ProfileHero({
  profile,
  onContinueLearning,
  onOpenTasks
}: {
  profile: StudentProfile;
  onContinueLearning: () => void;
  onOpenTasks: () => void;
}) {
  const expPercent = Math.min(100, Math.round((profile.currentExp / profile.nextLevelExp) * 100));
  const mainAbilities = profile.abilities
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((ability) => ability.name);

  return (
    <header className="profile-hero glass">
      <div className="profile-identity">
        <div className="profile-avatar" aria-label={`${profile.name}头像`}>
          {profile.avatar}
        </div>
        <div>
          <div className="eyebrow">PROFILE</div>
          <h2>我的能力档案</h2>
          <p>{profile.className} · 学号 {profile.studentNo}</p>
          <div className="tag-row profile-main-tags">
            {mainAbilities.map((ability) => (
              <span key={ability}>{ability}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="profile-hero-radar glass" aria-label="能力雷达图">
        <AbilityRadar abilities={profile.abilities} />
      </div>

      <div className="profile-level-panel">
        <div className="profile-title-row">
          <Sparkles size={18} />
          <span>{profile.title}</span>
        </div>
        <strong>Lv. {profile.level}</strong>
        <div className="profile-exp-line">
          <span>{profile.currentExp} / {profile.nextLevelExp} EXP</span>
          <span>{expPercent}%</span>
        </div>
        <div className="course-progress profile-exp-bar">
          <span style={{ width: `${expPercent}%` }} />
        </div>
        <div className="profile-hero-actions">
          <button className="tool-button primary" onClick={onContinueLearning}>
            <Play size={16} />
            继续学习
          </button>
          <button className="tool-button" onClick={onOpenTasks}>
            <ClipboardList size={16} />
            查看任务
          </button>
        </div>
      </div>

      <div className="profile-crest" aria-label="角色统计">
        <div>
          <span>总经验</span>
          <strong>{profile.totalExp}</strong>
        </div>
        <div>
          <span>学习天数</span>
          <strong>{profile.learningDays}</strong>
        </div>
        <button className="profile-crest-link" onClick={onContinueLearning} aria-label="继续学习">
          <ArrowRight size={18} />
        </button>
      </div>
    </header>
  );
}
