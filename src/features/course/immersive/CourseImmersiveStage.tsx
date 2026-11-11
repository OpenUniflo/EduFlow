import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import {
  COURSE_SAFE_BOTTOM,
  COURSE_SAFE_RIGHT,
  COURSE_SAFE_TOP,
  computeCourseFit,
  computeCoursePan
} from "./immersiveViewport";
import { advancePulse, routeMetrics } from "@/shared/scene/routePulse";
import { buildRouteAnchorSequence, pointAtRouteDistance, routeBandWindows, staggeredWindowCenters } from "./routeBand";

/**
 * One three.js scene for every learner course presentation. Structural layout
 * is supplied by the caller (ELK-derived); this component owns only camera,
 * pose, zoom, beams and the DOM overlay sync. It never computes graph layout.
 */

export type StagePoint = { x: number; y: number; z: number };

export type StageNode = {
  id: string;
  kind: "knowledge" | "assignment" | "chapter" | "chapter-empty" | "capability" | "route" | "route-chapter";
  title: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  status?: string;
  current?: boolean;
  /** Explicit course target Knowledge; rendered as a small top-right badge. */
  target?: boolean;
  meta?: string;
  detail?: ReactNode;
  /** Number of practices merged into one practice-group card. */
  count?: number;
  /** Plain-text action row shown on the card (practice / material chips). */
  actions?: string[];
  /** Second row under the name (state, practice count, coverage). */
  statusLine?: string;
  /** Practice identity shown on a front card and its reflection strip. */
  code?: string;
  bridge?: boolean;
  tone?: 1 | 2 | 3;
  index?: number;
  chapterId?: string;
  /** Reflection layer card: dashed, translucent, never the pointer target. */
  ghost?: boolean;
  /** Empty reflection slot ("暂无对应动手任务"). */
  empty?: boolean;
  /** Selection relation state. */
  dim?: boolean;
  highlight?: boolean;
  selected?: boolean;
  /** Route step number and the "you are here" marker. */
  step?: number;
  here?: boolean;
  /** Far face of the selected node: normal brightness, no highlight or name. */
  mirror?: boolean;
};

export type StageChapter = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  displayNumber: number;
  tone: 1 | 2 | 3;
  meta?: string;
};

export type StageEdge = {
  id: string;
  source?: string;
  target?: string;
  points: StagePoint[];
  kind?: "plain" | "knowledge" | "chapter" | "capability" | "practice" | "route-hop";
  highlighted?: boolean;
  /** Per-point weight of the animated knowledge reflection offset (0..1). */
  pointWeights?: number[];
};

export type StageBeam = {
  id: string;
  kind: "current" | "preview";
  points: StagePoint[];
  /**
   * P4R8: execution-order node ids. The stage resolves every id through the
   * same drawn position the cards / points use, so cardless capability and
   * intermediate nodes are on the band too. `points` stays for flat editing.
   */
  nodeIds?: string[];
  /** Selection outside the adopted route / route editing dims the beam. */
  dimmed?: boolean;
};

export type CourseImmersiveStageHandle = {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  resetPose(): void;
  setPose(pose: "front" | "rotated" | "flat"): void;
  rotateBy(radians: number): void;
  zoomPercent(): number;
  setZoomPercent(percent: number): void;
  getViewState(): StageViewState;
  setViewState(state: StageViewState): void;
  /** Smoothly move to the capability-layer preset (used by 看能力层). */
  focusCapabilities(): void;
  /** Pan + zoom only, preserving the current rotation (used by 定位). */
  locate(id: string): void;
  /** Smoothly return to the front pose (used by 回正面). */
  front(): void;
};

export type StageViewState = {
  distance: number;
  panX: number;
  panY: number;
  yaw: number;
  pitch: number;
  pose: "front" | "rotated" | "flat";
};

export type SemanticZoom = "far" | "mid" | "near";

type Props = {
  nodes: StageNode[];
  chapters?: StageChapter[];
  edges: StageEdge[];
  beams?: StageBeam[];
  mode: "course" | "capability" | "flat" | "route";
  layer: "skill" | "practice";
  pose: "front" | "rotated" | "flat";
  selectedId?: string | null;
  reducedMotion?: boolean;
  onSelect?(id: string, kind: StageNode["kind"]): void;
  onBackground?(): void;
  onPoseChange?(pose: "front" | "rotated" | "flat"): void;
  onSemanticZoom?(zoom: SemanticZoom, percent: number): void;
  onFps?(fps: number, nodeCount: number, domCount: number): void;
  detailOpen?: boolean;
  fitKey?: string;
  fitBounds?: { x: number; y: number };
  instantFit?: boolean;
  selectedCard?: ReactNode;
  className?: string;
  ref?: Ref<CourseImmersiveStageHandle>;
  "aria-label"?: string;
};

type RuntimeNode = {
  object: THREE.Object3D;
  element: HTMLElement | null;
  current: StagePoint;
  target: StagePoint;
  fade: number;
};

type FlatRouteBand = {
  id: string;
  kind: StageBeam["kind"];
  dimmed: boolean;
  nodeIds: string[];
  anchors: THREE.Vector3[];
  cumulative: number[];
  total: number;
  stepDistance: number;
  distance: number;
  color: string;
  track: SVGPathElement;
  pulses: SVGPathElement[][];
};

type Engine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  edgeGroup: THREE.Group;
  chapterGroup: THREE.Group;
  beamGroup: THREE.Group;
  routeBands: FlatRouteBand[];
  routeSvg: SVGSVGElement | null;
  flows: Array<{
    material: THREE.ShaderMaterial;
    metrics: ReturnType<typeof routeMetrics>;
    distance: number;
  }>;
  overviewPoints: THREE.Points | null;
  colors: Record<string, string>;
  width: number;
  height: number;
  fitDistance: number;
  bounds: { x: number; y: number };
  pxPerWorld: number;
  panX: number;
  panY: number;
  minPanX: number;
  maxPanX: number;
  minPanY: number;
  maxPanY: number;
  horizontalOverflow: boolean;
  safeLeft: number;
  safeRight: number;
  safeTop: number;
  safeBottom: number;
  detailShiftX: number;
  chapterLabels: Array<{ element: HTMLElement; point: THREE.Vector3; width: number }>;
  semantic: SemanticZoom;
  lastZoomPercent: number;
  emitZoom(force?: boolean): void;
  setCameraDistance(next: number, duration?: number): void;
  resize(): void;
  fit(animated?: boolean): void;
  targetFov: number;
  /** Release inertia for rotation and panning (radians or world units per ms). */
  velocity: { yaw: number; pitch: number; panX: number; panY: number };
  cameraVersion: number;
  frame: number;
  disposed: boolean;
  resizeObserver: ResizeObserver | null;
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function cardOverlapRatio(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  const width = Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2));
  const height = Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));
  if (!width || !height) return 0;
  return (width * height) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

function cssColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  // Resolve var() chains and color-mix() through a probe: getPropertyValue
  // returns the token expression, which THREE.Color cannot parse.
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color.trim();
  probe.remove();
  return resolved || fallback;
}

function roundedRectTexture(fill: string, edge: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, 256, 256);
  const gradient = context.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, fill);
  gradient.addColorStop(1, edge);
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(8, 8, 240, 240, 34);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, 64, 64);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(32, 32, 26, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeGroup(target: THREE.Group) {
  target.children.slice().forEach((child) => {
    target.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Sprite) {
      child.geometry?.dispose?.();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose?.();
    }
  });
}

export function CourseImmersiveStage({
  nodes, chapters = [], edges, beams = [], mode, layer, pose, selectedId, reducedMotion = false,
  onSelect, onBackground, onPoseChange, onSemanticZoom, onFps, detailOpen = false, fitKey = "", fitBounds, selectedCard, instantFit = false, className = "", ref, "aria-label": ariaLabel
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const routeSvgRef = useRef<SVGSVGElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const runtimeRef = useRef<Map<string, RuntimeNode>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onBackgroundRef = useRef(onBackground);
  onBackgroundRef.current = onBackground;
  const onPoseChangeRef = useRef(onPoseChange);
  onPoseChangeRef.current = onPoseChange;
  const onSemanticZoomRef = useRef(onSemanticZoom);
  onSemanticZoomRef.current = onSemanticZoom;
  const onFpsRef = useRef(onFps);
  onFpsRef.current = onFps;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const detailOpenRef = useRef(detailOpen);
  detailOpenRef.current = detailOpen;
  const instantFitRef = useRef(instantFit);
  instantFitRef.current = instantFit;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const selectedIdRef = useRef<string | null>(selectedId ?? null);
  selectedIdRef.current = selectedId ?? null;
  const targetPoseRef = useRef({ yaw: pose === "rotated" ? 1.05 : 0, pitch: pose === "rotated" ? -0.22 : 0 });
  const hasSelectedCardRef = useRef(Boolean(selectedCard));
  hasSelectedCardRef.current = Boolean(selectedCard);

  // Create the renderer, camera and animation loop once for this scene mount.
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const colors = {
      brand: cssColor("--brand", "#6D5DF6"),
      brandInk: cssColor("--brand-ink", "#4338CA"),
      line: cssColor("--line-strong", "#CBD5E1"),
      branch: cssColor("--muted", "#64748B"),
      ink: cssColor("--ink", "#0F172A"),
      target: cssColor("--course-target", "#3B82F6"),
      acquired: cssColor("--course-acquired", "#22C55E"),
      pending: cssColor("--course-intermediate", "#9CA3AF"),
      preview: cssColor("--course-route-preview", "#F59E0B"),
      surface: cssColor("--surface", "#FFFFFF")
    };
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(16, 1, 1, 12000);
    camera.position.set(0, 0, 2400);
    camera.lookAt(0, 0, 0);
    const group = new THREE.Group();
    scene.add(group);
    const edgeGroup = new THREE.Group();
    const chapterGroup = new THREE.Group();
    const beamGroup = new THREE.Group();
    group.add(edgeGroup, chapterGroup, beamGroup);
    const engine: Engine = {
      renderer, scene, camera, group, edgeGroup, chapterGroup, beamGroup, routeBands: [], routeSvg: routeSvgRef.current, flows: [], overviewPoints: null, colors,
      width: host.clientWidth, height: host.clientHeight, fitDistance: 2400,
      bounds: { x: 700, y: 480 }, pxPerWorld: 1, panX: 0, panY: 0,
      minPanX: -600, maxPanX: 600, minPanY: -600, maxPanY: 600, horizontalOverflow: false, detailShiftX: 0,
      safeLeft: 40, safeRight: 28, safeTop: 120, safeBottom: 78,
      chapterLabels: [], semantic: "mid", lastZoomPercent: 100,
      targetFov: 16, velocity: { yaw: 0, pitch: 0, panX: 0, panY: 0 }, cameraVersion: 0, frame: 0, disposed: false, resizeObserver: null
    } as unknown as Engine;
    engineRef.current = engine;

    function emitZoom(force = false) {
      const percent = Math.round((engine.fitDistance / Math.max(1, camera.position.z)) * 100);
      // The flattened route editor needs every card at every fit; far zoom is
      // a course-tree chapter overview that hides non-Knowledge cards.
      const next: SemanticZoom = modeRef.current === "flat" ? "mid" : percent < 84 ? "far" : percent > 128 ? "near" : "mid";
      if (next !== engine.semantic || force) {
        engine.semantic = next;
        host!.setAttribute("data-zoom", next);
      }
      if (percent !== engine.lastZoomPercent || force) {
        engine.lastZoomPercent = percent;
        host!.setAttribute("data-zoom-percent", String(percent));
        onSemanticZoomRef.current?.(next, percent);
      }
    }
    engine.emitZoom = emitZoom;
    function setCameraDistance(next: number, duration = 0) {
      const version = ++engine.cameraVersion;
      const start = camera.position.z;
      if (!duration || reducedRef.current) {
        camera.position.z = next;
        emitZoom();
        return;
      }
      const started = performance.now();
      const step = () => {
        if (engine.disposed || version !== engine.cameraVersion) return;
        const progress = Math.min(1, (performance.now() - started) / duration);
        camera.position.z = start + (next - start) * easeOut(progress);
        emitZoom();
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    engine.setCameraDistance = setCameraDistance;
    function resize() {
      const widthChanged = Math.abs(engine.width - host!.clientWidth) > 1;
      const heightChanged = Math.abs(engine.height - host!.clientHeight) > 1;
      engine.width = host!.clientWidth;
      engine.height = host!.clientHeight;
      renderer.setSize(Math.max(1, Math.round(engine.width)), Math.max(1, Math.round(engine.height)), false);
      camera.aspect = engine.width / Math.max(1, engine.height);
      camera.updateProjectionMatrix();
      // The floating detail panel never resizes the stage. A real window resize
      // keeps the readable width fit; it never lets a selection change zoom.
      if (widthChanged || heightChanged) fit(false);
    }
    engine.resize = resize;
    function fit(animated = true) {
      // Width-only fit for the course tree: all chapter columns are laid out
      // horizontally at a readable scale; extra height is browsed by panning.
      // The flattened route editor fits the remaining free rectangle (the edit
      // panel already narrows the stage) and pans vertically when it is tall.
      const flatMode = modeRef.current === "flat";
      const safeLeft = flatMode ? 24 : 40;
      const safeRight = flatMode ? 24 : COURSE_SAFE_RIGHT;
      const safeTop = flatMode ? 118 : COURSE_SAFE_TOP;
      const safeBottom = flatMode ? 84 : COURSE_SAFE_BOTTOM;
      engine.safeLeft = safeLeft;
      engine.safeRight = safeRight;
      engine.safeTop = safeTop;
      engine.safeBottom = safeBottom;
      const fit = computeCourseFit({
        viewportWidth: Math.max(1, engine.width),
        viewportHeight: Math.max(1, engine.height),
        bounds: engine.bounds,
        safeLeft,
        safeRight,
        safeTop,
        safeBottom,
        // Same readable floor as the course tree: 13px card labels never
        // shrink below ~12px. Tall bands are browsed by vertical panning.
        minScale: flatMode ? 1 : undefined,
        maxScale: flatMode ? 1.03 : undefined
      });
      engine.pxPerWorld = fit.pxPerWorld;
      engine.panX = fit.panX;
      engine.panY = fit.panY;
      engine.minPanX = fit.minPanX;
      engine.maxPanX = fit.maxPanX;
      engine.minPanY = fit.minPanY;
      engine.maxPanY = fit.maxPanY;
      engine.horizontalOverflow = fit.horizontalOverflow;
      const fov = THREE.MathUtils.degToRad(15);
      engine.fitDistance = engine.height / (2 * Math.max(0.0001, fit.pxPerWorld) * Math.tan(fov / 2));
      if (import.meta.env.DEV) (window as unknown as { __efFitDebug?: unknown }).__efFitDebug = { ...fit, bounds: engine.bounds, fit: engine.fitDistance, width: engine.width, height: engine.height };
      setCameraDistance(engine.fitDistance, animated && !reducedRef.current ? 520 : 0);
    }
    engine.fit = fit;
    function projectToScreen(world: THREE.Vector3) {
      const point = world.clone().project(camera);
      return {
        x: (point.x * 0.5 + 0.5) * engine.width,
        y: (-point.y * 0.5 + 0.5) * engine.height,
        visible: point.z > -1 && point.z < 1
      };
    }
    function flatRouteAnchors(band: FlatRouteBand) {
      const runtime = runtimeRef.current;
      const result: Array<{ id: string; world: THREE.Vector3; screen: { x: number; y: number } }> = [];
      band.nodeIds.forEach((id) => {
        const entry = runtime.get(id);
        if (!entry) return;
        const world = new THREE.Vector3(entry.current.x, -entry.current.y, entry.current.z).applyMatrix4(engine.group.matrixWorld);
        const screen = projectToScreen(world);
        result.push({ id, world, screen: { x: screen.x, y: screen.y } });
      });
      return result;
    }

    function flatRoutePath(
      anchors: Array<{ world: THREE.Vector3; screen: { x: number; y: number } }>,
      cumulative: number[],
      start: number,
      end: number
    ) {
      const total = cumulative[cumulative.length - 1] ?? 0;
      const from = Math.max(0, start);
      const to = Math.min(total, end);
      if (to - from < 0.01 || anchors.length < 2) return "";
      const distances = [from];
      for (let index = 1; index < cumulative.length - 1; index += 1) {
        if (cumulative[index] > from && cumulative[index] < to) distances.push(cumulative[index]);
      }
      distances.push(to);
      return distances.map((distance) => {
        let index = 0;
        while (index < cumulative.length - 2 && cumulative[index + 1] < distance) index += 1;
        const span = Math.max(0.0001, cumulative[index + 1] - cumulative[index]);
        const t = Math.max(0, Math.min(1, (distance - cumulative[index]) / span));
        const a = anchors[index].screen;
        const b = anchors[Math.min(anchors.length - 1, index + 1)].screen;
        return `${distance === from ? "M" : "L"} ${(a.x + (b.x - a.x) * t).toFixed(1)} ${(a.y + (b.y - a.y) * t).toFixed(1)}`;
      }).join(" ");
    }

    function updateFlatRouteBands(delta: number) {
      if (!engine.routeBands.length) return;
      const reduced = reducedRef.current;
      engine.routeSvg?.setAttribute("viewBox", `0 0 ${Math.max(1, engine.width)} ${Math.max(1, engine.height)}`);
      engine.routeBands.forEach((band) => {
        const anchors = flatRouteAnchors(band);
        if (anchors.length < 2) {
          band.track.setAttribute("d", "");
          band.pulses.forEach((pulse) => pulse.forEach((path) => path.setAttribute("d", "")));
          return;
        }
        const worldPoints = buildRouteAnchorSequence(band.nodeIds, anchors.map((anchor) => ({ id: anchor.id, x: anchor.world.x, y: anchor.world.y, z: anchor.world.z })));
        const metrics = routeMetrics(worldPoints);
        band.anchors = worldPoints.map((anchor) => new THREE.Vector3(anchor.x, anchor.y, anchor.z));
        band.cumulative = metrics.cumulative;
        band.total = metrics.total;
        band.stepDistance = metrics.stepDistance;
        band.track.setAttribute("d", flatRoutePath(anchors, metrics.cumulative, 0, metrics.total));
        band.track.setAttribute("opacity", reduced ? "0.17" : band.dimmed ? "0.06" : "0.12");
        if (reduced || metrics.total <= 0.0001) {
          band.pulses.forEach((pulse) => pulse.forEach((path) => path.setAttribute("d", "")));
          return;
        }
        band.distance = advancePulse(band.distance, metrics, delta);
        const midpoint = anchors[Math.floor(anchors.length / 2)].world;
        const distanceToMid = camera.position.distanceTo(midpoint);
        const worldPerPixel = (2 * Math.max(1, distanceToMid) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, engine.height);
        const windowWorld = 60 / 1.7 * worldPerPixel;
        const windows = routeBandWindows(band.distance, metrics, windowWorld, { count: 3, slices: 6 });
        band.pulses.forEach((pulse) => pulse.forEach((path) => path.setAttribute("d", "")));
        const sliceIndices = [0, 0, 0];
        windows.forEach((window) => {
          const pulse = band.pulses[window.window];
          if (!pulse) return;
          const path = pulse[Math.min(pulse.length - 1, sliceIndices[window.window]++)];
          const d = flatRoutePath(anchors, metrics.cumulative, window.start, window.end);
          if (!d) return;
          path.setAttribute("d", d);
          path.setAttribute("opacity", (window.intensity * (band.dimmed ? 0.32 : 0.86)).toFixed(3));
        });
      });
    }

    let last = performance.now();
    let lastZone = 0;
    let frameCount = 0;
    let fpsStarted = performance.now();
    let lastDomSync = 0;
    function tick(now: number) {
      if (engine.disposed) return;
      const rawDelta = Math.max(0, now - last);
      const delta = Math.min(64, rawDelta);
      last = now;
      const reduced = reducedRef.current;
      const runtime = runtimeRef.current;
      // Node tween: same nodes move to new coordinates (flatten/route); new
      // nodes fade in. No layout is computed here.
      const smoothing = reduced ? 1 : 1 - Math.exp(-rawDelta / 240);
      runtime.forEach((entry) => {
        entry.current = {
          x: entry.current.x + (entry.target.x - entry.current.x) * smoothing,
          y: entry.current.y + (entry.target.y - entry.current.y) * smoothing,
          z: entry.current.z + (entry.target.z - entry.current.z) * smoothing
        };
        entry.fade = reduced ? 1 : Math.min(1, entry.fade + rawDelta / 420);
        entry.object.position.set(entry.current.x, -entry.current.y, entry.current.z);
        entry.object.scale.setScalar(0.82 + entry.fade * 0.18);
      });
      // Release inertia: camera/pose continues briefly, then settles. User
      // input always clears these velocities on pointerdown.
      if (!dragging && !reduced) {
        const velocity = engine.velocity;
        if (Math.abs(velocity.yaw) + Math.abs(velocity.pitch) > 0.00004) {
          const nextYaw = targetPoseRef.current.yaw + velocity.yaw * rawDelta;
          const nextPitch = Math.max(-0.55, Math.min(0.55, targetPoseRef.current.pitch + velocity.pitch * rawDelta));
          targetPoseRef.current = { yaw: nextYaw, pitch: nextPitch };
          const normalized = Math.atan2(Math.sin(nextYaw), Math.cos(nextYaw));
          const nextPose = Math.abs(normalized) > 0.12 || Math.abs(nextPitch) > 0.08 ? "rotated" : "front";
          if (nextPose !== poseRef.current) { poseRef.current = nextPose; onPoseChangeRef.current?.(nextPose); }
          const decay = Math.exp(-rawDelta / 240);
          velocity.yaw *= decay;
          velocity.pitch *= decay;
          if (Math.abs(velocity.yaw) + Math.abs(velocity.pitch) < 0.00004) { velocity.yaw = 0; velocity.pitch = 0; }
        }
      }
      const target = targetPoseRef.current;
      const rotationSmoothing = reduced ? 1 : 1 - Math.exp(-rawDelta / 150);
      group.rotation.y += (target.yaw - group.rotation.y) * rotationSmoothing;
      group.rotation.x += (target.pitch - group.rotation.x) * rotationSmoothing;
      const normalizedYaw = Math.atan2(Math.sin(group.rotation.y), Math.cos(group.rotation.y));
      const rotated = Math.abs(normalizedYaw) > 0.24 || Math.abs(group.rotation.x) > 0.08;
      // The front pose is near-orthographic; rotating widens the lens so depth
      // between the course plane and the support plane is legible.
      engine.targetFov = rotated ? 18 : 15;
      if (Math.abs(camera.fov - engine.targetFov) > 0.05) {
        const nextFov = camera.fov + (engine.targetFov - camera.fov) * (reduced ? 1 : 1 - Math.exp(-rawDelta / 220));
        camera.fov = Math.max(12, Math.min(24, nextFov));
        camera.updateProjectionMatrix();
      }
      // Screen scale and pan envelope. Wheel/trackpad moves the group inside
      // this envelope; only Ctrl/⌘+wheel changes the camera distance.
      const fovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const pxPerWorld = engine.height / Math.max(1, 2 * camera.position.z * fovTan);
      engine.pxPerWorld = pxPerWorld;
      const envelope = computeCoursePan({
        viewportWidth: engine.width,
        viewportHeight: engine.height,
        bounds: engine.bounds,
        pxPerWorld,
        safeLeft: engine.safeLeft,
        safeRight: engine.safeRight,
        safeTop: engine.safeTop,
        safeBottom: engine.safeBottom
      });
      engine.minPanX = envelope.minPanX;
      engine.maxPanX = envelope.maxPanX;
      engine.minPanY = envelope.minPanY;
      engine.maxPanY = envelope.maxPanY;
      engine.horizontalOverflow = envelope.horizontalOverflow;
      if (!dragging && !reduced) {
        const velocity = engine.velocity;
        if (Math.abs(velocity.panX) + Math.abs(velocity.panY) > 0.002) {
          engine.panX += velocity.panX * rawDelta;
          engine.panY += velocity.panY * rawDelta;
          const decay = Math.exp(-rawDelta / 260);
          velocity.panX *= decay;
          velocity.panY *= decay;
          if (Math.abs(velocity.panX) + Math.abs(velocity.panY) < 0.002) { velocity.panX = 0; velocity.panY = 0; }
        }
      }
      engine.panX = Math.max(engine.minPanX, Math.min(engine.maxPanX, engine.panX));
      engine.panY = Math.max(engine.minPanY, Math.min(engine.maxPanY, engine.panY));
      // Capability support lives on a deeper plane. Front view keeps it under
      // 10% and effectively invisible; rotating reveals it progressively.
      const capAmount = Math.max(0, Math.min(1, (Math.abs(normalizedYaw) - 0.16) / (0.42 - 0.16)));
      const capVis = capAmount * capAmount * (3 - 2 * capAmount);
      // Keep the selected card in the free area by panning only. The floating
      // detail panel is 372px wide plus 16px inset; the scene shifts left just
      // enough, never zooming (the old workflow's 143%→183% jump).
      let targetDetailShift = 0;
      const specById = new Map(nodesRef.current.map((node) => [node.id, node] as const));
      const selectedEntry = detailOpenRef.current && selectedIdRef.current ? runtimeRef.current.get(selectedIdRef.current) : null;
      if (selectedEntry) {
        const world = new THREE.Vector3();
        selectedEntry.object.getWorldPosition(world);
        const point = projectToScreen(world);
        const spec = specById.get(selectedIdRef.current ?? "");
        const halfCard = Math.max(50, (spec?.width ?? 176) * 0.5);
        const baseX = point.x - engine.detailShiftX * pxPerWorld;
        const baseY = point.y;
        const panelStart = engine.width - 388;
        if (baseX + halfCard > panelStart - 16) targetDetailShift = (panelStart - 16 - (baseX + halfCard)) / Math.max(0.0001, pxPerWorld);
        else if (baseX - halfCard < 16) targetDetailShift = (16 - (baseX - halfCard)) / Math.max(0.0001, pxPerWorld);
        const topLimit = 156;
        const bottomLimit = engine.height - 108;
        let targetPanY = engine.panY;
        if (baseY < topLimit) targetPanY = engine.panY + (baseY - topLimit) / Math.max(0.0001, pxPerWorld);
        else if (baseY > bottomLimit) targetPanY = engine.panY + (baseY - bottomLimit) / Math.max(0.0001, pxPerWorld);
        engine.panY = Math.max(engine.minPanY, Math.min(engine.maxPanY, engine.panY + (targetPanY - engine.panY) * (reduced ? 1 : 1 - Math.exp(-rawDelta / 180))));
      }
      engine.detailShiftX += (targetDetailShift - engine.detailShiftX) * (reduced ? 1 : 1 - Math.exp(-rawDelta / 180));
      group.position.y = engine.panY;
      group.position.x = engine.panX + engine.detailShiftX;
      scene.updateMatrixWorld();
      updateFlatRouteBands(delta);
      if (import.meta.env.DEV) (window as unknown as { __efImmPose?: unknown }).__efImmPose = { yaw: group.rotation.y, target: target.yaw, pose: poseRef.current, mode: modeRef.current };
      if (import.meta.env.DEV) (window as unknown as { __efImmDebug?: unknown }).__efImmDebug = { bounds: engine.bounds, fit: engine.fitDistance, cz: camera.position.z, fov: camera.fov, w: engine.width, h: engine.height, gy: group.position.y, gx: group.position.x, panX: engine.panX, panY: engine.panY, zoom: engine.semantic, capVis, bridges: [...runtimeRef.current.entries()].filter(([id]) => specById.get(id)?.bridge).map(([id, entry]) => ({ id, x: entry.current.x, y: entry.current.y, z: entry.current.z })), samples: [...runtimeRef.current.entries()].filter(([id]) => ["R10", "A02", "AGC01"].includes(id)).map(([id, entry]) => ({ id, x: entry.current.x, y: entry.current.y, z: entry.current.z })) };
      const front = Math.abs(normalizedYaw) < 0.08 && poseRef.current !== "rotated";
      const farOverview = engine.semantic === "far" && modeRef.current === "course" && layerRef.current === "skill";
      if (engine.overviewPoints) engine.overviewPoints.visible = farOverview;
      const positions = new Map<string, { x: number; y: number; visible: boolean; scale: number; distance: number }>();
      // Far zoom is a chapter overview: node cards are display:none, so skip
      // their per-frame projection writes entirely. Large scenes also cap DOM
      // sync at ~30fps while the WebGL scene keeps its own frame cadence.
      const largeScene = runtime.size > 80;
      const syncDom = !largeScene || now - lastDomSync > 32;
      if (syncDom) lastDomSync = now;
      if (syncDom) runtime.forEach((entry, id) => {
        const element = entry.element;
        if (!element) return;
        const world = new THREE.Vector3();
        entry.object.getWorldPosition(world);
        const point = projectToScreen(world);
        const spec = specById.get(id);
        // Cards are DOM, but their size must track the world footprint: when
        // the stage narrows (detail panel) or the semantic zoom changes, world
        // spacing and card size shrink together instead of overlapping.
        const fovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const pxPerWorldNow = engine.height / Math.max(1, 2 * camera.position.z * fovTan);
        // Every card's CSS width already equals its world width, so the DOM
        // scale is just screen pixels per world unit. Scaling by width/176 a
        // second time made wide flat column headings huge while their cards
        // stayed tiny.
        const scale = Math.max(0.38, Math.min(1.3, pxPerWorldNow));
        const distance = camera.position.distanceTo(world);
        positions.set(id, { ...point, scale, distance });
        // Flat route editing is a 2D planning surface: every capability card is
        // a first-class member, so the rotated-plane capability reveal must not
        // fade or hide non-course (bridge) cards there.
        const flatMode = modeRef.current === "flat";
        const bridgeFactor = spec?.bridge && !flatMode ? capVis : 1;
        const kind = element.dataset.kind;
        const hidden = (!flatMode && spec?.bridge && capVis < 0.02)
          || (farOverview && kind === "knowledge")
          || (rotated && kind === "chapter-empty");
        const ghost = Boolean(spec?.ghost);
        const empty = Boolean(spec?.empty);
        const dimmed = Boolean(spec?.dim);
        const opacity = entry.fade * (hidden ? 0 : 1) * bridgeFactor * (ghost ? 0.62 : 1) * (dimmed ? 0.34 : 1) * (empty && !ghost ? 0.72 : 1);
        const pointer = hidden || ghost || empty ? "none" : "";
        if (element.dataset.lastHidden !== String(hidden)) {
          element.dataset.lastHidden = String(hidden);
          element.style.visibility = hidden ? "hidden" : "visible";
        }
        if (element.dataset.lastPointer !== pointer) {
          element.dataset.lastPointer = pointer;
          element.style.pointerEvents = pointer;
        }
        if (element.dataset.lastOpacity !== opacity.toFixed(2)) {
          element.dataset.lastOpacity = opacity.toFixed(2);
          element.style.opacity = String(opacity);
        }
        // Reflection cards always paint behind their solid counterpart. Once
        // rotated, screen depth decides, so the deeper support plane can sit in
        // front when the camera turns around.
        const layerZ = ghost || spec?.bridge ? 1 : 3;
        const depthZ = Math.abs(normalizedYaw) > 0.24 || Math.abs(group.rotation.x) > 0.08
          ? Math.max(1, 2000 - Math.round(distance))
          : layerZ;
        const zIndex = String(spec?.selected ? Math.max(60, depthZ) : depthZ);
        if (element.dataset.lastZ !== zIndex) {
          element.dataset.lastZ = zIndex;
          element.style.zIndex = zIndex;
        }
        // Cards stay screen-facing while the scene orbits, so a full 360°
        // rotation never mirrors text.
        const transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        if (element.dataset.lastTransform !== transform) {
          element.dataset.lastTransform = transform;
          element.style.transform = transform;
        }
        if (!point.visible) element.style.visibility = "hidden";
        else if (!hidden) element.style.visibility = "visible";
      });
      // Rotated overlap (demo `updateCards`): within one layer, any two cards
      // overlapping more than ~12% collapse the farther one to its status dot.
      // Capability cards participate; chapter banners and route labels do not.
      if (syncDom) {
        const cull = Math.abs(normalizedYaw) > 0.24 && poseRef.current !== "flat";
        const collapsed = new Set<string>();
        if (cull) {
          const boxes: Array<{ id: string; x: number; y: number; w: number; h: number; distance: number; priority: number; layer: string }> = [];
          runtime.forEach((entry, id) => {
            const element = entry.element;
            const point = positions.get(id);
            const spec = specById.get(id);
            if (!element || !point || !point.visible || element.dataset.lastHidden === "true" || !spec) return;
            if (spec.kind === "chapter" || spec.kind === "route-chapter" || spec.kind === "chapter-empty") return;
            const layer = spec.ghost ? "ghost" : "front";
            const priority = spec.selected ? 500 : spec.here ? 450 : spec.highlight ? 400 : spec.status === "completed" ? 300 : spec.status === "learning" ? 200 : 100;
            boxes.push({
              id,
              x: point.x,
              y: point.y,
              distance: point.distance,
              priority,
              layer,
              w: Math.max(16, (spec.width || 176) * point.scale),
              h: Math.max(14, (spec.height || 40) * point.scale)
            });
          });
          boxes.sort((left, right) => left.distance - right.distance || right.priority - left.priority || left.id.localeCompare(right.id));
          const accepted: typeof boxes = [];
          boxes.forEach((box) => {
            const overlaps = accepted.some((other) => other.layer === box.layer && cardOverlapRatio(box, other) > 0.12);
            if (overlaps) collapsed.add(box.id);
            else accepted.push(box);
          });
        }
        runtime.forEach((entry, id) => {
          if (!entry.element) return;
          const next = collapsed.has(id) ? "true" : "false";
          if (entry.element.dataset.collapsed !== next) entry.element.dataset.collapsed = next;
        });
      }
      // Capability / practice connector opacity follows the actual orbit and
      // the front layer, not the last clicked pose.
      engine.edgeGroup.children.forEach((child) => {
        const kind = child.userData.layerKind;
        if (kind !== "capability" && kind !== "practice") return;
        const material = (child as THREE.Mesh | THREE.Line).material;
        if (Array.isArray(material) || !material) return;
        const base = typeof child.userData.baseOpacity === "number" ? child.userData.baseOpacity : 0.2;
        const targetOpacity = kind === "capability" ? base * capVis : base * (layerRef.current === "practice" ? 1 : 0);
        (material as THREE.Material & { opacity: number }).opacity = targetOpacity;
      });
      // Chapter labels are DOM, anchored to each chapter's top edge. They are
      // always a single-line capsule: the column width clips the title and the
      // full name lives in the native title tooltip. No collision cull may hide
      // chapters 02/04/06.
      engine.chapterLabels.forEach(({ element, point, width }) => {
        const world = group.localToWorld(point.clone());
        const screen = projectToScreen(world);
        const maxWidth = Math.max(96, Math.min(232, width * pxPerWorld * 0.92));
        const maxWidthText = `${maxWidth.toFixed(1)}px`;
        if (element.style.maxWidth !== maxWidthText) element.style.maxWidth = maxWidthText;
        const meta = element.querySelector<HTMLElement>("em");
        if (meta) meta.style.display = maxWidth < 150 ? "none" : "";
        const compress = Math.max(0.24, Math.abs(Math.cos(group.rotation.y)));
        const transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0) translate(-50%, -50%) scaleX(${compress.toFixed(3)})`;
        if (element.dataset.lastTransform !== transform) {
          element.dataset.lastTransform = transform;
          element.style.transform = transform;
        }
        // Single-line at every zoom. Rotating edge-on would stack the capsules
        // over the cards, so the chapter strip yields to the capability layer.
        element.style.opacity = screen.visible && compress > 0.25 && !rotated ? "1" : "0";
      });
      const selected = selectedIdRef.current ? positions.get(selectedIdRef.current) : null;
      if (hasSelectedCardRef.current && selectedRef.current && selected) {
        const card = selectedRef.current;
        const cardWidth = card.offsetWidth || 340;
        const cardHeight = card.offsetHeight || 220;
        const safeTop = 128;
        const safeBottom = 74;
        const gap = 18;
        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
        const clampRect = (x: number, y: number) => ({
          x: clamp(x, cardWidth / 2 + 16, Math.max(cardWidth / 2 + 16, engine.width - cardWidth / 2 - 16)),
          y: clamp(y, safeTop + cardHeight / 2, Math.max(safeTop + cardHeight / 2, engine.height - safeBottom - cardHeight / 2))
        });
        // Anchor beside the selected node in the emptiest available space.
        // Right/left are preferred over below/above so the card does not cover
        // the focused chapter body.
        const selectedElement = runtime.get(selectedIdRef.current ?? "")?.element;
        const selectedWidth = Math.max(24, (selectedElement?.offsetWidth || 140) * selected.scale);
        const selectedHeight = Math.max(18, (selectedElement?.offsetHeight || 28) * selected.scale);
        const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
        positions.forEach((point, id) => {
          if (id === selectedIdRef.current || !point.visible) return;
          const element = runtime.get(id)?.element;
          if (!element || element.dataset.lastHidden === "true" || element.dataset.kind === "route-chapter") return;
          const width = Math.max(12, (element.offsetWidth || 130) * point.scale);
          const height = Math.max(12, (element.offsetHeight || 28) * point.scale);
          occupied.push({ x: point.x, y: point.y, w: width, h: height });
        });
        const right = selected.x + selectedWidth / 2 + gap + cardWidth / 2;
        const left = selected.x - selectedWidth / 2 - gap - cardWidth / 2;
        const below = selected.y + selectedHeight / 2 + gap + cardHeight / 2;
        const above = selected.y - selectedHeight / 2 - gap - cardHeight / 2;
        const candidates = [
          { x: right, y: selected.y },
          { x: left, y: selected.y },
          { x: right, y: selected.y - cardHeight * 0.32 },
          { x: right, y: selected.y + cardHeight * 0.32 },
          { x: left, y: selected.y - cardHeight * 0.32 },
          { x: left, y: selected.y + cardHeight * 0.32 },
          { x: selected.x, y: below },
          { x: selected.x, y: above }
        ];
        const fits = (point: { x: number; y: number }) => point.x - cardWidth / 2 >= 12
          && point.x + cardWidth / 2 <= engine.width - 12
          && point.y - cardHeight / 2 >= safeTop
          && point.y + cardHeight / 2 <= engine.height - safeBottom;
        const overlapArea = (point: { x: number; y: number }) => occupied.reduce((sum, box) => {
          const width = Math.min(point.x + cardWidth / 2, box.x + box.w / 2) - Math.max(point.x - cardWidth / 2, box.x - box.w / 2);
          const height = Math.min(point.y + cardHeight / 2, box.y + box.h / 2) - Math.max(point.y - cardHeight / 2, box.y - box.h / 2);
          return sum + (width > 0 && height > 0 ? width * height : 0);
        }, 0);
        const chosen = candidates
          .map((point, order) => ({ point, order, cost: (fits(point) ? 0 : 1e7) + overlapArea(point) * 8 + order }))
          .sort((a, b) => a.cost - b.cost)[0].point;
        const { x, y } = clampRect(chosen.x, chosen.y);
        const transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        if (card.dataset.lastTransform !== transform) {
          card.dataset.lastTransform = transform;
          card.style.transform = transform;
        }
        card.style.opacity = selected.visible ? "1" : "0";
      }
      renderer.render(scene, camera);
      frameCount += 1;
      if (now - fpsStarted > 700) {
        const fps = Math.round((frameCount * 1000) / Math.max(1, now - fpsStarted));
        onFpsRef.current?.(fps, runtime.size, host!.querySelectorAll("[data-stage-node]").length);
        frameCount = 0;
        fpsStarted = now;
      }
      if (now - lastZone > 180) {
        lastZone = now;
        emitZoom();
      }
      engine.frame = requestAnimationFrame(tick);
    }

    let dragging = false;
    let moved = false;
    let panning = false;
    let startedOnNode = false;
    let suppressClick = false;
    let startPointer = { x: 0, y: 0 };
    let lastPointer = { x: 0, y: 0 };
    let lastMoveAt = 0;
    function clearInertia() {
      engine.velocity = { yaw: 0, pitch: 0, panX: 0, panY: 0 };
    }
    function pointerDown(event: PointerEvent) {
      // Cards and labels are draggable scene objects, not text. Only the
      // floating detail card and browser chrome opt out.
      if (event.button !== 0 && event.button !== 2) return;
      if (event.button === 0 && (event.target as HTMLElement).closest(".ef-imm-selected-card, .ef-imm-detail, .ef-imm-stage button[data-immersive-control]")) return;
      dragging = true;
      moved = false;
      startedOnNode = Boolean((event.target as HTMLElement).closest("[data-stage-node], .ef-imm-chapter-label"));
      // Archive-identical mapping: left drag rotates; right or Shift drag pans.
      panning = event.button === 2 || event.shiftKey;
      clearInertia();
      startPointer = { x: event.clientX, y: event.clientY };
      lastPointer = { x: event.clientX, y: event.clientY };
      lastMoveAt = performance.now();
    }
    function pointerMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      if (Math.hypot(event.clientX - startPointer.x, event.clientY - startPointer.y) > 4) moved = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      const now = performance.now();
      const delta = Math.max(8, now - lastMoveAt);
      lastMoveAt = now;
      if (panning) {
        const scale = Math.max(0.0001, engine.pxPerWorld);
        const worldX = dx / scale;
        const worldY = -dy / scale;
        engine.panX = Math.max(engine.minPanX, Math.min(engine.maxPanX, engine.panX + worldX));
        engine.panY = Math.max(engine.minPanY, Math.min(engine.maxPanY, engine.panY + worldY));
        engine.velocity.panX = worldX / delta * 0.18;
        engine.velocity.panY = worldY / delta * 0.18;
        return;
      }
      if (!moved) return;
      // Free 360° orbit: yaw is unbounded, pitch stays comfortable.
      const yawDelta = dx * 0.006;
      const pitchDelta = dy * 0.004;
      const nextYaw = targetPoseRef.current.yaw + yawDelta;
      const nextPitch = Math.max(-0.55, Math.min(0.55, targetPoseRef.current.pitch + pitchDelta));
      targetPoseRef.current = { yaw: nextYaw, pitch: nextPitch };
      // Only a fraction of the pointer velocity becomes release inertia;
      // otherwise a short flick spins several extra turns.
      engine.velocity.yaw = Math.max(-0.012, Math.min(0.012, yawDelta / delta * 0.06));
      engine.velocity.pitch = Math.max(-0.008, Math.min(0.008, pitchDelta / delta * 0.06));
      const normalized = Math.atan2(Math.sin(nextYaw), Math.cos(nextYaw));
      poseRef.current = Math.abs(normalized) > 0.12 || Math.abs(nextPitch) > 0.08 ? "rotated" : "front";
      onPoseChangeRef.current?.(poseRef.current);
    }
    function pointerUp(event: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        // A drag that started on a card must rotate/pan, never select text or
        // fire the card's click. Swallow exactly the click that follows.
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      } else {
        clearInertia();
        if (event.button === 0 && !startedOnNode) onBackgroundRef.current?.();
      }
    }
    function swallowClick(event: MouseEvent) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
    function wheel(event: WheelEvent) {
      if ((event.target as HTMLElement).closest(".ef-imm-detail, .ef-imm-selected-card")) return;
      event.preventDefault();
      // Wheel and trackpad pinch (Ctrl+wheel) both zoom, exactly like the
      // Archive. Shift is reserved for panning with the pointer.
      const factor = Math.exp(event.deltaY * 0.0015);
      const next = Math.max(engine.fitDistance * 0.22, Math.min(engine.fitDistance * 3.2, camera.position.z * factor));
      camera.position.z = next;
      clearInertia();
      emitZoom(true);
    }
    function doubleClick(event: MouseEvent) {
      if ((event.target as HTMLElement).closest("[data-stage-node], .ef-imm-chapter-label, .ef-imm-selected-card")) return;
      clearInertia();
      targetPoseRef.current = { yaw: 0, pitch: 0 };
      poseRef.current = "front";
      onPoseChangeRef.current?.("front");
    }
    function contextMenu(event: MouseEvent) {
      if ((event.target as HTMLElement).closest(".ef-imm-detail, .ef-imm-selected-card")) return;
      event.preventDefault();
    }
    host.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    host.addEventListener("click", swallowClick, true);
    host.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("dblclick", doubleClick);
    host.addEventListener("contextmenu", contextMenu);
    const observer = new ResizeObserver(() => resize());
    observer.observe(host);
    engine.resizeObserver = observer;
    resize();
    engine.frame = requestAnimationFrame(tick);
    return () => {
      engine.disposed = true;
      cancelAnimationFrame(engine.frame);
      observer.disconnect();
      host.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      host.removeEventListener("click", swallowClick, true);
      host.removeEventListener("wheel", wheel);
      host.removeEventListener("dblclick", doubleClick);
      host.removeEventListener("contextmenu", contextMenu);
      disposeGroup(edgeGroup);
      disposeGroup(chapterGroup);
      disposeGroup(beamGroup);
      engine.chapterLabels.forEach(({ element }) => element.remove());
      engine.chapterLabels = [];
      // React owns the DOM cards; removing them here broke the overlay when
      // StrictMode re-ran the mount effect (setup -> cleanup -> setup) because
      // the second setup could not recreate React's already-committed nodes.
      runtimeRef.current.clear();
      renderer.dispose();
      engineRef.current = null;
    };
  }, []);

  // Structural node targets: reuses existing runtime entries so flatten and
  // layer changes animate instead of rebuilding the scene.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const runtime = runtimeRef.current;
    nodes.forEach((node) => {
      let entry = runtime.get(node.id);
      const target = { x: node.x, y: node.y, z: node.z };
      if (!entry) {
        const object = new THREE.Object3D();
        object.position.set(target.x, -target.y, target.z);
        engine.group.add(object);
        // The Archive-entry overlay already shows these cards. Materialise the
        // real cards fully before that overlay is removed, never fading them in
        // after the page has gone blank.
        entry = { object, element: null, current: { ...target }, target, fade: reducedRef.current || instantFitRef.current ? 1 : 0 };
        runtime.set(node.id, entry);
      } else {
        entry.target = target;
      }
    });
    const ids = new Set(nodes.map((node) => node.id));
    runtime.forEach((entry, id) => {
      if (ids.has(id)) return;
      engine.group.remove(entry.object);
      entry.element?.remove();
      runtime.delete(id);
    });
    // The flattened editor's cards and its column captions define the fit
    // bounds; in the course tree the knowledge cards and chapter boxes do. The
    // card footprint (not only its centre) is included so nothing is clipped.
    const measured = mode === "flat"
      ? nodes.filter((node) => node.kind === "capability" || node.kind === "route-chapter" || node.kind === "chapter-empty")
      : nodes.filter((node) => node.kind === "knowledge" || node.kind === "chapter-empty");
    const measuredX = [
      ...measured.flatMap((node) => [node.x - node.width / 2, node.x + node.width / 2]),
      ...chapters.flatMap((chapter) => [chapter.x - chapter.width / 2, chapter.x + chapter.width / 2])
    ];
    const measuredY = [
      ...measured.flatMap((node) => [node.y - node.height / 2, node.y + node.height / 2]),
      ...chapters.flatMap((chapter) => [chapter.y - chapter.height / 2, chapter.y + chapter.height / 2])
    ];
    const maxX = Math.max(360, ...measuredX.map((value) => Math.abs(value)));
    const maxY = Math.max(260, ...measuredY.map((value) => Math.abs(value))) + 24;
    engine.bounds = fitBounds ? { x: Math.max(maxX, fitBounds.x), y: Math.max(maxY, fitBounds.y) } : { x: maxX, y: maxY };
  }, [chapters, fitBounds, mode, nodes]);

  // Attach DOM element refs after React commits. A fit happens only for a new
  // structural/presentation frame (fitKey), never for semantic-zoom DOM changes.
  useEffect(() => {
    const overlay = hostRef.current?.querySelector<HTMLElement>(".ef-imm-overlay");
    if (!overlay) return;
    runtimeRef.current.forEach((entry, id) => {
      entry.element = overlay.querySelector<HTMLElement>(`[data-stage-id="${CSS.escape(id)}"]`);
    });
  }, [nodes]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // Entering from the Archive measures card targets while the scene is
    // hidden; fit instantly so the measured rectangles are the final ones.
    engine.fit(!reducedRef.current && !instantFitRef.current);
  }, [fitKey]);



  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    disposeGroup(engine.chapterGroup);
    engine.chapterLabels.forEach(({ element }) => element.remove());
    engine.chapterLabels = [];
    hostRef.current?.querySelectorAll(".ef-imm-chapter-label").forEach((element) => element.remove());
    const roundedRect = (shape: THREE.Shape, width: number, height: number, radius: number) => {
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const r = Math.min(radius, halfWidth, halfHeight);
      shape.moveTo(-halfWidth + r, -halfHeight);
      shape.lineTo(halfWidth - r, -halfHeight);
      shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + r);
      shape.lineTo(halfWidth, halfHeight - r);
      shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - r, halfHeight);
      shape.lineTo(-halfWidth + r, halfHeight);
      shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - r);
      shape.lineTo(-halfWidth, -halfHeight + r);
      shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + r, -halfHeight);
    };
    chapters.forEach((chapter) => {
      const color = new THREE.Color(chapter.tone === 1 ? engine.colors.brand : chapter.tone === 2 ? engine.colors.acquired : engine.colors.target);
      const shape = new THREE.Shape();
      roundedRect(shape, chapter.width, chapter.height, 28);
      const plate = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: engine.semantic === "far" ? 0.14 : 0.11, depthWrite: false, side: THREE.DoubleSide })
      );
      plate.position.set(chapter.x, -chapter.y, -18);
      engine.chapterGroup.add(plate);
      // Follow the same rounded outline as the glass fill. A square line loop
      // was what made the chapter area read as a rectangular table header.
      const borderPoints = shape.getPoints(10).map((point) => new THREE.Vector3(
        chapter.x + point.x,
        -chapter.y + point.y,
        -17
      ));
      const border = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(borderPoints),
        new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity: 0.52,
          dashSize: 9,
          gapSize: 6,
          depthWrite: false
        })
      );
      border.computeLineDistances();
      engine.chapterGroup.add(border);
      const element = document.createElement("button");
      element.type = "button";
      element.className = "ef-imm-chapter-label";
      element.dataset.chapterId = chapter.id;
      element.innerHTML = `<b>${String(chapter.displayNumber).padStart(2, "0")}</b><span></span><em></em>`;
      element.querySelector("span")!.textContent = chapter.title;
      element.querySelector("em")!.textContent = chapter.meta ?? "";
      element.style.maxWidth = `${Math.min(196, Math.max(92, chapter.width * 0.94))}px`;
      element.setAttribute("aria-label", `第 ${chapter.displayNumber} 章 ${chapter.title}${chapter.meta ? `，${chapter.meta}` : ""}`);
      element.title = `第 ${chapter.displayNumber} 章 · ${chapter.title}${chapter.meta ? ` · ${chapter.meta}` : ""}`;
      element.addEventListener("click", (event) => { event.stopPropagation(); onSelectRef.current?.(chapter.id, "chapter"); });
      hostRef.current?.appendChild(element);
      // Demo chapter style: one glass capsule centred on the panel's top edge.
      const point = new THREE.Vector3(
        chapter.x,
        -(chapter.y - chapter.height / 2),
        2
      );
      engine.chapterLabels.push({ element, point, width: chapter.width });
    });
  }, [chapters]);
  // Far semantic zoom renders node status as scene points (no DOM capsules);
  // chapter labels and the WebGL edge layer stay readable at overview scale.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.overviewPoints) {
      engine.group.remove(engine.overviewPoints);
      engine.overviewPoints.geometry.dispose();
      const material = engine.overviewPoints.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else { (material as THREE.PointsMaterial).map?.dispose(); material.dispose(); }
      engine.overviewPoints = null;
    }
    const knowledge = nodes.filter((node) => node.kind === "knowledge");
    if (!knowledge.length) return;
    const positions = new Float32Array(knowledge.length * 3);
    const colors = new Float32Array(knowledge.length * 3);
    knowledge.forEach((node, index) => {
      positions[index * 3] = node.x;
      positions[index * 3 + 1] = -node.y;
      positions[index * 3 + 2] = node.z + 4;
      const color = new THREE.Color(
        node.status === "completed" ? engine.colors.acquired
          : node.kind === "capability" ? engine.colors.pending
            : engine.colors.target
      );
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const texture = dotTexture();
    const material = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, map: texture ?? null, alphaTest: 0.2 });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.renderOrder = 2;
    engine.group.add(points);
    engine.overviewPoints = points;
    return () => {
      if (!engine.overviewPoints) return;
      engine.group.remove(engine.overviewPoints);
      engine.overviewPoints.geometry.dispose();
      const pointMaterial = engine.overviewPoints.material;
      if (Array.isArray(pointMaterial)) pointMaterial.forEach((item) => item.dispose());
      else { (pointMaterial as THREE.PointsMaterial).map?.dispose(); pointMaterial.dispose(); }
      engine.overviewPoints = null;
    };
  }, [nodes]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    disposeGroup(engine.edgeGroup);
    const points3d = (points: StagePoint[]) => points.map((point) => new THREE.Vector3(point.x, -point.y, point.z));
    // Front-plane Knowledge dependencies are thin orthogonal lines behind the
    // cards. Highlighting changes colour/opacity only; it must never become a
    // thick tube that reads as if it were painted over the cards.
    const addLine = (points: StagePoint[], color: string, opacity: number, kind: StageEdge["kind"], dashed = false) => {
      if (points.length < 2) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(points3d(points));
      const initialOpacity = kind === "capability" || kind === "practice" ? 0 : opacity;
      const material = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: initialOpacity, depthWrite: false, dashSize: 5, gapSize: 6 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: initialOpacity, depthWrite: false });
      const line = new THREE.Line(geometry, material);
      if (dashed) line.computeLineDistances();
      line.renderOrder = 0;
      line.userData.layerKind = kind;
      line.userData.baseOpacity = opacity;
      engine.edgeGroup.add(line);
    };
    // With a selection open the unrelated dependency web fades almost away;
    // the highlighted incident routes stay thin and orthogonal behind cards.
    const hasHighlight = edges.some((edge) => edge.highlighted);
    edges.forEach((edge) => {
      if (edge.kind === "capability") addLine(edge.points, engine.colors.brand, edge.highlighted ? 0.88 : hasHighlight ? 0.08 : 0.4, "capability", true);
      else if (edge.kind === "practice") addLine(edge.points, engine.colors.branch, edge.highlighted ? 0.78 : hasHighlight ? 0.08 : 0.34, "practice", true);
      else if (edge.kind === "chapter") addLine(edge.points, engine.colors.line, 0.2, "chapter");
      else addLine(edge.points, engine.colors.brand, edge.highlighted ? 0.92 : hasHighlight ? 0.06 : 0.24, "knowledge");
    });
  }, [edges]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.routeSvg) return;
    disposeGroup(engine.beamGroup);
    engine.flows = [];
    engine.routeBands = [];
    const svg = engine.routeSvg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", `0 0 ${Math.max(1, engine.width)} ${Math.max(1, engine.height)}`);
    const runtime = runtimeRef.current;
    beams.forEach((beam) => {
      const nodeIds = beam.nodeIds?.length ? beam.nodeIds : beam.points.flatMap((point) => {
        const entry = [...runtime.entries()].find(([, value]) => Math.abs(value.current.x - point.x) < 0.5 && Math.abs(value.current.y - point.y) < 0.5);
        return entry ? [entry[0]] : [];
      });
      if (nodeIds.length < 2) return;
      const color = beam.kind === "current" ? engine.colors.brandInk : engine.colors.preview;
      const track = document.createElementNS("http://www.w3.org/2000/svg", "path");
      track.setAttribute("fill", "none");
      track.setAttribute("stroke", color);
      track.setAttribute("stroke-width", "1.5");
      track.setAttribute("stroke-linecap", "round");
      track.setAttribute("stroke-linejoin", "round");
      track.setAttribute("opacity", beam.dimmed ? "0.05" : "0.12");
      svg.appendChild(track);
      const pulses: SVGPathElement[][] = [];
      for (let window = 0; window < 3; window += 1) {
        const paths: SVGPathElement[] = [];
        for (let slice = 0; slice < 6; slice += 1) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", color);
          path.setAttribute("stroke-width", "2.6");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          path.setAttribute("opacity", "0");
          svg.appendChild(path);
          paths.push(path);
        }
        pulses.push(paths);
      }
      engine.routeBands.push({
        id: beam.id, kind: beam.kind, dimmed: Boolean(beam.dimmed), nodeIds: [...nodeIds],
        anchors: [], cumulative: [], total: 0, stepDistance: 0, distance: 0, color, track, pulses
      });
    });
  }, [beams]);

  useEffect(() => {
    // A drag reports its new pose through onPoseChange; do not snap the target
    // back to the canned rotated pose mid-gesture. Only an external pose
    // change (toolbar/keyboard) should set the target here.
    const changed = poseRef.current !== pose;
    poseRef.current = pose;
    if (!changed) return;
    targetPoseRef.current = pose === "rotated" ? { yaw: 1.05, pitch: -0.22 } : { yaw: 0, pitch: 0 };
    if (engineRef.current) engineRef.current.velocity = { yaw: 0, pitch: 0, panX: 0, panY: 0 };
  }, [pose]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => { const engine = engineRef.current; if (engine) engine.setCameraDistance(Math.max(engine.fitDistance * 0.35, engine.camera.position.z * 0.78), 260); },
    zoomOut: () => { const engine = engineRef.current; if (engine) engine.setCameraDistance(Math.min(engine.fitDistance * 2.6, engine.camera.position.z * 1.28), 260); },
    fit: () => engineRef.current?.fit(!reducedRef.current),
    resetPose: () => { poseRef.current = "front"; targetPoseRef.current = { yaw: 0, pitch: 0 }; if (engineRef.current) engineRef.current.velocity = { yaw: 0, pitch: 0, panX: 0, panY: 0 }; onPoseChangeRef.current?.("front"); },
    setPose: (value) => { poseRef.current = value; targetPoseRef.current = value === "rotated" ? { yaw: 1.05, pitch: -0.22 } : { yaw: 0, pitch: 0 }; if (engineRef.current) engineRef.current.velocity = { yaw: 0, pitch: 0, panX: 0, panY: 0 }; onPoseChangeRef.current?.(value); },
    rotateBy: (radians) => { targetPoseRef.current = { ...targetPoseRef.current, yaw: targetPoseRef.current.yaw + radians }; },
    zoomPercent: () => engineRef.current?.lastZoomPercent ?? 100,
    setZoomPercent: (percent) => { const engine = engineRef.current; if (!engine) return; engine.setCameraDistance(engine.fitDistance / Math.max(0.2, percent / 100), 320); },
    getViewState: () => {
      const engine = engineRef.current;
      return {
        distance: engine?.camera.position.z ?? 2400,
        panX: engine?.panX ?? 0,
        panY: engine?.panY ?? 0,
        yaw: targetPoseRef.current.yaw,
        pitch: targetPoseRef.current.pitch,
        pose: poseRef.current
      };
    },
    setViewState: (state) => {
      const engine = engineRef.current;
      if (!engine) return;
      targetPoseRef.current = { yaw: state.yaw, pitch: state.pitch };
      poseRef.current = state.pose;
      engine.panX = state.panX;
      engine.panY = state.panY;
      engine.detailShiftX = 0;
      engine.velocity = { yaw: 0, pitch: 0, panX: 0, panY: 0 };
      engine.setCameraDistance(state.distance, 0);
    },
    focusCapabilities: () => {
      const engine = engineRef.current;
      if (!engine) return;
      targetPoseRef.current = { yaw: 0.95, pitch: -0.14 };
      poseRef.current = "rotated";
      onPoseChangeRef.current?.("rotated");
    },
    locate: (id: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      const node = nodesRef.current.find((item) => item.id === id);
      if (!node) return;
      const targetX = node.x;
      const targetY = node.y;
      const px = engine.pxPerWorld;
      engine.panX = -targetX * px + (engine.width - 388) / 2 - engine.width / 2;
      engine.panY = targetY * px - engine.height / 2;
      engine.setCameraDistance(Math.max(engine.fitDistance * 0.55, 240), 320);
    },
    front: () => {
      poseRef.current = "front";
      targetPoseRef.current = { yaw: 0, pitch: 0 };
      if (engineRef.current) engineRef.current.velocity = { yaw: 0, pitch: 0, panX: 0, panY: 0 };
      onPoseChangeRef.current?.("front");
    }
  }), []);

  return (
    <div
      ref={hostRef}
      className={`ef-imm-stage ${className}`.trim()}
      data-mode={mode}
      data-layer={layer}
      data-pose={pose}
      aria-label={`${ariaLabel ?? "课程场景"}。左键拖拽旋转，滚轮或双指缩放，右键或 Shift 拖拽平移，双击空白回正，方向键与 1/2/3 切换视角。`}
      aria-keyshortcuts="1 2 3 R F 0 + -"
      title="左键拖拽旋转 · 滚轮/双指缩放 · 右键或 Shift 拖拽平移 · 双击空白回正"
    >
      <canvas ref={canvasRef} className="ef-imm-canvas" aria-hidden="true" />
      <div className="ef-imm-overlay">
        {nodes.filter((node) => node.kind !== "chapter").map((node) => (
          <div
            key={node.id}
            data-stage-id={node.id}
            data-stage-node="true"
            data-kind={node.kind}
            data-status={node.status}
            data-bridge={node.bridge ? "true" : undefined}
            data-layer={mode === "course" ? (node.kind === "assignment" ? "practice" : "skill") : "course"}
            className={`ef-imm-node ef-imm-node--${node.kind} ${node.current ? "is-current" : ""} ${node.kind === "assignment" ? "is-practice" : "is-skill"} ${node.tone ? `tone-${node.tone}` : ""} ${node.id.startsWith("flatten-column:") ? "is-flat-column" : ""} ${node.ghost ? "is-ghost" : ""} ${node.empty ? "is-empty" : ""} ${node.dim ? "is-dim" : ""} ${node.highlight ? "is-hl" : ""} ${node.selected ? "is-sel" : ""} ${node.step ? "has-step" : ""}`}
            style={node.kind === "assignment"
              ? { width: `${Math.min(node.width, 176)}px`, height: `${node.height}px` }
              : { width: `${node.width}px`, height: `${node.height}px` }}
            role="button"
            tabIndex={0}
            aria-label={node.title}
            title={node.title}
            onClick={(event) => { event.stopPropagation(); onSelect?.(node.kind === "route-chapter" ? node.chapterId ?? node.id : node.id, node.kind); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(node.kind === "route-chapter" ? node.chapterId ?? node.id : node.id, node.kind); } }}
          >
            {node.kind === "assignment" ? <><b className="ef-imm-node-index">{node.empty ? "—" : node.meta}</b><span className="ef-imm-node-copy"><span className="ef-imm-node-title-row"><strong>{node.title}</strong>{node.count && node.count > 1 ? <em className="ef-imm-node-count">+{node.count - 1}</em> : null}</span>{node.detail ? <small className="ef-imm-node-meta">{node.detail}</small> : null}</span></> : null}
            {node.kind === "chapter-empty" ? <><i className="ef-imm-node-dot" /><span className="ef-imm-node-copy"><strong>{node.title}</strong><small className="ef-imm-node-meta">{node.meta}</small></span></> : null}
            {node.kind === "route" ? <><i className="ef-imm-route-dot">{node.index ? String(node.index).padStart(2, "0") : null}</i><span className="ef-imm-node-copy"><strong>{node.title}</strong><small>{node.meta}</small><span className="ef-imm-node-detail">{node.detail}</span></span></> : null}
            {node.kind === "route-chapter" ? <><i className="ef-imm-route-dot" /><span className="ef-imm-node-copy"><strong>{node.title}</strong><small>{node.meta ?? node.detail}</small></span></> : null}
            {node.kind === "knowledge" || node.kind === "capability" ? <>{node.step ? <i className="ef-imm-step">{node.step}</i> : null}<i className="ef-imm-node-dot" /><span className="ef-imm-node-copy"><strong>{node.title}</strong><small className="ef-imm-node-meta">{node.meta}</small><span className="ef-imm-node-detail">{node.detail}</span></span>{node.kind === "knowledge" && (node.current || node.target) ? <em className={`ef-imm-badge ${node.current ? "is-current" : "is-target"}`}>{node.current ? "当前" : "目标"}</em> : null}</> : null}
            {node.ghost ? <span className="ef-imm-ghost-peek" aria-hidden="true"><strong>{node.kind === "assignment" ? <>{node.title}{node.count && node.count > 1 ? <em className="ef-imm-node-count">+{node.count - 1}</em> : null}</> : node.title}</strong>{node.kind === "assignment" && node.detail ? <small>{node.detail}</small> : null}</span> : null}
          </div>
        ))}
        {selectedCard ? <div ref={selectedRef} className="ef-imm-selected-card">{selectedCard}</div> : null}
      </div>
      <div className="ef-imm-route-band" aria-hidden="true">
        <svg ref={routeSvgRef} className="ef-imm-route-svg" aria-hidden="true" />
      </div>
      <div className="ef-imm-help" aria-hidden="true">左键拖拽旋转 · 滚轮/双指缩放 · 右键或 Shift 拖拽平移</div>
    </div>
  );
}
