import { forwardRef, useCallback, useEffect, useImperativeHandle, useId, useMemo, useRef, useState } from "react";
import { useReducedMotion } from 'motion/react';
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
import { actionBranchColors, actionBranchPath, type ActionBranch } from "./actionBranches";
import { createProjectLaser } from "./projectLaser";
import { computeDownstreamSubgraph } from "../atlasDownstream";
import type { AtlasSceneEdge, AtlasSceneNode } from "../projections/atlasProjections";
import { atlasStructureKey, canonicalAtlasCamera, freezeAtlasNodePositions, resetAtlasCamera } from "../atlasCamera";
import type { RouteOverlay, RouteOverlayState } from '@/shared/learning/routePresentation';

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
  variant: "global" | "personal" | "project";
  selectedId?: string | null;
  searchMatchId?: string | null;
  currentLearningId?: string | null;
  autoRotate?: boolean;
  className?: string;
  onNodeClick?: (node: AtlasSceneNode) => void;
  onBackgroundClick?: () => void;
  onEdgeClick?: (edge: AtlasSceneEdge) => void;
  actionBranches?: ActionBranch[];
  onActionClick?: (id: string) => void;
  visibleNodeIds?: ReadonlySet<string>;
  routeOverlay?: RouteOverlay;
  selectedEdgeId?: string|null;
  draftNodeChanges?: {include:readonly string[];exclude:readonly string[]};
  edgeActionCounts?: ReadonlyMap<string, number>;
};

type LabelState = { id: string; title: string; x: number; y: number; priority: number; forced: boolean };
type NodeVisual = {
  group: Group;
  sphere: Mesh<SphereGeometry, MeshStandardMaterial>;
  hitTarget: Mesh<SphereGeometry, MeshBasicMaterial>;
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
    gradient.addColorStop(0, alphaColor(color, 0.62));
    gradient.addColorStop(0.28, alphaColor(color, 0.34));
    gradient.addColorStop(1, alphaColor(color, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

function baseRadius(node: AtlasSceneNode, variant: "global" | "personal" | "project") {
  const importanceRadius = 3.4 + Math.max(0, Math.min(1, node.visualImportance)) * 3.6;
  if (variant !== "project" && node.status === "explore") return Math.max(3.2, importanceRadius * 0.76);
  return variant === "global" ? importanceRadius : 3.6 + Math.max(0, Math.min(1, node.visualImportance)) * 2.6;
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
  actionBranches,
  onEdgeClick,
  onActionClick,
  visibleNodeIds,
  routeOverlay,
  selectedEdgeId,
  draftNodeChanges,
  edgeActionCounts,
  onBackgroundClick
}, forwardedRef) {
  const reducedMotion = useReducedMotion();
  const graphRef = useRef<ForceGraphMethods<AtlasSceneNode, AtlasSceneEdge> | undefined>(undefined);
  const graphBootedRef = useRef(false);
  const graphResumeTimerRef = useRef<number | null>(null);
  const hoverResumeTimerRef = useRef<number | null>(null);
  const manualResumeTimerRef = useRef<number | null>(null);
  const disposeTimerRef = useRef<number | null>(null);
  const initialCameraInitializedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visualByIdRef = useRef(new Map<string, NodeVisual>());
  const presentationRef = useRef({ focusTargetId: null as string | null, hoveredId: null as string | null, focusIds: null as Set<string> | null });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualInteraction, setManualInteraction] = useState(false);
  const [branchPositions, setBranchPositions] = useState<Array<ActionBranch & { path: string; x: number; y: number }>>([]);
  const [labels, setLabels] = useState<LabelState[]>([]);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const routeArrowId=useId().replace(/:/g,'');
  const [routePositions, setRoutePositions] = useState<{ nodes: { id: string; state: RouteOverlayState | 'context'; x: number; y: number }[]; edges: { id: string; state: RouteOverlayState | 'context'; x1: number; y1: number; x2: number; y2: number }[] }>({ nodes: [], edges: [] });
  const [edgeHint, setEdgeHint] = useState<{ x: number; y: number; text: string } | null>(null);
  const isVisible = useCallback((id: string) => !visibleNodeIds || visibleNodeIds.has(id), [visibleNodeIds]);

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

  const laser = useMemo(() => createProjectLaser(), []);

  const structureKey = useMemo(() => atlasStructureKey(nodes, edges, variant), [edges, nodes, variant]);
  const retainedNodes = useRef(new Map<string, RenderNode>());
  const retainedEdges = useRef(new Map<string, RenderEdge>());
  // Presentation-only fields intentionally do not participate in structural graph identity.
  // ForceGraph binds Three objects to data-object identity. Replacing retained data
  // while reusing its cached Three object lets removal of the old datum detach it.
  const renderNodes = useMemo<RenderNode[]>(() => {
    const next = nodes.map(node => retainedNodes.current.get(node.id) ?? { ...node });
    retainedNodes.current = new Map(next.map(node => [node.id, node]));
    return next;
  }, [structureKey]);
  const renderEdges = useMemo<RenderEdge[]>(() => {
    const next = edges.map(edge => {
      const old = retainedEdges.current.get(edge.id);
      return old && endpointId(old.source) === endpointId(edge.source) && endpointId(old.target) === endpointId(edge.target) ? old : { ...edge };
    });
    retainedEdges.current = new Map(next.map(edge => [edge.id, edge]));
    return next;
  }, [structureKey]);
  const graphData = useMemo(() => ({ nodes: renderNodes, links: renderEdges }), [renderEdges, renderNodes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const renderNodeById = useMemo(() => new Map(renderNodes.map((node) => [node.id, node])), [renderNodes]);
  const focusTargetId = selectedId ?? searchMatchId ?? null;
  const downstream = useMemo(() => variant === "project" && focusTargetId
    ? computeDownstreamSubgraph(focusTargetId, edges.filter(edge => isVisible(edge.source) && isVisible(edge.target))) : null, [variant, focusTargetId, edges, isVisible]);
  useEffect(() => { laser.select(downstream?.edgeIds); }, [laser, downstream]);
  useEffect(() => { laser.retain(new Set(renderEdges.map(edge => edge.id))); }, [laser, renderEdges]);
  const linkThreeObject = useCallback((edge: RenderEdge) => laser.object(edge.id), [laser]);
  const linkPositionUpdate = useCallback((object: import('three').Object3D, { start, end }: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }) => {
    laser.position(object, start, end);
  }, [laser]);
  const focusIds = useMemo(() => {
    if (downstream) return downstream.nodeIds;
    if (!focusTargetId) return null;
    const ids = new Set([focusTargetId]);
    renderEdges.forEach((edge) => {
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (source === focusTargetId) ids.add(target);
      if (target === focusTargetId) ids.add(source);
    });
    return ids;
  }, [focusTargetId, renderEdges, downstream]);

  presentationRef.current = { focusTargetId, hoveredId, focusIds };

  const disposeVisual = useCallback((visual: NodeVisual) => visual.materials.forEach((material) => material.dispose()), []);

  const applyNodeAppearance = useCallback((node: AtlasSceneNode, visual: NodeVisual) => {
    const presentation = presentationRef.current;
    const selected = node.id === presentation.focusTargetId;
    const hovered = node.id === presentation.hoveredId;
    const neighbor = Boolean(presentation.focusIds?.has(node.id) && !selected);
    const unrelated = Boolean(presentation.focusTargetId && !presentation.focusIds?.has(node.id));
    const defaultOpacity = node.capabilityRoles ? 0.82 : node.status === "explore" ? 0.38 : 0.82;
    const opacity = selected || hovered ? 1 : neighbor ? 0.9 : unrelated ? (node.status === "explore" ? 0.07 : 0.1) : defaultOpacity;
    visual.sphere.scale.setScalar(selected ? 1.3 : hovered ? 1.12 : 1);
    visual.sphere.material.color.set(node.color);
    visual.sphere.material.emissive.set(node.color);
    visual.sphere.material.opacity = opacity;
    visual.sphere.material.emissiveIntensity = selected ? 0.72 : neighbor || hovered ? 0.38 : unrelated ? 0.04 : 0.18;
    const glowMaterial = visual.glow.material as SpriteMaterial;
    glowMaterial.color.set(node.color);
    glowMaterial.map = resources.glow(node.color);
    glowMaterial.needsUpdate = true;
    glowMaterial.opacity = selected ? 0.46 : hovered ? 0.3 : neighbor ? 0.14 : unrelated ? 0.008 : node.status === "explore" ? 0.04 : 0.1;
    if (visual.ring) visual.ring.material.opacity = unrelated ? 0.06 : selected ? 1 : neighbor ? 0.9 : 0.82;
  }, [resources]);

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
    if (!initialCameraInitializedRef.current) {
      const camera = canonicalAtlasCamera(variant);
      instance.cameraPosition(camera.position, camera.lookAt, 0);
      initialCameraInitializedRef.current = true;
    }
    graphResumeTimerRef.current = window.setTimeout(() => {
      instance.resumeAnimation();
      graphResumeTimerRef.current = null;
    }, 60);
  }, [variant]);

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
    controls.autoRotate = !reducedMotion && variant === "global" && autoRotate && !focusTargetId && !hoveredId && !hoverPaused && !manualInteraction;
    controls.autoRotateSpeed = 0.16;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }, [autoRotate, focusTargetId, hoverPaused, hoveredId, manualInteraction, variant, reducedMotion]);

  useEffect(() => {
    const controls = graphRef.current?.controls() as { addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } | undefined;
    if (!controls?.addEventListener) return;
    const start = () => {
      if (manualResumeTimerRef.current) window.clearTimeout(manualResumeTimerRef.current);
      setManualInteraction(true);
    };
    const end = () => {
      if (manualResumeTimerRef.current) window.clearTimeout(manualResumeTimerRef.current);
      manualResumeTimerRef.current = window.setTimeout(() => setManualInteraction(false), 1400);
    };
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    return () => {
      controls.removeEventListener?.("start", start);
      controls.removeEventListener?.("end", end);
      if (manualResumeTimerRef.current) window.clearTimeout(manualResumeTimerRef.current);
    };
  }, [size.width]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const charge = graph.d3Force("charge");
    if (charge && "strength" in charge) (charge as unknown as { strength: (value: number) => unknown }).strength(variant === "global" ? -54 : -82);
    const link = graph.d3Force("link");
    if (link && "distance" in link) (link as unknown as { distance: (value: number) => unknown }).distance(variant === "global" ? 46 : 64);
    renderNodes.forEach((node) => { node.fx = undefined; node.fy = undefined; node.fz = undefined; });
    graph.d3ReheatSimulation();
  }, [graphData, renderNodes, structureKey, variant]);

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
        if (hoverResumeTimerRef.current) window.clearTimeout(hoverResumeTimerRef.current);
        if (manualResumeTimerRef.current) window.clearTimeout(manualResumeTimerRef.current);
        visualByIdRef.current.forEach(disposeVisual);
        visualByIdRef.current.clear();
        resources.dispose();
        laser.dispose();
        disposeTimerRef.current = null;
      }, 0);
    };
  }, [disposeVisual, resources, laser]);

  const focusNode = useCallback((nodeId: string) => {
    const graph = graphRef.current;
    const node = renderNodeById.get(nodeId);
    if (!graph || !node || !Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) return false;
    if (variant === "project") {
      // Keep the support chain visible; project focus is a user-driven fit over the stable world.
      graph.zoomToFit(reducedMotion ? 0 : 320, Math.min(180, size.height * .28), node => isVisible(String(node.id)));
      return true;
    }
    const target = { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 };
    const camera = graph.camera();
    let vector = { x: camera.position.x - target.x, y: camera.position.y - target.y, z: camera.position.z - target.z };
    let length = Math.hypot(vector.x, vector.y, vector.z);
    if (length < 1) {
      vector = { x: 0.24, y: 0.14, z: 1 };
      length = Math.hypot(vector.x, vector.y, vector.z);
    }
    const neighborhoodRadius = focusIds ? Math.max(0, ...[...focusIds].map((id) => {
      const neighbor = renderNodeById.get(id);
      return neighbor && Number.isFinite(neighbor.x) ? Math.hypot((neighbor.x ?? 0) - target.x, (neighbor.y ?? 0) - target.y, (neighbor.z ?? 0) - target.z) : 0;
    })) : 0;
    const distance = Math.max(variant === "personal" ? 190 : 165, neighborhoodRadius * 2.1);
    graph.cameraPosition({
      x: target.x + vector.x / length * distance,
      y: target.y + vector.y / length * distance,
      z: target.z + vector.z / length * distance
    }, target, reducedMotion ? 0 : 320);
    return true;
  }, [focusIds, renderNodeById, variant, size.height, isVisible, reducedMotion]);

  useEffect(() => {
    if (!focusTargetId || variant === "project") return;
    let attempts = 0;
    let timer = 0;
    const tryFocus = () => {
      if (focusNode(focusTargetId) || attempts >= 12) return;
      attempts += 1;
      timer = window.setTimeout(tryFocus, 80);
    };
    tryFocus();
    return () => window.clearTimeout(timer);
  }, [focusNode, focusTargetId, variant]);

  const updateLabels = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const screenNode = (id: string) => {
      const node = renderNodeById.get(id);
      return node && isVisible(id) && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)
        ? graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0, node.z ?? 0) : null;
    };
    const positionedRoute = {
      nodes: (variant==='project'?renderNodes.map(node=>({id:node.id,state:routeOverlay?.nodes.find(item=>item.id===node.id)?.state??'context' as const})):(routeOverlay?.nodes??[])).flatMap(node => { const point = screenNode(node.id); return point ? [{ ...node, ...point }] : []; }),
      edges: (routeOverlay ? renderEdges : []).flatMap(edge => {
        const item = routeOverlay?.edges.find(item => item.id === edge.id) ?? { id: edge.id, state: 'context' as const };
        const start = screenNode(endpointId(edge.source)), end = screenNode(endpointId(edge.target));
        return start && end ? [{ ...item, x1: start.x, y1: start.y, x2: end.x, y2: end.y }] : [];
      }),
    };
    setRoutePositions(previous => JSON.stringify(previous) === JSON.stringify(positionedRoute) ? previous : positionedRoute);
    const hoveredEdge = renderEdges.find(edge => edge.id === hoveredEdgeId);
    const hintStart = hoveredEdge && screenNode(endpointId(hoveredEdge.source));
    const hintEnd = hoveredEdge && screenNode(endpointId(hoveredEdge.target));
    const count = hoveredEdgeId ? edgeActionCounts?.get(hoveredEdgeId) ?? 0 : 0;
    const hint = hintStart && hintEnd ? { x: (hintStart.x + hintEnd.x) / 2, y: (hintStart.y + hintEnd.y) / 2,
      text: count ? `${count} 个行动方案 · 点击比较` : '当前关系尚未配置行动' } : null;
    setEdgeHint(previous => JSON.stringify(previous) === JSON.stringify(hint) ? previous : hint);
    const positionedBranches = (actionBranches ?? []).flatMap(branch => {
      const edge = renderEdges.find(edge => edge.id === branch.edgeId);
      if (!edge) return [];
      const source = renderNodeById.get(endpointId(edge.source)), target = renderNodeById.get(endpointId(edge.target));
      if (!source || !target || !isVisible(source.id) || !isVisible(target.id) || !Number.isFinite(source.x) || !Number.isFinite(target.x)) return [];
      const alternatives = (actionBranches ?? []).filter(item => item.edgeId === branch.edgeId);
      const start = graph.graph2ScreenCoords(source.x ?? 0, source.y ?? 0, source.z ?? 0);
      const end = graph.graph2ScreenCoords(target.x ?? 0, target.y ?? 0, target.z ?? 0);
      return [{ ...branch, ...actionBranchPath(start, end, alternatives.findIndex(item => item.id === branch.id), alternatives.length) }];
    });
    setBranchPositions(previous => JSON.stringify(previous) === JSON.stringify(positionedBranches) ? previous : positionedBranches);
    const camera = graph.camera();
    const cameraDistance = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
    const far = cameraDistance > (variant === "global" ? 760 : 680);
    const medium = cameraDistance > (variant === "global" ? 480 : 420);
    const candidates = renderNodes
      .filter((node) => !(actionBranches?.length && actionBranches.some(branch => { const edge = renderEdges.find(edge => edge.id === branch.edgeId); return edge && [endpointId(edge.source), endpointId(edge.target)].includes(node.id); })) && isVisible(node.id) && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
      .map((renderNode) => {
        const node = nodeById.get(renderNode.id) ?? renderNode;
        return { node: { ...node, x: renderNode.x, y: renderNode.y, z: renderNode.z } as RenderNode, priority: labelPriority(node, focusTargetId, hoveredId, focusIds, searchMatchId, currentLearningId) };
      })
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
  }, [currentLearningId, focusIds, focusTargetId, hoveredId, renderNodes, renderEdges, renderNodeById, nodeById, actionBranches, searchMatchId, size.height, size.width, variant, isVisible, routeOverlay, hoveredEdgeId, edgeActionCounts]);

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const tick = (time: number) => {
      if (variant === "project") laser.tick(reducedMotion ? 0 : time);
      if (time - previous > 80) {
        previous = time;
        updateLabels();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [updateLabels, laser, variant, reducedMotion]);

  const nodeThreeObject = useCallback((node: NodeObject<AtlasSceneNode>) => {
    const item = node as RenderNode;
    const existing = visualByIdRef.current.get(item.id);
    if (existing) return existing.group;
    const radius = baseRadius(item, variant);
    const group = new Group();
    const sphereMaterial = new MeshStandardMaterial({
      color: item.color,
      emissive: item.color,
      emissiveIntensity: 0.18,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: item.status === "explore" ? 0.38 : 0.82
    });
    const sphere = new Mesh(resources.sphere(radius), sphereMaterial);
    group.add(sphere);
    const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hitTarget = new Mesh(resources.sphere(radius * 2), hitMaterial);
    hitTarget.renderOrder = -1;
    group.add(hitTarget);
    const glowMaterial = new SpriteMaterial({
      map: resources.glow(item.color),
      color: item.color,
      transparent: true,
      opacity: item.status === "explore" ? 0.04 : 0.1,
      depthWrite: false,
      blending: AdditiveBlending
    });
    const glow = new Sprite(glowMaterial);
    glow.scale.set(radius * 2.8, radius * 2.8, 1);
    group.add(glow);
    const materials: Material[] = [sphereMaterial, hitMaterial, glowMaterial];
    let ring: NodeVisual["ring"];
    if (variant !== "project" && (item.status === "mastered" || item.status === "learning")) {
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
    const visual = { group, sphere, hitTarget, glow, ring, materials };
    visualByIdRef.current.set(item.id, visual);
    applyNodeAppearance(item, visual);
    return group;
  }, [applyNodeAppearance, resources, variant]);

  useImperativeHandle(forwardedRef, () => ({
    fit: () => graphRef.current?.zoomToFit(reducedMotion ? 0 : 320, variant === "project" ? Math.min(180, size.height * .28) : variant === "personal" ? 110 : 70, node => isVisible(String(node.id))),
    focus: (nodeId: string) => { focusNode(nodeId); },
    reset: () => {
      const graph = graphRef.current;
      if (!graph) return;
      resetAtlasCamera(variant, (position, lookAt, duration) => graph.cameraPosition(position, lookAt, reducedMotion ? 0 : duration));
    },
    zoomBy: (multiplier: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      const camera = graph.camera();
      graph.cameraPosition({ x: camera.position.x / multiplier, y: camera.position.y / multiplier, z: camera.position.z / multiplier }, undefined, reducedMotion ? 0 : 180);
    }
  }), [focusNode, variant, size.height, isVisible, reducedMotion]);

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
        nodeVisibility={node => isVisible(String(node.id))}
        linkVisibility={edge => isVisible(endpointId(edge.source)) && isVisible(endpointId(edge.target))}
        linkColor={(edge) => {
          const source = endpointId(edge.source);
          const target = endpointId(edge.target);
          const incident = downstream ? downstream.edgeIds.has(edge.id) : Boolean(focusTargetId && (focusTargetId === source || focusTargetId === target));
          const hoverIncident = Boolean(hoveredId && (hoveredId === source || hoveredId === target));
          if (incident && downstream) return "rgba(245,158,11,0.12)";
          if (incident) return alphaColor(nodeById.get(focusTargetId ?? "")?.color ?? "#8392A8", 0.84);
          if (hoverIncident && !downstream) return alphaColor(nodeById.get(hoveredId ?? "")?.color ?? "#8392A8", 0.48);
          if (focusTargetId) return "rgba(92,112,145,0.018)";
          return variant === "global" ? "rgba(131,146,168,0.18)" : "rgba(131,146,168,0.17)";
        }}
        linkWidth={(edge) => {
          const source = endpointId(edge.source);
          const target = endpointId(edge.target);
          if (downstream?.edgeIds.has(edge.id)) return 0.2;
          if (!downstream && focusTargetId && (focusTargetId === source || focusTargetId === target)) return 1.45;
          if (!downstream && hoveredId && (hoveredId === source || hoveredId === target)) return 0.82;
          return focusTargetId ? 0.08 : 0.48;
        }}
        linkOpacity={1}
        linkDirectionalArrowLength={0}
        linkDirectionalParticles={0}
        linkThreeObject={variant === "project" ? linkThreeObject : undefined}
        linkThreeObjectExtend={variant === "project"}
        linkPositionUpdate={variant === "project" ? linkPositionUpdate : undefined}
        enableNodeDrag={false}
        enableNavigationControls
        controlType="orbit"
        warmupTicks={80}
        cooldownTicks={variant === "global" ? 180 : 140}
        onEngineStop={() => {
          freezeAtlasNodePositions(renderNodes);
        }}
        onNodeHover={(node) => {
          if (hoverResumeTimerRef.current) window.clearTimeout(hoverResumeTimerRef.current);
          if (node?.id) {
            setHoverPaused(true);
            setHoveredId(String(node.id));
            return;
          }
          setHoveredId(null);
          hoverResumeTimerRef.current = window.setTimeout(() => setHoverPaused(false), 250);
        }}
        onNodeClick={(node) => onNodeClick?.(node as RenderNode)}
        onLinkClick={(edge) => onEdgeClick?.(edges.find(item => item.id === edge.id) ?? edge as AtlasSceneEdge)}
        onLinkHover={edge => setHoveredEdgeId(edge ? String(edge.id) : null)}
        onBackgroundClick={onBackgroundClick}
      />
      {variant === 'project' && routeOverlay ? <svg className={`atlas-route-overlay ${routeOverlay.preview?'is-preview':''} ${reducedMotion?'reduced-motion':''}`} width={size.width} height={size.height} aria-label={routeOverlay.preview ? '路线预览差异' : '当前正式路线'} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <defs><marker id={routeArrowId} viewBox="0 0 8 8" refX="16" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke"/></marker></defs>
        {routePositions.edges.map(edge=><g key={edge.id} className={`route-overlay-${edge.state}`} data-route-edge={edge.state==='context'?undefined:edge.id} data-route-direction="source-target">
          {edge.state==='kept'?<line className="route-current-baseline" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} strokeWidth={6}/>:null}
          <line className="route-fact-line" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} strokeWidth={edge.state==='context'?1:2.5} markerEnd={edge.state==='context'?undefined:`url(#${routeArrowId})`}/>
          {edge.state!=='context'?<line className="route-directional-pulse" pathLength={100} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} strokeWidth={4} strokeLinecap="round"/>:null}
        </g>)}
        {routePositions.nodes.map(node=><g key={node.id} data-route-node={node.state==='context'?undefined:node.id} data-project-node={node.id} data-x={node.x} data-y={node.y}>
          {node.state==='added'||node.state==='removed'?<circle cx={node.x} cy={node.y} r={16} fill="none" stroke={node.state==='added'?'#087f8c':'#a66651'} strokeWidth={1} strokeDasharray="3 4"/>:null}
          {node.id===selectedId?<circle className="planning-selection" data-selected-node={node.id} cx={node.x} cy={node.y} r={12} fill="none" stroke="#334155" strokeWidth={2}/>:null}
          {draftNodeChanges?.include.includes(node.id)||draftNodeChanges?.exclude.includes(node.id)?<g data-draft-node={node.id} data-draft-state={draftNodeChanges.include.includes(node.id)?'include':'exclude'}><circle cx={node.x+13} cy={node.y-13} r={7} fill="#fff" stroke="#64748b"/><text x={node.x+13} y={node.y-9} textAnchor="middle" fontSize={12} fill="#334155">{draftNodeChanges.include.includes(node.id)?'+':'−'}</text></g>:null}
        </g>)}
        {routePositions.edges.filter(edge=>edge.id===selectedEdgeId).map(edge=><line key={edge.id} data-selected-edge={edge.id} className="planning-selection" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="#334155" strokeWidth={3} strokeLinecap="round"/>)}
      </svg> : null}
      {variant === 'project' && edgeHint ? <div className="atlas-edge-hint" role="tooltip" style={{ transform: `translate(${edgeHint.x}px, ${edgeHint.y}px) translate(-50%, -120%)` }}>{edgeHint.text}</div> : null}
      {variant === 'project' && branchPositions.length > 0 ? <svg className="atlas-action-branches" width={size.width} height={size.height} aria-label="关系上的行动替代方案" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
        {branchPositions.map((branch, index) => <g key={branch.id} className={`action-branch action-branch-${branch.status}`}>
          <path d={branch.path} fill="none" stroke={actionBranchColors[branch.status]} strokeWidth={branch.status === 'candidate' || branch.status === 'unavailable' ? 1.5 : 3} strokeDasharray={branch.status === 'candidate' || branch.status === 'unavailable' ? '4 5' : undefined}/>
          <path d={branch.path} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={() => onActionClick?.(branch.id)}/>
          <g style={{ pointerEvents: 'all', cursor: 'pointer' }} onClick={() => onActionClick?.(branch.id)}><title>{`${index + 1} · ${branch.title}`}</title><circle cx={branch.x} cy={branch.y} r={9} fill="#f5f8fc" stroke={actionBranchColors[branch.status]} strokeWidth={1.5}/><text x={branch.x} y={branch.y + 4} textAnchor="middle" fontSize={11} fill={actionBranchColors[branch.status]}>{index + 1}</text></g>
        </g>)}
      </svg> : null}
      <div className="knowledge-atlas-label-layer" aria-hidden="true">
        {labels.map((label) => <span key={label.id} className={label.id === focusTargetId ? "selected" : ""} style={{ transform: `translate(${label.x}px, ${label.y}px) translate(-50%, 0)` }}>{label.title}</span>)}
      </div>
    </div>
  );
});
