import { useNavigate, useParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { PracticeObject } from "@/features/course/practice/PracticeObject";

/**
 * Immersive Assignment route. The component is the same practice object used
 * by the Home side panel; only the Object Shell size changes.
 */
export function AssignmentExperiencePage({ session, onLogout: _onLogout }: { session: MockSession | null; onLogout: () => void }) {
  const navigate = useNavigate();
  const { courseId = "", assignmentId = "" } = useParams();
  if (!session) {
    return <main className="ef-practice-page"><section className="ef-practice-disabled"><strong>登录后才能提交实践</strong><button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={() => navigate(`/courses/${encodeURIComponent(courseId)}`)}>返回课程</button></section></main>;
  }
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  return <PracticeObject
    session={session}
    courseId={courseId}
    assignmentId={assignmentId}
    size="immersive"
    onReturn={() => navigate(runtime ? `/courses/${encodeURIComponent(courseId)}` : "/")}
  />;
}
