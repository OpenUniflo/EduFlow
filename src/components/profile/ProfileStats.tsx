import { BarChart3, BookOpen, CheckCircle2, GitBranch, ListChecks, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StudentProfile } from "../../types/profile";

const stats: Array<{ key: keyof Pick<StudentProfile, "completedCourses" | "completedChapters" | "completedTasks" | "builtWorkflows" | "successfulRuns" | "averageScore">; label: string; note: string; icon: LucideIcon }> = [
  { key: "completedCourses", label: "已完成课程", note: "完成整门课程", icon: BookOpen },
  { key: "completedChapters", label: "已完成章节", note: "章节学习进度", icon: ListChecks },
  { key: "completedTasks", label: "已完成任务", note: "实训提交记录", icon: CheckCircle2 },
  { key: "builtWorkflows", label: "构建工作流", note: "画布创建次数", icon: GitBranch },
  { key: "successfulRuns", label: "成功运行", note: "通过运行检查", icon: BarChart3 },
  { key: "averageScore", label: "平均得分", note: "已评分任务均分", icon: Trophy }
];

export function ProfileStats({ profile }: { profile: StudentProfile }) {
  return (
    <section className="profile-stat-grid" aria-label="核心统计">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <article className="profile-stat-card glass" key={stat.key}>
            <Icon size={18} />
            <div>
              <strong>{profile[stat.key]}</strong>
              <span>{stat.label}</span>
              <small>{stat.note}</small>
            </div>
          </article>
        );
      })}
    </section>
  );
}
