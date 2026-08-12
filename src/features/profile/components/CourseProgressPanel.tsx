import { ArrowRight, BookOpen } from "lucide-react";
import type { ProfileCourseProgress } from "@/features/profile/legacyTypes";
import { ProfileEmptyState } from "./ProfileEmptyState";

function courseStatusLabel(status: ProfileCourseProgress["status"]) {
  if (status === "completed") return "已完成";
  if (status === "learning") return "学习中";
  return "未开始";
}

export function CourseProgressPanel({
  courses,
  onOpenCourse
}: {
  courses: ProfileCourseProgress[];
  onOpenCourse: (courseId: string) => void;
}) {
  if (!courses.length) {
    return <ProfileEmptyState message="还没有课程进度，开始一门课程后这里会自动更新。" />;
  }

  return (
    <section className="profile-side-card glass">
      <div className="profile-section-heading compact">
        <div className="panel-heading">
          <BookOpen size={18} />
          <h3>课程进度</h3>
        </div>
      </div>
      <div className="profile-course-list">
        {courses.map((course) => (
          <article className="profile-course-item" key={course.courseId}>
            <div className="profile-course-head">
              <h4>{course.courseTitle}</h4>
              <span className={`course-status ${course.status}`}>{courseStatusLabel(course.status)}</span>
            </div>
            <div className="profile-course-meta">
              <span>章节 {course.completedChapters} / {course.chapterCount}</span>
              <span>任务 {course.completedTasks} / {course.taskCount}</span>
              <span>{course.progress}%</span>
            </div>
            <div className="course-progress">
              <span style={{ width: `${course.progress}%` }} />
            </div>
            <div className="tag-row">
              {course.mainAbilities.map((ability) => (
                <span key={ability}>{ability}</span>
              ))}
            </div>
            <button className="tool-button" onClick={() => onOpenCourse(course.courseId)}>
              {course.status === "learning" ? "继续学习" : "查看课程"}
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
