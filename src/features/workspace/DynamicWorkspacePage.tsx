import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import type { MockSession } from "@/features/auth/types";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import { resolveNodeDomain } from "@/features/knowledge/domain/domainResolution";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { satisfiesTeachingPrerequisite } from "@/shared/learning/teachingPrerequisites";
import { laneColumns, mapLands, markChapters, type PlaceState, type WorkspaceChapter } from "./workspaceModel";
import "./dynamicWorkspace.css";

type PageId = "work" | "progress" | "resources" | "ability";
type GraphId = "map" | "path" | "lanes";
const pages: Array<[PageId, string]> = [["work", "工作台"], ["progress", "目标与进展"], ["resources", "资源中心"], ["ability", "能力"]];
const graphs: Array<[GraphId, string]> = [["map", "知识世界"], ["path", "能力路线"], ["lanes", "课程泳道"]];

function chaptersOf(runtime: CourseRuntimeData): WorkspaceChapter[] {
  return runtime.chapters.map((chapter) => {
    const lessonIds = new Set(runtime.lessons.filter((lesson) => lesson.chapterId === chapter.id).map((lesson) => lesson.id));
    const nodeIds = [...new Set(runtime.curriculumCoverages.filter((coverage) => lessonIds.has(coverage.lessonId)).map((coverage) => coverage.nodeId))];
    return { id: chapter.id, title: chapter.title, order: chapter.order, nodeIds };
  });
}

export function DynamicWorkspacePage({ session }: { session: MockSession }) {
  const navigate = useNavigate();
  const [page, setPage] = useState<PageId>("work");
  const [graph, setGraph] = useState<GraphId>("lanes");
  const [revision, setRevision] = useState(0);
  const [courseId, setCourseId] = useState<string | null>(null);
  useEffect(() => applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  const snapshot = useMemo(() => {
    const runtimes = applicationServices.courseRepository.listCourseRuntimes().filter((runtime) => runtime.course.lifecycle === "published");
    const knowledgeGraph = applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId));
    const records = applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
    const governance = applicationServices.domainGovernanceRepository.load();
    const known = new Set(records.filter((record) => satisfiesTeachingPrerequisite(record.status)).map((record) => record.nodeId));
    return { runtimes, knowledgeGraph, known, governance };
  }, [revision, session.userId]);
  const selectedId = courseId && snapshot.runtimes.some((runtime) => runtime.course.id === courseId) ? courseId : snapshot.runtimes[0]?.course.id ?? null;
  const runtime = snapshot.runtimes.find((item) => item.course.id === selectedId);
  const places = runtime ? markChapters(chaptersOf(runtime), snapshot.known) : [];
  const placeState = new Map(places.map((place) => [place.id, place.state]));
  const nodeState = (id: string): PlaceState => {
    if (snapshot.known.has(id)) return "done";
    const chapter = runtime ? chaptersOf(runtime).find((item) => item.nodeIds.includes(id)) : undefined;
    return chapter ? placeState.get(chapter.id) ?? "ahead" : "ahead";
  };
  const lands = runtime ? mapLands(runtime.curriculumCoverages.map((coverage) => {
    const node = snapshot.knowledgeGraph.nodes.find((item) => item.id === coverage.nodeId);
    return { id: coverage.nodeId, title: node?.title ?? coverage.nodeId, domain: resolveNodeDomain(coverage.nodeId, snapshot.governance).domain?.name ?? "未分类", state: nodeState(coverage.nodeId) };
  }).filter((node, index, list) => list.findIndex((item) => item.id === node.id) === index)) : [];
  const stateLabel = runtime ? applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id) : undefined;
  const doneAssignments = stateLabel ? Object.values(stateLabel.assignmentStates).filter((item) => item.status === "accepted" || item.status === "completed").length : 0;

  function openChapter(id: string) {
    if (runtime) navigate(`/courses/${runtime.course.id}/chapters/${id}`);
  }

  return <div className="ws-app">
    <aside className="ws-side">
      <strong>EduFlow</strong>
      {pages.map(([id, label]) => <button className={page === id ? "on" : ""} key={id} type="button" onClick={() => setPage(id)}>{label}</button>)}
    </aside>
    <main className="ws-main">
      {!runtime ? <section><h1>还没有已发布课程</h1><p>发布一门课程后，这里会显示它的资源、进度和能力。</p><button className="ws-link" type="button" onClick={() => navigate("/courses")}>去课程</button></section> : <>
        <div className="ws-row">
          {snapshot.runtimes.map((item) => <button className={item.course.id === runtime.course.id ? "on" : ""} key={item.course.id} type="button" onClick={() => setCourseId(item.course.id)}>{item.course.title}</button>)}
        </div>
        {page === "work" ? <section>
          <h1>{runtime.course.title}</h1>
          <p>下面三张图用的是这门课的章节和你已经形成的能力，不是写死的示例。</p>
          <div className="ws-row">{graphs.map(([id, label]) => <button className={graph === id ? "on" : ""} key={id} type="button" onClick={() => setGraph(id)}>{label}</button>)}</div>
          {graph === "map" ? <div className="ws-lands">{lands.map((land) => <section className="ws-land" key={land.name}><b>{land.name}</b>{land.places.map((place) => <button className={`ws-place ${place.state}`} key={place.id} type="button" onClick={() => navigate(`/courses/${runtime.course.id}`)}>{place.title}</button>)}</section>)}</div> : null}
          {graph === "path" ? <div className="ws-road">{[...places].reverse().map((place) => <button className={`ws-card ${place.state}`} key={place.id} type="button" onClick={() => openChapter(place.id)}>{place.state === "now" ? "现在这一步 · " : ""}{place.title}</button>)}</div> : null}
          {graph === "lanes" ? <div className="ws-lanes">{laneColumns(places).map((column) => <section key={column.title}><b>{column.title}</b>{column.cards.map((card) => <button className={`ws-card ${card.state}`} key={card.id} type="button" onClick={() => openChapter(card.id)}>{card.title}</button>)}</section>)}</div> : null}
        </section> : null}
        {page === "progress" ? <section>
          <h1>目标与进展</h1>
          <div className="ws-list">{snapshot.runtimes.map((item) => {
            const state = applicationServices.learningProgressRepository.getCourseState(session.userId, item.course.id);
            const done = Object.values(state.assignmentStates).filter((entry) => entry.status === "accepted" || entry.status === "completed").length;
            return <article key={item.course.id}><strong>{item.course.title}</strong><span>{state.isActive ? "学习中" : "未加入"} · 已完成成果 {done} / {item.assignments.length}</span></article>;
          })}</div>
        </section> : null}
        {page === "resources" ? <section>
          <h1>资源中心</h1>
          <p>这些是当前已发布的课程。打开后进入课程本身。</p>
          <div className="ws-list">{snapshot.runtimes.map((item) => <article key={item.course.id}><strong>{item.course.title}</strong><span>{item.course.description}</span><button className="ws-link" type="button" onClick={() => navigate(`/courses/${item.course.id}`)}>打开课程</button></article>)}</div>
        </section> : null}
        {page === "ability" ? <section>
          <h1>能力</h1>
          <p>{runtime.course.title} · 已形成 {places.filter((place) => place.state === "done").length} / {places.length} 个篇章。成果 {doneAssignments} / {runtime.assignments.length}。</p>
          <div className="ws-list">{places.map((place) => <article key={place.id}><strong>{place.title}</strong><span>{place.state === "done" ? "已形成" : place.state === "now" ? "当前这一步" : place.state === "goal" ? "目标" : "尚未形成"}</span></article>)}</div>
        </section> : null}
        <EduFlowAssistant context={{ workspace: "courses", experienceMode: "learn", presentation: "skill-tree", userRole: session.role, capabilities: session.capabilities, courseId: runtime.course.id }} contextLabel={runtime.course.title} />
      </>}
    </main>
  </div>;
}
