import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial
} from "three";
import type { AtlasSceneEdge, AtlasSceneNode } from "../projections/atlasProjections";

type RenderNode = NodeObject<AtlasSceneNode> & AtlasSceneNode;
type RenderEdge = LinkObject<AtlasSceneNode, AtlasSceneEdge> & AtlasSceneEdge;

export type KnowledgeAtlasSceneHandle = {
  fit: () => void;
  focus: (nodeId: string) => void;
  reset: () => void;
  zoomBy: (multiplier: number) => void;
};

export type KnowledgeAtlasSceneProps = {
  nodes: AtlasSceneNode[];
  edges: AtlasSceneEdge[];
  variant: "global" | "personal";
  selectedId?: string | null;
  autoRotate?: boolean;
  className?: string;
  onNodeClick?: (node: AtlasSceneNode) => void;
  onBackgroundClick?: () => void;
};

type LabelState = { id: string; title: string; x: number; y: number; priority: number; forced: boolean };

function alphaColor(hex: string, alpha: number) {
  const color = new Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function labelPriority(node: AtlasSceneNode, selectedId: string | null, hoveredId: string | null) {
  if (node.id === selectedId) return 100;
  if (node.id === hoveredId) return 90;
  if (node.currentLearning) return 80;
  if (node.searchMatch) return 70;
  if (node.featured) return 60;
  if (node.status === "learning") return 55;
  if (node.isCore) return 40;
  return 10;
}

function overlaps(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function endpointId(endpoint: RenderEdge["source"] | RenderEdge["target"]) {
  return typeof endpoint === "object" && endpoint !== null ? String((endpoint as RenderNode).id) : String(endpoint ?? "");
}

function makeGlowTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, alphaColor("#ffffff", 0.9));
    gradient.addColorStop(0.22, alphaColor(color, 0.7));
    gradient.addColorStop(1, alphaColor(color, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

export const KnowledgeAtlasScene = forwardRef<KnowledgeAtlasSceneHandle, KnowledgeAtlasSceneProps>(function KnowledgeAtlasScene({
  nodes,
  edges,
  variant,
  selectedId = null,
  autoRotate = false,
  className,
  onNodeClick,
  onBackgroundClick
}, forwardedRef) {
  const graphRef = useRef<ForceGraphMethods<AtlasSceneNode, AtlasSceneEdge> | undefined>(undefined);
  const graphBootedRef = useRef(false);
  const graphResumeTimerRef = useRef<number | null>(null);
  const initialFitRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 960, height: 640 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelState[]>([]);

  const renderNodes = useMemo<RenderNode[]>(() => nodes.map((node) => ({ ...node })), [nodes]);
  const renderEdges = useMemo<RenderEdge[]>(() => edges.map((edge) => ({ ...edge })), [edges]);
  const graphData = useMemo(() => ({ nodes: renderNodes, links: renderEdges }), [renderEdges, renderNodes]);
  const nodeById = useMemo(() => new Map(renderNodes.map((node) => [node.id, node])), [renderNodes]);
  const assignGraphRef = useCallback((instance: ForceGraphMethods<AtlasSceneNode, AtlasSceneEdge> | null | undefined) => {
    graphRef.current = instance ?? undefined;
    if (!instance) {
      if (graphResumeTimerRef.current) window.clearTimeout(graphResumeTimerRef.current);
      graphResumeTimerRef.current = null;
      graphBootedRef.current = false;
      return;
    }
    if (graphBootedRef.current) return;
    graphBootedRef.current = true;
    // react-force-graph's underlying Kapsule can start its first animation
    // frame before applying graphData under React 19. Pause that frame and
    // resume after the synchronous property update has initialized D3.
    instance.pauseAnimation();
    graphResumeTimerRef.current = window.setTimeout(() => {
      instance.resumeAnimation();
      graphResumeTimerRef.current = null;
    }, 60);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () => setSize({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controls = graphRef.current?.controls() as { autoRotate?: boolean; autoRotateSpeed?: number; enableDamping?: boolean; dampingFactor?: number } | undefined;
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.16;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }, [autoRotate]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const charge = graph.d3Force("charge");
    if (charge && "strength" in charge) (charge as unknown as { strength: (value: number) => unknown }).strength(variant === "global" ? -54 : -82);
    const link = graph.d3Force("link");
    if (link && "distance" in link) (link as unknown as { distance: (value: number) => unknown }).distance(variant === "global" ? 46 : 64);
    graph.d3ReheatSimulation();
  }, [graphData, variant]);

  const updateLabels = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const camera = graph.camera();
    const cameraDistance = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
    const far = cameraDistance > (variant === "global" ? 760 : 680);
    const medium = cameraDistance > (variant === "global" ? 480 : 420);
    const candidates = renderNodes
      .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
      .map((node) => ({ node, priority: labelPriority(node, selectedId, hoveredId) }))
      .filter(({ node, priority }) => {
        if (priority >= 70) return true;
        if (far) return priority >= 60;
        if (medium) return priority >= (variant === "personal" ? 40 : 55);
        return priority >= (node.status === "explore" ? 35 : variant === "personal" ? 30 : 10);
      })
      .sort((left, right) => right.priority - left.priority || left.node.id.localeCompare(right.node.id));
    const accepted: Array<LabelState & { width: number; height: number }> = [];
    candidates.forEach(({ node, priority }) => {
      const screen = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      if (screen.x < -80 || screen.x > size.width + 80 || screen.y < -40 || screen.y > size.height + 50) return;
      const width = Math.min(180, Math.max(44, node.title.length * 11 + 18));
      const box = { x: screen.x - width / 2, y: screen.y + (node.status === "explore" ? 12 : 16), width, height: 24 };
      const forced = node.id === selectedId || node.id === hoveredId;
      if (!forced && accepted.some((label) => overlaps(box, label))) return;
      accepted.push({ id: node.id, title: node.title, x: screen.x, y: box.y, priority, forced, width, height: box.height });
    });
    setLabels(accepted.map(({ width: _width, height: _height, ...label }) => label));
  }, [hoveredId, renderNodes, selectedId, size.height, size.width, variant]);

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const tick = (time: number) => {
      if (time - previous > 80) {
        previous = time;
        updateLabels();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [updateLabels]);

  const nodeThreeObject = useCallback((node: NodeObject<AtlasSceneNode>) => {
    const item = node as RenderNode;
    const group = new Group();
    const selected = item.id === selectedId;
    const hovered = item.id === hoveredId;
    const radius = item.status === "explore" ? 3.6 : item.status === "learning" ? 6.2 : variant === "global" ? 5.2 : 5.4;
    const opacity = selected || hovered ? 1 : item.status === "explore" ? 0.38 : 0.82;
    const sphere = new Mesh(
      new SphereGeometry(radius * (selected ? 1.28 : 1), 18, 18),
      new MeshStandardMaterial({ color: item.color, emissive: item.color, emissiveIntensity: selected ? 1.25 : 0.55, roughness: 0.28, metalness: 0.08, transparent: true, opacity })
    );
    group.add(sphere);
    const glow = new Sprite(new SpriteMaterial({ map: makeGlowTexture(item.color), color: item.color, transparent: true, opacity: selected || hovered ? 0.62 : item.status === "explore" ? 0.1 : 0.24, depthWrite: false, blending: AdditiveBlending }));
    glow.scale.set(radius * 5.8, radius * 5.8, 1);
    group.add(glow);
    if (item.status === "mastered" || item.status === "learning") {
      const ringColor = item.status === "mastered" ? "#55ae89" : "#6f89ef";
      const ring = new Mesh(new RingGeometry(radius * 1.42, radius * 1.64, 32), new MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.82, side: 2, depthWrite: false }));
      ring.rotation.x = Math.PI / 2.8;
      group.add(ring);
    }
    return group;
  }, [hoveredId, selectedId, variant]);

  useImperativeHandle(forwardedRef, () => ({
    fit: () => graphRef.current?.zoomToFit(480, variant === "personal" ? 110 : 70),
    focus: (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) return;
      const distance = variant === "personal" ? 130 : 105;
      const length = Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0) || 1;
      const ratio = 1 + distance / length;
      graphRef.current?.cameraPosition({ x: (node.x ?? 0) * ratio, y: (node.y ?? 0) * ratio, z: (node.z ?? 0) * ratio }, { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 }, 650);
    },
    reset: () => {
      graphRef.current?.cameraPosition({ x: 0, y: 0, z: variant === "personal" ? 520 : 620 }, { x: 0, y: 0, z: 0 }, 500);
      window.setTimeout(() => graphRef.current?.zoomToFit(450, variant === "personal" ? 110 : 70), 520);
    },
    zoomBy: (multiplier: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      const camera = graph.camera();
      graph.cameraPosition({ x: camera.position.x / multiplier, y: camera.position.y / multiplier, z: camera.position.z / multiplier }, undefined, 180);
    }
  }), [nodeById, variant]);

  return (
    <div ref={containerRef} className={`knowledge-atlas-scene ${className ?? ""}`}>
      <ForceGraph3D<AtlasSceneNode, AtlasSceneEdge>
        ref={assignGraphRef as never}
        width={size.width}
        height={size.height}
        graphData={graphData}
        forceEngine="d3"
        numDimensions={3}
        backgroundColor={variant === "global" ? "#f4f8fd" : "#f5f8fc"}
        showNavInfo={false}
        nodeThreeObject={nodeThreeObject}
        nodeLabel={() => ""}
        nodeVisibility={() => true}
        linkColor={(edge) => {
          const source = endpointId(edge.source);
          const target = endpointId(edge.target);
          const incident = selectedId === source || selectedId === target;
          return incident ? alphaColor(nodeById.get(selectedId ?? "")?.color ?? "#697ee6", 0.72) : variant === "global" ? "rgba(104,126,160,0.075)" : "rgba(92,112,145,0.09)";
        }}
        linkWidth={(edge) => {
          const source = endpointId(edge.source);
          const target = endpointId(edge.target);
          return selectedId === source || selectedId === target ? 1.35 : 0.24;
        }}
        linkOpacity={1}
        linkDirectionalArrowLength={0}
        enableNodeDrag={false}
        enableNavigationControls
        controlType="orbit"
        warmupTicks={80}
        cooldownTicks={variant === "global" ? 180 : 140}
        onEngineStop={() => {
          if (initialFitRef.current) return;
          initialFitRef.current = true;
          graphRef.current?.zoomToFit(600, variant === "personal" ? 110 : 70);
        }}
        onNodeHover={(node) => setHoveredId(node?.id ? String(node.id) : null)}
        onNodeClick={(node) => onNodeClick?.(node as RenderNode)}
        onBackgroundClick={onBackgroundClick}
      />
      <div className="knowledge-atlas-label-layer" aria-hidden="true">
        {labels.map((label) => <span key={label.id} className={label.forced ? "forced" : ""} style={{ transform: `translate(${label.x}px, ${label.y}px) translate(-50%, 0)` }}>{label.title}</span>)}
      </div>
    </div>
  );
});
