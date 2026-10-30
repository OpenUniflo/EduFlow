import { useEffect, useMemo, useState } from "react";
import type { CourseGraphData } from "@/features/course/runtime/courseRuntime";
import type { LearningStatus } from "@/features/course/types";
import {
  courseChapterTreeCounts,
  layoutCourseChapterTree,
  truncateCapsuleTitle,
  type CourseChapterTree,
  type CourseChapterTreeMode
} from "@/features/course/graph/courseChapterTree";
import type { ArchiveModel } from "../model/atlasModel";

const STATUS_LABEL: Record<LearningStatus, string> = {
  completed: "已学",
  learning: "在学",
  available: "目标",
  locked: "待学"
};

export type ArchiveCourseTreeOverlayProps = {
  graphData: CourseGraphData;
  mode: CourseChapterTreeMode;
  onSelectKnowledge: (id: string) => void;
};

export function ArchiveCourseTreeOverlay({ graphData, mode, onSelectKnowledge }: ArchiveCourseTreeOverlayProps) {
  const [tree, setTree] = useState<CourseChapterTree | null>(null);
  useEffect(() => {
    let live = true;
    setTree(null);
    void layoutCourseChapterTree(graphData).then((layout) => { if (live) setTree(layout); }).catch(() => { if (live) setTree(null); });
    return () => { live = false; };
  }, [graphData]);
  if (!tree) return <div className="ef-archive-tree-loading" role="status">正在展开课程结构…</div>;
  return (
    <div className="ef-archive-tree-layer" data-tree-mode={mode} aria-label={mode === "skill" ? "课程技能树投影" : "课程实训树投影"}>
      <div className="ef-archive-tree-plane" aria-hidden />
      <svg viewBox={`0 0 ${tree.width} ${tree.height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="课程章节树">
        <defs>
          <filter id="ef-tree-fade" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <marker id="ef-tree-arrow" viewBox="0 0 8 8" refX="6.4" refY="4" markerWidth="5.4" markerHeight="5.4" orient="auto-start-reverse">
            <path className="ef-tree-arrow-head" d="M0 0 8 4 0 8Z" />
          </marker>
        </defs>
        <g aria-hidden>
          {tree.chapters.map((chapter) => (
            <g key={chapter.id}>
              <rect className={`ef-tree-chapter tone-${chapter.tone}`} x={chapter.x} y={chapter.y} width={chapter.width} height={chapter.height} rx={22} filter="url(#ef-tree-fade)" />
              <text className="ef-tree-chapter-note" x={chapter.x + 12} y={chapter.y + 20}>
                <tspan className="ef-tree-chapter-index">{String(chapter.displayNumber).padStart(2, "0")}</tspan>
                <tspan dx="6">{truncateCapsuleTitle(chapter.title, 20)}</tspan>
              </text>
              <text className="ef-tree-chapter-meta" x={chapter.x + chapter.width - 12} y={chapter.y + 20} textAnchor="end">
                {mode === "practice" ? `${chapter.assignmentCount} 个实训` : `${chapter.learnedCount}/${chapter.knowledgeCount} 已学`}
              </text>
              {mode === "practice" ? (
                <text className="ef-tree-practice-note" x={chapter.x + chapter.width / 2} y={chapter.y + chapter.height / 2 + 4} textAnchor="middle">
                  {chapter.assignmentCount ? `本章 ${chapter.assignmentCount} 个实训 · ${chapter.progress}%` : "本章暂无实训"}
                </text>
              ) : null}
            </g>
          ))}
        </g>
        <g className="ef-tree-edges" aria-hidden>
          {tree.edges.map((edge) => (
            <path key={edge.id} className={`ef-tree-edge ${edge.kind === "chapter" ? "is-chapter" : ""} ${edge.crossChapter ? "is-cross" : ""}`} d={edge.path} markerEnd={edge.kind === "chapter" ? "url(#ef-tree-arrow)" : undefined} />
          ))}
        </g>
        {mode === "skill" ? (
          <g className="ef-tree-nodes">
            {tree.nodes.map((node) => (
              <g
                key={node.id}
                className={`ef-tree-node state-${node.status} ${node.current ? "is-current" : ""}`}
                transform={`translate(${node.x} ${node.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${node.title}，${STATUS_LABEL[node.status]}${node.current ? "，当前" : ""}`}
                onClick={() => onSelectKnowledge(node.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectKnowledge(node.id); } }}
              >
                <title>{`${node.title} · ${node.chapterTitle}`}</title>
                <rect width={node.width} height={node.height} rx={14} />
                <circle className="ef-tree-node-dot" cx={13} cy={14} r={4.4} />
                <text className="ef-tree-node-name" x={23} y={18}>{truncateCapsuleTitle(node.title)}</text>
              </g>
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function ArchiveCourseTreeLegend({ treeMode, counts }: { treeMode: CourseChapterTreeMode; counts: ReturnType<typeof courseChapterTreeCounts> }) {
  if (treeMode === "practice") {
    return <div className="ef-archive-course-tree-legend" role="group" aria-label="实训树图例"><span><i className="is-practice" aria-hidden />课程章节实训</span><span>切换技能树查看知识</span><span>星图坐标未改变</span></div>;
  }
  return (
    <div className="ef-archive-course-tree-legend" role="group" aria-label="技能树图例">
      <span><i className="is-learned" aria-hidden />已学 {counts.learned}</span>
      <span><i className="is-learning" aria-hidden />在学 {counts.learning}</span>
      <span><i className="is-current" aria-hidden />当前 {counts.current}</span>
      <span><i className="is-target" aria-hidden />目标 {counts.target}</span>
      <span><i className="is-pending" aria-hidden />待学 {counts.pending}</span>
    </div>
  );
}

type DraftLayoutNode = { id: string; title: string; depth: number; x: number; y: number; width: number; height: number };

function draftLayout(ids: readonly string[], depthById: ReadonlyMap<string, number>, titles: ReadonlyMap<string, string>) {
  const byDepth = new Map<number, string[]>();
  ids.forEach((id) => {
    const depth = Math.max(1, Math.min(3, (depthById.get(id) ?? 0) + 1));
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), id]);
  });
  const capsuleWidth = 116;
  const capsuleHeight = 28;
  const gapX = 8;
  const gapY = 7;
  const padding = 14;
  const header = 34;
  const nodes: DraftLayoutNode[] = [];
  const regions: Array<{ depth: number; x: number; y: number; width: number; height: number; count: number }> = [];
  let cursorX = 0;
  [1, 2, 3].forEach((depth) => {
    const depthIds = (byDepth.get(depth) ?? []).slice().sort((left, right) => (titles.get(left) ?? left).localeCompare(titles.get(right) ?? right) || left.localeCompare(right));
    if (!depthIds.length) return;
    const cols = Math.min(2, depthIds.length);
    const rows = Math.ceil(depthIds.length / cols);
    const width = Math.max(178, padding * 2 + cols * capsuleWidth + (cols - 1) * gapX);
    const height = header + rows * capsuleHeight + (rows - 1) * gapY + padding;
    regions.push({ depth, x: cursorX, y: 0, width, height, count: depthIds.length });
    depthIds.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      nodes.push({
        id,
        title: titles.get(id) ?? id,
        depth,
        x: cursorX + padding + col * (capsuleWidth + gapX),
        y: header + row * (capsuleHeight + gapY),
        width: capsuleWidth,
        height: capsuleHeight
      });
    });
    cursorX += width + 46;
  });
  return { nodes, regions, width: Math.max(320, cursorX - 46), height: Math.max(220, ...regions.map((region) => region.height)) };
}

export function ArchiveDraftTreeOverlay({ ids, depth, model, onSelectKnowledge }: {
  ids: readonly string[];
  depth: ReadonlyMap<string, number>;
  model: ArchiveModel;
  onSelectKnowledge: (id: string) => void;
}) {
  const titles = useMemo(() => new Map(model.nodes.map((node) => [node.id, node.title])), [model.nodes]);
  const layout = useMemo(() => draftLayout(ids, depth, titles), [depth, ids, titles]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);
  if (!ids.length) return null;
  return (
    <div className="ef-archive-tree-layer is-draft" aria-label="课程创建简报草稿树">
      <div className="ef-archive-tree-plane is-draft" aria-hidden />
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="简报知识草稿树">
        <defs>
          <pattern id="ef-tree-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="var(--brand)" opacity="0.05" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="var(--brand)" strokeOpacity="0.28" strokeWidth="1.2" />
          </pattern>
        </defs>
        <g aria-hidden>
          {layout.regions.map((region) => (
            <g key={region.depth}>
              <rect className="ef-tree-chapter is-hatch" x={region.x} y={region.y} width={region.width} height={region.height} rx={16} />
              <text className="ef-tree-chapter-note" x={region.x + 14} y={region.y + 20}>
                <tspan className="ef-tree-chapter-index">{`层级 ${region.depth}`}</tspan>
                <tspan dx="6">{region.count} 个知识</tspan>
              </text>
            </g>
          ))}
        </g>
        <g className="ef-tree-edges" aria-hidden>
          {model.edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)).map((edge) => {
            const source = nodeById.get(edge.source) as DraftLayoutNode;
            const target = nodeById.get(edge.target) as DraftLayoutNode;
            const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
            const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
            const midX = (from.x + to.x) / 2;
            return <path key={edge.id} className="ef-tree-edge is-draft" d={`M${from.x} ${from.y}L${midX} ${from.y}L${midX} ${to.y}L${to.x} ${to.y}`} />;
          })}
        </g>
        <g className="ef-tree-nodes">
          {layout.nodes.map((node) => (
            <g
              key={node.id}
              className="ef-tree-node is-draft"
              style={{ opacity: node.depth === 1 ? 1 : node.depth === 2 ? 0.76 : 0.56 }}
              transform={`translate(${node.x} ${node.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${node.title}，草稿知识，前置层级 ${node.depth}`}
              onClick={() => onSelectKnowledge(node.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectKnowledge(node.id); } }}
            >
              <title>{node.title}</title>
              <rect width={node.width} height={node.height} rx={14} />
              <circle className="ef-tree-node-dot" cx={13} cy={14} r={4.4} />
              <text className="ef-tree-node-name" x={23} y={18}>{truncateCapsuleTitle(node.title)}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export function ArchiveDraftTreeLegend({ counts }: { counts: { one: number; two: number; three: number } }) {
  return (
    <div className="ef-archive-draft-tree-legend" role="group" aria-label="草稿前置层级图例">
      <span><i className="is-one">1</i>前置 1 · {counts.one} 个</span>
      <span><i className="is-two">2</i>前置 2 · {counts.two} 个</span>
      <span><i className="is-three">3</i>前置 3 · {counts.three} 个</span>
    </div>
  );
}
