import { BaseEdge, getSmoothStepPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import type { CourseChapterProjection, CourseSkillTreeNode } from "@/features/course/types";
import type { CourseGraphData } from "../runtime/courseRuntime";
import { buildCourseGraphProjection, type CourseGraphView } from "./courseGraphProjection";
import { layoutCourseGraph } from "./elkCourseLayout";
import { toReactFlow, type CourseFlowEdgeData, type CourseFlowNodeData } from "./reactFlowAdapter";
import type { ManualNodePosition } from "@/features/course/authoring/courseAuthoringDraft";
import { findChapterDropTarget, toChapterRelativePosition, type CourseGraphRect } from "./courseGraphInteraction";

export type CourseGraphHandle = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focus: (id: string) => void;
};

type Props = {
  graphData: CourseGraphData;
  view: CourseGraphView;
  focusedChapterId: string | null;
  mode: "knowledge" | "assignment";
  selectedId: string | null;
  searchMatchId: string | null;
  onChapterClick: (chapter: CourseChapterProjection) => void;
  onChapterDoubleClick: (chapter: CourseChapterProjection) => void;
  onKnowledgeClick: (node: CourseSkillTreeNode) => void;
  onAssignmentClick: (node: CourseSkillTreeNode) => void;
  designEnabled?: boolean;
  manualPositions?: Record<string, ManualNodePosition>;
  onKnowledgeDrop?: (nodeId: string, chapterId: string, position: ManualNodePosition) => void;
  onDependencyCreate?: (sourceId: string, targetId: string) => void;
  onDependencySelect?: (edgeId: string) => void;
};

function ChapterNode({ data }: NodeProps<Node<CourseFlowNodeData>>) {
  const chapter = data.chapter!;
  const progress = chapter.knowledgeProgress;
  const assignment = chapter.assignmentSummary;
  const assignmentStatus = `${assignment.completedCount} 项完成 · ${assignment.inProgressCount} 项进行中`;
  return (
    <div className={`course-flow-chapter ${data.expanded ? "expanded" : "collapsed"} mode-${data.mode} ${data.selected || data.searchMatch ? "selected" : ""} ${data.dropTarget ? "drop-target" : ""}`} style={{ "--node-color": chapter.color } as React.CSSProperties} onDoubleClick={(event) => { event.stopPropagation(); data.onChapterDoubleClick?.(chapter); }}>
      <Handle type="target" id="in" position={Position.Left} />
      <div className="course-flow-chapter-presentation knowledge-presentation"><div className="course-flow-chapter-head"><i /><span><small>CHAPTER {String(chapter.order).padStart(2, "0")}</small><strong>{chapter.title}</strong><em>{chapter.lessonCount} 课 · {assignment.progress >= 100 ? "✓ 阶段已完成" : assignment.progress ? "● 当前学习" : "可学习"}</em></span></div>{!data.expanded ? <p>{chapter.description}</p> : <div className="course-flow-chapter-caption">{chapter.title} · 原子知识与实训伴生层 · Knowledge mastery {progress}%</div>}</div>
      <div className="course-flow-chapter-presentation assignment-presentation"><div className="course-flow-chapter-head"><i /><span><small>CHAPTER {String(chapter.order).padStart(2, "0")} · 实训</small><strong>{chapter.title} · 实训</strong><em>{assignment.assignmentCount} 项实训 · 完成度 {assignment.progress}%</em></span></div>{!data.expanded ? <p>{assignmentStatus}<br />篇章成果：{assignment.outcome}</p> : <div className="course-flow-chapter-caption">{assignmentStatus} · 篇章成果：{assignment.outcome}</div>}</div>
      {!data.expanded ? <b>双击原位展开</b> : null}
      <Handle type="source" id="out" position={Position.Right} />
    </div>
  );
}

function KnowledgeNode({ data }: NodeProps<Node<CourseFlowNodeData>>) {
  const node = data.knowledge!;
  const status = { completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" }[node.status];
  const assignmentStatus = node.assignmentStateSummary.completedCount ? "已完成" : node.assignmentStateSummary.inProgressCount ? "进行中" : node.status === "locked" ? "待解锁" : "可开始";
  const singleAssignment = node.assignmentContexts.length === 1 ? node.assignmentContexts[0].assignment : null;
  const assignmentTitle = singleAssignment?.title ?? `${node.assignmentCount} 项课后任务`;
  const assignmentMeta = singleAssignment?.estimatedMinutes ? `预计 ${singleAssignment.estimatedMinutes} 分钟` : `${node.assignmentStateSummary.inProgressCount} 项进行中`;
  return (
    <div className={`course-flow-knowledge status-${node.status} mode-${data.mode} has-assignment ${data.selected || data.searchMatch ? "selected" : ""}`} style={{ "--node-color": node.color } as React.CSSProperties}>
      <Handle type="target" id="in" position={Position.Left} isConnectable={data.designEnabled} className="course-dependency-handle target" aria-label={`连接到 ${node.title}`} />
      <button className="course-flow-card course-flow-assignment-card" onClick={(event) => { event.stopPropagation(); data.onAssignmentClick?.(node); }} aria-label={`查看实训：${assignmentTitle}`}>
        <span className="course-flow-knowledge-icon">◇</span>
        <strong>{assignmentTitle}</strong>
        <small>{node.assignmentCount} 项实训 · {assignmentStatus}</small>
        <em>{assignmentMeta}</em>
      </button>
      <div className="course-flow-card course-flow-knowledge-card">
        <span className="course-flow-knowledge-icon">◆</span>
        <strong>{node.title}{data.draftCandidate ? <small className="course-flow-draft-badge">草稿</small> : null}</strong>
        <small>第 {node.lesson} 课 · {status}</small>
        <em>{node.assignmentCount} 项实训伴生</em>
      </div>
      <Handle type="source" id="out" position={Position.Right} isConnectable={data.designEnabled} className="course-dependency-handle source" aria-label={`从 ${node.title} 创建依赖`} />
    </div>
  );
}

function CourseEdge({ data, markerEnd, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps<Edge<CourseFlowEdgeData>>) {
  if (!data) return null;
  const path = data.routing === "elk" && data.path ? data.path : getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    offset: data.kind === "chapter" ? 34 : 24
  })[0];
  const className = ["course-flow-edge", data.relation, data.sourceKind === "curriculum-sequence" ? "sequence" : "knowledge-derived", data.strength === "hard" ? "hard" : data.strength === "soft" ? "soft" : "", data.highlighted ? "highlighted" : ""].filter(Boolean).join(" ");
  const title = data.sourceKind === "curriculum-sequence" ? "教学顺序补充连接 · 非知识事实" : data.kind === "chapter" ? `${data.supportCount} 个底层知识依赖` : data.relation;
  return <><BaseEdge path={path} markerEnd={markerEnd} className={className} /><title>{title}</title></>;
}

const nodeTypes = { chapter: ChapterNode, knowledge: KnowledgeNode };
const edgeTypes = { course: CourseEdge };

const CourseGraphInner = forwardRef<CourseGraphHandle, Props>(function CourseGraphInner(props, ref) {
  const instance = useReactFlow();
  const chapterClickTimer = useRef<number | null>(null);
  const layoutRequestRef = useRef(0);
  const fittedStructureRef = useRef<string | null>(null);
  const [dropTargetChapterId, setDropTargetChapterId] = useState<string | null>(null);
  const projection = useMemo(() => buildCourseGraphProjection(props.graphData, props.view, props.focusedChapterId), [props.focusedChapterId, props.graphData, props.view]);
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutCourseGraph>> | null>(null);
  const structureKey = `${props.graphData.courseId}:${props.graphData.revision}:${props.view}:${props.focusedChapterId ?? "all-collapsed"}`;

  useEffect(() => {
    const request = ++layoutRequestRef.current;
    layoutCourseGraph(props.graphData, projection).then((layout) => {
      if (request !== layoutRequestRef.current) return;
      setLayout(layout);
      if (fittedStructureRef.current === structureKey) return;
      fittedStructureRef.current = structureKey;
      window.requestAnimationFrame(() => instance.fitView({ padding: 0.14, duration: 520, maxZoom: props.view === "full" ? 0.76 : 1.05 }));
    });
  }, [instance, projection, props.graphData, props.view, structureKey]);

  const flow = useMemo(
    () => layout ? toReactFlow(layout, props.graphData.knowledgeEdges, props.mode, props.selectedId, props.searchMatchId, props.onChapterDoubleClick, props.onAssignmentClick, props.designEnabled, props.manualPositions, dropTargetChapterId) : { nodes: [], edges: [] },
    [dropTargetChapterId, layout, props.designEnabled, props.graphData.knowledgeEdges, props.manualPositions, props.mode, props.onAssignmentClick, props.onChapterDoubleClick, props.searchMatchId, props.selectedId]
  );

  function graphRect(node: Node<CourseFlowNodeData>): CourseGraphRect {
    const position = node.position;
    return { id: node.id, x: position.x, y: position.y, width: node.measured?.width ?? node.width ?? 0, height: node.measured?.height ?? node.height ?? 0 };
  }

  function dropTargetFor(node: Node<CourseFlowNodeData>) {
    return findChapterDropTarget(graphRect(node), instance.getNodes().filter((item) => item.data.kind === "chapter").map((item) => graphRect(item as Node<CourseFlowNodeData>)));
  }

  useImperativeHandle(ref, () => ({
    fit: () => instance.fitView({ padding: 0.14, duration: 420, maxZoom: props.view === "full" ? 0.76 : 1.05 }),
    zoomIn: () => void instance.zoomIn({ duration: 180 }),
    zoomOut: () => void instance.zoomOut({ duration: 180 }),
    focus: (id: string) => {
      const node = instance.getNode(id);
      if (!node) return;
      void instance.setCenter(node.position.x + (node.width ?? 190) / 2, node.position.y + (node.height ?? 108) / 2, { zoom: Math.max(instance.getZoom(), 0.9), duration: 480 });
    }
  }), [instance, props.view]);

  return (
    <ReactFlow
      nodes={flow.nodes}
      edges={flow.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={Boolean(props.designEnabled)}
      nodesConnectable={Boolean(props.designEnabled)}
      elementsSelectable
      minZoom={0.16}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      onNodeDrag={(_, node) => { if (props.designEnabled && node.data.kind === "knowledge") setDropTargetChapterId(dropTargetFor(node)?.replace(/^chapter:/, "") ?? null); }}
      onNodeDragStop={(_, node) => {
        setDropTargetChapterId(null);
        if (!props.designEnabled || node.data.kind !== "knowledge") return;
        const sourceChapterId = node.data.knowledge!.chapterId;
        const targetFlowId = dropTargetFor(node) ?? `chapter:${sourceChapterId}`;
        const targetChapter = instance.getNode(targetFlowId) as Node<CourseFlowNodeData> | undefined;
        if (!targetChapter) return;
        props.onKnowledgeDrop?.(node.data.knowledge!.id, targetFlowId.replace(/^chapter:/, ""), toChapterRelativePosition(graphRect(node), graphRect(targetChapter)));
      }}
      onConnect={(connection: Connection) => { if (!props.designEnabled || !connection.source || !connection.target) return; props.onDependencyCreate?.(connection.source.replace(/^knowledge:/, ""), connection.target.replace(/^knowledge:/, "")); }}
      onConnectEnd={(_, connectionState) => {
        if (!props.designEnabled || !connectionState.fromNode || !connectionState.toNode || connectionState.fromNode.id !== connectionState.toNode.id) return;
        const nodeId = connectionState.fromNode.id.replace(/^knowledge:/, "");
        props.onDependencyCreate?.(nodeId, nodeId);
      }}
      onEdgeClick={(_, edge) => { if (!props.designEnabled || !edge.selectable) return; props.onDependencySelect?.(edge.data?.sourceEdge?.id ?? edge.id); }}
      onNodeClick={(event, node) => {
        if (node.data.kind !== "chapter") return props.onKnowledgeClick(node.data.knowledge!);
        if (chapterClickTimer.current) window.clearTimeout(chapterClickTimer.current);
        if (event.detail >= 2) {
          chapterClickTimer.current = null;
          props.onChapterDoubleClick(node.data.chapter!);
          return;
        }
        chapterClickTimer.current = window.setTimeout(() => props.onChapterClick(node.data.chapter!), 230);
      }}
      onNodeDoubleClick={(_, node) => {
        if (chapterClickTimer.current) window.clearTimeout(chapterClickTimer.current);
        chapterClickTimer.current = null;
        if (node.data.kind === "chapter") props.onChapterDoubleClick(node.data.chapter!);
        else props.onKnowledgeClick(node.data.knowledge!);
      }}
    />
  );
});

export const CourseGraph = forwardRef<CourseGraphHandle, Props>(function CourseGraph(props, ref) {
  return <ReactFlowProvider><CourseGraphInner {...props} ref={ref} /></ReactFlowProvider>;
});
