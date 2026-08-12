import { Clock } from "lucide-react";
import type { ProfileGrowthLog } from "@/features/profile/legacyTypes";
import { ProfileEmptyState } from "./ProfileEmptyState";

const sourceLabels: Record<ProfileGrowthLog["sourceType"], string> = {
  course: "课程",
  task: "任务",
  workflow: "工作流",
  run: "运行"
};

export function GrowthTimeline({ logs }: { logs: ProfileGrowthLog[] }) {
  if (!logs.length) {
    return <ProfileEmptyState />;
  }

  return (
    <section className="profile-section">
      <div className="profile-section-heading">
        <div className="panel-heading">
          <Clock size={18} />
          <h3>近期成长记录</h3>
        </div>
      </div>
      <div className="growth-timeline">
        {logs.map((log) => (
          <article className="growth-item glass" key={log.id}>
            <div className="growth-date">{log.date}</div>
            <div className="growth-dot" aria-hidden="true" />
            <div className="growth-content">
              <div className="growth-head">
                <h4>{log.title}</h4>
                <strong>{log.ability} +{log.gain}</strong>
              </div>
              <p>{log.description}</p>
              <span>{sourceLabels[log.sourceType]} · {log.sourceTitle}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
