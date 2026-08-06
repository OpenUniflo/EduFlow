import { BaseEdge, getSmoothStepPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import type { CourseChapterProjection, CourseSkillTreeNode } from "../../types";
import { buildCourseGraphProjection, type CourseGraphView } from "./courseGraphProjection";
import { layoutCourseGraph } from "./elkCourseLayout";
import { toReactFlow, type CourseFlowEdgeData, type CourseFlowNodeData } from "./reactFlowAdapter";

export type CourseGraphHandle = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focus: (id: string) => void;
};

type Props = {
  view: CourseGraphView;
  focusedChapterId: string | null;
  mode: "knowledge" | "practice";
  selectedId: string | null;
  searchMatchId: string | null;
  onChapterClick: (chapter: CourseChapterProjection) => void;
  onChapterDoubleClick: (chapter: CourseChapterProjection) => void;
  onKnowledgeClick: (node: CourseSkillTreeNode) => void;
};

function ChapterNode({ data }: NodeProps<Node<CourseFlowNodeData>>) {
  const chapter = data.chapter!;
  const progress = chapter.progress;
  return (
    <div className={`course-flow-chapter ${data.expanded ? "expanded" : "collapsed"} ${data.selected || data.searchMatch ? "selected" : ""}`} style={{ "--node-color": chapter.color } as React.CSSProperties} onDoubleClick={(event) => { event.stopPropagation(); data.onChapterDoubleClick?.(chapter); }}>
      <Handle type="target" id="in" position={Position.Left} />
      <div className="course-flow-chapter-head"><i /><span><small>CHAPTER {String(chapter.order).padStart(2, "0")}</small><strong>{chapter.title}</strong><em>{chapter.lessonIds.length} 课 · {progress >= 100 ? "已完成" : progress ? `学习中 ${progress}%` : "可学习"}</em></span></div>
      {!data.expanded ? <><p>{chapter.description}</p><b>双击原位展开</b></> : <div className="course-flow-chapter-caption">{chapter.title} · 原子知识与实训伴生层</div>}
      <Handle type="source" id="out" position={Position.Right} />
    </div>
  );
}

function KnowledgeNode({ data }: NodeProps<Node<CourseFlowNodeData>>) {
  const node = data.knowledge!;
  const status = { completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" }[node.status];
  const practiceStatus = node.status === "completed" ? "已验证" : node.status === "learning" ? "进行中" : node.status === "locked" ? "待解锁" : "可开始";
  const hasPractice = node.practiceContexts.length > 0;
  return (
    <div className={`course-flow-knowledge status-${node.status} mode-${data.mode} ${hasPractice ? "has-practice" : ""} ${data.selected || data.searchMatch ? "selected" : ""}`} style={{ "--node-color": node.color } as React.CSSProperties}>
      <Handle type="target" id="in" position={Position.Left} />
      {hasPractice ? <div className="course-flow-card course-flow-practice-card">
        <span className="course-flow-knowledge-icon">◇</span>
        <strong>{node.practiceTitle}</strong>
        <small>{node.practiceContexts.length} 项实训 · {practiceStatus}</small>
        <em>PracticeCoverage 伴生层</em>
      </div> : null}
      <div className="course-flow-card course-flow-knowledge-card">
        <span className="course-flow-knowledge-icon">◆</span>
        <strong>{node.title}</strong>
        <small>第 {node.lesson} 课 · {status}</small>
        <em>{hasPractice ? `${node.practiceContexts.length} 项实训伴生` : "课程知识节点"}</em>
      </div>
      <Handle type="source" id="out" position={Position.Right} />
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
  const projection = useMemo(() => buildCourseGraphProjection(props.view, props.focusedChapterId), [props.focusedChapterId, props.view]);
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutCourseGraph>> | null>(null);
  const structureKey = `${props.view}:${props.focusedChapterId ?? "all-collapsed"}`;

  useEffect(() => {
    const request = ++layoutRequestRef.current;
    layoutCourseGraph(projection).then((layout) => {
      if (request !== layoutRequestRef.current) return;
      setLayout(layout);
      if (fittedStructureRef.current === structureKey) return;
      fittedStructureRef.current = structureKey;
      window.requestAnimationFrame(() => instance.fitView({ padding: 0.14, duration: 520, maxZoom: props.view === "full" ? 0.76 : 1.05 }));
    });
  }, [instance, projection, props.view, structureKey]);

  const flow = useMemo(
    () => layout ? toReactFlow(layout, props.mode, props.selectedId, props.searchMatchId, props.onChapterDoubleClick) : { nodes: [], edges: [] },
    [layout, props.mode, props.onChapterDoubleClick, props.searchMatchId, props.selectedId]
  );

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
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.16}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
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
