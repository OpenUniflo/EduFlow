import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { canDesignCourse } from "@/features/auth/capabilities";
import type { MockSession } from "@/features/auth/types";
import type { MicroLearningProvider } from "@/features/learning/micro/microLearning";
import type { CourseDesignAssistantProvider } from "@/features/course/courseDesignAssistant";

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

function CourseRouteLoading() {
  return <main className="ef-imm-route-loading" role="status" aria-label="正在打开课程">正在展开课程结构…</main>;
}

/**
 * `/courses/:courseId` keeps one route with two non-overlapping renderers:
 * learner immersive scenes (three.js) and the authoring studio (React Flow).
 * A session never switches renderer inside a running view.
 */
export function CourseGraphPage(props: CourseGraphPageProps) {
  const { courseId = "" } = useParams();
  const designRoute = new URLSearchParams(window.location.search).get("experience") === "design";
  const design = designRoute && canDesignCourse(props.session);
  return (
    <Suspense fallback={<CourseRouteLoading />}>
      {design
        ? <CourseStudioPage key={`studio:${courseId}:${props.session?.userId ?? "anonymous"}`} {...props} />
        : <LearnerCourseImmersivePage key={`learn:${courseId}:${props.session?.userId ?? "anonymous"}`} session={props.session} onLogout={props.onLogout} microLearningProvider={props.microLearningProvider} />}
    </Suspense>
  );
}
