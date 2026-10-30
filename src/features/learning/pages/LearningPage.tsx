import { PanelRight, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applicationServices } from "@/app/services/applicationServices";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import type { MockSession } from "@/features/auth/types";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildActiveLearningKnowledge } from "@/features/learning/recommendation/todayQueue";
import { createMicroLearningNavigation, type MicroLearningPath } from "@/features/learning/micro/microLearning";
import { microImmersiveHref, microSurfaceForPath } from "@/features/learning/micro/microSurface";
import { defaultKnowledgeContextId, resolveKnowledgeLearningContext } from "@/features/learning/resources/knowledgeLearningResources";
import { PracticeObject } from "@/features/course/practice/PracticeObject";
import { InlineMicro } from "@/features/home/InlineMicro";
import { CoursePreviewCard } from "@/features/home/CoursePreviewCard";
import { rememberCourseOrigin } from "@/features/course/immersive/courseTransition";
import { ConversationMicroCard } from "@/features/home/ConversationMicroCard";
import { HomeConversation } from "@/features/home/HomeConversation";
import { MyPanel } from "@/features/home/MyPanel";
import { TodayOverview } from "@/features/home/TodayOverview";
import { resolveHomeBoundary } from "@/features/home/homeBoundary";
import { buildArchiveSummary } from "@/features/home/panelModel";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import { Pill } from "@/shared/ui/Pill";
import { EventRow } from "@/shared/ui/Conversation";
import { shortDisplayName } from "@/shared/ui/displayName";
import "@/features/home/home.css";

type Workspace =
  | { kind: "micro"; knowledgeId: string; courseId?: string; pathId: string; path: MicroLearningPath }
  | { kind: "practice"; courseId: string; assignmentId: string; title: string }
  | null;

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export function LearningPage({ session, onLogout: _onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const assistant = useAssistantRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const panelOpen = searchParams.get("panel") === "1";
  const practiceParam = searchParams.get("practice");
  const microParam = searchParams.get("micro");
  const panelToggleRef = useRef<HTMLButtonElement>(null);
  const [workspace, setWorkspace] = useState<Workspace>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [people, setPeople] = useState<readonly FollowedPerson[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [removedContexts, setRemovedContexts] = useState<string[]>([]);

  useEffect(() => applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1)), []);

  useEffect(() => {
    if (!practiceParam) return;
    const [courseId, assignmentId] = practiceParam.split(":");
    if (!courseId || !assignmentId) return;
    const runtime = applicationServices.courseRepository.getCourse(courseId);
    const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
    if (runtime && assignment) setWorkspace({ kind: "practice", courseId, assignmentId, title: assignment.title });
  }, [practiceParam]);

  useEffect(() => {
    if (!microParam) return;
    const [knowledgeId, pathId, courseId] = microParam.split(":");
    if (!knowledgeId || !pathId) return;
    const path = applicationServices.microLearningRepository.getPath(knowledgeId, { courseId: courseId || undefined, mode: "learn", pathId });
    if (path) setWorkspace({ kind: "micro", knowledgeId, courseId: courseId || undefined, pathId, path });
  }, [microParam]);

  useEffect(() => {
    const repository = applicationServices.preview?.peopleRepository;
    if (!repository) return;
    let live = true;
    void repository.listFollowed(session.userId).then((items) => { if (live) setPeople(items); }).catch(() => undefined);
    return () => { live = false; };
  }, [session.userId]);

  const runtimes = useMemo(() => applicationServices.courseRepository.listCourseRuntimes(), [revision]);
  const graph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)), [revision, session.userId]);
  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const states = useMemo(() => runtimes.map((runtime) => applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)), [revision, runtimes, session.userId]);
  const items = useMemo(() => buildActiveLearningKnowledge({ runtimes, graph, userKnowledge: records, courseStates: states, microRepository: applicationServices.microLearningRepository }), [graph, records, runtimes, states]);
  const current = items[0];
  const archive = useMemo(() => buildArchiveSummary(records, new Map(graph.nodes.map((node) => [node.id, node.title]))), [graph.nodes, records]);
  const nodeTitles = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.title])), [graph.nodes]);

  const courses = useMemo(() => runtimes.flatMap((runtime) => {
    const state = states.find((candidate) => candidate.courseId === runtime.course.id);
    if (!state || !state.isActive) return [];
    const accepted = runtime.assignments.filter((assignment) => ["accepted", "completed"].includes(state.assignmentStates[assignment.id]?.status ?? "")).length;
    const pending = runtime.assignments.filter((assignment) => !["accepted", "completed"].includes(state.assignmentStates[assignment.id]?.status ?? ""));
    const progress = runtime.assignments.length ? Math.round(accepted / runtime.assignments.length * 100) : 0;
    const lesson = runtime.lessons.find((item) => item.id === state.recentLessonId);
    const chapter = lesson ? runtime.chapters.find((item) => item.id === lesson.chapterId) : undefined;
    const next = pending[0];
    return [{
      runtime,
      state,
      progress,
      currentChapter: chapter?.title,
      nextLabel: next ? `下一步「${next.title}」· 约 ${next.estimatedMinutes ?? 25} 分钟` : "课程学习内容已完成，可查看档案关注新的知识"
    } satisfies TodayCourse];
  }).sort((left, right) => (right.state.updatedAt ?? "").localeCompare(left.state.updatedAt ?? "") || left.runtime.course.title.localeCompare(right.runtime.course.title)), [runtimes, states]);

  const todayCourse = courses[0] ?? null;
  const contextId = current ? defaultKnowledgeContextId(current.resources, selectedCourseId ?? undefined) : "standalone";
  const selectedContext = current ? resolveKnowledgeLearningContext(current.resources, contextId) : null;
  const microPath = selectedContext?.micro.path ?? null;
  const microCourseId = selectedContext?.kind === "course" ? selectedContext.courseId : undefined;
  const microComplex = microPath ? microSurfaceForPath(microPath) === "panel" : false;
  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? null;
  const selectedCourse = runtimes.find((runtime) => runtime.course.id === (selectedCourseId ?? todayCourse?.runtime.course.id));
  const selectedCourseState = selectedCourse ? states.find((state) => state.courseId === selectedCourse.course.id) : undefined;
  const microProgress = microPath ? applicationServices.microLearningRepository.getPathProgress(microPath.id) : undefined;
  const microCompleteSteps = microPath ? (microProgress?.status === "completed" ? microPath.units.reduce((sum, unit) => sum + unit.steps.length, 0) : microPath.units.reduce((sum, unit) => sum + (applicationServices.microLearningRepository.getUnitProgress(unit.id)?.completedStepIds.length ?? 0), 0)) : 0;
  const microTotalSteps = microPath ? microPath.units.reduce((sum, unit) => sum + unit.steps.length, 0) : 0;
  const microCurrentUnit = microProgress?.currentUnitId ?? microPath?.units.find((unit) => applicationServices.microLearningRepository.getUnitProgress(unit.id)?.status !== "completed")?.id;

  const week = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return date;
    });
    const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const activityKeys = new Set<string>();
    for (const record of records) {
      if (record.updatedAt) activityKeys.add(dateKey(new Date(record.updatedAt)));
      for (const evidence of record.evidence ?? []) if (evidence.createdAt) activityKeys.add(dateKey(new Date(evidence.createdAt)));
    }
    const active = days.map((date) => activityKeys.has(dateKey(date)));
    return { labels: days.map((date) => dayLabels[date.getDay()]), active, count: active.filter(Boolean).length };
  }, [records]);

  const boundary = resolveHomeBoundary({
    loading: assistant.loading,
    error: assistant.error || undefined,
    activeKnowledgeCount: items.length,
    activeCourseCount: courses.length,
    hasAnyLearningRecord: records.length > 0
  });

  useEffect(() => {
    if (!panelOpen && !workspace) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (workspace) { setWorkspace(null); return; }
      if (panelOpen) { setPanel(false); panelToggleRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, workspace]);

  function setPanel(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("panel", "1"); else next.delete("panel");
    setSearchParams(next, { replace: true });
  }

  function openPractice(courseId: string, assignmentId: string, title: string) {
    setPanel(false);
    setWorkspace({ kind: "practice", courseId, assignmentId, title });
  }

  function openMicroPanel() {
    if (!current || !microPath) return;
    setPanel(false);
    setWorkspace({ kind: "micro", knowledgeId: current.knowledgeId, courseId: microCourseId, pathId: microPath.id, path: microPath });
  }

  function launchMicro() {
    if (!current) return;
    const courseId = microCourseId;
    const target = createMicroLearningNavigation(current.knowledgeId,{courseId,returnTo:"/"});
    navigate(target.to, { state: target.state });
  }

  function launchWorkspaceMicro() {
    if (workspace?.kind !== "micro") return;
    const target = microImmersiveHref(workspace.knowledgeId, { courseId: workspace.courseId, pathId: workspace.pathId, returnTo: "/" });
    navigate(target.to, { state: target.state });
  }

  function contexts() {
    const result: Array<{ id: string; label: string }> = [];
    if (selectedCourse) result.push({ id: "course", label: selectedCourse.course.title });
    if (current) result.push({ id: "knowledge", label: current.title });
    if (selectedPerson) result.push({ id: "person", label: selectedPerson.displayName.replace("示例 · ", "") });
    if (workspace?.kind === "practice") result.push({ id: "practice", label: `实践 · ${workspace.title}` });
    if (workspace?.kind === "micro" && microPath) result.push({ id: "micro", label: `微学习 · ${microPath.title}` });
    return result.filter((context) => !removedContexts.includes(context.id));
  }

  async function send(message: string) {
    const context = {
      workspace: "learning" as const,
      experienceMode: "learn" as const,
      presentation: "today",
      ...(selectedCourse ? { courseId: selectedCourse.course.id } : {}),
      ...(current ? { knowledgeId: current.knowledgeId } : {})
    };
    return assistant.send(message, context);
  }

  function openArchive() { navigate(archiveHref({ focus: "me" })); }

  const todayCard = current && microPath && boundary === "ready" ? (microComplex ? <div className="ef-home-today-micro">
    <div className="ef-home-structured-head"><Pill tone="brand">复杂微学习</Pill><strong>{microPath.title}</strong></div>
    <p>{microPath.description ?? `这条路径有 ${microPath.units.length} 个单元，适合在右侧工作区边看边做。`}</p>
    <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={openMicroPanel}>在右侧工作区打开</button>
  </div> : <InlineMicro path={microPath} knowledgeId={current.knowledgeId} courseId={microCourseId} session={session} surface="inline" onExpand={launchMicro} />) : undefined;

  return <main className={`ef-home ${panelOpen ? "has-panel" : ""} ${workspace ? "has-workspace" : ""}`} data-boundary={boundary} data-workspace={workspace?.kind ?? ""}>
    <header className="ef-home-head">
      <div className="ef-home-head-copy">
        <span className="ef-home-date">{formatToday()} · 最近 7 天 {week.count} 天有学习记录</span>
        <h1>{greeting()}，{shortDisplayName(session.name)}</h1>
        <p>{todayCourse ? `今天把「${current?.title ?? todayCourse.runtime.chapters[0]?.title ?? "下一步"}」走完，约 ${todayCourse.runtime.assignments[0]?.estimatedMinutes ?? 18} 分钟。` : "从一个目标开始，EduFlow 从这件事开始帮你搭路线。"}</p>
      </div>
      <button ref={panelToggleRef} type="button" className={`ef-home-panel-toggle ${panelOpen ? "is-open" : ""}`} aria-pressed={panelOpen} aria-controls="ef-my-panel" onClick={() => setPanel(!panelOpen)}><PanelRight size={16} aria-hidden="true" />我的</button>
    </header>

    {boundary === "new-user" ? <NewUserStart runtimes={runtimes} onSend={(prompt) => void send(prompt)} onOpenCourse={(courseId, origin) => { rememberCourseOrigin(courseId, origin); navigate(`/courses/${encodeURIComponent(courseId)}`); }} onOpenArchive={openArchive} /> : boundary === "ready" && !assistant.messages.length ? <TodayOverview session={session} course={todayCourse as TodayCourse | null} counts={{ learned: archive.learned, learning: archive.learning, practicing: archive.practicing, mastered: archive.mastered }} week={week} recentTitle={archive.recentTitle} onOpenCourse={(origin) => { if (!todayCourse) { openArchive(); return; } rememberCourseOrigin(todayCourse.runtime.course.id, origin); navigate(`/courses/${encodeURIComponent(todayCourse.runtime.course.id)}`); }} onOpenArchive={openArchive} /> : null}

    <div className="ef-home-work">
      <div className="ef-home-column">
        {boundary === "error" ? <div className="ef-home-error-banner" role="alert"><span><strong>首页加载失败</strong><small>请检查网络后重试；已有学习记录不会被清空。</small></span><button type="button" onClick={() => window.location.reload()}>重试</button></div> : null}
        <HomeConversation
          messages={assistant.messages}
          loading={assistant.loading}
          sending={assistant.sending}
          error={boundary === "error" ? "" : assistant.error}
          contexts={contexts()}
          onRemoveContext={(id) => setRemovedContexts((current) => [...current, id])}
          onSend={send}
          suggestions={selectedPerson || boundary === "error" ? [] : boundary === "new-user" ? ["让 AI 会查我们自己的文档", "把重复的周报整理自动化", "搞懂 Agent 为什么总调错工具"] : current ? [`先来一道「${current.title}」的热身题`, "今天还有哪些安排？", "我上周的实践还差什么？"] : ["推荐一门适合我的课程", "我想先补提示工程", "查看本周学习安排"]}
          todayCard={selectedPerson || assistant.messages.length ? undefined : todayCard}
          eventRow={workspace?.kind === "practice" ? <EventRow icon={<Play size={15} />} title={<>已开始实践 <strong>{workspace.title}</strong></>} detail="在右侧工作区继续；提交后内容会被保存。" action={<Pill tone="brand" dot>进行中</Pill>} /> : undefined}
          coursePreview={boundary === "ready" && assistant.messages.length && selectedCourse && !removedContexts.includes("course") ? <CoursePreviewCard course={selectedCourse} records={records} courseState={selectedCourseState} currentKnowledgeId={current?.knowledgeId} nodeTitles={nodeTitles} onOpenArchive={() => navigate(archiveHref({ focus: `course:${selectedCourse.course.id}` }))} /> : undefined}
          microCard={boundary === "ready" && assistant.messages.length > 0 && current && microPath && microProgress?.status === "in_progress" ? <ConversationMicroCard path={microPath} progress={microProgress} currentUnitId={microCurrentUnit} completeSteps={microCompleteSteps} totalSteps={microTotalSteps} onOpen={() => microComplex ? openMicroPanel() : launchMicro()} /> : undefined}
          previewPerson={selectedPerson}
          onRetry={() => window.location.reload()}
        />
      </div>

      {panelOpen ? <MyPanel
        session={session}
        open
        loading={assistant.loading}
        onClose={() => { setPanel(false); panelToggleRef.current?.focus(); }}
        selectedPersonId={selectedPersonId}
        onSelectPerson={(person) => setSelectedPersonId(person?.id ?? null)}
        selectedCourseId={selectedCourseId ?? todayCourse?.runtime.course.id ?? null}
        onSelectCourse={(courseId) => { setSelectedCourseId(courseId); setRemovedContexts((current) => current.filter((id) => id !== "course")); }}
        onOpenPractice={openPractice}
        onOpenImmersivePractice={(courseId, assignmentId) => navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`)}
      /> : null}

      {workspace ? <div className="ef-home-workspace" aria-label={workspace.kind === "micro" ? "微学习工作区" : "实践工作区"}>
        {workspace.kind === "micro" && current ? <InlineMicro path={workspace.path} knowledgeId={workspace.knowledgeId} courseId={workspace.courseId} session={session} surface="panel" onClose={() => setWorkspace(null)} onExpand={launchWorkspaceMicro} /> : null}
        {workspace.kind === "practice" ? <PracticeObject session={session} courseId={workspace.courseId} assignmentId={workspace.assignmentId} size="panel" onClose={() => setWorkspace(null)} onOpenImmersive={() => navigate(`/courses/${encodeURIComponent(workspace.courseId)}/assignments/${encodeURIComponent(workspace.assignmentId)}`)} onReturn={() => setWorkspace(null)} /> : null}
      </div> : null}
    </div>
  </main>;
}

type TodayCourse = { runtime: CourseRuntimeData; state: UserCourseState; progress: number; currentChapter?: string; nextLabel: string };

function NewUserStart({ runtimes, onSend, onOpenCourse, onOpenArchive }: { runtimes: CourseRuntimeData[]; onSend: (prompt: string) => void; onOpenCourse: (courseId: string, origin?: DOMRect) => void; onOpenArchive: () => void }) {
  const scenarios = [
    { title: "让 AI 会查我们自己的文档", hint: "RAG", prompt: "我想让 AI 会查我们自己的文档，现在它总是编。" },
    { title: "把重复的周报整理自动化", hint: "工作流", prompt: "我想把重复的周报整理自动化。" },
    { title: "搞懂 Agent 为什么总调错工具", hint: "工具调用", prompt: "我想搞懂 Agent 为什么总调错工具。" }
  ];
  const recommendations = runtimes.filter((runtime) => runtime.course.lifecycle === "published").slice(0, 3);
  return <section className="ef-home-new-user" aria-label="新用户开始">
    <article className="ef-home-new-card">
      <header><span>开始</span><Pill tone="quiet">新用户</Pill></header>
      <h2>你想先让 AI 帮你解决什么？</h2>
      <p>不用先想课程。说一个具体场景，我先看看需要哪些知识。</p>
      <div className="ef-home-scenarios">{scenarios.map((scenario) => <button key={scenario.title} type="button" onClick={() => onSend(scenario.prompt)}><span><strong>{scenario.title}</strong><small>{scenario.hint}</small></span><span aria-hidden="true">→</span></button>)}</div>
    </article>
    <article className="ef-home-new-card">
      <header><span>推荐先学</span><Pill tone="quiet">{recommendations.length} 门</Pill></header>
      <div className="ef-home-recommendations">{recommendations.map((runtime) => <button key={runtime.course.id} type="button" onClick={(event) => onOpenCourse(runtime.course.id, event.currentTarget.getBoundingClientRect())}><span><strong>{runtime.course.title}</strong><small>{runtime.chapters.length} 章 · {runtime.assignments.length} 项实践</small></span><ArrowRightIcon /></button>)}</div>
      <button type="button" className="ef-home-text-link" onClick={onOpenArchive}>浏览全部档案 →</button>
    </article>
  </section>;
}

function ArrowRightIcon() {
  return <span className="ef-home-arrow" aria-hidden="true">→</span>;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatToday() {
  return new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
}
