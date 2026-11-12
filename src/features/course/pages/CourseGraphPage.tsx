import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { canDesignCourse } from "@/features/auth/capabilities";
import type { MockSession } from "@/features/auth/types";
import type { MicroLearningProvider } from "@/features/learning/micro/microLearning";
import type { CourseDesignAssistantProvider } from "@/features/course/courseDesignAssistant";
import { readCourseEnterSnapshot } from "../immersive/courseTransition";
import { CourseLearnerRoutePage } from "./CourseLearnerRoutePage";
import { CoursePageHeader } from "./CoursePageHeader";
import { buildCourseHeaderModel } from "./courseHeaderModel";
import { courseViewFromSearch, courseViewSearch, resolveCourseEntry, type CourseView } from "./courseEntry";
import "./coursePage.css";

export type CourseGraphPageProps = {
  session: MockSession | null;
  onLogout: () => void;
  courseDesignAssistantProvider?: CourseDesignAssistantProvider;
  microLearningProvider?: MicroLearningProvider;
};

// The learner scene must not pull React Flow into its chunk, and the studio may
// not pull three.js into its chunk. Both are route-level async boundaries.
const LearnerCourseImmersivePage = lazy(() => import("../immersive/CourseImmersivePage"));
const CourseStudioPage = lazy(() => import("./CourseStudioPage").then((module) => ({ default: module.CourseStudioPage })));

function CourseRouteLoading({ courseId }: { courseId: string }) {
  const snapshot = readCourseEnterSnapshot(courseId);
  return <main
    role="status"
    aria-label="正在打开课程"
    style={{
      height: "100%",
      minHeight: 0,
      background: "radial-gradient(90% 72% at 18% 8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%), radial-gradient(86% 66% at 82% 16%, color-mix(in srgb, var(--acquired) 18%, transparent), transparent 72%), linear-gradient(145deg, color-mix(in srgb, var(--brand) 8%, var(--page)), color-mix(in srgb, var(--p-cyan) 8%, var(--page)))"
    }}
  >
    {/* The route chunk may still be loading after the Archive unmounts. Keep its
        card rectangles on screen so the hand-off never flashes an empty page. */}
    {snapshot?.cards.map((card) => <div key={card.id} aria-hidden="true" style={{
      position: "fixed",
      left: card.left,
      top: card.top,
      width: card.width,
      height: card.height,
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: "6px 10px",
      border: "1px solid color-mix(in srgb, var(--line-strong) 74%, transparent)",
      borderRadius: 12,
      color: "var(--ink)",
      background: "color-mix(in srgb, var(--surface) 94%, transparent)",
      boxShadow: "var(--sh-1)",
      fontSize: 14,
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      overflow: "hidden",
      zIndex: 60
    }}>
      <span style={{ width: 8, height: 8, flex: "0 0 8px", borderRadius: 99, background: card.status === "completed" || card.status === "learned" || card.status === "mastered" ? "var(--acquired)" : "var(--muted)" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{card.title}</span>
    </div>)}
  </main>;
}

/**
 * `/courses/:courseId` keeps one route with two non-overlapping renderers:
 * learner immersive scenes (three.js) and the authoring studio (React Flow).
 * A session never switches renderer inside a running view.
 *
 * Both learner views share the one CoursePageHeader mounted here. Changing
 * `?view=course` therefore swaps only the body underneath it.
 */
export function CourseGraphPage(props: CourseGraphPageProps) {
  const { courseId = "", chapterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [headerRevision, setHeaderRevision] = useState(0);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setHeaderRevision((value) => value + 1)), []);
  const designRoute = searchParams.get("experience") === "design";
  const design = designRoute && canDesignCourse(props.session);
  const view = courseViewFromSearch(location.search);
  const entry = useMemo(() => resolveCourseEntry(location.state, courseId), [courseId, location.state]);
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const headerModel = useMemo(() => {
    if (!runtime) return null;
    const records = props.session ? applicationServices.userKnowledgeRepository.getUserKnowledge(props.session.userId) : [];
    return buildCourseHeaderModel(runtime, records);
  }, [headerRevision, props.session, runtime]);

  const changeView = (next: CourseView) => {
    if (next === view) return;
    setSearchParams(courseViewSearch(location.search, next), { state: location.state });
  };

  if (design) {
    return (
      <Suspense fallback={<CourseRouteLoading courseId={courseId} />}>
        <CourseStudioPage key={`studio:${courseId}:${props.session?.userId ?? "anonymous"}`} {...props} />
      </Suspense>
    );
  }

  // Missing/foreign Courses render the route surface's own Not Found state.
  if (!runtime || !headerModel) {
    return <CourseLearnerRoutePage courseId={courseId} focusChapterId={chapterId} session={props.session} />;
  }

  return (
    <div className="ef-course-page" data-view={view}>
      <div className="ef-course-page-header-region">
        <CoursePageHeader
          courseTitle={runtime.course.title}
          model={headerModel}
          authenticated={Boolean(props.session)}
          view={view}
          backLabel={entry.label}
          onBack={() => navigate(entry.returnTo)}
          onViewChange={changeView}
        />
      </div>
      <div className={`ef-course-page-body is-${view}`}>
        {view === "tree" ? (
          <Suspense fallback={<CourseRouteLoading courseId={courseId} />}>
            <LearnerCourseImmersivePage
              key={`learn:${courseId}:${props.session?.userId ?? "anonymous"}`}
              session={props.session}
              onLogout={props.onLogout}
              microLearningProvider={props.microLearningProvider}
              onBack={() => navigate(entry.returnTo)}
            />
          </Suspense>
        ) : (
          <CourseLearnerRoutePage courseId={courseId} focusChapterId={chapterId} session={props.session} />
        )}
      </div>
    </div>
  );
}
