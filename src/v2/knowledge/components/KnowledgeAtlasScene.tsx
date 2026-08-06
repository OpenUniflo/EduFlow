import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Material,
  type Texture
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
  searchMatchId?: string | null;
  currentLearningId?: string | null;
  autoRotate?: boolean;
  className?: string;
  onNodeClick?: (node: AtlasSceneNode) => void;
  onBackgroundClick?: () => void;
};

type LabelState = { id: string; title: string; x: number; y: number; priority: number; forced: boolean };
type NodeVisual = {
  group: Group;
  sphere: Mesh<SphereGeometry, MeshStandardMaterial>;
  glow: Sprite;
  ring?: Mesh<RingGeometry, MeshBasicMaterial>;
  materials: Material[];
};

function alphaColor(hex: string, alpha: number) {
  const color = new Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function endpointId(endpoint: unknown) {
  return typeof endpoint === "object" && endpoint !== null && "id" in endpoint ? String((endpoint as { id?: string | number }).id ?? "") : String(endpoint ?? "");
}

function labelPriority(
  node: AtlasSceneNode,
  focusTargetId: string | null,
  hoveredId: string | null,
  focusIds: Set<string> | null,
  searchMatchId: string | null,
  currentLearningId: string | null
) {
  if (node.id === focusTargetId) return 100;
  if (node.id === hoveredId) return 95;
  if (node.id === searchMatchId) return 92;
  if (focusIds?.has(node.id)) return 86;
  if (node.id === currentLearningId) return 80;
  if (node.featured) return 60;
  if (node.status === "learning") return 55;
  if (node.isCore) return 40;
  return 10;
}

function overlaps(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function sameLabels(left: LabelState[], right: LabelState[]) {
  return left.length === right.length && left.every((label, index) => {
    const other = right[index];
    return label.id === other.id
      && label.title === other.title
      && label.priority === other.priority
      && label.forced === other.forced
      && Math.round(label.x) === Math.round(other.x)
      && Math.round(label.y) === Math.round(other.y);
  });
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

function baseRadius(node: AtlasSceneNode, variant: "global" | "personal") {
  if (node.status === "explore") return 3.6;
  if (node.status === "learning") return 6.2;
  return variant === "global" ? 5.2 : 5.4;
}

export const KnowledgeAtlasScene = forwardRef<KnowledgeAtlasSceneHandle, KnowledgeAtlasSceneProps>(function KnowledgeAtlasScene({
  nodes,
  edges,
  variant,
  selectedId = null,
  searchMatchId = null,
  currentLearningId = null,
  autoRotate = false,
  className,
  onNodeClick,
  onBackgroundClick
}, forwardedRef) {
  const graphRef = useRef<ForceGraphMethods<AtlasSceneNode, AtlasSceneEdge> | undefined>(undefined);
  const graphBootedRef = useRef(false);
  const graphResumeTimerRef = useRef<number | null>(null);
  const disposeTimerRef = useRef<number | null>(null);
  const initialFitRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visualByIdRef = useRef(new Map<string, NodeVisual>());
  const presentationRef = useRef({ focusTargetId: null as string | null, hoveredId: null as string | null, focusIds: null as Set<string> | null });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelState[]>([]);

  const resources = useMemo(() => {
    const spheres = new Map<string, SphereGeometry>();
    const rings = new Map<string, RingGeometry>();
    const textures = new Map<string, Texture>();
    return {
      sphere(radius: number) {
        const key = radius.toFixed(1);
        let geometry = spheres.get(key);
        if (!geometry) {
          geometry = new SphereGeometry(radius, 18, 18);
          spheres.set(key, geometry);
        }
        return geometry;
      },
      ring(radius: number) {
        const key = radius.toFixed(1);
        let geometry = rings.get(key);
        if (!geometry) {
          geometry = new RingGeometry(radius * 1.42, radius * 1.64, 32);
          rings.set(key, geometry);
        }
        return geometry;
      },
      glow(color: string) {
        let texture = textures.get(color);
        if (!texture) {
          texture = makeGlowTexture(color);
          textures.set(color, texture);
        }
        return texture;
      },
      dispose() {
        spheres.forEach((geometry) => geometry.dispose());
        rings.forEach((geometry) => geometry.dispose());
        textures.forEach((texture) => texture.dispose());
        spheres.clear();
        rings.clear();
        textures.clear();
      }
    };
  }, []);

  const renderNodes = useMemo<RenderNode[]>(() => nodes.map((node) => ({ ...node })), [nodes]);
  const renderEdges = useMemo<RenderEdge[]>(() => edges.map((edge) => ({ ...edge })), [edges]);
  const graphData = useMemo(() => ({ nodes: renderNodes, links: renderEdges }), [renderEdges, renderNodes]);
  const nodeById = useMemo(() => new Map(renderNodes.map((node) => [node.id, node])), [renderNodes]);
  const focusTargetId = selectedId ?? searchMatchId ?? null;
  const focusIds = useMemo(() => {
    if (!focusTargetId) return null;
    const ids = new Set([focusTargetId]);
    renderEdges.forEach((edge) => {
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (source === focusTargetId) ids.add(target);
      if (target === focusTargetId) ids.add(source);
    });
    return ids;
  }, [focusTargetId, renderEdges]);

  presentationRef.current = { focusTargetId, hoveredId, focusIds };

  const disposeVisual = useCallback((visual: NodeVisual) => visual.materials.forEach((material) => material.dispose()), []);

  const applyNodeAppearance = useCallback((node: AtlasSceneNode, visual: NodeVisual) => {
    const presentation = presentationRef.current;
    const selected = node.id === presentation.focusTargetId;
    const hovered = node.id === presentation.hoveredId;
    const neighbor = Boolean(presentation.focusIds?.has(node.id) && !selected);
    const unrelated = Boolean(presentation.focusTargetId && !presentation.focusIds?.has(node.id));
    const defaultOpacity = node.status === "explore" ? 0.38 : 0.82;
    const opacity = selected || hovered ? 1 : neighbor ? 0.9 : unrelated ? (node.status === "explore" ? 0.07 : 0.1) : defaultOpacity;
    visual.sphere.scale.setScalar(selected ? 1.3 : hovered ? 1.12 : 1);
    visual.sphere.material.opacity = opacity;
    visual.sphere.material.emissiveIntensity = selected ? 1.35 : neighbor || hovered ? 0.72 : unrelated ? 0.08 : 0.55;
    const glowMaterial = visual.glow.material as SpriteMaterial;
    glowMaterial.opacity = selected ? 0.7 : hovered ? 0.58 : neighbor ? 0.34 : unrelated ? 0.015 : node.status === "explore" ? 0.1 : 0.24;
    if (visual.ring) visual.ring.material.opacity = unrelated ? 0.06 : selected ? 1 : neighbor ? 0.9 : 0.82;
  }, []);

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
    instance.pauseAnimation();
    graphResumeTimerRef.current = window.setTimeout(() => {
      instance.resumeAnimation();
      graphResumeTimerRef.current = null;
    }, 60);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () => {
      const next = { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) };
      setSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controls = graphRef.current?.controls() as { autoRotate?: boolean; autoRotateSpeed?: number; enableDamping?: boolean; dampingFactor?: number } | undefined;
    if (!controls) return;
    controls.autoRotate = autoRotate && !focusTargetId;
    controls.autoRotateSpeed = 0.16;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }, [autoRotate, focusTargetId]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    initialFitRef.current = false;
    const charge = graph.d3Force("charge");
    if (charge && "strength" in charge) (charge as unknown as { strength: (value: number) => unknown }).strength(variant === "global" ? -54 : -82);
    const link = graph.d3Force("link");
    if (link && "distance" in link) (link as unknown as { distance: (value: number) => unknown }).distance(variant === "global" ? 46 : 64);
    graph.d3ReheatSimulation();
  }, [graphData, variant]);

  useEffect(() => {
    const visibleIds = new Set(renderNodes.map((node) => node.id));
    visualByIdRef.current.forEach((visual, id) => {
      if (visibleIds.has(id)) return;
      disposeVisual(visual);
      visualByIdRef.current.delete(id);
    });
  }, [disposeVisual, renderNodes]);

  useEffect(() => {
    visualByIdRef.current.forEach((visual, id) => {
      const node = nodeById.get(id);
      if (node) applyNodeAppearance(node, visual);
    });
  }, [applyNodeAppearance, focusIds, focusTargetId, hoveredId, nodeById]);

  useEffect(() => {
    if (disposeTimerRef.current) window.clearTimeout(disposeTimerRef.current);
    disposeTimerRef.current = null;
    return () => {
      // Delay disposal by one task so React Strict Mode's effect replay can
      // cancel the teardown while a real unmount still releases GPU assets.
      disposeTimerRef.current = window.setTimeout(() => {
        if (graphResumeTimerRef.current) window.clearTimeout(graphResumeTimerRef.current);
        visualByIdRef.current.forEach(disposeVisual);
        visualByIdRef.current.clear();
        resources.dispose();
        disposeTimerRef.current = null;
      }, 0);
    };
  }, [disposeVisual, resources]);

  const focusNode = useCallback((nodeId: string) => {
    const graph = graphRef.current;
    const node = nodeById.get(nodeId);
    if (!graph || !node || !Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) return false;
    const target = { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 };
    const camera = graph.camera();
    let vector = { x: camera.position.x - target.x, y: camera.position.y - target.y, z: camera.position.z - target.z };
    let length = Math.hypot(vector.x, vector.y, vector.z);
    if (length < 1) {
      vector = { x: 0.24, y: 0.14, z: 1 };
      length = Math.hypot(vector.x, vector.y, vector.z);
    }
    const distance = variant === "personal" ? 190 : 155;
    graph.cameraPosition({
      x: target.x + vector.x / length * distance,
      y: target.y + vector.y / length * distance,
      z: target.z + vector.z / length * distance
    }, target, 620);
    return true;
  }, [nodeById, variant]);

  useEffect(() => {
    if (!focusTargetId) return;
    let attempts = 0;
    let timer = 0;
    const tryFocus = () => {
      if (focusNode(focusTargetId) || attempts >= 12) return;
      attempts += 1;
      timer = window.setTimeout(tryFocus, 80);
    };
    tryFocus();
    return () => window.clearTimeout(timer);
  }, [focusNode, focusTargetId]);

  const updateLabels = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const camera = graph.camera();
    const cameraDistance = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
    const far = cameraDistance > (variant === "global" ? 760 : 680);
    const medium = cameraDistance > (variant === "global" ? 480 : 420);
    const candidates = renderNodes
      .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
      .map((node) => ({ node, priority: labelPriority(node, focusTargetId, hoveredId, focusIds, searchMatchId, currentLearningId) }))
      .filter(({ node, priority }) => {
        if (priority >= 80) return true;
        if (focusTargetId) return false;
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
      const forced = node.id === focusTargetId || node.id === hoveredId;
      if (!forced && accepted.some((label) => overlaps(box, label))) return;
      accepted.push({ id: node.id, title: node.title, x: screen.x, y: box.y, priority, forced, width, height: box.height });
    });
    const next = accepted.map(({ width: _width, height: _height, ...label }) => label);
    setLabels((current) => sameLabels(current, next) ? current : next);
  }, [currentLearningId, focusIds, focusTargetId, hoveredId, renderNodes, searchMatchId, size.height, size.width, variant]);

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
    const existing = visualByIdRef.current.get(item.id);
    if (existing) return existing.group;
    const radius = baseRadius(item, variant);
    const group = new Group();
    const sphereMaterial = new MeshStandardMaterial({
      color: item.color,
      emissive: item.color,
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: item.status === "explore" ? 0.38 : 0.82
    });
    const sphere = new Mesh(resources.sphere(radius), sphereMaterial);
    group.add(sphere);
    const glowMaterial = new SpriteMaterial({
      map: resources.glow(item.color),
      color: item.color,
      transparent: true,
      opacity: item.status === "explore" ? 0.1 : 0.24,
      depthWrite: false,
      blending: AdditiveBlending
    });
    const glow = new Sprite(glowMaterial);
    glow.scale.set(radius * 5.8, radius * 5.8, 1);
    group.add(glow);
    const materials: Material[] = [sphereMaterial, glowMaterial];
    let ring: NodeVisual["ring"];
    if (item.status === "mastered" || item.status === "learning") {
      const ringMaterial = new MeshBasicMaterial({
        color: item.status === "mastered" ? "#55ae89" : "#6f89ef",
        transparent: true,
        opacity: 0.82,
        side: DoubleSide,
        depthWrite: false
      });
      ring = new Mesh(resources.ring(radius), ringMaterial);
      ring.rotation.x = Math.PI / 2.8;
      group.add(ring);
      materials.push(ringMaterial);
    }
    const visual = { group, sphere, glow, ring, materials };
    visualByIdRef.current.set(item.id, visual);
    applyNodeAppearance(item, visual);
    return group;
  }, [applyNodeAppearance, resources, variant]);

  useImperativeHandle(forwardedRef, () => ({
    fit: () => graphRef.current?.zoomToFit(480, variant === "personal" ? 110 : 70),
    focus: (nodeId: string) => { focusNode(nodeId); },
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
  }), [focusNode, variant]);

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
          const incident = Boolean(focusTargetId && (focusTargetId === source || focusTargetId === target));
          if (incident) return alphaColor(nodeById.get(focusTargetId ?? "")?.color ?? "#697ee6", 0.72);
          if (focusTargetId) return "rgba(92,112,145,0.018)";
          return variant === "global" ? "rgba(104,126,160,0.075)" : "rgba(92,112,145,0.09)";
        }}
        linkWidth={(edge) => {
          const source = endpointId(edge.source);
          const target = endpointId(edge.target);
          if (focusTargetId && (focusTargetId === source || focusTargetId === target)) return 1.45;
          return focusTargetId ? 0.08 : 0.24;
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
