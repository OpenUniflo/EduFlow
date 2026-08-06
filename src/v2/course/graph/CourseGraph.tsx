import { BaseEdge, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
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
      <div className="course-flow-chapter-head"><i /><span><small>CHAPTER {String(chapter.order).padStart(2, "0")}</small><strong>{data.mode === "practice" ? chapter.outcome : chapter.title}</strong><em>{chapter.lessonIds.length} 课 · {progress >= 100 ? "已完成" : progress ? `学习中 ${progress}%` : "可学习"}</em></span></div>
      {!data.expanded ? <><p>{chapter.description}</p><b>双击原位展开</b></> : <div className="course-flow-chapter-caption">{chapter.title} · 原子知识与实训伴生层</div>}
      <Handle type="source" id="out" position={Position.Right} />
    </div>
  );
}

function KnowledgeNode({ data }: NodeProps<Node<CourseFlowNodeData>>) {
  const node = data.knowledge!;
  const title = data.mode === "practice" ? node.practiceTitle : node.title;
  const status = { completed: "已完成", learning: "学习中", available: "可学习", locked: "未解锁" }[node.status];
  return (
    <div className={`course-flow-knowledge status-${node.status} ${data.selected || data.searchMatch ? "selected" : ""}`} style={{ "--node-color": node.color } as React.CSSProperties}>
      <Handle type="target" id="in" position={Position.Left} />
      <span className="course-flow-knowledge-icon">{data.mode === "practice" ? "◇" : "◆"}</span>
      <strong>{title}</strong>
      <small>第 {node.lesson} 课 · {status}</small>
      <em>{node.practiceContexts.length ? `${node.practiceContexts.length} 项实训伴生` : "课程知识节点"}</em>
      <Handle type="source" id="out" position={Position.Right} />
    </div>
  );
}

function CourseEdge({ data, markerEnd }: EdgeProps<Edge<CourseFlowEdgeData>>) {
  if (!data?.path) return null;
  const className = ["course-flow-edge", data.relation, data.sourceKind === "curriculum-sequence" ? "sequence" : "knowledge-derived", data.strength === "hard" ? "hard" : data.strength === "soft" ? "soft" : "", data.highlighted ? "highlighted" : ""].filter(Boolean).join(" ");
  const title = data.sourceKind === "curriculum-sequence" ? "教学顺序补充连接 · 非知识事实" : data.kind === "chapter" ? `${data.supportCount} 个底层知识依赖` : data.relation;
  return <><BaseEdge path={data.path} markerEnd={markerEnd} className={className} /><title>{title}</title></>;
}

const nodeTypes = { chapter: ChapterNode, knowledge: KnowledgeNode };
const edgeTypes = { course: CourseEdge };

const CourseGraphInner = forwardRef<CourseGraphHandle, Props>(function CourseGraphInner(props, ref) {
  const instance = useReactFlow();
  const chapterClickTimer = useRef<number | null>(null);
  const projection = useMemo(() => buildCourseGraphProjection(props.view, props.focusedChapterId, props.selectedId?.replace("knowledge:", "") ?? null), [props.focusedChapterId, props.selectedId, props.view]);
  const [flow, setFlow] = useState<ReturnType<typeof toReactFlow>>({ nodes: [], edges: [] });

  useEffect(() => {
    let active = true;
    layoutCourseGraph(projection).then((layout) => {
      if (!active) return;
      const next = toReactFlow(layout, props.mode, props.selectedId, props.searchMatchId);
      setFlow({ nodes: next.nodes.map((node) => node.data.kind === "chapter" ? { ...node, data: { ...node.data, onChapterDoubleClick: props.onChapterDoubleClick } } : node), edges: next.edges });
      window.requestAnimationFrame(() => instance.fitView({ padding: 0.14, duration: 520, maxZoom: props.view === "full" ? 0.76 : 1.05 }));
    });
    return () => { active = false; };
  }, [instance, projection, props.mode, props.searchMatchId, props.selectedId, props.view]);

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
