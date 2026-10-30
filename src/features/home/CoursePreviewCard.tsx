import { Network } from "lucide-react";
import { useMemo, useState } from "react";
import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { ConversationCard } from "@/shared/ui/Conversation";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill } from "@/shared/ui/Pill";

type TreeNodeState = "done" | "now" | "quiet";

type PreviewNode = { id: string; title: string; state: TreeNodeState };

type PreviewChapter = {
  id: string;
  number: number;
  title: string;
  nodes: PreviewNode[];
  assignments: Array<{ id: string; title: string; status: string }>;
};

const doneStatuses = new Set(["learned", "practicing", "mastered"]);

/** Read-only skill/practice projection over the real course runtime and learner state. */
export function buildCoursePreview(input: {
  course: CourseRuntimeData;
  records: readonly UserKnowledgeRecord[];
  courseState?: UserCourseState;
  currentKnowledgeId?: string;
  nodeTitles?: ReadonlyMap<string, string>;
}): { chapters: PreviewChapter[]; totals: { done: number; learning: number; quiet: number }; nodeCount: number } {
  const recordByNode = new Map(input.records.map((record) => [record.nodeId, record.status]));
  const chapterOfLesson = new Map(input.course.lessons.map((lesson) => [lesson.id, lesson.chapterId]));
  const nodeIdsByChapter = new Map<string, string[]>();
  for (const coverage of input.course.curriculumCoverages) {
    const chapterId = chapterOfLesson.get(coverage.lessonId);
    if (!chapterId) continue;
    const list = nodeIdsByChapter.get(chapterId) ?? [];
    if (!list.includes(coverage.nodeId)) list.push(coverage.nodeId);
    nodeIdsByChapter.set(chapterId, list);
  }
  const chapters = [...input.course.chapters].sort((left, right) => left.order - right.order).slice(0, 3).map((chapter, index) => {
    const nodeIds = nodeIdsByChapter.get(chapter.id) ?? [];
    const nodes = nodeIds.slice(0, 4).map((nodeId) => {
      const status = recordByNode.get(nodeId);
      const state: TreeNodeState = nodeId === input.currentKnowledgeId || status === "learning" ? "now" : status && doneStatuses.has(status) ? "done" : "quiet";
      return { id: nodeId, title: input.nodeTitles?.get(nodeId) ?? nodeId, state };
    });
    const assignmentIds = [...new Set(input.course.assignmentCoverages.filter((coverage) => nodeIds.includes(coverage.nodeId)).map((coverage) => coverage.assignmentId))];
    const assignments = assignmentIds.flatMap((assignmentId) => {
      const assignment = input.course.assignments.find((item) => item.id === assignmentId);
      if (!assignment) return [];
      return [{ id: assignment.id, title: assignment.title, status: input.courseState?.assignmentStates[assignment.id]?.status ?? "not_started" }];
    });
    return { id: chapter.id, number: index + 1, title: chapter.title, nodes, assignments };
  });
  const totals = { done: 0, learning: 0, quiet: 0 };
  for (const nodeId of new Set(input.course.curriculumCoverages.map((coverage) => coverage.nodeId))) {
    const status = recordByNode.get(nodeId);
    if (status && doneStatuses.has(status)) totals.done += 1;
    else if (status === "learning" || nodeId === input.currentKnowledgeId) totals.learning += 1;
    else totals.quiet += 1;
  }
  return { chapters, totals, nodeCount: new Set(input.course.curriculumCoverages.map((coverage) => coverage.nodeId)).size };
}

/** L card used when the conversation is grounded in a real course context. */
export function CoursePreviewCard({ course, records, courseState, currentKnowledgeId, nodeTitles, onOpenArchive }: {
  course: CourseRuntimeData;
  records: readonly UserKnowledgeRecord[];
  courseState?: UserCourseState;
  currentKnowledgeId?: string;
  nodeTitles?: ReadonlyMap<string, string>;
  onOpenArchive(): void;
}) {
  const [view, setView] = useState<"skill" | "practice">("skill");
  const preview = useMemo(() => buildCoursePreview({ course, records, courseState, currentKnowledgeId, nodeTitles }), [course, courseState, currentKnowledgeId, nodeTitles, records]);
  const chapterLabel = preview.chapters.map((chapter) => chapter.number).join(" / ");
  return <ConversationCard size="l" label={`课程预览 ${course.course.title}`}>
    <ObjectShell
      size="l"
      icon={<Network size={16} />}
      kicker="课程 · 技能树预览"
      title={course.course.title}
      badge={<Pill tone="quiet">只读</Pill>}
      context={<span>{preview.chapters.length} 章 · {preview.nodeCount} 个知识节点 · 聚焦第 {chapterLabel} 章</span>}
      footer={<div className="ef-home-course-foot"><span>只读预览</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onOpenArchive}>在档案中打开</button></div>}
    >
      <div className="ef-home-tree-tabs" role="group" aria-label="课程树视图">
        <button type="button" className={`ef-ui-chip ${view === "skill" ? "is-on" : ""}`} aria-pressed={view === "skill"} onClick={() => setView("skill")}>技能树</button>
        <button type="button" className={`ef-ui-chip ${view === "practice" ? "is-on" : ""}`} aria-pressed={view === "practice"} onClick={() => setView("practice")}>实训树</button>
      </div>
      {view === "skill" ? <div className="ef-home-tree" role="img" aria-label={`课程技能树缩略：${preview.chapters.length} 章，${preview.nodeCount} 个知识节点`}>
        {preview.chapters.map((chapter) => <div className="ef-home-tree-chapter" key={chapter.id}>
          <div className="ef-home-tree-chapter-head"><span>第 {chapter.number} 章</span><small>{chapter.nodes.filter((node) => node.state === "done").length} / {chapter.nodes.length}</small></div>
          <div className="ef-home-tree-chapter-title" title={chapter.title}>{chapter.title}</div>
          <div className="ef-home-tree-nodes">
            {chapter.nodes.map((node) => <div className={`ef-home-tree-node is-${node.state}`} key={node.id}><i aria-hidden="true" /><span title={node.title}>{node.title}</span></div>)}
            {!chapter.nodes.length ? <p className="ef-home-tree-empty">本章暂无知识节点</p> : null}
          </div>
        </div>)}
      </div> : <div className="ef-home-tree-practice">
        {preview.chapters.map((chapter) => <div className="ef-home-tree-practice-chapter" key={chapter.id}>
          <div className="ef-home-tree-chapter-head"><span>第 {chapter.number} 章</span><small>{chapter.assignments.length} 项实践</small></div>
          <div className="ef-home-tree-chapter-title" title={chapter.title}>{chapter.title}</div>
          {chapter.assignments.length ? <ul>{chapter.assignments.map((assignment) => <li key={assignment.id}><span title={assignment.title}>{assignment.title}</span><Pill tone={assignment.status === "accepted" || assignment.status === "completed" ? "ok" : assignment.status === "needs_revision" ? "warn" : "quiet"}>{practiceStatusLabel(assignment.status)}</Pill></li>)}</ul> : <p className="ef-home-tree-empty">本章暂无实践</p>}
        </div>)}
      </div>}
      <div className="ef-home-tree-foot">
        <span className="ef-home-tree-legend"><i className="is-done" />已学<i className="is-now" />当前<i className="is-quiet" />待学</span>
        <span>全课 {preview.totals.done} 已学 · {preview.totals.learning} 在学 · {preview.totals.quiet} 待学</span>
      </div>
    </ObjectShell>
  </ConversationCard>;
}

function practiceStatusLabel(status: string) {
  if (status === "accepted" || status === "completed") return "已验收";
  if (status === "submitted") return "待验收";
  if (status === "needs_revision") return "需修改";
  if (status === "started" || status === "in-progress") return "进行中";
  return "未开始";
}
