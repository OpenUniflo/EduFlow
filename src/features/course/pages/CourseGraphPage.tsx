import { lazy, Suspense } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { canDesignCourse } from "@/features/auth/capabilities";
import type { MockSession } from "@/features/auth/types";
import type { MicroLearningProvider } from "@/features/learning/micro/microLearning";
import type { CourseDesignAssistantProvider } from "@/features/course/courseDesignAssistant";
import { readCourseEnterSnapshot } from "../immersive/courseTransition";
import { CourseLearnerRoutePage } from "./CourseLearnerRoutePage";

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
      minHeight: "100dvh",
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
 */
export function CourseGraphPage(props: CourseGraphPageProps) {
  const { courseId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const designRoute = searchParams.get("experience") === "design";
  const design = designRoute && canDesignCourse(props.session);
  const tree = searchParams.get("view") === "course";
  if (!design && !tree) {
    return <CourseLearnerRoutePage
      courseId={courseId}
      session={props.session}
      onOpenTree={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("view", "course"); return next; })}
    />;
  }
  return (
    <Suspense fallback={<CourseRouteLoading courseId={courseId} />}>
      {design
        ? <CourseStudioPage key={`studio:${courseId}:${props.session?.userId ?? "anonymous"}`} {...props} />
        : <LearnerCourseImmersivePage key={`learn:${courseId}:${props.session?.userId ?? "anonymous"}`} session={props.session} onLogout={props.onLogout} microLearningProvider={props.microLearningProvider} initialView="course" hideRouteView onBackToRoute={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete("view"); return next; })} />}
    </Suspense>
  );
}
