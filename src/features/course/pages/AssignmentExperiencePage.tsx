import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import type { MockSession } from "@/features/auth/types";
import { authGateState } from "@/features/auth/authRedirect";
import { PracticeObject } from "@/features/course/practice/PracticeObject";
import { Button } from "@/shared/ui/Button";

/**
 * Immersive Assignment route. The component is the same practice object used
 * by the Home side panel; only the Object Shell size changes.
 */
export function AssignmentExperiencePage({ session, onLogout: _onLogout }: { session: MockSession | null; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId = "", assignmentId = "" } = useParams();
  const requestedReturn = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof requestedReturn === "string" && /^\/(?!\/)/.test(requestedReturn) ? requestedReturn : `/courses/${encodeURIComponent(courseId)}`;
  if (!session) {
    return <main className="ef-practice-page">
      <section className="ef-practice-disabled ef-practice-auth-card" aria-label="需要登录">
        <Lock size={22} aria-hidden="true" />
        <div><strong>登录后才能提交实践</strong><p>登录后会回到当前实践；已保存的学习进度不受影响。</p></div>
        <div className="ef-practice-auth-actions">
          <Button variant="primary" onClick={() => navigate("/login", { state: authGateState(location) })}>去登录</Button>
          <Button variant="secondary" onClick={() => navigate(`/courses/${encodeURIComponent(courseId)}`)}>返回课程</Button>
        </div>
      </section>
    </main>;
  }
  return <PracticeObject
    session={session}
    courseId={courseId}
    assignmentId={assignmentId}
    size="immersive"
    onReturn={() => navigate(returnTo)}
  />;
}
