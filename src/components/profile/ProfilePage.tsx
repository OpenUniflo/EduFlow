import type { StudentProfile } from "../../types/profile";
import { AbilityPanel } from "./AbilityPanel";
import { AchievementWall } from "./AchievementWall";
import { CourseProgressPanel } from "./CourseProgressPanel";
import { GrowthTimeline } from "./GrowthTimeline";
import { ProfileHero } from "./ProfileHero";
import { ProfileStats } from "./ProfileStats";

function getContinueCourseId(profile: StudentProfile) {
  const learningCourses = profile.courseProgress
    .filter((course) => course.status === "learning")
    .sort((left, right) => right.progress - left.progress);
  const nextCourse = learningCourses[0] ?? profile.courseProgress.find((course) => course.status !== "completed") ?? profile.courseProgress[0];
  return nextCourse?.courseId;
}

export function ProfilePage({
  profile,
  onOpenCourse,
  onOpenTasks,
  onNavigateTarget
}: {
  profile: StudentProfile;
  onOpenCourse: (courseId: string) => void;
  onOpenTasks: () => void;
  onNavigateTarget: (targetUrl: string) => void;
}) {
  function continueLearning() {
    const courseId = getContinueCourseId(profile);
    if (courseId) {
      onOpenCourse(courseId);
      return;
    }
    onNavigateTarget("/courses");
  }

  return (
    <>
      <ProfileHero profile={profile} onContinueLearning={continueLearning} onOpenTasks={onOpenTasks} />
      <ProfileStats profile={profile} />
      <AbilityPanel abilities={profile.abilities} skillModules={profile.skillTree} />
      <CourseProgressPanel courses={profile.courseProgress} onOpenCourse={onOpenCourse} />
      <AchievementWall achievements={profile.achievements} />
      <GrowthTimeline logs={profile.recentGrowthLogs} />
    </>
  );
}
