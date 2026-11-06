import { ArrowLeft, Home, Network, Route } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { createMicroLearningNavigation } from "@/features/learning/micro/microLearning";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { buildHomeCourseProjection, type HomeMicroAsset } from "../path/courseLearnerProjection";
import { CourseRoutePanel, type CourseRouteStepAction } from "../path/CourseRoutePanel";
import "../path/coursePath.css";

/**
 * The default learner Course page: a normal route document. It reads the same
 * navigation decision as Home and never mounts the three.js scene. The Course
 * tree is a user action and loads its own chunk.
 */
export function CourseLearnerRoutePage({ courseId, session, onOpenTree }: {
  courseId: string;
  session: MockSession | null;
  onOpenTree(): void;
}) {
  const navigate = useNavigate();
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

  if (!runtime) return <main className="ef-course-route-page"><section className="ef-course-route-missing" role="status"><h1>没有找到这门课程</h1><p>课程可能已下架，或链接不完整。</p><button type="button" className="ef-ui-btn ef-ui-btn--secondary" onClick={() => navigate("/")}><Home size={14} />回到首页</button></section></main>;

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

  return <main className="ef-course-route-page">
    <header className="ef-course-route-top">
      <button type="button" className="ef-course-route-back" onClick={() => navigate("/")} aria-label="回到首页"><ArrowLeft size={16} /><span>首页</span></button>
      <div className="ef-course-route-title">
        <span>课程</span>
        <h1>{courseTitle}</h1>
        <p>{runtime.chapters.length} 章 · {new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId)).size} 个要点{authenticated ? "" : " · 登录后可查看学习状态"}</p>
      </div>
      <nav className="ef-course-route-tabs" aria-label="课程视图">
        <button type="button" role="tab" aria-selected className="is-on"><Route size={14} />路线</button>
        <button type="button" role="tab" aria-selected={false} onClick={onOpenTree}><Network size={14} />课程树</button>
      </nav>
    </header>
    {decisionError ? <p className="ef-course-route-error" role="alert">下一步暂时无法读取；路线仍可按课程顺序查看。<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></p> : null}
    {projection ? <CourseRoutePanel
      projection={projection}
      decision={decision}
      courseTitle={courseTitle}
      showHeader={false}
      onSelect={openAction}
      onStart={openAction}
    /> : <section className="ef-course-route-empty" role="status">
      <p>{authenticated ? "正在准备你的学习路线…" : "登录后可以查看学习状态和下一步。"}</p>
      {!authenticated ? <button type="button" className="ef-ui-btn ef-ui-btn--primary" onClick={() => navigate("/login", { state: { from: window.location.pathname } })}>登录</button> : null}
    </section>}
    <footer className="ef-course-route-foot">
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => navigate("/")}><Home size={13} />回到首页</button>
      <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onOpenTree}><Network size={13} />看课程结构</button>
    </footer>
  </main>;
}
