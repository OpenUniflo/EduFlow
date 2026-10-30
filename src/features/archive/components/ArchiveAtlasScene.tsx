import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { ArchiveEdge, ArchiveNode } from "../model/atlasModel";
import type { AtlasCommunity } from "../model/atlasCommunities";
import type { Vec3 } from "../model/atlas3dLayout";
import { placeAtlasLabels, type AtlasLabelCandidate, type AtlasLabelRect } from "../model/atlasLabels";
import type { PlaneChapter } from "../model/coursePlaneLayout";
import type { PlaneDependencyRoute } from "../model/coursePlaneDependencies";

export type ScenePerson = { id: string; name: string; accent: string; nodeIds: ReadonlySet<string> };
export type SceneMode = "default" | "person" | "course" | "draft";
export type SceneInsets = { left?: number; right?: number; top?: number; bottom?: number };

export type ArchiveAtlasSceneHandle = {
  zoomBy(factor: number): void;
  fitAll(options?: { insets?: SceneInsets; padding?: number }): void;
  fitIds(ids: Iterable<string>, options?: { padding?: number; maxRatio?: number; insets?: SceneInsets }): void;
  fitCourse(insets?: SceneInsets): void;
  resetView(): void;
  shiftForDetail(open: boolean): void;
  getZoomPercent(): number;
  getLevel(): number;
};

export type ArchiveAtlasSceneProps = {
  nodes: readonly ArchiveNode[];
  edges: readonly ArchiveEdge[];
  basePositions: Record<string, Vec3>;
  mode: SceneMode;
  modePositions?: Record<string, Vec3> | null;
  planePositions?: Record<string, Vec3> | null;
  planeChapters?: readonly PlaneChapter[];
  planeDependencies?: readonly PlaneDependencyRoute[];
  planeNodeIds?: ReadonlySet<string>;
  planeTargetIds?: ReadonlySet<string>;
  planeCardSize?: { width: number; height: number } | null;
  people?: readonly ScenePerson[];
  communities?: readonly AtlasCommunity[];
  selectedId?: string | null;
  searchIds?: readonly string[];
  assistantIds?: readonly string[];
  draftIds?: readonly string[];
  reducedMotion?: boolean;
  onSelectNode?(id: string | null): void;
  onHoverNode?(id: string | null, point: { x: number; y: number } | null): void;
  onLevelChange?(level: number): void;
  onZoomChange?(percent: number): void;
  onActivatePlaneNode?(id: string): void;
  onBlank?(): void;
  onReady?(): void;
  onResize?(): void;
  ref?: Ref<ArchiveAtlasSceneHandle>;
};

type DomainGroup = { id: string; name: string; color: string; indices: number[] };

type PersonRing = { index: number; color1: THREE.Color; color2: THREE.Color; split: number; alpha: number };

const FOV = 40;
const FOV_T = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const HOME_DIRECTION = new THREE.Vector3(0.28, 0.2, 1).normalize();
const SELECTION_DIM = 0.2;
const PERSON_DIM = 0.5;
const COURSE_DIM = 0.4;
const DETAIL_WIDTH = 372;
const PLANE_BACK = 760;
const CARD_NATURAL_WIDTH = 176;
const CARD_NATURAL_HEIGHT = 40;
/** Keep the world-space 14px card title at ~12px on screen. */
const MIN_CARD_SCALE = 0.86;

function cssVarValue(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  let value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  for (let depth = 0; depth < 5; depth += 1) {
    const match = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
    if (!match) break;
    value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  }
  return value && !value.startsWith("var(") ? value : fallback;
}

function resolveColor(color: string) {
  const match = /^var\((--[a-z0-9-]+)\)$/i.exec(color.trim());
  return match ? cssVarValue(match[1], "#8b93b5") : color;
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.42)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function regionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.roundRect(6, 6, 244, 244, 26);
  context.fillStyle = "rgba(124,108,246,0.10)";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "rgba(124,108,246,0.52)";
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function estimateLabelWidth(text: string, small: string, kind: AtlasLabelCandidate["kind"]) {
  let width = 0;
  for (const character of text) width += character.charCodeAt(0) > 255 ? 13 : 7;
  for (const character of small) width += character.charCodeAt(0) > 255 ? 11 : 6;
  const padding = kind === "domain" ? 34 : kind === "topic" ? 28 : kind === "chapter" || kind === "column" ? 26 : 22;
  // The DOM label is slightly wider than the glyph estimate (padding, dot,
  // blur border); keep a safety margin so collision and clamping match reality.
  return width + padding + (small ? 10 : 0) + 10;
}

function labelHeight(kind: AtlasLabelCandidate["kind"]) {
  if (kind === "domain") return 34;
  if (kind === "topic") return 28;
  if (kind === "chapter" || kind === "column") return 27;
  return 22;
}

/**
 * The Archive's 3D map. Layout is supplied as frozen coordinates by the page;
 * this component owns only camera, points/lines drawing, label culling, level
 * of detail and reversible 600ms node transitions.
 */
export default function ArchiveAtlasScene({
  nodes,
  edges,
  basePositions,
  mode,
  modePositions,
  planePositions,
  planeChapters = [],
  planeDependencies = [],
  planeNodeIds,
  planeTargetIds,
  planeCardSize,
  people = [],
  communities = [],
  selectedId = null,
  searchIds = [],
  assistantIds = [],
  draftIds = [],
  reducedMotion = false,
  onSelectNode,
  onHoverNode,
  onLevelChange,
  onZoomChange,
  onActivatePlaneNode,
  onBlank,
  onReady,
  onResize,
  ref
}: ArchiveAtlasSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ nodes, edges, mode, selectedId, searchIds, assistantIds, draftIds, people, communities, onSelectNode, onHoverNode, onLevelChange, onZoomChange, onActivatePlaneNode, onBlank, onReady, onResize, planeChapters, planeDependencies, planeNodeIds, planeTargetIds, planeCardSize, reducedMotion });
  propsRef.current = { nodes, edges, mode, selectedId, searchIds, assistantIds, draftIds, people, communities, onSelectNode, onHoverNode, onLevelChange, onZoomChange, onActivatePlaneNode, onBlank, onReady, onResize, planeChapters, planeDependencies, planeNodeIds, planeTargetIds, planeCardSize, reducedMotion };

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    points: THREE.Points;
    glowPoints: THREE.Points;
    glowMaterial: THREE.ShaderMaterial;
    pointGeometry: THREE.BufferGeometry;
    pointPosition: THREE.BufferAttribute;
    pointAlpha: THREE.BufferAttribute;
    pointSize: THREE.BufferAttribute;
    pointColor: THREE.BufferAttribute;
    pointMaterial: THREE.ShaderMaterial;
    rings: THREE.Points;
    ringGeometry: THREE.BufferGeometry;
    ringPosition: THREE.BufferAttribute;
    ringColor1: THREE.BufferAttribute;
    ringColor2: THREE.BufferAttribute;
    ringSplit: THREE.BufferAttribute;
    ringAlpha: THREE.BufferAttribute;
    ringSize: THREE.BufferAttribute;
    ringMaterial: THREE.ShaderMaterial;
    edgeLines: THREE.LineSegments;
    edgeGeometry: THREE.BufferGeometry;
    edgePosition: THREE.BufferAttribute;
    edgeAlpha: THREE.BufferAttribute;
    edgeMaterial: THREE.ShaderMaterial;
    highlightLines: LineSegments2;
    highlightGeometry: LineSegmentsGeometry;
    globalLines: LineSegments2;
    globalGeometry: LineSegmentsGeometry;
    domainSprites: THREE.Sprite[];
    topicSprites: THREE.Sprite[];
    domainLinks: Array<{ a: number; b: number; line: Line2; material: LineMaterial; count: number }>;
    regionMeshes: THREE.Mesh[];
    starField: THREE.Points;
    current: Float32Array;
    target: Float32Array;
    alpha: Float32Array;
    targetAlpha: Float32Array;
    size: Float32Array;
    targetSize: Float32Array;
    edgeAlphaCurrent: Float32Array;
    edgeAlphaTarget: Float32Array;
    nodeIndex: Map<string, number>;
    neighbors: number[][];
    domainGroups: DomainGroup[];
    communityGroups: Array<{ indices: number[]; color: string; name: string }>;
    indexById: Map<string, number>;
    dispose(): void;
  } | null>(null);

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const nodeIndex = useMemo(() => new Map(nodeIds.map((id, index) => [id, index])), [nodeIds]);
  const neighbors = useMemo(() => {
    const adjacency = Array.from({ length: nodes.length }, () => [] as number[]);
    edges.forEach((edge) => {
      const source = nodeIndex.get(edge.source);
      const target = nodeIndex.get(edge.target);
      if (source === undefined || target === undefined) return;
      adjacency[source].push(target);
      adjacency[target].push(source);
    });
    return adjacency;
  }, [edges, nodeIndex, nodes.length]);

  const domainGroups = useMemo<DomainGroup[]>(() => {
    const groups = new Map<string, DomainGroup>();
    nodes.forEach((node, index) => {
      const id = node.domainId ?? "__unclassified";
      const group = groups.get(id) ?? { id, name: node.domainTitle || "未分类", color: node.color, indices: [] };
      group.indices.push(index);
      groups.set(id, group);
    });
    return Array.from(groups.values()).sort((left, right) => right.indices.length - left.indices.length || left.id.localeCompare(right.id));
  }, [nodes]);

  const communityGroups = useMemo(() => communities.map((community) => ({
    indices: community.nodeIds.flatMap((id) => {
      const index = nodeIndex.get(id);
      return index === undefined ? [] : [index];
    }),
    color: nodes[nodeIndex.get(community.nodeIds[0]) ?? 0]?.color ?? "#8b93b5",
    name: community.name
  })), [communities, nodeIndex, nodes]);

  const animationRef = useRef({ start: 0, duration: 0, from: null as Float32Array | null, active: false });
  const presentationRef = useRef({ start: 0, duration: 0, fromAlpha: null as Float32Array | null, fromSize: null as Float32Array | null, fromEdge: null as Float32Array | null, active: false });
  const cameraTweenRef = useRef({ start: 0, duration: 0, fromPosition: new THREE.Vector3(), toPosition: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(), active: false });
  const hoveredRef = useRef<number | null>(null);
  const hoverPointRef = useRef<{ x: number; y: number } | null>(null);
  const levelRef = useRef(-1);
  const zoomRef = useRef(0);
  const modeRef = useRef<SceneMode>(mode);
  const modePositionsRef = useRef<Record<string, Vec3> | null>(modePositions ?? null);
  const planePositionsRef = useRef<Record<string, Vec3> | null>(planePositions ?? null);
  const detailShiftRef = useRef(0);
  const lastCourseInsetsRef = useRef<{ left?: number; right?: number; top?: number; bottom?: number }>({});
  const referenceDistanceRef = useRef(1);
  const downRef = useRef<{ x: number; y: number; time: number; button: number } | null>(null);
  const paletteRef = useRef({ edge: "#8b93b5", bright: "#b9b1ff", brandInk: "#4338ca", star: "#9aa6da", global: "#ffb454" });
  const labelPoolRef = useRef(new Map<string, HTMLDivElement>());
  const lastLabelFrameRef = useRef(0);

  function getPosition(index: number) {
    const current = engineRef.current?.current;
    return current ? { x: current[index * 3], y: current[index * 3 + 1], z: current[index * 3 + 2] } : { x: 0, y: 0, z: 0 };
  }

  function targetsForMode() {
    const currentProps = propsRef.current;
    const target = new Float32Array(currentProps.nodes.length * 3);
    const currentModePositions = modePositionsRef.current;
    const base = basePositions;
    currentProps.nodes.forEach((node, index) => {
      const position = currentModePositions?.[node.id] ?? base[node.id] ?? { x: 0, y: 0, z: 0 };
      target[index * 3] = position.x;
      target[index * 3 + 1] = position.y;
      target[index * 3 + 2] = position.z;
    });
    if ((currentProps.mode === "course" || currentProps.mode === "draft") && planePositions) {
      currentProps.nodes.forEach((node, index) => {
        if (planePositions[node.id]) {
          target[index * 3] = planePositions[node.id].x;
          target[index * 3 + 1] = planePositions[node.id].y;
          target[index * 3 + 2] = planePositions[node.id].z;
        } else {
          target[index * 3 + 2] = Math.min(target[index * 3 + 2], 0) - PLANE_BACK;
        }
      });
    }
    return target;
  }

  function presentationTargets() {
    const engine = engineRef.current;
    if (!engine) return;
    const currentProps = propsRef.current;
    const count = currentProps.nodes.length;
    const alpha = new Float32Array(count).fill(0.92);
    const size = new Float32Array(count).fill(1);
    const edgeAlpha = new Float32Array(currentProps.edges.length).fill(0.16);
    const selected = currentProps.selectedId ? engine.nodeIndex.get(currentProps.selectedId) : undefined;
    const selectedNeighborhood = selected === undefined ? null : new Set([selected, ...engine.neighbors[selected]]);
    const personSets = currentProps.people.map((person) => ({ ...person, indices: new Set(Array.from(person.nodeIds).flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; })) }));
    const focusedPersonIndices = new Set<number>();
    personSets.forEach((person) => person.indices.forEach((index) => focusedPersonIndices.add(index)));
    const planeSet = currentProps.planeNodeIds ?? new Set<string>();
    const stationedPlane = new Set(Object.keys(planePositionsRef.current ?? {}));
    const inStationedPlane = (id: string) => planeSet.has(id) && (stationedPlane.size === 0 || stationedPlane.has(id));
    const searching = new Set(currentProps.searchIds.flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; }));
    const assisting = new Set(currentProps.assistantIds.flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; }));
    const drafting = new Set(currentProps.draftIds.flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; }));

    currentProps.nodes.forEach((node, index) => {
      if (selectedNeighborhood) {
        if (index === selected) { alpha[index] = 1; size[index] = 1.65; }
        else if (selectedNeighborhood.has(index)) { alpha[index] = 1; size[index] = 1.2; }
        else { alpha[index] = SELECTION_DIM; size[index] = 0.9; }
      } else if (currentProps.mode === "course" || currentProps.mode === "draft") {
        const inPlane = inStationedPlane(node.id) || drafting.has(index);
        if (inPlane) { alpha[index] = 1; size[index] = 1.35; }
        else { alpha[index] = COURSE_DIM; size[index] = 0.9; }
      } else if (currentProps.mode === "person" && focusedPersonIndices.size) {
        if (focusedPersonIndices.has(index)) { alpha[index] = 1; size[index] = 1.32; }
        else { alpha[index] = PERSON_DIM; size[index] = 0.92; }
      } else if (searching.size) {
        if (searching.has(index)) { alpha[index] = 1; size[index] = 1.45; }
        else { alpha[index] = 0.42; size[index] = 0.92; }
      } else if (assisting.size) {
        if (assisting.has(index)) { alpha[index] = 1; size[index] = 1.4; }
        else { alpha[index] = 0.5; size[index] = 0.94; }
      }
      if (hoveredRef.current === index) { alpha[index] = 1; size[index] = Math.max(1.3, size[index]); }
    });

    const courseMode = currentProps.mode === "course" || currentProps.mode === "draft";
    const hoveredIndex = hoveredRef.current;
    const hoveredPlaneNode = courseMode && hoveredIndex !== null && inStationedPlane(currentProps.nodes[hoveredIndex]?.id ?? "");
    const hoveredNeighbors = hoveredPlaneNode && hoveredIndex !== null ? new Set([hoveredIndex, ...engine.neighbors[hoveredIndex]]) : null;
    if (hoveredNeighbors) {
      hoveredNeighbors.forEach((index) => { alpha[index] = 1; size[index] = Math.max(index === hoveredIndex ? 1.7 : 1.85, size[index]); });
    }
    currentProps.edges.forEach((edge, index) => {
      const source = engine.nodeIndex.get(edge.source);
      const target = engine.nodeIndex.get(edge.target);
      if (source === undefined || target === undefined) return;
      if (selectedNeighborhood) {
        edgeAlpha[index] = edge.source === currentProps.selectedId || edge.target === currentProps.selectedId ? 0.95 : 0.025;
      } else if (courseMode) {
        const sourceIn = inStationedPlane(edge.source) || drafting.has(source);
        const targetIn = inStationedPlane(edge.target) || drafting.has(target);
        const touchesHover = hoveredIndex !== null && (source === hoveredIndex || target === hoveredIndex);
        edgeAlpha[index] = touchesHover ? 0.9 : sourceIn && targetIn ? 0.05 : sourceIn || targetIn ? 0.14 : 0.03;
      } else if (currentProps.mode === "person" && focusedPersonIndices.size) {
        const sourceIn = focusedPersonIndices.has(source);
        const targetIn = focusedPersonIndices.has(target);
        edgeAlpha[index] = sourceIn && targetIn ? 0.46 : sourceIn || targetIn ? 0.16 : 0.06;
      } else if (searching.size || assisting.size) {
        edgeAlpha[index] = 0.05;
      }
    });

    engine.targetAlpha = alpha;
    engine.targetSize = size;
    engine.edgeAlphaTarget = edgeAlpha;
  }

  function startNodeAnimation() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.target = targetsForMode();
    presentationTargets();
    animationRef.current = {
      start: performance.now(),
      duration: propsRef.current.reducedMotion ? 1 : 600,
      from: new Float32Array(engine.current),
      active: true
    };
    startPresentationAnimation(600);
  }

  function startPresentationAnimation(duration = 180) {
    const engine = engineRef.current;
    if (!engine) return;
    presentationRef.current = {
      start: performance.now(),
      duration: propsRef.current.reducedMotion ? 1 : duration,
      fromAlpha: new Float32Array(engine.alpha),
      fromSize: new Float32Array(engine.size),
      fromEdge: new Float32Array(engine.edgeAlphaCurrent),
      active: true
    };
  }

  function animateCamera(position: THREE.Vector3, target: THREE.Vector3, duration = 600) {
    const engine = engineRef.current;
    if (!engine) return;
    const ms = propsRef.current.reducedMotion ? 1 : duration;
    cameraTweenRef.current = {
      start: performance.now(),
      duration: ms,
      fromPosition: engine.camera.position.clone(),
      toPosition: position.clone(),
      fromTarget: engine.controls.target.clone(),
      toTarget: target.clone(),
      active: true
    };
  }

  function pxPerWorld(distance: number, height: number) {
    return height / (2 * distance * FOV_T);
  }

  function fitBoundsOf(indices: Iterable<number>, options: { inset?: SceneInsets; padding?: number; maxRatio?: number; direction?: THREE.Vector3; useTarget?: boolean } = {}) {
    const engine = engineRef.current;
    if (!engine) return;
    const width = engine.renderer.domElement.clientWidth || 1;
    const height = engine.renderer.domElement.clientHeight || 1;
    const unique = Array.from(new Set(indices));
    const source = options.useTarget ? engine.target : engine.current;
    const points = unique.map((index) => ({ x: source[index * 3], y: source[index * 3 + 1], z: source[index * 3 + 2] }));
    if (!points.length) return;
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
    center.x /= points.length; center.y /= points.length; center.z /= points.length;
    const radius = Math.max(40, ...points.map((point) => Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z)));
    const left = Math.max(0, options.inset?.left ?? 0);
    const right = Math.max(0, options.inset?.right ?? 0);
    const top = Math.max(0, options.inset?.top ?? 0);
    const bottom = Math.max(0, options.inset?.bottom ?? 0);
    const availableWidth = Math.max(180, width - left - right);
    const availableHeight = Math.max(180, height - top - bottom);
    // Pixels-per-world that make the fitted sphere occupy the free rectangle.
    const worldPerPixel = Math.min(availableWidth, availableHeight) / (2 * radius) / Math.max(1.01, options.padding ?? 1.08);
    const distance = Math.max(240, Math.min(6000, height / (2 * FOV_T * Math.max(0.00001, worldPerPixel))));
    const direction = options.direction ? options.direction.clone().normalize() : engine.camera.position.clone().sub(engine.controls.target).normalize();
    const rightVector = new THREE.Vector3().setFromMatrixColumn(engine.camera.matrixWorld, 0).normalize();
    const upVector = new THREE.Vector3().setFromMatrixColumn(engine.camera.matrixWorld, 1).normalize();
    const shiftX = (left - right) / 2;
    const shiftY = (top - bottom) / 2;
    const target = new THREE.Vector3(center.x, center.y, center.z)
      .addScaledVector(rightVector, -shiftX / worldPerPixel)
      .addScaledVector(upVector, shiftY / worldPerPixel);
    const position = target.clone().addScaledVector(direction, distance);
    referenceDistanceRef.current = distance;
    animateCamera(position, target, 600);
  }

  function fitCoursePlane(insets: SceneInsets = {}) {
    const engine = engineRef.current;
    if (!engine || !planePositions) return;
    lastCourseInsetsRef.current = insets;
    const width = engine.renderer.domElement.clientWidth || 1;
    const height = engine.renderer.domElement.clientHeight || 1;
    // Insets are already canvas-local (the page measures the panel against the
    // archive main, which starts where the canvas does).
    const left = Math.max(0, insets.left ?? 0);
    const right = Math.max(0, insets.right ?? 0);
    const top = Math.max(0, insets.top ?? 0);
    const bottom = Math.max(0, insets.bottom ?? 0);
    // Leave 48px breathing room (24px each side) inside the free rectangle;
    // the panel, course bar, controls and detail column are already excluded.
    const EDGE_PADDING = 24;
    const availableWidth = Math.max(180, width - left - right - EDGE_PADDING * 2);
    const availableHeight = Math.max(180, height - top - bottom - EDGE_PADDING * 2);
    const values = Object.values(planePositions);
    const chapters = propsRef.current.planeChapters;
    if (!values.length && !chapters.length) return;
    const card = propsRef.current.planeCardSize ?? { width: 176, height: 40 };
    const halfCardWidth = card.width / 2;
    const halfCardHeight = card.height / 2;
    // Include the card footprint (not just node centres) so no card is clipped.
    const minX = Math.min(...values.map((value) => value.x - halfCardWidth), ...chapters.map((chapter) => chapter.x));
    const maxX = Math.max(...values.map((value) => value.x + halfCardWidth), ...chapters.map((chapter) => chapter.x + chapter.width));
    const minY = Math.min(...values.map((value) => value.y - halfCardHeight), ...chapters.map((chapter) => chapter.y - chapter.height));
    const maxY = Math.max(...values.map((value) => value.y + halfCardHeight), ...chapters.map((chapter) => chapter.y));
    const planeWidth = Math.max(80, maxX - minX);
    const planeHeight = Math.max(80, maxY - minY);
    // Fit width and height together, but never below the readable card scale:
    // a whole-course overview that makes names 6px tall is worse than a plane
    // that is slightly wider than the free area and can be panned. This is the
    // only case where the course plane may extend horizontally.
    const fitScale = Math.min(availableWidth / planeWidth, availableHeight / planeHeight);
    const worldPerPixel = Math.max(MIN_CARD_SCALE, fitScale);
    const distance = Math.max(240, Math.min(6000, height / (2 * FOV_T * Math.max(0.00001, worldPerPixel))));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const shiftX = (left - right) / 2;
    const shiftY = (top - bottom) / 2;
    // The course plane is front-facing: shift the camera target so the plane
    // lands in the middle of the free rectangle, not the middle of the canvas.
    const target = new THREE.Vector3(centerX - shiftX / worldPerPixel, centerY + shiftY / worldPerPixel, 0);
    const position = new THREE.Vector3(target.x, target.y, distance);
    referenceDistanceRef.current = distance;
    animateCamera(position, target, 600);
  }

  useImperativeHandle(ref, () => ({
    zoomBy(factor) {
      const engine = engineRef.current;
      if (!engine) return;
      const direction = engine.camera.position.clone().sub(engine.controls.target);
      const distance = Math.max(engine.controls.minDistance, Math.min(engine.controls.maxDistance, direction.length() * factor));
      const target = engine.controls.target.clone();
      animateCamera(target.clone().add(direction.setLength(distance)), target, 260);
    },
    fitAll(options = {}) {
      fitBoundsOf(Array.from({ length: propsRef.current.nodes.length }, (_, index) => index), { padding: options.padding ?? 1.08, inset: options.insets, useTarget: true });
    },
    fitIds(ids, options = {}) {
      const engine = engineRef.current;
      if (!engine) return;
      const indices = Array.from(ids).flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; });
      if (!indices.length) { fitBoundsOf(Array.from({ length: propsRef.current.nodes.length }, (_, index) => index), { padding: 1.08, inset: options.insets }); return; }
      fitBoundsOf(indices, { padding: options.padding ?? 1.55, inset: options.insets, useTarget: true });
    },
    fitCourse(insets) { fitCoursePlane(insets); },
    resetView() {
      const currentMode = propsRef.current.mode;
      if (currentMode === "course" || currentMode === "draft") { fitCoursePlane(lastCourseInsetsRef.current); return; }
      fitBoundsOf(Array.from({ length: propsRef.current.nodes.length }, (_, index) => index), { padding: 1.08 });
    },
    shiftForDetail(open) {
      const engine = engineRef.current;
      if (!engine) return;
      const height = engine.renderer.domElement.clientHeight || 1;
      const distance = engine.camera.position.distanceTo(engine.controls.target);
      const worldShift = open ? (DETAIL_WIDTH / 2) / pxPerWorld(distance, height) : 0;
      const delta = worldShift - detailShiftRef.current;
      detailShiftRef.current = worldShift;
      if (Math.abs(delta) < 0.01) return;
      const right = new THREE.Vector3().setFromMatrixColumn(engine.camera.matrixWorld, 0).normalize();
      animateCamera(engine.camera.position.clone().add(right.clone().multiplyScalar(delta)), engine.controls.target.clone().add(right.clone().multiplyScalar(delta)), 420);
    },
    getZoomPercent() { return zoomRef.current; },
    getLevel() { return levelRef.current; }
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "ef-atlas-canvas";
    renderer.domElement.setAttribute("aria-label", "档案星图：拖拽旋转，滚轮缩放，右键平移");
    renderer.domElement.tabIndex = 0;
    container.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, width / height, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = 180;
    controls.maxDistance = 6000;

    const count = nodes.length;
    const current = new Float32Array(count * 3);
    const target = new Float32Array(count * 3);
    nodes.forEach((node, index) => {
      const position = basePositions[node.id] ?? { x: 0, y: 0, z: 0 };
      current[index * 3] = position.x; current[index * 3 + 1] = position.y; current[index * 3 + 2] = position.z;
    });
    target.set(current);

    const pointGeometry = new THREE.BufferGeometry();
    const pointPosition = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const pointAlpha = new THREE.BufferAttribute(new Float32Array(count), 1);
    const pointSize = new THREE.BufferAttribute(new Float32Array(count), 1);
    const pointColor = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    pointGeometry.setAttribute("position", pointPosition);
    pointGeometry.setAttribute("alpha", pointAlpha);
    pointGeometry.setAttribute("size", pointSize);
    pointGeometry.setAttribute("color", pointColor);
    const pointMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: false,
      uniforms: { uScale: { value: 1 }, uSize: { value: 1 }, uAlpha: { value: 1 } },
      vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying vec3 vColor; varying float vAlpha; uniform float uScale; uniform float uSize;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uSize * uScale / max(1.0, -mv.z), 2.0, 28.0); gl_Position = projectionMatrix * mv; vColor = color; vAlpha = alpha; }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha; uniform float uAlpha;
        void main(){ float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0; if (distanceFromCenter > 1.0) discard; float core = smoothstep(1.0, 0.62, distanceFromCenter); vec3 color = vColor * (1.06 - 0.22 * distanceFromCenter) + vec3(0.16) * (1.0 - smoothstep(0.0, 0.5, distanceFromCenter)); gl_FragColor = vec4(color, core * vAlpha * uAlpha); }`
    });
    const points = new THREE.Points(pointGeometry, pointMaterial);
    points.renderOrder = 4;
    points.frustumCulled = false;
    scene.add(points);

    const glowMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uSize: { value: 1 }, uAlpha: { value: 1 } },
      vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying vec3 vColor; varying float vAlpha; uniform float uScale; uniform float uSize;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * 3.2 * uSize * uScale / max(1.0, -mv.z), 3.0, 72.0); gl_Position = projectionMatrix * mv; vColor = color; vAlpha = alpha; }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha; uniform float uAlpha;
        void main(){ float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0; if (distanceFromCenter > 1.0) discard; float halo = smoothstep(1.0, 0.15, distanceFromCenter) * 0.14; gl_FragColor = vec4(vColor, halo * vAlpha * uAlpha); }`
    });
    const glowPoints = new THREE.Points(pointGeometry, glowMaterial);
    glowPoints.renderOrder = 3;
    glowPoints.frustumCulled = false;
    scene.add(glowPoints);

    const ringGeometry = new THREE.BufferGeometry();
    const ringPosition = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const ringColor1 = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const ringColor2 = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const ringSplit = new THREE.BufferAttribute(new Float32Array(count), 1);
    const ringAlpha = new THREE.BufferAttribute(new Float32Array(count), 1);
    const ringSize = new THREE.BufferAttribute(new Float32Array(count), 1);
    ringGeometry.setAttribute("position", ringPosition);
    ringGeometry.setAttribute("c1", ringColor1);
    ringGeometry.setAttribute("c2", ringColor2);
    ringGeometry.setAttribute("split", ringSplit);
    ringGeometry.setAttribute("alpha", ringAlpha);
    ringGeometry.setAttribute("size", ringSize);
    const ringMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 1 }, uSize: { value: 1 } },
      vertexShader: `attribute vec3 c1; attribute vec3 c2; attribute float split; attribute float alpha; attribute float size; varying vec3 v1; varying vec3 v2; varying float vSplit; varying float vAlpha; uniform float uScale; uniform float uSize;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uSize * uScale / max(1.0, -mv.z), 6.0, 84.0); gl_Position = projectionMatrix * mv; v1 = c1; v2 = c2; vSplit = split; vAlpha = alpha; }`,
      fragmentShader: `varying vec3 v1; varying vec3 v2; varying float vSplit; varying float vAlpha;
        void main(){ vec2 uv = gl_PointCoord - 0.5; float distanceFromCenter = length(uv) * 2.0; if (distanceFromCenter > 1.0) discard; float ring = smoothstep(0.56, 0.68, distanceFromCenter) * (1.0 - smoothstep(0.88, 1.0, distanceFromCenter)); vec3 color = (vSplit > 0.5 && uv.x > 0.0) ? v2 : v1; gl_FragColor = vec4(color, ring * vAlpha); }`
    });
    const rings = new THREE.Points(ringGeometry, ringMaterial);
    rings.renderOrder = 5;
    rings.frustumCulled = false;
    scene.add(rings);

    const edgeGeometry = new THREE.BufferGeometry();
    const edgePosition = new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3);
    const edgeAlphaAttribute = new THREE.BufferAttribute(new Float32Array(edges.length * 2), 1);
    edgeGeometry.setAttribute("position", edgePosition);
    edgeGeometry.setAttribute("alpha", edgeAlphaAttribute);
    const edgeMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color("#8b93b5") }, uMul: { value: 1 } },
      vertexShader: `attribute float alpha; varying float vAlpha; void main(){ vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vAlpha; uniform vec3 uColor; uniform float uMul; void main(){ gl_FragColor = vec4(uColor, vAlpha * uMul); }`
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.renderOrder = 2;
    edgeLines.frustumCulled = false;
    scene.add(edgeLines);

    function makeSegmentLines(color: string, linewidth: number, opacity: number) {
      const geometry = new LineSegmentsGeometry();
      const material = new LineMaterial({ color: new THREE.Color(color), linewidth, transparent: true, opacity, depthWrite: false });
      material.resolution.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
      const lines = new LineSegments2(geometry, material);
      lines.renderOrder = 6;
      lines.frustumCulled = false;
      lines.visible = false;
      scene.add(lines);
      return { lines, geometry, material };
    }
    const highlightSegments = makeSegmentLines("#b9b1ff", 2.4, 0.95);
    const highlightLines = highlightSegments.lines;
    const highlightGeometry = highlightSegments.geometry;
    const globalSegments = makeSegmentLines("#ffb454", 2.6, 0.95);
    const globalLines = globalSegments.lines;
    const globalGeometry = globalSegments.geometry;
    // Course-internal factual dependencies. Primary brand, clearly stronger
    // than the archive's 0.16-opacity background edges; hover/selection adds a
    // bright overlay on the incident upstream/downstream routes.
    const dependencySegments = makeSegmentLines("#7c6cf6", 2, 0.7);
    const dependencyLines = dependencySegments.lines;
    const dependencyGeometry = dependencySegments.geometry;
    dependencyLines.renderOrder = 5;
    const dependencyHotSegments = makeSegmentLines("#4338ca", 3.4, 1);
    const dependencyHotLines = dependencyHotSegments.lines;
    const dependencyHotGeometry = dependencyHotSegments.geometry;
    // Keep the hovered upstream/downstream routes above the orange global
    // neighbour edges, which occupy the same incident slots.
    dependencyHotLines.renderOrder = 7;

    const glow = glowTexture();
    const domainSprites = domainGroups.map((group) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(resolveColor(group.color)), transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      sprite.renderOrder = 0;
      scene.add(sprite);
      return sprite;
    });
    const topicSprites = communityGroups.map((group) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(resolveColor(group.color)), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      sprite.renderOrder = 1;
      scene.add(sprite);
      return sprite;
    });

    const domainPairCounts = new Map<string, number>();
    const indexById = new Map(nodes.map((node, index) => [node.id, index] as const));
    edges.forEach((edge) => {
      const source = nodes[indexById.get(edge.source) ?? -1];
      const targetNode = nodes[indexById.get(edge.target) ?? -1];
      if (!source || !targetNode) return;
      const sourceDomain = source.domainId ?? "__unclassified";
      const targetDomain = targetNode.domainId ?? "__unclassified";
      if (sourceDomain === targetDomain) return;
      const key = sourceDomain < targetDomain ? `${sourceDomain}|${targetDomain}` : `${targetDomain}|${sourceDomain}`;
      domainPairCounts.set(key, (domainPairCounts.get(key) ?? 0) + 1);
    });
    const domainLinks: Array<{ a: number; b: number; line: Line2; material: LineMaterial; count: number }> = [];
    const domainIndex = new Map(domainGroups.map((group, index) => [group.id, index] as const));
    domainPairCounts.forEach((countValue, key) => {
      const [a, b] = key.split("|");
      const aIndex = domainIndex.get(a);
      const bIndex = domainIndex.get(b);
      if (aIndex === undefined || bIndex === undefined) return;
      const material = new LineMaterial({ color: new THREE.Color("#8b93b5"), linewidth: Math.min(4.5, 0.8 + countValue * 0.32), transparent: true, opacity: 0, depthWrite: false });
      const line = new Line2(new LineGeometry(), material);
      line.renderOrder = 1;
      line.frustumCulled = false;
      scene.add(line);
      domainLinks.push({ a: aIndex, b: bIndex, line, material, count: countValue });
    });

    const regionMeshes = planeChapters.map(() => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: regionTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      mesh.renderOrder = 1;
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(420 * 3);
    let starSeed = 7;
    const starRandom = () => {
      starSeed = (starSeed * 1664525 + 1013904223) >>> 0;
      return starSeed / 4294967296;
    };
    for (let index = 0; index < 420; index += 1) {
      const radius = 2400 + starRandom() * 2600;
      const theta = starRandom() * Math.PI * 2;
      const phi = Math.acos(2 * starRandom() - 1);
      starPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      starPositions[index * 3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
      starPositions[index * 3 + 2] = Math.cos(phi) * radius;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starField = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: new THREE.Color("#9aa6da"), size: 1.6, transparent: true, opacity: 0.34, depthWrite: false, sizeAttenuation: false }));
    scene.add(starField);

    const engine = {
      renderer, scene, camera, controls, points, glowPoints, glowMaterial, pointGeometry, pointPosition, pointAlpha, pointSize, pointColor, pointMaterial,
      rings, ringGeometry, ringPosition, ringColor1, ringColor2, ringSplit, ringAlpha, ringSize, ringMaterial,
      edgeLines, edgeGeometry, edgePosition, edgeAlpha: edgeAlphaAttribute, edgeMaterial,
      highlightLines, highlightGeometry, globalLines, globalGeometry,
      domainSprites, topicSprites, domainLinks, regionMeshes, starField,
      current, target,
      alpha: new Float32Array(count).fill(0.92), targetAlpha: new Float32Array(count).fill(0.92),
      size: new Float32Array(count).fill(1), targetSize: new Float32Array(count).fill(1),
      edgeAlphaCurrent: new Float32Array(edges.length).fill(0.16), edgeAlphaTarget: new Float32Array(edges.length).fill(0.16),
      nodeIndex, neighbors, domainGroups, communityGroups, indexById,
      dispose() {
        controls.dispose();
        renderer.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Points || object instanceof THREE.LineSegments || object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof Line2 || object instanceof LineSegments2) {
            const geometry = (object as THREE.Mesh).geometry;
            geometry?.dispose?.();
            const material = (object as THREE.Mesh).material;
            if (Array.isArray(material)) material.forEach((item) => item.dispose());
            else material?.dispose?.();
          }
        });
        glow.dispose();
      }
    };
    engineRef.current = engine;
    detailShiftRef.current = 0;
    window.requestAnimationFrame(() => onReady?.());
    const cardPool = new Map<string, HTMLDivElement>();
    const cardRects = new Map<number, { x: number; y: number; width: number; height: number }>();
    let visibleCardIndices = new Set<number>();
    let hudRects: AtlasLabelRect[] = [];
    let lastHudAt = 0;

    const initialIndices = Array.from({ length: count }, (_, index) => index);
    const initialPoints = initialIndices.map((index) => ({ x: current[index * 3], y: current[index * 3 + 1], z: current[index * 3 + 2] }));
    const center = initialPoints.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
    if (initialPoints.length) { center.x /= initialPoints.length; center.y /= initialPoints.length; center.z /= initialPoints.length; }
    const radius = Math.max(40, ...initialPoints.map((point) => Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z)));
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2)) * 1.12;
    referenceDistanceRef.current = distance;
    camera.position.copy(HOME_DIRECTION.clone().multiplyScalar(distance).add(new THREE.Vector3(center.x, center.y, center.z)));
    controls.target.set(center.x, center.y, center.z);
    controls.update();
    modeRef.current = propsRef.current.mode;

    let resizeTimer = 0;
    const resize = () => {
      const nextWidth = Math.max(1, container.clientWidth);
      const nextHeight = Math.max(1, container.clientHeight);
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      domainLinks.forEach((link) => link.material.resolution.set(nextWidth * renderer.getPixelRatio(), nextHeight * renderer.getPixelRatio()));
      highlightSegments.material.resolution.set(nextWidth * renderer.getPixelRatio(), nextHeight * renderer.getPixelRatio());
      globalSegments.material.resolution.set(nextWidth * renderer.getPixelRatio(), nextHeight * renderer.getPixelRatio());
      dependencySegments.material.resolution.set(nextWidth * renderer.getPixelRatio(), nextHeight * renderer.getPixelRatio());
      dependencyHotSegments.material.resolution.set(nextWidth * renderer.getPixelRatio(), nextHeight * renderer.getPixelRatio());
      // Do not leave labels from the previous viewport visible for a frame
      // while the debounced re-fit starts; the next frame draws them clamped.
      labelPoolRef.current.forEach((element) => { element.style.display = "none"; });
      lastLabelFrameRef.current = 0;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => propsRef.current.onResize?.(), 160);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const refreshPalette = () => {
      paletteRef.current = {
        edge: cssVarValue("--atlas-edge", "#8b93b5"),
        bright: cssVarValue("--brand", "#7c6cf6"),
        brandInk: cssVarValue("--brand-ink", "#4338ca"),
        star: cssVarValue("--atlas-star", "#9aa6da"),
        global: cssVarValue("--p-orange", "#e8a75a")
      };
      edgeMaterial.uniforms.uColor.value.set(paletteRef.current.edge);
      starField.material.color.set(paletteRef.current.star);
      highlightLines.material.color.set(paletteRef.current.bright);
      globalLines.material.color.set(paletteRef.current.global);
      dependencyLines.material.color.set(paletteRef.current.bright);
      dependencyHotLines.material.color.set(paletteRef.current.brandInk);
      domainGroups.forEach((group, index) => domainSprites[index]?.material.color.set(resolveColor(group.color)));
      communityGroups.forEach((group, index) => topicSprites[index]?.material.color.set(resolveColor(group.color)));
      nodes.forEach((node, index) => {
        const color = new THREE.Color(resolveColor(node.color));
        color.toArray(pointColor.array, index * 3);
      });
      pointColor.needsUpdate = true;
      domainLinks.forEach((link) => link.material.color.set(paletteRef.current.edge));
    };
    refreshPalette();
    const themeObserver = new MutationObserver(refreshPalette);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refreshPalette);

    const onPointerDown = (event: PointerEvent) => {
      cameraTweenRef.current.active = false;
      downRef.current = { x: event.clientX, y: event.clientY, time: performance.now(), button: event.button };
    };
    const onWheel = () => { cameraTweenRef.current.active = false; };
    const onPointerUp = (event: PointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down) return;
      if (down.button !== 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      onCanvasClick(event.clientX - rect.left, event.clientY - rect.top);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (downRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const id = pick(event.clientX - rect.left, event.clientY - rect.top);
      if (id !== hoveredRef.current) {
        hoveredRef.current = id;
        renderer.domElement.style.cursor = id === null ? "" : "pointer";
        hoverPointRef.current = id === null ? null : { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const nodeId = id === null ? null : propsRef.current.nodes[id]?.id ?? null;
        propsRef.current.onHoverNode?.(nodeId, hoverPointRef.current);
        presentationTargets();
        startPresentationAnimation(160);
      }
    };
    const onPointerLeave = () => {
      if (hoveredRef.current === null) return;
      hoveredRef.current = null;
      hoverPointRef.current = null;
      renderer.domElement.style.cursor = "";
      propsRef.current.onHoverNode?.(null, null);
      presentationTargets();
      startPresentationAnimation(160);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    function project(point: { x: number; y: number; z: number }) {
      const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: (projected.x + 1) / 2 * rect.width, y: (1 - projected.y) / 2 * rect.height, z: projected.z };
    }

    function pick(x: number, y: number) {
      const currentMode = propsRef.current.mode;
      if (currentMode === "course" || currentMode === "draft") {
        let cardHit = -1;
        cardRects.forEach((rect, index) => {
          if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) cardHit = index;
        });
        if (cardHit >= 0) return cardHit;
      }
      let best: number | null = null;
      let bestDistance = Infinity;
      for (let index = 0; index < count; index += 1) {
        if (engine.alpha[index] < 0.25) continue;
        const point = project(getPosition(index));
        if (point.z > 1) continue;
        const screenDistance = Math.hypot(point.x - x, point.y - y);
        if (screenDistance > 12) continue;
        if (screenDistance < bestDistance) { best = index; bestDistance = screenDistance; }
      }
      return best;
    }

    function onCanvasClick(x: number, y: number) {
      const id = pick(x, y);
      const node = id === null ? null : propsRef.current.nodes[id];
      const currentMode = propsRef.current.mode;
      if (currentMode === "course" || currentMode === "draft") {
        if (node && propsRef.current.planeNodeIds?.has(node.id)) { propsRef.current.onActivatePlaneNode?.(node.id); return; }
        hoveredRef.current = null;
        hoverPointRef.current = null;
        presentationTargets();
        startPresentationAnimation(160);
        propsRef.current.onBlank?.();
        return;
      }
      if (node) propsRef.current.onSelectNode?.(node.id);
      else propsRef.current.onBlank?.();
    }

    let frameHandle = 0;
    let disposed = false;
    const frame = (now: number) => {
      if (disposed) return;
      frameHandle = requestAnimationFrame(frame);
      controls.update();
      const currentMode = propsRef.current.mode;
      modeRef.current = currentMode;
      const tween = animationRef.current;
      if (tween.active && tween.from) {
        const progress = Math.min(1, (now - tween.start) / Math.max(1, tween.duration));
        const eased = easeInOut(progress);
        for (let index = 0; index < engine.current.length; index += 1) engine.current[index] = tween.from[index] + (engine.target[index] - tween.from[index]) * eased;
        if (progress >= 1) tween.active = false;
      }
      const presentation = presentationRef.current;
      if (presentation.active && presentation.fromAlpha && presentation.fromSize && presentation.fromEdge) {
        const progress = Math.min(1, (now - presentation.start) / Math.max(1, presentation.duration));
        const eased = easeInOut(progress);
        for (let index = 0; index < engine.alpha.length; index += 1) {
          engine.alpha[index] = presentation.fromAlpha[index] + (engine.targetAlpha[index] - presentation.fromAlpha[index]) * eased;
          engine.size[index] = presentation.fromSize[index] + (engine.targetSize[index] - presentation.fromSize[index]) * eased;
        }
        for (let index = 0; index < engine.edgeAlphaCurrent.length; index += 1) {
          engine.edgeAlphaCurrent[index] = presentation.fromEdge[index] + (engine.edgeAlphaTarget[index] - presentation.fromEdge[index]) * eased;
        }
        if (progress >= 1) presentation.active = false;
      } else {
        engine.edgeAlphaCurrent.set(engine.edgeAlphaTarget);
      }

      const cameraTween = cameraTweenRef.current;
      if (cameraTween.active) {
        const progress = Math.min(1, (now - cameraTween.start) / Math.max(1, cameraTween.duration));
        const eased = easeInOut(progress);
        camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
        controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
        if (progress >= 1) cameraTween.active = false;
      }

      const distanceToTarget = camera.position.distanceTo(controls.target);
      const worldRadius = Math.max(120, ...Object.values(basePositions).map((position) => Math.hypot(position.x, position.y, position.z)));
      const far = smoothStep(worldRadius * 1.55, worldRadius * 2.35, distanceToTarget);
      const near = 1 - smoothStep(worldRadius * 0.72, worldRadius * 1.2, distanceToTarget);
      const mid = Math.max(0, Math.min(1, 1 - far - near));
      // The indicator must name whichever layer actually dominates on screen:
      // domain (far), topic (mid) or knowledge (near). Never use a separate
      // distance threshold here, or the chip lags one layer behind the labels.
      const level = far >= mid && far >= near ? 0 : mid >= near ? 1 : 2;
      if (level !== levelRef.current) {
        levelRef.current = level;
        propsRef.current.onLevelChange?.(level);
      }
      const percent = Math.round(Math.max(8, Math.min(800, referenceDistanceRef.current / Math.max(1, distanceToTarget) * 100)));
      if (percent !== zoomRef.current) {
        zoomRef.current = percent;
        propsRef.current.onZoomChange?.(percent);
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const pixelRatio = renderer.getPixelRatio();
      const sharedScale = rect.height / (2 * FOV_T) * pixelRatio;
      pointMaterial.uniforms.uScale.value = sharedScale;
      ringMaterial.uniforms.uScale.value = sharedScale;
      const courseMode = currentMode === "course" || currentMode === "draft";
      drawCards(rect, courseMode);
      pointMaterial.uniforms.uSize.value = courseMode ? 1.12 : 1 - 0.08 * far;
      pointMaterial.uniforms.uAlpha.value = 1;
      glowMaterial.uniforms.uScale.value = sharedScale;
      glowMaterial.uniforms.uSize.value = courseMode ? 1.12 : 1 - 0.12 * far;
      glowMaterial.uniforms.uAlpha.value = courseMode ? 0.45 : 1;
      edgeMaterial.uniforms.uMul.value = 1 - 0.68 * far;

      for (let index = 0; index < count; index += 1) {
        const cardVisible = visibleCardIndices.has(index);
        pointPosition.array[index * 3] = engine.current[index * 3];
        pointPosition.array[index * 3 + 1] = engine.current[index * 3 + 1];
        pointPosition.array[index * 3 + 2] = engine.current[index * 3 + 2];
        pointAlpha.array[index] = cardVisible ? Math.min(0.24, engine.alpha[index]) : engine.alpha[index];
        pointSize.array[index] = cardVisible ? 5 : (courseMode ? 9.4 : 11.5) * engine.size[index];
      }
      pointPosition.needsUpdate = true;
      pointAlpha.needsUpdate = true;
      pointSize.needsUpdate = true;

      const mergedOwners = new Map<number, ScenePerson[]>();
      propsRef.current.people.forEach((person) => {
        person.nodeIds.forEach((id) => {
          const index = engine.nodeIndex.get(id);
          if (index === undefined) return;
          mergedOwners.set(index, [...(mergedOwners.get(index) ?? []), person]);
        });
      });
      const selected = propsRef.current.selectedId ? engine.nodeIndex.get(propsRef.current.selectedId) : undefined;
      const neighborSet = selected === undefined ? null : new Set([selected, ...engine.neighbors[selected]]);
      const searchSet = new Set(propsRef.current.searchIds.flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; }));
      const assistantSet = new Set(propsRef.current.assistantIds.flatMap((id) => { const index = engine.nodeIndex.get(id); return index === undefined ? [] : [index]; }));
      for (let index = 0; index < count; index += 1) {
        const owners = mergedOwners.get(index) ?? [];
        let ringAlphaValue = 0;
        let color1 = new THREE.Color("#ffffff");
        let color2 = color1;
        let split = 0;
        if (owners.length && !courseMode) {
          ringAlphaValue = neighborSet && !neighborSet.has(index) ? 0.14 : 0.95;
          color1 = new THREE.Color(cssVarValue(`--p-${owners[0].accent === "me" ? "me" : owners[0].accent}`, "#7c6cf6"));
          color2 = owners[1] ? new THREE.Color(cssVarValue(`--p-${owners[1].accent === "me" ? "me" : owners[1].accent}`, "#22b8cf")) : color1;
          split = owners.length > 1 ? 1 : 0;
        }
        if (selected === index) { ringAlphaValue = 1; color1 = new THREE.Color("#ffffff"); split = 0; }
        if (searchSet.has(index) || assistantSet.has(index)) { ringAlphaValue = Math.max(ringAlphaValue, 0.9); color1 = new THREE.Color(searchSet.has(index) ? cssVarValue("--target", "#22a55e") : cssVarValue("--brand", "#7c6cf6")); split = 0; }
        ringPosition.array[index * 3] = engine.current[index * 3];
        ringPosition.array[index * 3 + 1] = engine.current[index * 3 + 1];
        ringPosition.array[index * 3 + 2] = engine.current[index * 3 + 2];
        color1.toArray(ringColor1.array, index * 3);
        color2.toArray(ringColor2.array, index * 3);
        ringSplit.array[index] = split;
        ringAlpha.array[index] = ringAlphaValue;
        ringSize.array[index] = (courseMode ? 19 : 20) * engine.size[index];
      }
      ringPosition.needsUpdate = true;
      ringColor1.needsUpdate = true;
      ringColor2.needsUpdate = true;
      ringSplit.needsUpdate = true;
      ringAlpha.needsUpdate = true;
      ringSize.needsUpdate = true;

      for (let index = 0; index < propsRef.current.edges.length; index += 1) {
        const edge = propsRef.current.edges[index];
        const source = engine.nodeIndex.get(edge.source);
        const targetIndex = engine.nodeIndex.get(edge.target);
        if (source === undefined || targetIndex === undefined) continue;
        edgePosition.array[index * 6] = engine.current[source * 3];
        edgePosition.array[index * 6 + 1] = engine.current[source * 3 + 1];
        edgePosition.array[index * 6 + 2] = engine.current[source * 3 + 2];
        edgePosition.array[index * 6 + 3] = engine.current[targetIndex * 3];
        edgePosition.array[index * 6 + 4] = engine.current[targetIndex * 3 + 1];
        edgePosition.array[index * 6 + 5] = engine.current[targetIndex * 3 + 2];
        const value = engine.edgeAlphaCurrent[index] ?? 0;
        edgeAlphaAttribute.array[index * 2] = value;
        edgeAlphaAttribute.array[index * 2 + 1] = value;
      }
      edgePosition.needsUpdate = true;
      edgeAlphaAttribute.needsUpdate = true;

      // selection / hover incident edges
      const highlight: number[] = [];
      const hovered = hoveredRef.current;
      const focusIndex = selected ?? hovered;
      if (focusIndex !== null && focusIndex !== undefined && !courseMode) {
        engine.neighbors[focusIndex].forEach((neighbor) => {
          highlight.push(engine.current[focusIndex * 3], engine.current[focusIndex * 3 + 1], engine.current[focusIndex * 3 + 2]);
          highlight.push(engine.current[neighbor * 3], engine.current[neighbor * 3 + 1], engine.current[neighbor * 3 + 2]);
        });
      }
      const globalHighlight: number[] = [];
      if (courseMode && hovered !== null && propsRef.current.planeNodeIds?.has(propsRef.current.nodes[hovered]?.id ?? "")) {
        engine.neighbors[hovered].forEach((neighbor) => {
          const neighborId = propsRef.current.nodes[neighbor]?.id;
          if (neighborId && propsRef.current.planeNodeIds?.has(neighborId)) return;
          globalHighlight.push(engine.current[hovered * 3], engine.current[hovered * 3 + 1], engine.current[hovered * 3 + 2]);
          globalHighlight.push(engine.current[neighbor * 3], engine.current[neighbor * 3 + 1], engine.current[neighbor * 3 + 2]);
        });
      }
      updateLineGeometry(highlightGeometry, highlight);
      highlightLines.visible = highlight.length > 0;
      updateLineGeometry(globalGeometry, globalHighlight);
      globalLines.visible = globalHighlight.length > 0;

      // Course-internal prerequisite/enables routes. Every route is already
      // orthogonal and card-safe; hover/selection lifts the incident routes
      // while unrelated ones stay as quiet context.
      const dependencyBase: number[] = [];
      const dependencyHot: number[] = [];
      if (courseMode) {
        const planeIds = propsRef.current.planeNodeIds;
        const selectedNodeId = selected !== undefined ? propsRef.current.nodes[selected]?.id : undefined;
        const hoveredNodeId = hovered !== null ? propsRef.current.nodes[hovered]?.id : undefined;
        const focusedNodeId = selectedNodeId && planeIds?.has(selectedNodeId)
          ? selectedNodeId
          : hoveredNodeId && planeIds?.has(hoveredNodeId) ? hoveredNodeId : null;
        propsRef.current.planeDependencies.forEach((route) => {
          const incident = Boolean(focusedNodeId && (route.source === focusedNodeId || route.target === focusedNodeId));
          const output = incident ? dependencyHot : dependencyBase;
          for (let index = 0; index < route.points.length - 1; index += 1) {
            const start = route.points[index];
            const end = route.points[index + 1];
            output.push(start.x, start.y, start.z, end.x, end.y, end.z);
          }
        });
        dependencySegments.material.opacity = focusedNodeId ? 0.38 : 0.7;
      }
      updateLineGeometry(dependencyGeometry, dependencyBase);
      dependencyLines.visible = dependencyBase.length > 0;
      updateLineGeometry(dependencyHotGeometry, dependencyHot);
      dependencyHotLines.visible = dependencyHot.length > 0;

      // map glows
      const domainCentroids = engine.domainGroups.map((group) => centroidOf(group.indices, engine.current, engine.alpha));
      const selectionGlow = selected !== undefined ? 0.4 : 1;
      domainSprites.forEach((sprite, index) => {
        const centroid = domainCentroids[index];
        sprite.position.set(centroid.x, centroid.y, centroid.z);
        sprite.scale.setScalar(Math.min(900, Math.max(120, centroid.spread * 3.8)));
        const opacity = courseMode ? 0 : (0.54 * far + 0.12 * mid) * (currentMode === "person" ? 0.7 : 1) * selectionGlow;
        sprite.material.opacity = opacity;
        sprite.visible = opacity > 0.01;
      });
      const communityCentroids = engine.communityGroups.map((group) => centroidOf(group.indices, engine.current, engine.alpha));
      const topicGlowFade = 1 - smoothStep(0.18, 0.68, near);
      topicSprites.forEach((sprite, index) => {
        const centroid = communityCentroids[index];
        sprite.position.set(centroid.x, centroid.y, centroid.z);
        sprite.scale.setScalar(Math.min(420, Math.max(70, centroid.spread * 2.8)));
        const opacity = courseMode ? 0 : 0.62 * mid * topicGlowFade * (currentMode === "person" ? 0.55 : 1) * selectionGlow;
        sprite.material.opacity = opacity;
        sprite.visible = opacity > 0.01;
      });
      engine.domainLinks.forEach((link) => {
        const a = domainCentroids[link.a];
        const b = domainCentroids[link.b];
        const opacity = courseMode ? 0 : far * 0.34;
        link.material.opacity = opacity;
        link.line.visible = opacity > 0.01;
        if (link.line.visible) link.line.geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
      });

      // course chapter regions
      syncRegionMeshes();
      engine.regionMeshes.forEach((mesh, index) => {
        const chapter = propsRef.current.planeChapters[index];
        if (!chapter || !courseMode) { mesh.visible = false; return; }
        mesh.visible = true;
        mesh.position.set(chapter.x + chapter.width / 2, chapter.y - chapter.height / 2, -3);
        mesh.scale.set(chapter.width, chapter.height, 1);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
      });

      drawLabels(now, {
        rect, far, mid, near, level, courseMode, selected: selected ?? null, neighborSet, searchSet, assistantSet,
        domainCentroids, communityCentroids, hovered
      });
      renderer.render(scene, camera);
    };
    frameHandle = requestAnimationFrame(frame);

    function centroidOf(indices: readonly number[], currentPositions: Float32Array, alpha: Float32Array) {
      if (!indices.length) return { x: 0, y: 0, z: 0, spread: 0, alpha: 0 };
      let x = 0, y = 0, z = 0, alphaSum = 0;
      indices.forEach((index) => {
        x += currentPositions[index * 3]; y += currentPositions[index * 3 + 1]; z += currentPositions[index * 3 + 2];
        alphaSum += alpha[index];
      });
      x /= indices.length; y /= indices.length; z /= indices.length;
      let spread = 0;
      indices.forEach((index) => {
        spread += (currentPositions[index * 3] - x) ** 2 + (currentPositions[index * 3 + 1] - y) ** 2 + (currentPositions[index * 3 + 2] - z) ** 2;
      });
      return { x, y, z, spread: Math.sqrt(spread / indices.length), alpha: alphaSum / indices.length };
    }

    function updateLineGeometry(geometry: LineSegmentsGeometry, values: number[]) {
      if (values.length < 6) return;
      geometry.setPositions(values);
    }

    function syncRegionMeshes() {
      const desired = propsRef.current.planeChapters.length;
      while (engine.regionMeshes.length < desired) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: regionTexture(), transparent: true, depthWrite: false, opacity: 0 }));
        mesh.renderOrder = 1;
        mesh.visible = false;
        scene.add(mesh);
        engine.regionMeshes.push(mesh);
      }
      while (engine.regionMeshes.length > desired) {
        const mesh = engine.regionMeshes.pop()!;
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }

    function overlapRatio(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
      const x = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
      const y = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
      return (x * y) / Math.max(1, Math.min(left.width * left.height, right.width * right.height));
    }

    function drawCards(rect: DOMRect, courseMode: boolean) {
      const currentProps = propsRef.current;
      cardRects.clear();
      visibleCardIndices = new Set();
      const wanted = courseMode && currentProps.planeNodeIds?.size;
      if (!wanted) {
        cardPool.forEach((element) => { element.style.display = "none"; });
        return;
      }
      const planeSize = currentProps.planeCardSize ?? { width: CARD_NATURAL_WIDTH, height: CARD_NATURAL_HEIGHT };
      const candidates: Array<{ index: number; id: string; x: number; y: number; width: number; height: number; scale: number; distance: number; node: ArchiveNode; rect: { x: number; y: number; width: number; height: number } }> = [];
      for (let index = 0; index < count; index += 1) {
        const node = currentProps.nodes[index];
        if (!node || !currentProps.planeNodeIds?.has(node.id)) continue;
        if (engine.alpha[index] < 0.2) continue;
        const point = project(getPosition(index));
        if (point.z > 1) continue;
        const distance = camera.position.distanceTo(new THREE.Vector3(engine.current[index * 3], engine.current[index * 3 + 1], engine.current[index * 3 + 2]));
        // The demo's `150 * pxPerWorld / 176` in world terms: a card is 176x40
        // world units and scales with camera distance; it only becomes a point
        // when the text would be unreadable.
        const pxPerWorld = rect.height / (2 * Math.max(1, distance) * FOV_T);
        const scale = Math.max(0.3, Math.min(1.3, (planeSize.width * pxPerWorld) / CARD_NATURAL_WIDTH));
        if (scale < 0.42) continue;
        const width = CARD_NATURAL_WIDTH * scale;
        const height = CARD_NATURAL_HEIGHT * scale;
        const box = { x: point.x - width / 2, y: point.y - height / 2, width, height };
        candidates.push({ index, id: node.id, x: point.x, y: point.y, width, height, scale, distance, node, rect: box });
      }
      candidates.sort((left, right) => left.distance - right.distance || left.index - right.index);
      const accepted: typeof candidates = [];
      candidates.forEach((candidate) => {
        if (accepted.some((other) => overlapRatio(candidate.rect, other.rect) > 0.12)) return;
        accepted.push(candidate);
      });
      accepted.forEach((candidate) => {
        visibleCardIndices.add(candidate.index);
        cardRects.set(candidate.index, candidate.rect);
        let element = cardPool.get(candidate.id);
        if (!element) {
          element = document.createElement("div");
          element.className = "ef-atlas-card";
          cardsRef.current?.appendChild(element);
          cardPool.set(candidate.id, element);
        }
        const isCurrent = Boolean(candidate.node.isCurrent);
        const isTarget = Boolean(currentProps.planeTargetIds?.has(candidate.id));
        const badge = isCurrent
          ? '<em class="ef-atlas-card-badge is-current">当前</em>'
          : isTarget ? '<em class="ef-atlas-card-badge is-target">目标</em>' : "";
        const html = `<span class="ef-atlas-card-dot" aria-hidden></span><span class="ef-atlas-card-title">${escapeHtml(candidate.node.title)}</span>${badge}`;
        if (element.dataset.html !== html) { element.innerHTML = html; element.dataset.html = html; }
        element.dataset.status = candidate.node.status;
        element.dataset.nodeId = candidate.id;
        element.classList.toggle("is-hover", hoveredRef.current === candidate.index);
        element.style.width = `${CARD_NATURAL_WIDTH}px`;
        element.style.height = `${CARD_NATURAL_HEIGHT}px`;
        element.style.transform = `translate(${candidate.x.toFixed(1)}px, ${candidate.y.toFixed(1)}px) scale(${candidate.scale.toFixed(3)}) translate(-50%, -50%)`;
        element.style.display = "";
      });
      cardPool.forEach((element, id) => {
        const index = engine.nodeIndex.get(id);
        if (index === undefined || !visibleCardIndices.has(index)) element.style.display = "none";
      });
    }

    function collectHudRects(rect: DOMRect): AtlasLabelRect[] {
      const selectors = [
        ".ef-atlas-people", ".ef-atlas-guest", ".ef-atlas-panel", ".ef-atlas-detail",
        ".ef-atlas-coursebar", ".ef-atlas-zoom", ".ef-atlas-level", ".ef-atlas-legend",
        ".ef-archive-assistant", ".ef-archive-assistant-fab", ".ef-archive-search-panel",
        ".ef-atlas-error-banner", ".ef-archive-people-error", ".ef-archive-loading-card"
      ];
      const result: AtlasLabelRect[] = [];
      document.querySelectorAll(selectors.join(",")).forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return;
        const box = element.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) return;
        if (box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom) return;
        result.push({
          x: box.left - rect.left - 8,
          y: box.top - rect.top - 8,
          width: box.width + 16,
          height: box.height + 16
        });
      });
      return result;
    }

    function drawLabels(now: number, context: {
      rect: DOMRect;
      far: number;
      mid: number;
      near: number;
      level: number;
      courseMode: boolean;
      selected: number | null;
      neighborSet: Set<number> | null;
      searchSet: Set<number>;
      assistantSet: Set<number>;
      domainCentroids: Array<{ x: number; y: number; z: number; spread: number; alpha: number }>;
      communityCentroids: Array<{ x: number; y: number; z: number; spread: number; alpha: number }>;
      hovered: number | null;
    }) {
      if (now - lastLabelFrameRef.current < 24) return;
      lastLabelFrameRef.current = now;
      if (!hudRects.length || now - lastHudAt > 220) {
        lastHudAt = now;
        hudRects = collectHudRects(context.rect);
      }
      const candidates: AtlasLabelCandidate[] = [];
      const info = new Map<string, { text: string; small?: string; dot?: string; strong?: boolean }>();
      const currentProps = propsRef.current;
      const personCoverage = currentProps.people.map((person) => ({ name: person.name, ids: person.nodeIds }));
      const selectionDim = context.selected !== null ? 0.3 : 1;
      if (!context.courseMode) {
        const domainFade = context.level >= 2 ? 0 : 1 - smoothStep(0.12, 0.5, context.near);
        const domainAlpha = (context.far + 0.72 * context.mid) * domainFade * selectionDim * (currentProps.mode === "person" ? 0.8 : 1);
        if (domainAlpha > 0.06) {
          engine.domainGroups.forEach((group, index) => {
            const centroid = context.domainCentroids[index];
            const point = project({ x: centroid.x, y: centroid.y + centroid.spread * 0.18, z: centroid.z });
            if (point.z > 1) return;
            const text = group.name;
            const small = personCoverage.length
              ? `${personCoverage.map((person) => `${person.name} ${group.indices.filter((nodeIndex) => person.ids.has(currentProps.nodes[nodeIndex].id)).length}`).join(" · ")} / ${group.indices.length}`
              : `${group.indices.length} 个知识`;
            const width = estimateLabelWidth(text, small, "domain");
            const key = `domain:${group.id}`;
            candidates.push({ key, kind: "domain", text, x: point.x - width / 2, y: point.y - labelHeight("domain") * 0.5, width, height: labelHeight("domain"), priority: 1000 - index, force: true, alpha: domainAlpha });
            info.set(key, { text, small });
          });
        }
        const topicFade = context.level >= 2 ? 0 : 1 - smoothStep(0.42, 0.78, context.near);
        const topicAlpha = (context.level >= 1 ? 1 : 0) * context.mid * (currentProps.mode === "person" ? 0.65 : 1) * (1 - context.far) * topicFade * selectionDim;
        // Suppress a topic only when a knowledge label with the same name is
        // actually on screen. At the topic layer knowledge labels are hidden,
        // so their titles must not swallow the topic labels.
        const knowledgeTitles = new Set<string>();
        const knowledgeLabelIndices = context.level === 2
          ? Array.from({ length: count }, (_, index) => index).filter((index) => engine.alpha[index] >= 0.3)
          : [context.selected, context.hovered].filter((index): index is number => index !== null);
        knowledgeLabelIndices.forEach((index) => {
          const node = currentProps.nodes[index];
          if (node) knowledgeTitles.add(node.title.trim().toLocaleLowerCase());
        });
        if (topicAlpha > 0.06) {
          engine.communityGroups.forEach((group, index) => {
            if (group.indices.length < 2) return;
            if (knowledgeTitles.has(group.name.trim().toLocaleLowerCase())) return;
            const centroid = context.communityCentroids[index];
            const point = project(centroid);
            if (point.z > 1) return;
            const text = group.name;
            const small = `· ${group.indices.length} 个`;
            const dot = resolveColor(currentProps.nodes[group.indices[0]]?.color ?? "#8b93b5");
            const width = estimateLabelWidth(text, small, "topic");
            const key = `topic:${group.name}:${group.indices[0]}`;
            candidates.push({ key, kind: "topic", text, x: point.x - width / 2, y: point.y - labelHeight("topic"), width, height: labelHeight("topic"), priority: 320 + group.indices.length, alpha: topicAlpha });
            info.set(key, { text, small, dot });
          });
        }
        // Knowledge labels only appear once the near layer is the dominant one,
        // matching the level chip instead of switching a layer early.
        const knowledgeAlpha = context.level === 2 ? Math.min(1, context.near * 2.2) : 0;
        const coreNodeIds = new Set(currentProps.people.flatMap((person) => Array.from(person.nodeIds)));
        const hover = context.hovered;
        for (let index = 0; index < count; index += 1) {
          const forced = index === context.selected || index === hover || context.neighborSet?.has(index) || context.searchSet.has(index) || context.assistantSet.has(index);
          if (!forced && (knowledgeAlpha < 0.08 || engine.alpha[index] < 0.3)) continue;
          const point = project(getPosition(index));
          if (point.z > 1) continue;
          const node = currentProps.nodes[index];
          if (!node) continue;
          const text = node.title;
          const width = estimateLabelWidth(text, "", "knowledge");
          const key = `node:${node.id}`;
          candidates.push({
            key,
            kind: "knowledge",
            text,
            x: point.x - width / 2,
            y: point.y - labelHeight("knowledge") - 8,
            width,
            height: labelHeight("knowledge"),
            priority: forced ? 2200 + (index === context.selected ? 300 : 0) : 600 + engine.neighbors[index].length * 4,
            alpha: forced ? 1 : knowledgeAlpha,
            // Core labels stay visible by nudging outside the ring obstacle.
            force: currentProps.mode === "person" && coreNodeIds.has(node.id)
          });
          info.set(key, { text, dot: resolveColor(node.color), strong: forced });
        }
      } else {
        currentProps.planeChapters.forEach((chapter, index) => {
          const chapterText = `第 ${index + 1} 章 ${chapter.title}`;
          const point = project({ x: chapter.x + chapter.width / 2, y: chapter.y, z: 0 });
          const leftPoint = project({ x: chapter.x, y: chapter.y, z: 0 });
          const rightPoint = project({ x: chapter.x + chapter.width, y: chapter.y, z: 0 });
          const regionWidth = Math.max(80, Math.abs(rightPoint.x - leftPoint.x));
          const naturalWidth = estimateLabelWidth(chapterText, "", "chapter");
          // One-line capsule anchored just above the chapter's top edge. Keep it
          // within the region's screen width so neighbouring titles cannot
          // collide and force each other away from their regions.
          const width = Math.max(48, Math.min(naturalWidth, regionWidth - 16));
          const height = labelHeight("chapter");
          const labelY = point.y - height - 4;
          // The left panel can sit right next to the first chapter. Keep the
          // title pill above its own region but slide it just clear of HUD
          // exclusions instead of dropping it (chapter titles never nudge
          // vertically in this layout).
          const blockingHud = hudRects.filter((hud) => labelY < hud.y + hud.height && labelY + height > hud.y);
          const safeLeft = Math.max(8, ...blockingHud.filter((hud) => hud.x + hud.width <= point.x).map((hud) => hud.x + hud.width + 6));
          const safeRight = Math.min(context.rect.width - 8, ...blockingHud.filter((hud) => hud.x >= point.x).map((hud) => hud.x - 6));
          let labelX = point.x - width / 2;
          if (labelX < safeLeft) labelX = safeLeft;
          if (labelX + width > safeRight) labelX = safeRight - width;
          if (labelX < 8) labelX = 8;
          const key = `chapter:${chapter.id}`;
          candidates.push({ key, kind: "chapter", text: chapterText, x: labelX, y: labelY, width, height, priority: 1300 - index, force: true, alpha: 1 });
          info.set(key, { text: chapterText, strong: true });
        });
        const hover = context.hovered;
        const planeSet = currentProps.planeNodeIds ?? new Set<string>();
        for (let index = 0; index < count; index += 1) {
          const node = currentProps.nodes[index];
          if (!node || planeSet.has(node.id) || currentProps.draftIds.includes(node.id)) continue;
          const isGlobalNeighbor = hover !== null && engine.neighbors[hover].includes(index);
          if (!isGlobalNeighbor) continue;
          const point = project(getPosition(index));
          if (point.z > 1) continue;
          const text = node.title;
          const width = estimateLabelWidth(text, "", "knowledge");
          const key = `node:${node.id}`;
          candidates.push({ key, kind: "knowledge", text, x: point.x - width / 2, y: point.y - labelHeight("knowledge") - 12, width, height: labelHeight("knowledge"), priority: 2400, alpha: 1, force: true });
          info.set(key, { text, dot: resolveColor(node.color), strong: true });
        }
      }
      const cardObstacles: AtlasLabelRect[] = Array.from(cardRects.values()).map((rect) => ({
        x: rect.x - 3,
        y: rect.y - 3,
        width: rect.width + 6,
        // Include the optional current/target badge hanging below the card.
        height: rect.height + 11
      }));
      const coreObstacles: AtlasLabelRect[] = [];
      if (!context.courseMode && currentProps.mode === "person") {
        currentProps.people.forEach((person) => {
          person.nodeIds.forEach((id) => {
            const index = engine.nodeIndex.get(id);
            if (index === undefined) return;
            const point = project(getPosition(index));
            if (point.z > 1) return;
            // Each core node and its person-colour ring is a no-label island.
            coreObstacles.push({ x: point.x - 28, y: point.y - 28, width: 56, height: 56 });
          });
        });
      }
      const placed = placeAtlasLabels(candidates, { width: context.rect.width, height: context.rect.height }, {
        maxLabels: 120,
        exclusions: [...hudRects, ...cardObstacles, ...coreObstacles]
      });
      const used = new Set<string>();
      placed.forEach((label) => {
        used.add(label.key);
        let element = labelPoolRef.current.get(label.key);
        if (!element) {
          element = document.createElement("div");
          element.className = "ef-atlas-label";
          labelsRef.current?.appendChild(element);
          labelPoolRef.current.set(label.key, element);
        }
        const content = info.get(label.key);
        const dot = content?.dot;
        const html = `${dot ? `<i style="background:${dot}"></i>` : ""}<span class="ef-atlas-label-text">${escapeHtml(content?.text ?? "")}</span>${content?.small ? `<small>${escapeHtml(content.small)}</small>` : ""}`;
        if (element.dataset.html !== html) { element.innerHTML = html; element.dataset.html = html; }
        element.dataset.key = label.key;
        element.className = `ef-atlas-label is-${label.kind}${content?.strong ? " is-strong" : ""}`;
        element.title = label.kind === "chapter" ? (content?.text ?? "") : "";
        if (label.kind === "chapter") {
          element.style.whiteSpace = "nowrap";
          element.style.textAlign = "center";
          element.style.width = `${label.width}px`;
          element.style.maxWidth = `${label.width}px`;
        } else {
          element.style.whiteSpace = "";
          element.style.textAlign = "";
          element.style.width = "";
          element.style.maxWidth = "";
        }
        element.style.transform = `translate(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px)`;
        element.style.opacity = String((label.alpha ?? 1).toFixed(2));
        element.style.display = "";
      });
      labelPoolRef.current.forEach((element, key) => {
        if (!used.has(key) && element.style.display !== "none") element.style.display = "none";
      });
    }

    function escapeHtml(value: string) {
      return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] as string));
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameHandle);
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      media.removeEventListener("change", refreshPalette);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      labelPoolRef.current.forEach((element) => element.remove());
      cardPool.forEach((element) => element.remove());
      cardPool.clear();
      labelPoolRef.current.clear();
      engine.dispose();
      renderer.domElement.remove();
      engineRef.current = null;
    };
    // The scene is intentionally bound to the structural dataset; presentation
    // props are read through propsRef and never rebuild the renderer.
  }, [nodes, edges, basePositions, domainGroups, communityGroups]);

  useEffect(() => {
    modePositionsRef.current = modePositions ?? null;
    planePositionsRef.current = planePositions ?? null;
    if (!engineRef.current) return;
    hoveredRef.current = null;
    hoverPointRef.current = null;
    startNodeAnimation();
    const currentMode = mode;
    if (currentMode === "course" || currentMode === "draft") {
      // The page calls fitCourse once plane ELK coordinates are ready.
    } else if (currentMode === "default") {
      fitBoundsOf(Array.from({ length: nodes.length }, (_, index) => index), { padding: 1.08, useTarget: true });
    }
  }, [mode, modePositions]);

  useEffect(() => {
    if (!engineRef.current) return;
    presentationTargets();
    startPresentationAnimation(320);
  }, [selectedId, searchIds, assistantIds, draftIds, people, reducedMotion]);

  useEffect(() => {
    if (!engineRef.current) return;
    startNodeAnimation();
  }, [planePositions]);

  return (
    <div className="ef-atlas-scene" ref={containerRef} data-mode={mode}>
      <div className="ef-atlas-cards" ref={cardsRef} aria-hidden="true" />
      <div className="ef-atlas-labels" ref={labelsRef} aria-hidden="true" />
    </div>
  );
}
