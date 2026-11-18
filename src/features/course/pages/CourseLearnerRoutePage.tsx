import { Home } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { createMicroLearningNavigation } from "@/features/learning/micro/microLearning";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { buildHomeCourseProjection, type HomeMicroAsset } from "../path/courseLearnerProjection";
import { CourseRoutePanel, type CourseRouteStepAction } from "../path/CourseRoutePanel";
import "../path/coursePath.css";

/**
 * The default learner Course page body: a normal route document. It reads the
 * same navigation decision as Home and never mounts the three.js scene. The
 * shared CoursePageHeader owns the view switch and the back target.
 */
export function CourseLearnerRoutePage({ courseId, focusChapterId, session }: {
  courseId: string;
  focusChapterId?: string;
  session: MockSession | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<NavigationDecision | null>(null);
  const [decisionError, setDecisionError] = useState(false);
  const runtime = applicationServices.courseRepository.getCourse(courseId);

  useEffect(() => applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    if (!session) { setDecision(null); return; }
    let live = true;
    setDecisionError(false);
    void applicationServices.learnerStateService.getNavigation(courseId)
      .then((value) => { if (live) setDecision(value); })
      .catch(() => { if (live) { setDecision(null); setDecisionError(true); } });
    return () => { live = false; };
  }, [courseId, revision, session]);

  const graph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(session ? userKnowledgeAccess(session.userId) : { visibleScopes: ["global"] }), [revision, session]);
  const records = useMemo(() => session ? applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId) : [], [revision, session]);
  const courseState = session
    ? applicationServices.learningProgressRepository.getCourseState(session.userId, courseId)
    : { userId: "", courseId, isActive: false, assignmentStates: {}, materialStates: {}, updatedAt: "" };

  const focusNodeId = useMemo(() => {
    if (!focusChapterId || !runtime) return undefined;
    const lessonIds = new Set(runtime.lessons.filter((lesson) => lesson.chapterId === focusChapterId).map((lesson) => lesson.id));
    return runtime.curriculumCoverages.find((coverage) => lessonIds.has(coverage.lessonId))?.nodeId;
  }, [focusChapterId, runtime]);

  const projection = useMemo(() => {
    if (!runtime) return null;
    const titles = new Map(graph.nodes.map((node) => [node.id, node.title]));
    return buildHomeCourseProjection({
      runtime,
      records,
      courseState,
      decision,
      microFor: (nodeId): HomeMicroAsset | undefined => {
        const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId, mode: "learn" });
        return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
      },
      titleFor: (nodeId) => titles.get(nodeId)
    });
  }, [courseId, courseState, decision, graph.nodes, records, revision, runtime]);

  if (!runtime) return <section className="ef-course-route-missing" role="status"><h1>没有找到这门课程</h1><p>课程可能已下架，或链接不完整。</p><button type="button" className="ef-ui-btn ef-ui-btn--secondary" onClick={() => navigate("/")}><Home size={14} />回到首页</button></section>;

  const courseTitle = runtime.course.title;
  const authenticated = Boolean(session);

  function openAction(action: CourseRouteStepAction) {
    const returnTo = `/courses/${encodeURIComponent(courseId)}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (action.kind === "micro" && action.pathId) {
      const target = createMicroLearningNavigation(action.nodeId, { courseId, returnTo });
      navigate(target.to, { state: target.state });
      return;
    }
    if (action.kind === "practice" && action.assignmentId) {
      navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(action.assignmentId)}`, { state: { returnTo } });
    }
  }

  return <section className="ef-course-route-content" aria-label={`${courseTitle}路线`}>
    {decisionError ? <p className="ef-course-route-error" role="alert">下一步暂时无法读取；路线仍可按课程顺序查看。<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></p> : null}
    {projection ? <CourseRoutePanel
      projection={projection}
      decision={decision}
      courseTitle={courseTitle}
      showHeader={false}
      mode="page"
      focusNodeId={focusNodeId}
      onSelect={() => undefined}
      onStart={openAction}
    /> : <section className="ef-course-route-empty" role="status">
      <p>{authenticated ? "正在准备你的学习路线…" : "登录后可以查看学习状态和下一步。"}</p>
      {!authenticated ? <button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={() => navigate("/login", { state: { from: window.location.pathname } })}>登录</button> : null}
    </section>}
  </section>;
}
