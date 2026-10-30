import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import * as THREE from "three";

/**
 * One three.js scene for every learner course presentation. Structural layout
 * is supplied by the caller (ELK-derived); this component owns only camera,
 * pose, zoom, beams and the DOM overlay sync. It never computes graph layout.
 */

export type StagePoint = { x: number; y: number; z: number };

export type StageNode = {
  id: string;
  kind: "knowledge" | "assignment" | "chapter" | "capability" | "route" | "route-chapter";
  title: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  status?: string;
  current?: boolean;
  meta?: string;
  detail?: ReactNode;
  bridge?: boolean;
  tone?: 1 | 2 | 3;
  index?: number;
  chapterId?: string;
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
  kind?: "plain" | "chapter";
  highlighted?: boolean;
};

export type StageBeam = {
  id: string;
  kind: "current" | "preview";
  points: StagePoint[];
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
  fitKey?: string;
  fitBounds?: { x: number; y: number };
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

type Engine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  edgeGroup: THREE.Group;
  chapterGroup: THREE.Group;
  beamGroup: THREE.Group;
  packets: Array<{ mesh: THREE.Mesh; points: StagePoint[]; progress: number; speed: number; offset: number }>;
  overviewPoints: THREE.Points | null;
  colors: Record<string, string>;
  width: number;
  height: number;
  fitDistance: number;
  bounds: { x: number; y: number };
  chapterLabels: Array<{ element: HTMLElement; point: THREE.Vector3 }>;
  semantic: SemanticZoom;
  lastZoomPercent: number;
  emitZoom(force?: boolean): void;
  setCameraDistance(next: number, duration?: number): void;
  resize(): void;
  fit(animated?: boolean): void;
  targetFov: number;
  frame: number;
  disposed: boolean;
  resizeObserver: ResizeObserver | null;
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function cssColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
  onSelect, onBackground, onPoseChange, onSemanticZoom, onFps, fitKey = "", fitBounds, selectedCard, className = "", ref, "aria-label": ariaLabel
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const selectedIdRef = useRef<string | null>(selectedId ?? null);
  selectedIdRef.current = selectedId ?? null;
  const targetPoseRef = useRef({ yaw: pose === "rotated" ? 0.68 : 0, pitch: pose === "rotated" ? -0.18 : 0 });
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
      target: cssColor("--target", "#22C55E"),
      acquired: cssColor("--acquired", "#3B82F6"),
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
      renderer, scene, camera, group, edgeGroup, chapterGroup, beamGroup, packets: [], overviewPoints: null, colors,
      width: host.clientWidth, height: host.clientHeight, fitDistance: 2400,
      bounds: { x: 700, y: 480 }, chapterLabels: [], semantic: "mid", lastZoomPercent: 100,
      targetFov: 16, frame: 0, disposed: false, resizeObserver: null
    } as unknown as Engine;
    engineRef.current = engine;

    function emitZoom(force = false) {
      const percent = Math.round((engine.fitDistance / Math.max(1, camera.position.z)) * 100);
      const next: SemanticZoom = percent < 84 ? "far" : percent > 128 ? "near" : "mid";
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
      const start = camera.position.z;
      if (!duration || reducedRef.current) {
        camera.position.z = next;
        emitZoom();
        return;
      }
      const started = performance.now();
      const step = () => {
        if (engine.disposed) return;
        const progress = Math.min(1, (performance.now() - started) / duration);
        camera.position.z = start + (next - start) * easeOut(progress);
        emitZoom();
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    engine.setCameraDistance = setCameraDistance;
    function resize() {
      engine.width = host!.clientWidth;
      engine.height = host!.clientHeight;
      renderer.setSize(Math.max(1, Math.round(engine.width)), Math.max(1, Math.round(engine.height)), false);
      camera.aspect = engine.width / Math.max(1, engine.height);
      camera.updateProjectionMatrix();
      fit(false);
    }
    engine.resize = resize;
    function fit(animated = true) {
      // Fit against the front lens, independent of a rotated preview frame.
      const fov = THREE.MathUtils.degToRad(15);
      // Keep the graph inside the usable area below the contextual top band and
      // above the bottom controls; the column headers of the flat editor must
      // never hide under the top bar.
      const safeTop = 132;
      const safeBottom = 78;
      const usableHeight = Math.max(280, engine.height - safeTop - safeBottom);
      const usableWidth = Math.max(320, engine.width - 56);
      const zForHeight = (engine.bounds.y * 2 * (engine.height / usableHeight)) / (2 * Math.tan(fov / 2));
      const zForWidth = (engine.bounds.x * 2 * (engine.width / usableWidth)) / (2 * Math.tan(fov / 2) * Math.max(0.4, camera.aspect));
      engine.fitDistance = Math.max(zForHeight, zForWidth) * 1.1;
      if (import.meta.env.DEV) (window as unknown as { __efFitDebug?: unknown }).__efFitDebug = { zForHeight, zForWidth, bounds: engine.bounds, fov: camera.fov, aspect: camera.aspect, width: engine.width, height: engine.height, usableHeight, usableWidth, fit: engine.fitDistance };
      const densityScale = runtimeRef.current.size > 80 ? 1.26 : 1;
      setCameraDistance(engine.fitDistance * densityScale, animated && !reducedRef.current ? 520 : 0);
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
    let last = performance.now();
    let lastZone = 0;
    let frameCount = 0;
    let fpsStarted = performance.now();
    let lastDomSync = 0;
    function tick(now: number) {
      if (engine.disposed) return;
      const delta = Math.max(0, Math.min(64, now - last));
      last = now;
      const reduced = reducedRef.current;
      const runtime = runtimeRef.current;
      // Node tween: same nodes move to new coordinates (flatten/route); new
      // nodes fade in. No layout is computed here.
      const smoothing = reduced ? 1 : 1 - Math.exp(-delta / 240);
      runtime.forEach((entry) => {
        entry.current = {
          x: entry.current.x + (entry.target.x - entry.current.x) * smoothing,
          y: entry.current.y + (entry.target.y - entry.current.y) * smoothing,
          z: entry.current.z + (entry.target.z - entry.current.z) * smoothing
        };
        entry.fade = reduced ? 1 : Math.min(1, entry.fade + delta / 420);
        entry.object.position.set(entry.current.x, -entry.current.y, entry.current.z);
        entry.object.scale.setScalar(0.82 + entry.fade * 0.18);
      });
      const target = targetPoseRef.current;
      const rotationSmoothing = reduced ? 1 : 1 - Math.exp(-delta / 150);
      group.rotation.y += (target.yaw - group.rotation.y) * rotationSmoothing;
      group.rotation.x += (target.pitch - group.rotation.x) * rotationSmoothing;
      const rotated = Math.abs(group.rotation.y) > 0.24 || Math.abs(group.rotation.x) > 0.08;
      // The front pose is near-orthographic; rotating widens the lens so depth
      // between the course plane and the support plane is legible.
      engine.targetFov = rotated ? 18 : 15;
      if (Math.abs(camera.fov - engine.targetFov) > 0.05) {
        const nextFov = camera.fov + (engine.targetFov - camera.fov) * (reduced ? 1 : 1 - Math.exp(-delta / 220));
        camera.fov = Math.max(12, Math.min(24, nextFov));
        camera.updateProjectionMatrix();
      }
      // Vertical safe-area bias: keep content below the contextual top band.
      const halfWorldHeight = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const pxPerWorld = engine.height / Math.max(1, halfWorldHeight * 2);
      const safeTop = 132;
      const safeBottom = 78;
      const verticalBias = engine.semantic === "near" ? 160 : (safeTop - safeBottom) / 2;
      group.position.y = -verticalBias / Math.max(0.0001, pxPerWorld);
      scene.updateMatrixWorld();
      if (import.meta.env.DEV) (window as unknown as { __efImmPose?: unknown }).__efImmPose = { yaw: group.rotation.y, target: target.yaw, pose: poseRef.current, mode: modeRef.current };
      if (import.meta.env.DEV) (window as unknown as { __efImmDebug?: unknown }).__efImmDebug = { bounds: engine.bounds, fit: engine.fitDistance, cz: camera.position.z, fov: camera.fov, w: engine.width, h: engine.height, gy: group.position.y, zoom: engine.semantic };
      const front = Math.abs(group.rotation.y) < 0.08 && poseRef.current !== "rotated";
      const farOverview = engine.semantic === "far" && modeRef.current === "course" && layerRef.current === "skill";
      if (engine.overviewPoints) engine.overviewPoints.visible = farOverview;
      const positions = new Map<string, { x: number; y: number; visible: boolean; scale: number }>();
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
        // Semantic zoom changes the card composition (dot → capsule → action
        // card); the DOM itself stays at screen scale so action rows never
        // overlap in the dense ELK layout.
        const scale = Math.max(0.38, Math.min(1, engine.fitDistance / Math.max(1, camera.position.z)));
        positions.set(id, { ...point, scale });
        const bridgeHidden = modeRef.current === "capability" && front && element.dataset.bridge === "true";
        const kind = element.dataset.kind;
        const hidden = bridgeHidden || (farOverview && kind === "knowledge");
        const layerFactor = modeRef.current !== "course" ? 1 : layerRef.current === "skill" && kind === "assignment" ? 0.12 : layerRef.current === "practice" && kind === "knowledge" ? 0.14 : 1;
        const opacity = entry.fade * (hidden ? 0 : layerFactor);
        if (element.dataset.lastHidden !== String(hidden)) {
          element.dataset.lastHidden = String(hidden);
          element.style.visibility = hidden ? "hidden" : "visible";
          element.style.pointerEvents = hidden ? "none" : "";
        }
        if (element.dataset.lastOpacity !== opacity.toFixed(2)) {
          element.dataset.lastOpacity = opacity.toFixed(2);
          element.style.opacity = String(opacity);
        }
        const cardYaw = (-group.rotation.y * 0.5).toFixed(3);
        const transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)}) rotateY(${cardYaw}rad)`;
        if (element.dataset.lastTransform !== transform) {
          element.dataset.lastTransform = transform;
          element.style.transform = transform;
        }
        if (!point.visible) element.style.visibility = "hidden";
        else if (!hidden) element.style.visibility = "visible";
      });
      // Rotated capability view: the support plane sits behind the course
      // plane, so many labels project onto the same pixels. Keep only the
      // highest-priority readable labels; the rest stay as dots and reveal
      // their full name on hover (title + CSS hover).
      if (syncDom) {
        const cull = modeRef.current === "capability" && Math.abs(group.rotation.y) > 0.24;
        const hiddenLabels = new Set<string>();
        if (cull) {
          const boxes: Array<{ id: string; x: number; y: number; w: number; h: number; bridge: boolean; priority: number }> = [];
          runtime.forEach((entry, id) => {
            const element = entry.element;
            const point = positions.get(id);
            if (!element || !point || !point.visible || element.dataset.lastHidden === "true" || element.dataset.kind !== "capability") return;
            const bridge = element.dataset.bridge === "true";
            const current = element.classList.contains("is-current") || selectedIdRef.current === id;
            const priority = current ? 500 : element.dataset.status === "completed" ? 300 : element.dataset.status === "learning" ? 200 : bridge ? 0 : 100;
            boxes.push({
              id, x: point.x, y: point.y, bridge, priority,
              // Use a stable nominal card box, not the collapsed width: reading
              // offsetWidth while a label is hidden would immediately unhide it
              // on the next frame (hide/unhide flicker). rotateY also widens the
              // projected box, so keep a small safety margin.
              w: 132,
              h: 32
            });
          });
          boxes.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
          const accepted: typeof boxes = [];
          boxes.forEach((box) => {
            if (box.bridge) { hiddenLabels.add(box.id); return; }
            const overlaps = accepted.some((other) => {
              const width = Math.min(box.x + box.w / 2, other.x + other.w / 2) - Math.max(box.x - box.w / 2, other.x - other.w / 2);
              const height = Math.min(box.y + box.h / 2, other.y + other.h / 2) - Math.max(box.y - box.h / 2, other.y - other.h / 2);
              return width > 4 && height > 2;
            });
            if (overlaps) hiddenLabels.add(box.id);
            else accepted.push(box);
          });
        }
        runtime.forEach((entry, id) => {
          const element = entry.element;
          if (!element || element.dataset.kind !== "capability") return;
          const next = hiddenLabels.has(id) ? "true" : "false";
          if (element.dataset.labelHidden !== next) element.dataset.labelHidden = next;
        });
      }
      // Chapter labels are DOM, but anchored to the same rotated world point.
      engine.chapterLabels.forEach(({ element, point }) => {
        const world = group.localToWorld(point.clone());
        const screen = projectToScreen(world);
        const transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0) scaleX(${Math.cos(group.rotation.y).toFixed(3)})`;
        if (element.dataset.lastTransform !== transform) {
          element.dataset.lastTransform = transform;
          element.style.transform = transform;
        }
        element.style.opacity = screen.visible ? "1" : "0";
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
      engine.packets.forEach((packet) => {
        if (reduced) {
          const point = packet.points[0];
          packet.mesh.position.set(point.x, -point.y, point.z + 12);
          return;
        }
        packet.progress = (packet.progress + packet.speed * delta) % 1;
        const raw = (packet.progress + packet.offset) % 1;
        const scaled = raw * (packet.points.length - 1);
        const index = Math.min(packet.points.length - 2, Math.max(0, Math.floor(scaled)));
        const local = scaled - index;
        const from = packet.points[index];
        const to = packet.points[Math.min(packet.points.length - 1, index + 1)];
        packet.mesh.position.set(
          from.x + (to.x - from.x) * local,
          -(from.y + (to.y - from.y) * local),
          from.z + (to.z - from.z) * local + 12
        );
      });
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
    let lastPointer = { x: 0, y: 0 };
    function pointerDown(event: PointerEvent) {
      if ((event.target as HTMLElement).closest("[data-stage-node], .ef-imm-chapter-label, .ef-imm-selected-card")) return;
      dragging = true;
      moved = false;
      lastPointer = { x: event.clientX, y: event.clientY };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    }
    function pointerMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      const nextYaw = Math.max(-1.05, Math.min(1.05, targetPoseRef.current.yaw + dx * 0.006));
      const nextPitch = Math.max(-0.34, Math.min(0.34, targetPoseRef.current.pitch + dy * 0.004));
      targetPoseRef.current = { yaw: nextYaw, pitch: nextPitch };
      poseRef.current = Math.abs(nextYaw) > 0.12 ? "rotated" : "front";
      onPoseChangeRef.current?.(poseRef.current);
    }
    function pointerUp() {
      if (!dragging) return;
      dragging = false;
      if (!moved) onBackgroundRef.current?.();
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const next = Math.max(engine.fitDistance * 0.35, Math.min(engine.fitDistance * 2.6, camera.position.z + event.deltaY * 1.7));
      camera.position.z = next;
      emitZoom(true);
    }
    function doubleClick(event: MouseEvent) {
      if ((event.target as HTMLElement).closest("[data-stage-node], .ef-imm-chapter-label, .ef-imm-selected-card")) return;
      targetPoseRef.current = { yaw: 0, pitch: 0 };
      poseRef.current = "front";
      onPoseChangeRef.current?.("front");
    }
    host.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    host.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("dblclick", doubleClick);
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
      host.removeEventListener("wheel", wheel);
      host.removeEventListener("dblclick", doubleClick);
      disposeGroup(edgeGroup);
      disposeGroup(chapterGroup);
      disposeGroup(beamGroup);
      engine.chapterLabels.forEach(({ element }) => element.remove());
      engine.chapterLabels = [];
      runtimeRef.current.forEach((entry) => entry.element?.remove());
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
        entry = { object, element: null, current: { ...target }, target, fade: reducedRef.current ? 1 : 0 };
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
    // Practice cards are a presentation shadow inside the same chapter
    // footprint; they never enlarge the fitted course frame.
    const boundsNodes = nodes.filter((node) => node.kind !== "assignment");
    const measured = boundsNodes.length ? boundsNodes : nodes;
    const maxX = Math.max(360, ...measured.flatMap((node) => [Math.abs(node.x - node.width / 2), Math.abs(node.x + node.width / 2)]));
    const maxY = Math.max(260, ...measured.flatMap((node) => [Math.abs(node.y - node.height / 2), Math.abs(node.y + node.height / 2)]));
    engine.bounds = fitBounds ? { x: Math.max(maxX, fitBounds.x), y: Math.max(maxY, fitBounds.y) } : { x: maxX, y: maxY };
  }, [fitBounds, nodes]);

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
    engine.fit(!reducedRef.current);
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
      roundedRect(shape, chapter.width, chapter.height, 18);
      const plate = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: engine.semantic === "far" ? 0.16 : 0.1, depthWrite: false, side: THREE.DoubleSide })
      );
      plate.position.set(chapter.x, -chapter.y, -18);
      engine.chapterGroup.add(plate);
      const borderPoints: THREE.Vector3[] = [];
      const steps = 14;
      for (let index = 0; index <= steps; index += 1) {
        borderPoints.push(new THREE.Vector3(chapter.x - chapter.width / 2 + (chapter.width / steps) * index, -chapter.y - chapter.height / 2, -17));
      }
      for (let index = 0; index <= steps; index += 1) {
        borderPoints.push(new THREE.Vector3(chapter.x + chapter.width / 2, -chapter.y - chapter.height / 2 + (chapter.height / steps) * index, -17));
      }
      for (let index = 0; index <= steps; index += 1) {
        borderPoints.push(new THREE.Vector3(chapter.x + chapter.width / 2 - (chapter.width / steps) * index, -chapter.y + chapter.height / 2, -17));
      }
      for (let index = 0; index <= steps; index += 1) {
        borderPoints.push(new THREE.Vector3(chapter.x - chapter.width / 2, -chapter.y + chapter.height / 2 - (chapter.height / steps) * index, -17));
      }
      engine.chapterGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(borderPoints),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.52, depthWrite: false })
      ));
      const element = document.createElement("button");
      element.type = "button";
      element.className = "ef-imm-chapter-label";
      element.dataset.chapterId = chapter.id;
      element.innerHTML = `<b>${String(chapter.displayNumber).padStart(2, "0")}</b><span></span><em></em>`;
      element.querySelector("span")!.textContent = chapter.title;
      element.querySelector("em")!.textContent = chapter.meta ?? "";
      element.style.maxWidth = `${Math.min(250, Math.max(142, chapter.width * 0.62))}px`;
      element.setAttribute("aria-label", `第 ${chapter.displayNumber} 章 ${chapter.title}${chapter.meta ? `，${chapter.meta}` : ""}`);
      element.addEventListener("click", (event) => { event.stopPropagation(); onSelectRef.current?.(chapter.id, "chapter"); });
      hostRef.current?.appendChild(element);
      // Anchor inside the region's top-left, not above its top edge.
      const point = new THREE.Vector3(
        chapter.x - chapter.width / 2 + 14,
        -(chapter.y - chapter.height / 2 + 20),
        2
      );
      engine.chapterLabels.push({ element, point });
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
          : node.status === "learning" ? engine.colors.brand
            : node.status === "available" ? engine.colors.target
              : "#94A3B8"
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
    const addTube = (points: StagePoint[], radius: number, color: string, opacity: number) => {
      if (points.length < 2) return;
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(from.x, -from.y, from.z),
          new THREE.Vector3(to.x, -to.y, to.z)
        ));
      }
      const geometry = new THREE.TubeGeometry(path, Math.max(2, points.length * 4), radius, 5, false);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 1;
      engine.edgeGroup.add(mesh);
    };
    edges.forEach((edge) => {
      if (edge.highlighted) addTube(edge.points, 3.0, engine.colors.brand, 1);
      else addTube(edge.points, edge.kind === "chapter" ? 1.8 : 1.9, edge.kind === "chapter" ? engine.colors.line : engine.colors.branch, edge.kind === "chapter" ? 0.72 : 0.82);
    });
  }, [edges]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    disposeGroup(engine.beamGroup);
    engine.packets = [];
    const addDashTube = (points: THREE.Vector3[], color: string, radius: number) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const samples = curve.getSpacedPoints(56);
      for (let index = 0; index < samples.length - 1; index += 1) {
        if (Math.floor(index / 4) % 2 === 0) continue;
        const path = new THREE.CurvePath<THREE.Vector3>();
        path.add(new THREE.LineCurve3(samples[index], samples[index + 1]));
        const geometry = new THREE.TubeGeometry(path, 1, radius, 5, false);
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 6;
        engine.beamGroup.add(mesh);
      }
    };
    beams.forEach((beam) => {
      const points = beam.points.map((point) => new THREE.Vector3(point.x, -point.y, point.z + 14));
      if (points.length < 2) return;
      const color = beam.kind === "current" ? engine.colors.brandInk : engine.colors.target;
      if (beam.kind === "current") {
        const curve = new THREE.CatmullRomCurve3(points);
        const flat = modeRef.current === "flat";
        const geometry = new THREE.TubeGeometry(curve, Math.max(24, points.length * 10), flat ? 3.4 : 4.4, 8, false);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: flat ? 0.66 : 0.78, depthWrite: false }));
        mesh.renderOrder = 3;
        engine.beamGroup.add(mesh);
        const packetGeometry = new THREE.SphereGeometry(5.4, 12, 10);
        const count = Math.min(8, Math.max(3, Math.floor(curve.getLength() / 90)));
        for (let index = 0; index < count; index += 1) {
          const packet = new THREE.Mesh(packetGeometry.clone(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98, depthWrite: false }));
          packet.renderOrder = 5;
          engine.beamGroup.add(packet);
          engine.packets.push({ mesh: packet, points: beam.points, progress: 0, speed: 0.00022, offset: index / count });
        }
      } else {
        // Preview: a distinct dashed light band, never the current-route solid.
        addDashTube(points, color, 3.4);
      }
    });
  }, [beams]);
  useEffect(() => {
    poseRef.current = pose;
    targetPoseRef.current = pose === "rotated" ? { yaw: 0.68, pitch: -0.18 } : { yaw: 0, pitch: 0 };
  }, [pose]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => { const engine = engineRef.current; if (engine) engine.setCameraDistance(Math.max(engine.fitDistance * 0.35, engine.camera.position.z * 0.78), 260); },
    zoomOut: () => { const engine = engineRef.current; if (engine) engine.setCameraDistance(Math.min(engine.fitDistance * 2.6, engine.camera.position.z * 1.28), 260); },
    fit: () => engineRef.current?.fit(!reducedRef.current),
    resetPose: () => { poseRef.current = "front"; targetPoseRef.current = { yaw: 0, pitch: 0 }; onPoseChangeRef.current?.("front"); },
    setPose: (value) => { poseRef.current = value; targetPoseRef.current = value === "rotated" ? { yaw: 0.68, pitch: -0.18 } : { yaw: 0, pitch: 0 }; onPoseChangeRef.current?.(value); },
    rotateBy: (radians) => { targetPoseRef.current = { ...targetPoseRef.current, yaw: Math.max(-1.05, Math.min(1.05, targetPoseRef.current.yaw + radians)) }; },
    zoomPercent: () => engineRef.current?.lastZoomPercent ?? 100,
    setZoomPercent: (percent) => { const engine = engineRef.current; if (!engine) return; engine.setCameraDistance(engine.fitDistance / Math.max(0.2, percent / 100), 320); }
  }), []);

  return (
    <div
      ref={hostRef}
      className={`ef-imm-stage ${className}`.trim()}
      data-mode={mode}
      data-layer={layer}
      data-pose={pose}
      aria-label={`${ariaLabel ?? "课程场景"}。拖拽旋转，滚轮缩放，双击空白回正，方向键与 1/2/3 切换视角。`}
      aria-keyshortcuts="1 2 3 R F 0 + -"
      title="拖拽旋转 · 滚轮缩放 · 双击空白回正"
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
            className={`ef-imm-node ef-imm-node--${node.kind} ${node.current ? "is-current" : ""} ${node.kind === "assignment" ? "is-practice" : "is-skill"} ${node.tone ? `tone-${node.tone}` : ""} ${node.id.startsWith("flatten-column:") ? "is-flat-column" : ""}`}
            style={node.kind === "assignment"
              ? { width: `${Math.min(node.width, 100)}px`, height: "22px" }
              : node.kind === "route-chapter"
                ? { width: `${node.width}px`, height: `${node.height}px` }
                : undefined}
            role="button"
            tabIndex={0}
            aria-label={node.title}
            title={node.title}
            onClick={(event) => { event.stopPropagation(); onSelect?.(node.kind === "route-chapter" ? node.chapterId ?? node.id : node.id, node.kind); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(node.kind === "route-chapter" ? node.chapterId ?? node.id : node.id, node.kind); } }}
          >
            {node.kind === "assignment" ? <><b className="ef-imm-node-index">{node.meta}</b><span className="ef-imm-node-copy"><strong>{node.title}</strong></span></> : null}
            {node.kind === "route" ? <><i className="ef-imm-route-dot">{node.index ? String(node.index).padStart(2, "0") : null}</i><span className="ef-imm-node-copy"><strong>{node.title}</strong><small>{node.meta}</small><span className="ef-imm-node-detail">{node.detail}</span></span>{node.current ? <em className="ef-imm-here">你在这里</em> : null}</> : null}
            {node.kind === "route-chapter" ? <><i className="ef-imm-route-dot" /><span className="ef-imm-node-copy"><strong>{node.title}</strong><small>{node.detail}</small></span></> : null}
            {node.kind === "knowledge" || node.kind === "capability" ? <><i className="ef-imm-node-dot" /><span className="ef-imm-node-copy"><strong>{node.title}</strong><small className="ef-imm-node-meta">{node.meta}</small><span className="ef-imm-node-detail">{node.detail}</span></span></> : null}
          </div>
        ))}
        {selectedCard ? <div ref={selectedRef} className="ef-imm-selected-card">{selectedCard}</div> : null}
      </div>
      <div className="ef-imm-help" aria-hidden="true">拖拽旋转 · 滚轮缩放</div>
    </div>
  );
}
