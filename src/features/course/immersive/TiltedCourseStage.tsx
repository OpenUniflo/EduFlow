import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import {
  chooseExcentricNodes,
  chooseTiltedLabels,
  clampToPanBounds,
  layoutExcentric,
  panBoundsFor,
  panOffsetToBounds,
  pickScreenSpace,
  simplificationForAngle,
  tiltAngleDegrees,
  type ExcentricNode,
  type TiltedLabelCandidate,
  type TiltedLabelChoice,
  type TiltedPoint
} from "@/shared/scene/tiltedPlane";
import type {
  CourseImmersiveStageHandle,
  SemanticZoom,
  StageBeam,
  StageChapter,
  StageEdge,
  StageNode,
  StageViewState
} from "./CourseImmersiveStage";

type Props = {
  nodes: StageNode[];
  chapters?: StageChapter[];
  edges: StageEdge[];
  beams?: StageBeam[];
  layer: "skill" | "practice";
  pose: "front" | "rotated";
  selectedId?: string | null;
  hoverId?: string | null;
  reducedMotion?: boolean;
  detailOpen?: boolean;
  fitKey?: string;
  instantFit?: boolean;
  externalHoverId?: string | null;
  /** HUD width on the right that labels must avoid (e.g. the capability rail). */
  rightInset?: number;
  /** The capability layer only exists while 看能力层 is active. */
  capabilitiesOn?: boolean;
  onSelect?(id: string, kind: StageNode["kind"], context: { angle: number }): void;
  onBackground?(): void;
  onPoseChange?(pose: "front" | "rotated"): void;
  onSemanticZoom?(zoom: SemanticZoom, percent: number): void;
  onFps?(fps: number, nodeCount: number, domCount: number): void;
  onHoverNode?(id: string | null, point: { x: number; y: number } | null): void;
  onReady?(): void;
  className?: string;
  ref?: Ref<CourseImmersiveStageHandle>;
  "aria-label"?: string;
};

type CardRuntime = {
  node: StageNode;
  element: HTMLDivElement;
  object: CSS3DObject;
  signature: string;
  width: number;
  height: number;
  opacity: number;
  screen: { x: number; y: number; z: number };
  distance: number;
  angle: ReturnType<typeof simplificationForAngle>;
};

type ChapterRuntime = {
  chapter: StageChapter;
  panel: HTMLDivElement;
  panelObject: CSS3DObject;
  title: HTMLDivElement;
  titleObject: CSS3DObject;
  quad: Array<{ x: number; y: number }>;
};

type EngineApi = {
  animateCamera(position: THREE.Vector3, target: THREE.Vector3, duration?: number): void;
  fit(animated?: boolean): void;
  frontView(): void;
  capsView(): void;
  markLabelsDirty(): void;
  rebuildCards(): void;
  rebuildChapters(): void;
  rebuildEdges(): void;
  rebuildBeams(): void;
};

const FOV = 40;
const FOV_T = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const NODE_MAX_PX = 48;
const RING_GAP_PX = 9;
const RING_MAX_PX = 60;
const RING_WIDTH_PX = 2.2;
const PICK_RADIUS = 24;
const PICK_PRIORITY_GAP = 4;
const SIDE_MAX = 8;
const SIDE_SHOW_PX = 14;
const SIDE_HIDE_PX = 10;
const SIDE_H = 22;
const LABEL_FREEZE_MS = 250;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function cssColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character] as string));
}

function nodeColor(node: StageNode) {
  if (node.kind === "assignment") return "var(--practice)";
  if (node.kind === "capability") return "var(--capability, var(--brand))";
  if (node.status === "completed") return "var(--acquired)";
  if (node.status === "learning") return "var(--brand)";
  if (node.status === "available") return "var(--target)";
  return "var(--pending)";
}

function cardSignature(node: StageNode) {
  return [
    node.id, node.title, node.kind, node.status ?? "", node.meta ?? "", node.count ?? "",
    node.current ? "1" : "", node.target ? "1" : "", node.ghost ? "1" : "", node.empty ? "1" : "",
    node.selected ? "1" : "", node.highlight ? "1" : "", node.dim ? "1" : "", node.step ?? "",
    node.actions?.join("|") ?? "", node.height
  ].join("\u0001");
}

function cardClass(node: StageNode) {
  return [
    "ef-imm-node",
    "ef-imm-tilt-card",
    `ef-imm-node--${node.kind}`,
    node.current ? "is-current" : "",
    node.kind === "assignment" ? "is-practice" : "is-skill",
    node.ghost ? "is-ghost" : "",
    node.empty ? "is-empty" : "",
    node.dim ? "is-dim" : "",
    node.highlight ? "is-hl" : "",
    node.selected ? "is-sel" : ""
  ].filter(Boolean).join(" ");
}

function cardHtml(node: StageNode) {
  const step = node.step ? `<i class="ef-imm-step">${node.step}</i>` : "";
  const badge = node.kind === "knowledge" && (node.current || node.target)
    ? `<em class="ef-imm-badge ${node.current ? "is-current" : "is-target"}">${node.current ? "当前" : "目标"}</em>`
    : "";
  if (node.kind === "assignment") {
    return `${node.empty ? "" : `<i class="ef-imm-node-index">${escapeHtml(node.meta ?? "")}</i>`}
      <span class="ef-imm-node-copy">
        <span class="ef-imm-node-title-row"><strong>${escapeHtml(node.title)}</strong>${node.count && node.count > 1 ? `<em class="ef-imm-node-count">+${node.count - 1}</em>` : ""}</span>
        <small class="ef-imm-node-meta">${escapeHtml(node.meta ?? "")}</small>
      </span>`;
  }
  if (node.kind === "capability") {
    return `${step}<i class="ef-imm-node-dot" style="--dotc:${nodeColor(node)}"></i>
      <span class="ef-imm-node-copy"><strong>${escapeHtml(node.title)}</strong><small class="ef-imm-node-meta">${escapeHtml(node.meta ?? "")}</small></span>
      ${badge}`;
  }
  if (node.kind === "chapter-empty") {
    return `<i class="ef-imm-node-dot"></i><span class="ef-imm-node-copy"><strong>${escapeHtml(node.title)}</strong><small class="ef-imm-node-meta">${escapeHtml(node.meta ?? "")}</small></span>`;
  }
  const actions = node.actions?.length
    ? `<span class="ef-imm-node-detail"><span class="ef-imm-actions">${node.actions.map((action) => `<span>${escapeHtml(action)}</span>`).join("")}</span></span>`
    : "";
  return `${step}<i class="ef-imm-node-dot" style="--dotc:${nodeColor(node)}"></i>
    <span class="ef-imm-node-copy"><strong>${escapeHtml(node.title)}</strong><small class="ef-imm-node-meta">${escapeHtml(node.meta ?? "")}</small>${actions}</span>
    ${badge}`;
}


function chapterTitleHtml(chapter: StageChapter) {
  return `<b>${String(chapter.displayNumber).padStart(2, "0")}</b><span>${escapeHtml(chapter.title)}</span><em>${escapeHtml(chapter.meta ?? "")}</em>`;
}

function makeIconTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.92)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function TiltedCourseStage({
  nodes, chapters = [], edges, beams = [], layer, pose, selectedId = null, hoverId = null,
  reducedMotion = false, detailOpen = false, fitKey = "", instantFit = false, externalHoverId = null, rightInset = 0,
  capabilitiesOn = false,
  onSelect, onBackground, onPoseChange, onSemanticZoom, onFps, onHoverNode, onReady,
  className = "", ref, "aria-label": ariaLabel
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const exRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<EngineApi | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const externalHoverRef = useRef(externalHoverId);
  externalHoverRef.current = externalHoverId;
  const hoverIdRef = useRef(hoverId);
  hoverIdRef.current = hoverId;
  const runtimeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    cssRenderer: CSS3DRenderer;
    scene: THREE.Scene;
    cssScene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    points: THREE.Points;
    rings: THREE.Points;
    pointPositions: Float32Array;
    pointAlpha: Float32Array;
    pointSize: Float32Array;
    pointColor: Float32Array;
    ringPositions: Float32Array;
    ringAlpha: Float32Array;
    ringSize: Float32Array;
    ringColor: Float32Array;
    ringColor2: Float32Array;
    ringSplit: Float32Array;
    edgeGroup: THREE.Group;
    beamGroup: THREE.Group;
    chapterGroup: THREE.Group;
    packets: Array<{ mesh: THREE.Mesh; points: TiltedPoint[]; progress: number; speed: number; offset: number }>;
    cards: Map<string, CardRuntime>;
    chapters: Map<string, ChapterRuntime>;
    xrayHost: HTMLDivElement;
    xraySvg: SVGSVGElement;
    xrayName: HTMLDivElement;
    hoverRing: HTMLDivElement;
    labels: Map<string, HTMLDivElement>;
    exRows: Map<string, HTMLButtonElement>;
    labelChoices: TiltedLabelChoice[];
    labelPrevious: Set<string>;
    labelsFrozen: boolean;
    labelsDirty: boolean;
    labelTimer: number;
    lastLabelAt: number;
    exTimer: number;
    exVisible: boolean;
    exAnchor: { x: number; y: number } | null;
    exHovering: boolean;
    hover: string | null;
    internalHover: string | null;
    chapterHover: string | null;
    pointer: { x: number; y: number } | null;
    pointerInside: boolean;
    panBounds: ReturnType<typeof panBoundsFor>;
    fitDistance: number;
    pxPerWorld: number;
    fitted: boolean;
    userInteracted: boolean;
    width: number;
    height: number;
    lastZoomPercent: number;
    semantic: SemanticZoom;
    lastFrame: number;
    frame: number;
    disposed: boolean;
    down: { x: number; y: number; button: number; shift: boolean; onLabel: boolean } | null;
    dragging: boolean;
    moved: boolean;
    suppressClick: boolean;
    cameraTween: number;
    cameraTweenStop: (() => void) | null;
    externalHover: string | null;
    selected: string | null;
    detailOpen: boolean;
    reduced: boolean;
    currentNodes: StageNode[];
    currentChapters: StageChapter[];
    currentEdges: StageEdge[];
    currentBeams: StageBeam[];
    layer: "skill" | "practice";
    frameCount: number;
    fpsStarted: number;
    emitZoom(force?: boolean): void;
  }>(null);

  const propsRef = useRef({ nodes, chapters, edges, beams, layer, selectedId, hoverId, reducedMotion, detailOpen, externalHoverId, rightInset, capabilitiesOn, onSelect, onBackground, onPoseChange, onSemanticZoom, onFps, onHoverNode, onReady });
  propsRef.current = { nodes, chapters, edges, beams, layer, selectedId, hoverId, reducedMotion, detailOpen, externalHoverId, rightInset, capabilitiesOn, onSelect, onBackground, onPoseChange, onSemanticZoom, onFps, onHoverNode, onReady };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const labelsLayer = labelsRef.current;
    const exLayer = exRef.current;
    if (!host || !canvas || !labelsLayer || !exLayer) return;
    const hostEl: HTMLDivElement = host;
    const labelsEl: HTMLDivElement = labelsLayer;
    const exEl: HTMLDivElement = exLayer;
    const colors = {
      brand: cssColor("--brand", "#6D5DF6"),
      brandInk: cssColor("--brand-ink", "#4338CA"),
      acquired: cssColor("--acquired", "#3B82F6"),
      target: cssColor("--target", "#22C55E"),
      pending: cssColor("--pending", "#94A3B8"),
      practice: cssColor("--practice", "#F59E0B"),
      line: cssColor("--line-strong", "#CBD5E1"),
      ink: cssColor("--ink", "#0F172A")
    };
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cssScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
    camera.position.set(0, 0, 1200);
    const controls = new OrbitControls(camera, host);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.9;
    controls.screenSpacePanning = true;
    controls.minDistance = 160;
    controls.maxDistance = 6000;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI - 0.08;
    controls.enablePan = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    const cssRenderer = new CSS3DRenderer();
    cssRenderer.domElement.className = "ef-imm-css3d";
    cssRenderer.domElement.style.pointerEvents = "none";
    cssRenderer.domElement.style.zIndex = "2";
    host.appendChild(cssRenderer.domElement);
    const edgeGroup = new THREE.Group();
    const beamGroup = new THREE.Group();
    const chapterGroup = new THREE.Group();
    scene.add(edgeGroup, beamGroup, chapterGroup);

    const pointPositions = new Float32Array(512 * 3);
    const pointAlpha = new Float32Array(512);
    const pointSize = new Float32Array(512);
    const pointColor = new Float32Array(512 * 3);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));
    pointGeometry.setAttribute("alpha", new THREE.BufferAttribute(pointAlpha, 1));
    pointGeometry.setAttribute("size", new THREE.BufferAttribute(pointSize, 1));
    pointGeometry.setAttribute("color", new THREE.BufferAttribute(pointColor, 3));
    const pointMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 1 }, uSize: { value: 1 }, uAlpha: { value: 1 }, uMaxPx: { value: NODE_MAX_PX * renderer.getPixelRatio() } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uScale; uniform float uSize; uniform float uMaxPx;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = max(2.0, min(size*uSize*uScale/-mv.z, uMaxPx)); gl_Position = projectionMatrix*mv; vC=color; vA=alpha; }`,
      fragmentShader: `varying vec3 vC; varying float vA; uniform float uAlpha;
        void main(){ float d = length(gl_PointCoord-.5)*2.; if(d>1.) discard; float a = smoothstep(1.,.72,d);
          vec3 c = vC*(1.08-.28*d) + vec3(.18)*(1.-smoothstep(0.,.55,d)); gl_FragColor = vec4(c, a*vA*uAlpha); }`
    });
    const points = new THREE.Points(pointGeometry, pointMaterial);
    points.renderOrder = 3;
    points.frustumCulled = false;
    scene.add(points);

    const ringPositions = new Float32Array(512 * 3);
    const ringAlpha = new Float32Array(512);
    const ringSize = new Float32Array(512);
    const ringColor = new Float32Array(512 * 3);
    const ringColor2 = new Float32Array(512 * 3);
    const ringSplit = new Float32Array(512);
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
    ringGeometry.setAttribute("alpha", new THREE.BufferAttribute(ringAlpha, 1));
    ringGeometry.setAttribute("size", new THREE.BufferAttribute(ringSize, 1));
    ringGeometry.setAttribute("c1", new THREE.BufferAttribute(ringColor, 3));
    ringGeometry.setAttribute("c2", new THREE.BufferAttribute(ringColor2, 3));
    ringGeometry.setAttribute("split", new THREE.BufferAttribute(ringSplit, 1));
    const ringMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 1 }, uNodeMax: { value: NODE_MAX_PX * renderer.getPixelRatio() }, uGap: { value: RING_GAP_PX * renderer.getPixelRatio() }, uRingMax: { value: RING_MAX_PX * renderer.getPixelRatio() }, uWidth: { value: RING_WIDTH_PX * renderer.getPixelRatio() } },
      vertexShader: `attribute vec3 c1; attribute vec3 c2; attribute float split; attribute float alpha; attribute float size;
        varying vec3 v1; varying vec3 v2; varying float vS; varying float vA; varying float vPx;
        uniform float uScale; uniform float uNodeMax; uniform float uGap; uniform float uRingMax;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.);
          float nodePx = (size/2.1)*uScale/-mv.z; float px = min(nodePx, uNodeMax); px = min(px + uGap, uRingMax);
          gl_PointSize = max(px, 12.0); gl_Position = projectionMatrix*mv; v1=c1; v2=c2; vS=split; vA=alpha; vPx=px; }`,
      fragmentShader: `varying vec3 v1; varying vec3 v2; varying float vS; varying float vA; varying float vPx; uniform float uWidth;
        void main(){ vec2 uv = gl_PointCoord-.5; float d = length(uv)*vPx; float outer = vPx*.5-.5; float inner = max(0., outer-uWidth);
          float r = smoothstep(inner-1., inner, d) * (1.-smoothstep(outer-1., outer, d)); if(r<=.001) discard;
          vec3 c = (vS>.5 && uv.x>0.) ? v2 : v1; gl_FragColor = vec4(c, r*vA); }`
    });
    const rings = new THREE.Points(ringGeometry, ringMaterial);
    rings.renderOrder = 4;
    rings.frustumCulled = false;
    scene.add(rings);

    const xrayHost = document.createElement("div");
    xrayHost.className = "ef-imm-tilt-xray";
    xrayHost.innerHTML = '<svg aria-hidden="true"></svg><div class="ef-imm-tilt-xray-name"></div>';
    document.body.appendChild(xrayHost);
    const xraySvg = xrayHost.querySelector("svg")!;
    const xrayName = xrayHost.querySelector<HTMLDivElement>(".ef-imm-tilt-xray-name")!;

    const hoverRing = document.createElement("div");
    hoverRing.className = "ef-imm-tilt-hover-ring";
    host.appendChild(hoverRing);

    const engine = {
      renderer, cssRenderer, scene, cssScene, camera, controls, points, rings,
      pointPositions, pointAlpha, pointSize, pointColor,
      ringPositions, ringAlpha, ringSize, ringColor, ringColor2, ringSplit,
      edgeGroup, beamGroup, chapterGroup, packets: [],
      cards: new Map<string, CardRuntime>(), chapters: new Map<string, ChapterRuntime>(),
      xrayHost, xraySvg, xrayName, hoverRing,
      labels: new Map<string, HTMLDivElement>(), exRows: new Map<string, HTMLButtonElement>(),
      labelChoices: [] as TiltedLabelChoice[], labelPrevious: new Set<string>(),
      labelsFrozen: false, labelsDirty: true, labelTimer: 0, lastLabelAt: 0,
      exTimer: 0, exVisible: false, exAnchor: null as { x: number; y: number } | null, exHovering: false,
      hover: null as string | null, internalHover: null as string | null, chapterHover: null as string | null,
      pointer: null as { x: number; y: number } | null, pointerInside: false,
      panBounds: null as ReturnType<typeof panBoundsFor>,
      fitDistance: 1200, pxPerWorld: 1, width: hostEl.clientWidth, height: hostEl.clientHeight,
      lastZoomPercent: 100, semantic: "mid" as SemanticZoom, lastFrame: performance.now(), frame: 0, disposed: false,
      down: null as null | { x: number; y: number; button: number; shift: boolean; onLabel: boolean },
      dragging: false, moved: false, suppressClick: false,
      cameraTween: 0, cameraTweenStop: null as null | (() => void),
      externalHover: null as string | null, selected: null as string | null, detailOpen: false, reduced: false,
      currentNodes: [] as StageNode[], currentChapters: [] as StageChapter[], currentEdges: [] as StageEdge[], currentBeams: [] as StageBeam[],
      layer: "skill" as "skill" | "practice",
      frameCount: 0, fpsStarted: performance.now(),
      emitZoom(force = false) {
        const percent = Math.round((engine.fitDistance / Math.max(1, camera.position.distanceTo(controls.target))) * 100);
        const next: SemanticZoom = percent < 84 ? "far" : percent > 128 ? "near" : "mid";
        if (engine.semantic !== next || force) {
          engine.semantic = next;
          hostEl.setAttribute("data-zoom", next);
        }
        if (engine.lastZoomPercent !== percent || force) {
          engine.lastZoomPercent = percent;
          hostEl.setAttribute("data-zoom-percent", String(percent));
          propsRef.current.onSemanticZoom?.(next, percent);
        }
      }
    } as unknown as NonNullable<typeof runtimeRef.current>;
    runtimeRef.current = engine;

    const colorFor = (node: StageNode) => node.kind === "assignment"
      ? colors.practice
      : node.kind === "capability"
        ? colors.brand
        : node.status === "completed"
          ? colors.acquired
          : node.status === "learning"
            ? colors.brand
            : node.status === "available"
              ? colors.target
              : colors.pending;
    const measureCanvas = document.createElement("canvas").getContext("2d")!;
    const measureText = (text: string, size = 13) => {
      measureCanvas.font = `600 ${size}px -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif`;
      return measureCanvas.measureText(text).width;
    };
    const sideTextWidth = (text: string) => {
      let width = 0;
      for (const character of text) width += character.charCodeAt(0) > 255 ? 12 : 7;
      return width + 18;
    };

    const project = (point: TiltedPoint) => {
      const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
      return { x: (projected.x + 1) / 2 * engine.width, y: (1 - projected.y) / 2 * engine.height, z: projected.z };
    };
    const localPoint = (node: StageNode): TiltedPoint => ({ x: node.x, y: -node.y, z: node.z });

    function stopCameraTween() {
      engine.cameraTweenStop?.();
      engine.cameraTweenStop = null;
    }
    function animateCamera(nextPosition: THREE.Vector3, nextTarget: THREE.Vector3, duration = 600) {
      stopCameraTween();
      if (engine.reduced || duration <= 0) {
        camera.position.copy(nextPosition);
        controls.target.copy(nextTarget);
        controls.update();
        engine.emitZoom(true);
        markLabelsDirty();
        return;
      }
      const fromPosition = camera.position.clone();
      const fromTarget = controls.target.clone();
      const started = performance.now();
      let frame = 0;
      const step = () => {
        if (engine.disposed) return;
        const progress = Math.min(1, (performance.now() - started) / duration);
        const eased = easeOut(progress);
        camera.position.lerpVectors(fromPosition, nextPosition, eased);
        controls.target.lerpVectors(fromTarget, nextTarget, eased);
        controls.update();
        markLabelsDirty();
        if (progress < 1) frame = requestAnimationFrame(step);
        else { engine.cameraTweenStop = null; engine.emitZoom(true); }
      };
      engine.cameraTweenStop = () => cancelAnimationFrame(frame);
      frame = requestAnimationFrame(step);
    }

    function fit(animated = true) {
      // Once the user has taken the camera, a late initial fit must not yank it
      // back to the front. The toolbar fit resets this guard explicitly.
      if (engine.fitted && engine.userInteracted) return;
      const currentNodes = engine.currentNodes;
      const currentChapters = engine.currentChapters;
      if (!currentNodes.length) return;
      const xs: number[] = [];
      const ys: number[] = [];
      currentNodes.forEach((node) => {
        if (node.kind === "capability" || node.kind === "chapter-empty") return;
        xs.push(node.x - node.width / 2, node.x + node.width / 2);
        ys.push(-node.y - node.height / 2, -node.y + node.height / 2);
      });
      currentChapters.forEach((chapter) => {
        xs.push(chapter.x - chapter.width / 2, chapter.x + chapter.width / 2);
        ys.push(-chapter.y - chapter.height / 2, -chapter.y + chapter.height / 2);
      });
      if (!xs.length) { xs.push(-500, 500); ys.push(-320, 320); }
      const minX = Math.min(...xs); const maxX = Math.max(...xs);
      const minY = Math.min(...ys); const maxY = Math.max(...ys);
      const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
      const contentWidth = Math.max(1, maxX - minX);
      const contentHeight = Math.max(1, maxY - minY);
      const usableWidth = Math.max(280, engine.width - 80);
      // Two-row header at <=1180: the chapter titles must start below the tabs.
      const safeTop = engine.width <= 1180 ? 152 : 112;
      const safeBottom = 82;
      const usableHeight = Math.max(240, engine.height - safeTop - safeBottom);
      // Knowledge labels must stay readable. If the seven chapter columns do
      // not fit at the floor, the view starts at the left edge and the user
      // pans; zooming out to ~6px text was the P4R2 problem this guard fixes.
      const scale = Math.max(0.86, Math.min(1.12, Math.min(usableWidth / contentWidth, usableHeight / contentHeight)));
      engine.pxPerWorld = scale;
      const distance = engine.height / (2 * scale * FOV_T);
      engine.fitDistance = distance;
      const wasFitted = engine.fitted;
      engine.fitted = true;
      const visibleWidth = usableWidth / scale;
      const visibleHeight = usableHeight / scale;
      const nextTarget = center.clone();
      if (contentWidth > visibleWidth) nextTarget.x = minX + visibleWidth / 2;
      if (contentHeight > visibleHeight) nextTarget.y = maxY - (engine.height / 2 - safeTop) / scale;
      // Top align tall content under the header, otherwise centre it.
      const nextPosition = nextTarget.clone().add(new THREE.Vector3(0, 0, distance));
      engine.panBounds = panBoundsFor([
        ...currentNodes.map((node) => ({ x: node.x, y: -node.y, z: node.z })),
        ...currentChapters.flatMap((chapter) => ([
          { x: chapter.x - chapter.width / 2, y: -chapter.y - chapter.height / 2, z: -3 },
          { x: chapter.x + chapter.width / 2, y: -chapter.y + chapter.height / 2, z: -3 }
        ]))
      ], 300);
      (engine as unknown as { lastFit?: unknown }).lastFit = { nextTarget: nextTarget.toArray(), nextPosition: nextPosition.toArray(), animated, contentWidth, contentHeight, nodes: currentNodes.length, chapters: currentChapters.length, fitted: engine.fitted };
      animateCamera(nextPosition, nextTarget, animated && wasFitted ? 620 : 0);
      engine.emitZoom(true);
    }
    (engine as unknown as { fit(animated?: boolean): void }).fit = fit;

    function frontView() {
      const distance = Math.max(520, camera.position.distanceTo(controls.target));
      const target = controls.target.clone();
      const position = target.clone().add(new THREE.Vector3(0, 0, distance));
      animateCamera(position, target, 620);
    }
    function capsView() {
      // The capability layer is a preset orbit, not a whole-graph fit: keeping
      // the course plane at its readable scale makes the layer's screen labels
      // legible. The target sits halfway into the depth stack so the front
      // plane and the support cards are both in frame.
      const target = controls.target.clone();
      target.z = -150;
      const distance = Math.max(520, engine.fitDistance * 1.05);
      const yaw = THREE.MathUtils.degToRad(62);
      const pitch = THREE.MathUtils.degToRad(14);
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      animateCamera(target.clone().add(direction.multiplyScalar(distance)), target, 700);
    }
    function setOrbit(thetaDeg: number, pitchDeg = 0, duration = 620) {
      engine.userInteracted = true;
      const distance = Math.max(160, camera.position.distanceTo(controls.target));
      const yaw = THREE.MathUtils.degToRad(thetaDeg);
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const target = controls.target.clone();
      (engine as unknown as { lastOrbit?: unknown }).lastOrbit = { target: target.toArray(), cam: camera.position.toArray(), distance, bounds: engine.panBounds };
      animateCamera(target.clone().add(direction.multiplyScalar(distance)), target, duration);
    }

    function markLabelsDirty() {
      engine.labelsDirty = true;
    }
    function freezeLabels() {
      engine.labelsFrozen = true;
      window.clearTimeout(engine.labelTimer);
      hideExcentric();
    }
    function scheduleThaw(delay = LABEL_FREEZE_MS) {
      window.clearTimeout(engine.labelTimer);
      engine.labelTimer = window.setTimeout(() => {
        engine.labelsFrozen = false;
        engine.labelsDirty = true;
      }, delay);
    }

    function planeIds() {
      return engine.currentNodes.filter((node) => node.kind !== "route" && node.kind !== "route-chapter").map((node) => node.id);
    }
    function nodeById(id: string) {
      return engine.currentNodes.find((node) => node.id === id) ?? null;
    }
    function cardScreen(node: StageNode, dist: number) {
      const point = project(localPoint(node));
      const diameter = Math.min(13 * (node.kind === "capability" ? 0.9 : 1) * (engine.height / (2 * dist * FOV_T)), NODE_MAX_PX);
      return { id: node.id, x: point.x, y: point.y, z: point.z, dist, diameter, vis: node.dim ? 0.26 : node.ghost ? 0.5 : 1 };
    }
    /** Actual drawn opacity: the card, or the WebGL point once the card is a dot. */
    function renderedOpacity(index: number) {
      const node = engine.currentNodes[index];
      const card = engine.cards.get(node.id);
      return Math.max(card?.opacity ?? 0, engine.pointAlpha[index] ?? 0);
    }
    /** Same-position precedence on the turned plane. */
    function pickPriority(node: StageNode) {
      if (node.kind === "assignment") return 2;
      if (node.kind === "capability") return 1;
      return 0;
    }
    function rankOf(node: StageNode) {
      if (engine.hover === node.id || engine.externalHover === node.id) return 0;
      if (node.current) return 1;
      if (node.step) return 2;
      return 3;
    }
    function chooseLabels() {
      const candidates: TiltedLabelCandidate[] = [];
      const obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
      const capVisible = capabilityVisible();
      for (let index = 0; index < engine.currentNodes.length; index += 1) {
        const node = engine.currentNodes[index];
        if (node.kind === "route" || node.kind === "route-chapter") continue;
        // Reflection practice cards are the same step as their Knowledge; naming
        // both would duplicate text on the turned plane.
        if (node.kind === "assignment") continue;
        if (node.id === engine.selected) continue;
        const dist = camera.position.distanceTo(new THREE.Vector3(node.x, -node.y, node.z));
        const screen = cardScreen(node, dist);
        if (screen.z > 1) continue;
        const width = Math.max(14, Math.min(52, screen.diameter + 8));
        obstacles.push({ id: node.id, x: screen.x - width / 2, y: screen.y - width / 2, width, height: width });
        // Names and picking share this one "drawn and interactive" test: a
        // capability outside 看能力层, or a reflection after 42°, has no name.
        const alpha = renderedOpacity(index);
        const visible = !node.dim && alpha >= 0.1;
        if (!visible) continue;
        // A capability layer is revealed as a handful of markers behind the
        // course; naming them is the point of 看能力层 even when their screen
        // diameter is just under the normal distance threshold.
        const capabilityOpen = node.kind === "capability" && capVisible > 0.5;
        candidates.push({
          id: node.id, x: screen.x, y: screen.y, distance: dist, diameter: screen.diameter,
          visibility: alpha, priority: capabilityOpen ? 0 : rankOf(node),
          text: node.title
        });
      }
      const rightLimit = propsRef.current.detailOpen ? engine.width - 388 : engine.width - (propsRef.current.rightInset ?? 0);
      engine.labelChoices = chooseTiltedLabels(candidates, {
        width: Math.max(200, rightLimit), height: engine.height, maxLabels: engine.selected ? SIDE_MAX - 1 : SIDE_MAX,
        showDiameter: SIDE_SHOW_PX, hideDiameter: SIDE_HIDE_PX, lineHeight: SIDE_H, margin: 8,
        measure: sideTextWidth, previous: engine.labelPrevious, obstacles,
        exclusions: [
          { x: 0, y: 0, width: rightLimit, height: 76 },
          { x: 0, y: engine.height - 128, width: rightLimit, height: 128 }
        ]
      });
      engine.labelPrevious = new Set(engine.labelChoices.map((choice) => choice.id));
      engine.lastLabelAt = performance.now();
      engine.labelsDirty = false;
    }
    function capabilityVisible() {
      // The layer is a mode, not a side effect of the camera angle: at a
      // default 70° view its markers must not be named or pickable while the
      // 看能力层 rail is closed. Opening the rail makes the same markers both
      // visible and interactive.
      if (!propsRef.current.capabilitiesOn) return 0;
      const direction = camera.position.clone().sub(controls.target).normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, direction.z)));
      return smooth(0.06, 0.6, angle);
    }
    function updateLabels() {
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      const on = angle > 54;
      if (!on) {
        engine.labelChoices = [];
        engine.labelPrevious.clear();
        engine.labels.forEach((element) => { element.style.opacity = "0"; });
        return;
      }
      // While dragging / zooming the set is frozen, but the labels still track
      // their nodes; only joining or leaving the set waits for the 250ms thaw.
      if (!engine.labelsFrozen && engine.labelsDirty && performance.now() - engine.lastLabelAt > 30) chooseLabels();
      const used = new Set<string>();
      for (const choice of engine.labelChoices) {
        const node = nodeById(choice.id);
        if (!node) continue;
        const screen = cardScreen(node, camera.position.distanceTo(new THREE.Vector3(node.x, -node.y, node.z)));
        if (screen.z > 1) continue;
        const width = Math.max(24, sideTextWidth(node.title));
        const anchorX = choice.anchor === "left" ? screen.x - width - 12 : choice.anchor === "right" ? screen.x + 12 : screen.x - width / 2;
        const anchorY = choice.anchor === "below" ? screen.y + 12 : choice.anchor === "above" ? screen.y - SIDE_H - 12 : screen.y - SIDE_H / 2;
        const rect = { x: anchorX, y: anchorY, width, height: SIDE_H };
        let element = engine.labels.get(choice.id);
        if (!element) {
          element = document.createElement("div");
          element.className = "ef-imm-tilt-label";
          labelsEl.appendChild(element);
          engine.labels.set(choice.id, element);
        }
        if (element.textContent !== node.title) element.textContent = node.title;
        const fade = smooth(55, 60, angle);
        element.style.transform = `translate(${rect.x.toFixed(1)}px, ${rect.y.toFixed(1)}px)`;
        element.style.opacity = (choice.alpha * fade * (node.dim ? 0.25 : 1)).toFixed(3);
        used.add(choice.id);
      }
      engine.labels.forEach((element, id) => {
        if (!used.has(id)) element.style.opacity = "0";
      });
    }

    function updateChapterLabelElement() {
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      const chapterLabel = angle > 35 ? engine.chapters.get(engine.chapterHover ?? "") : null;
      const element = engine.labels.get("__chapter__");
      if (!chapterLabel) {
        if (element) element.style.opacity = "0";
        return;
      }
      let target = element;
      if (!target) {
        target = document.createElement("div");
        target.className = "ef-imm-tilt-label is-chapter";
        labelsEl.appendChild(target);
        engine.labels.set("__chapter__", target);
      }
      const top = project({ x: chapterLabel.chapter.x, y: -(chapterLabel.chapter.y - chapterLabel.chapter.height / 2), z: 4 });
      const text = `第 ${chapterLabel.chapter.displayNumber} 章 · ${chapterLabel.chapter.title}`;
      if (target.textContent !== text) target.textContent = text;
      const labelX = Math.max(8, Math.min(engine.width - 150, top.x - 70));
      const labelY = Math.max(8, Math.min(engine.height - 32, top.y - 32));
      target.style.transform = `translate(${labelX.toFixed(1)}px, ${labelY.toFixed(1)}px)`;
      target.style.opacity = "1";
    }

    function nodeScreenFor(id: string) {
      const node = nodeById(id);
      if (!node) return null;
      const world = new THREE.Vector3(node.x, -node.y, node.z);
      const screen = project(world);
      return { node, world, screen, distance: camera.position.distanceTo(world) };
    }
    function updateHoverRing() {
      const id = engine.hover ?? engine.externalHover;
      const info = id ? nodeScreenFor(id) : null;
      if (!info || info.screen.z > 1) {
        engine.hoverRing.style.opacity = "0";
        return;
      }
      const node = info.node;
      const diameter = Math.max(34, Math.min(58, 13 * (engine.height / (2 * info.distance * FOV_T)) * 0.8 + 14));
      engine.hoverRing.style.width = `${diameter.toFixed(1)}px`;
      engine.hoverRing.style.height = `${diameter.toFixed(1)}px`;
      engine.hoverRing.style.borderColor = nodeColor(node);
      engine.hoverRing.style.transform = `translate(${(info.screen.x - diameter / 2).toFixed(1)}px, ${(info.screen.y - diameter / 2).toFixed(1)}px)`;
      engine.hoverRing.style.opacity = "1";
    }

    function xrayFor(): { node: StageNode; screen: { x: number; y: number; z: number }; distance: number; segments: Array<{ x1: number; y1: number; x2: number; y2: number }> } | null {
      if (!engine.selected) return null;
      const info = nodeScreenFor(engine.selected);
      if (!info) return null;
      const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      const currentEdges = engine.currentEdges;
      const add = (target: TiltedPoint) => {
        const point = project(target);
        if (point.z > 1) return;
        segments.push({ x1: info.screen.x, y1: info.screen.y, x2: point.x, y2: point.y });
      };
      for (const edge of currentEdges) {
        if (edge.source !== engine.selected && edge.target !== engine.selected) continue;
        const edgePoints = edge.points;
        if (edgePoints.length > 1) {
          // Draw the endpoint join, not every bend, so the top layer stays clean.
          add(edgePoints[edgePoints.length - 1]);
        }
      }
      // Capability support edges reach through the source/target pair.
      for (const edge of currentEdges) {
        if (edge.kind !== "capability") continue;
        if (edge.source !== engine.selected && edge.target !== engine.selected) continue;
        if (edge.points.length > 1) add(edge.points[edge.points.length - 1]);
      }
      return { node: info.node, screen: info.screen, distance: info.distance, segments };
    }

    function rectForCard(node: StageNode, card: CardRuntime) {
      const width = card.width * (engine.height / (2 * Math.max(1, card.distance) * FOV_T));
      const height = card.height * (engine.height / (2 * Math.max(1, card.distance) * FOV_T));
      return { x: card.screen.x - width / 2, y: card.screen.y - height / 2, width, height };
    }
    function xrayBlocked(rect: { x: number; y: number; width: number; height: number }, distance: number, xray: ReturnType<typeof xrayFor>) {
      if (!xray || distance >= xray.distance - 3) return false;
      const expanded = { x: rect.x - 4, y: rect.y - 4, width: rect.width + 8, height: rect.height + 8 };
      const inside = xray.screen.x >= expanded.x && xray.screen.x <= expanded.x + expanded.width
        && xray.screen.y >= expanded.y && xray.screen.y <= expanded.y + expanded.height;
      if (inside) return true;
      return xray.segments.some((segment) => segmentIntersectsRect(segment, expanded));
    }
    function segmentIntersectsRect(segment: { x1: number; y1: number; x2: number; y2: number }, rect: { x: number; y: number; width: number; height: number }) {
      const contains = (x: number, y: number) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
      if (contains(segment.x1, segment.y1) || contains(segment.x2, segment.y2)) return true;
      const hit = (ax: number, ay: number, bx: number, by: number) => {
        const denominator = (bx - ax) * (segment.y2 - segment.y1) - (by - ay) * (segment.x2 - segment.x1);
        if (Math.abs(denominator) < 1e-6) return false;
        const t = ((segment.x1 - ax) * (segment.y2 - segment.y1) - (segment.y1 - ay) * (segment.x2 - segment.x1)) / denominator;
        const u = ((segment.x1 - ax) * (by - ay) - (segment.y1 - ay) * (bx - ax)) / denominator;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
      };
      return hit(rect.x, rect.y, rect.x + rect.width, rect.y)
        || hit(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height)
        || hit(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height)
        || hit(rect.x, rect.y + rect.height, rect.x, rect.y);
    }
    function drawXray() {
      const xray = xrayFor();
      const hostRect = hostEl.getBoundingClientRect();
      if (!xray) {
        engine.xrayHost.style.opacity = "0";
        return;
      }
      engine.xrayHost.style.opacity = "1";
      engine.xrayHost.style.left = `${hostRect.left}px`;
      engine.xrayHost.style.top = `${hostRect.top}px`;
      engine.xrayHost.style.width = `${hostRect.width}px`;
      engine.xrayHost.style.height = `${hostRect.height}px`;
      engine.xraySvg.setAttribute("viewBox", `0 0 ${engine.width} ${engine.height}`);
      engine.xraySvg.setAttribute("width", String(engine.width));
      engine.xraySvg.setAttribute("height", String(engine.height));
      const radius = Math.max(16, Math.min(34, 13 * (engine.height / (2 * xray.distance * FOV_T)) * 0.55 + 10));
      const lines = xray.segments.map((segment) => `<line x1="${segment.x1.toFixed(1)}" y1="${segment.y1.toFixed(1)}" x2="${segment.x2.toFixed(1)}" y2="${segment.y2.toFixed(1)}"/>`).join("");
      engine.xraySvg.innerHTML = `<g class="ef-imm-tilt-xray-glow">${lines}</g><g class="ef-imm-tilt-xray-core">${lines}</g>
        <circle class="ef-imm-tilt-xray-halo" cx="${xray.screen.x.toFixed(1)}" cy="${xray.screen.y.toFixed(1)}" r="${(radius + 7).toFixed(1)}"/>
        <circle class="ef-imm-tilt-xray-ring" cx="${xray.screen.x.toFixed(1)}" cy="${xray.screen.y.toFixed(1)}" r="${radius.toFixed(1)}"/>`;
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      engine.xrayName.textContent = xray.node.title;
      const width = Math.min(260, Math.max(54, measureText(xray.node.title) + 26));
      let x = Math.max(8, Math.min(engine.width - width - 8, xray.screen.x - width / 2));
      let y = xray.screen.y - radius - 34;
      if (y < 8) y = xray.screen.y + radius + 12;
      engine.xrayName.style.width = `${width}px`;
      engine.xrayName.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      engine.xrayName.style.opacity = angle > 35 ? "1" : "0";
    }

    function denseNodesAt(x: number, y: number): ExcentricNode[] {
      const result: ExcentricNode[] = [];
      for (let index = 0; index < engine.currentNodes.length; index += 1) {
        const node = engine.currentNodes[index];
        if (node.kind === "route" || node.kind === "route-chapter" || node.kind === "assignment") continue;
        const distance = camera.position.distanceTo(new THREE.Vector3(node.x, -node.y, node.z));
        const screen = cardScreen(node, distance);
        const alpha = renderedOpacity(index);
        if (screen.z > 1 || alpha < 0.12) continue;
        const close = Math.hypot(screen.x - x, screen.y - y);
        if (close <= 50) result.push({ id: node.id, x: screen.x, y: screen.y, distance, visibility: alpha, text: node.title });
      }
      return result;
    }
    function hideExcentric() {
      if (!engine.exVisible && !engine.exRows.size) return;
      engine.exVisible = false;
      engine.exRows.clear();
      engine.exAnchor = null;
      engine.exHovering = false;
      exEl.innerHTML = "";
      markLabelsDirty();
    }
    function drawExcentric(x: number, y: number) {
      const near = chooseExcentricNodes(denseNodesAt(x, y), { x, y }, { radius: 50, minNodes: 3, maxNodes: 6 });
      if (near.length < 3) { hideExcentric(); return; }
      const layout = layoutExcentric(near, { x, y }, { width: engine.width, height: engine.height }, {
        measure: sideTextWidth, rowHeight: 22, margin: 12, topInset: 76, bottomInset: 76
      });
      if (!layout) { hideExcentric(); return; }
      engine.exVisible = true;
      engine.exAnchor = { x, y };
      engine.exRows.clear();
      const svg = `<svg class="ef-imm-tilt-ex-lines" width="${engine.width}" height="${engine.height}" aria-hidden="true">${layout.lines.map((line) => `<line x1="${line.x1.toFixed(1)}" y1="${line.y1.toFixed(1)}" x2="${line.x2.toFixed(1)}" y2="${line.y2.toFixed(1)}"/>`).join("")}</svg>`;
      const rows = layout.rows.map((row) => `<button type="button" class="ef-imm-tilt-ex-item" data-id="${escapeHtml(row.id)}" style="left:${row.x.toFixed(1)}px;top:${row.y.toFixed(1)}px;width:${row.width.toFixed(1)}px;height:${row.height}px">${escapeHtml(row.text)}</button>`).join("");
      exEl.innerHTML = `${svg}<div class="ef-imm-tilt-ex-column" style="left:0;top:0;width:${layout.width}px">${rows}</div>`;
      exEl.querySelectorAll<HTMLButtonElement>(".ef-imm-tilt-ex-item").forEach((button) => {
        const id = button.dataset.id!;
        engine.exRows.set(id, button);
        button.addEventListener("pointerenter", () => {
          engine.exHovering = true;
          engine.internalHover = id;
          applyHover(id);
          markLabelsDirty();
        });
        button.addEventListener("pointerleave", () => {
          engine.exHovering = false;
          if (engine.internalHover === id) engine.internalHover = null;
          applyHover(engine.internalHover);
          markLabelsDirty();
        });
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const node = nodeById(id);
          if (node) activate(node);
        });
      });
      markLabelsDirty();
    }
    function scheduleExcentric(x: number, y: number) {
      window.clearTimeout(engine.exTimer);
      engine.exTimer = window.setTimeout(() => {
        if (engine.dragging) return;
        const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
        if (angle <= 35) return;
        drawExcentric(x, y);
      }, 300);
    }

    function applyHover(id: string | null) {
      const last = engine.hover;
      engine.hover = id;
      if (last !== id) {
        propsRef.current.onHoverNode?.(id, id ? engine.pointer : null);
        hostEl.style.cursor = id ? "pointer" : "";
        markLabelsDirty();
      }
    }
    function pickAt(x: number, y: number) {
      const candidates = [];
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      const capVisible = capabilityVisible();
      for (let index = 0; index < engine.currentNodes.length; index += 1) {
        const node = engine.currentNodes[index];
        if (node.kind === "route" || node.kind === "route-chapter") continue;
        if (node.kind === "capability" && capVisible < 0.02) continue;
        const distance = camera.position.distanceTo(new THREE.Vector3(node.x, -node.y, node.z));
        const screen = cardScreen(node, distance);
        if (screen.z > 1) continue;
        // Exactly the same opacity test as the name layer: no candidate for a
        // reflection after 42°, a closed capability layer, or a hidden card.
        if (renderedOpacity(index) < 0.1) continue;
        const card = engine.cards.get(node.id);
        // Only the front card stage uses card-body hit testing. Once turned,
        // the visible marker (pill or dot) is the target, not the old card box.
        const rect = card && angle <= 35 ? rectForCard(node, card) : undefined;
        candidates.push({
          id: node.id, x: screen.x, y: screen.y, distance,
          rect,
          radius: node.id === engine.selected ? 30 : 0,
          priority: pickPriority(node)
        });
      }
      return pickScreenSpace(candidates, { x, y }, { minRadius: PICK_RADIUS, priorityGap: PICK_PRIORITY_GAP });
    }
    function activate(node: StageNode) {
      if (node.kind === "chapter" || node.kind === "route-chapter") {
        propsRef.current.onBackground?.();
        return;
      }
      propsRef.current.onSelect?.(node.id, node.kind, { angle: angle() });
    }

    function updateCards() {
      const selected = engine.selected;
      const direction = camera.position.clone().sub(controls.target).normalize();
      const angle = tiltAngleDegrees(direction);
      const state = simplificationForAngle(angle);
      const xray = xrayFor();
      const capVis = capabilityVisible();
      const isFlat = engine.layer === "practice";
      engine.cards.forEach((card) => {
        const node = card.node;
        const world = new THREE.Vector3(node.x, -node.y, node.z);
        card.object.position.copy(world);
        const distance = camera.position.distanceTo(world);
        const pxPerWorld = engine.height / (2 * Math.max(1, distance) * FOV_T);
        const screen = project({ x: world.x, y: world.y, z: world.z });
        card.screen = screen;
        card.distance = distance;
        card.angle = state;
        const ghost = Boolean(node.ghost);
        let opacity = 1;
        if (ghost) opacity *= 1 - smooth(35, 42, angle);
        if (node.dim) opacity *= 0.24;
        if (node.kind === "capability") opacity *= capVis;
        opacity *= 1 - state.back;
        if (node.id === selected && angle > 35) opacity *= 1 - smooth(35, 38, angle);
        // The WebGL point takes over exactly when the card becomes a dot.
        opacity *= 1 - smooth(0.72, 0.995, state.dot);
        let width = node.width;
        let height = node.height;
        const name = node.title;
        // The plane compresses columns as it turns; the capsule must shrink with
        // it instead of painting over the neighbouring chapter column.
        const maxPill = THREE.MathUtils.lerp(166, 86, smooth(35, 55, angle));
        const pillWidth = Math.max(46, Math.min(maxPill, measureText(name, node.kind === "capability" ? 12 : 13) + 22));
        const dotPx = Math.min(13 * (node.kind === "capability" ? 0.9 : 1) * pxPerWorld, NODE_MAX_PX);
        const dotSize = dotPx / Math.max(0.0001, pxPerWorld);
        width = THREE.MathUtils.lerp(THREE.MathUtils.lerp(node.width, pillWidth, state.pill), dotSize, state.dot);
        height = THREE.MathUtils.lerp(THREE.MathUtils.lerp(node.height, 26, state.pill), dotSize, state.dot);
        const cardRect = {
          x: screen.x - width * pxPerWorld / 2,
          y: screen.y - height * pxPerWorld / 2,
          width: width * pxPerWorld,
          height: height * pxPerWorld
        };
        const blocked = xrayBlocked(cardRect, distance, xray);
        if (blocked) opacity *= 0.16;
        if (!node.selected && node.id === selected) opacity *= 1;
        card.width = width;
        card.height = height;
        card.opacity = opacity;
        const element = card.element;
        element.style.width = `${width.toFixed(2)}px`;
        element.style.height = `${height.toFixed(2)}px`;
        const padY = THREE.MathUtils.lerp(THREE.MathUtils.lerp(node.kind === "assignment" ? 7 : 9, 3, state.pill), 0, state.dot);
        const padRight = THREE.MathUtils.lerp(THREE.MathUtils.lerp(10, 9, state.pill), 0, state.dot);
        // Front cards with a route step reserve room for the badge inside the
        // left edge. Capsules / dots hide it and go back to the normal padding.
        const padLeft = node.kind === "knowledge" && node.step && angle <= 35 ? 36 : padRight;
        element.style.padding = `${padY.toFixed(2)}px ${padRight.toFixed(2)}px ${padY.toFixed(2)}px ${padLeft.toFixed(2)}px`;
        element.style.borderRadius = state.pill > 0.02 ? "999px" : "12px";
        element.style.opacity = Math.max(0, Math.min(1, opacity)).toFixed(3);
        element.style.setProperty("--name-op", state.cardName.toFixed(3));
        element.style.setProperty("--extra-op", state.extra.toFixed(3));
        element.style.setProperty("--dotc", `var(--dotc, ${nodeColor(node)})`);
        element.classList.toggle("is-pill", state.pill > 0.02);
        element.classList.toggle("is-dot", state.dot > 0.6);
        element.classList.toggle("is-ghost", ghost);
        element.classList.toggle("is-dim", Boolean(node.dim));
        element.classList.toggle("is-sel", node.id === selected);
        card.object.visible = opacity > 0.004 && screen.z < 1;
        element.style.pointerEvents = "none";
        // Billboard only the shrinking capsule / dot so the final marker is a
        // perfect screen-facing circle; the full card stays in the plane.
        const targetQuaternion = state.billboard > 0.001
          ? new THREE.Quaternion().copy(camera.quaternion)
          : new THREE.Quaternion();
        if (state.billboard <= 0.001) {
          card.object.quaternion.set(0, 0, 0, 1);
        } else if (state.billboard >= 0.999) {
          card.object.quaternion.copy(targetQuaternion);
        } else {
          card.object.quaternion.slerpQuaternions(new THREE.Quaternion(), targetQuaternion, state.billboard);
        }
      });
    }

    function updateChapters() {
      const direction = camera.position.clone().sub(controls.target).normalize();
      const angle = tiltAngleDegrees(direction);
      const state = simplificationForAngle(angle);
      const xray = xrayFor();
      engine.chapters.forEach((runtime) => {
        const { chapter } = runtime;
        const panelCenter = new THREE.Vector3(chapter.x, -chapter.y, -3);
        runtime.panelObject.position.copy(panelCenter);
        runtime.titleObject.position.set(chapter.x, -(chapter.y - chapter.height / 2), 2);
        const hovered = engine.chapterHover === chapter.id;
        const panelScreen = project({ x: panelCenter.x, y: panelCenter.y, z: panelCenter.z });
        // Project the four panel corners for pointer hit testing and x-ray dimming.
        const corners = [
          { x: chapter.x - chapter.width / 2, y: -chapter.y - chapter.height / 2 },
          { x: chapter.x + chapter.width / 2, y: -chapter.y - chapter.height / 2 },
          { x: chapter.x + chapter.width / 2, y: -chapter.y + chapter.height / 2 },
          { x: chapter.x - chapter.width / 2, y: -chapter.y + chapter.height / 2 }
        ].map((point) => { const projected = project({ x: point.x, y: point.y, z: -3 }); return { x: projected.x, y: projected.y }; });
        runtime.quad = corners;
        let opacity = 0.9 * (1 - state.back);
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        if (xrayBlocked(rect, camera.position.distanceTo(panelCenter), xray)) opacity *= 0.22;
        runtime.panel.style.opacity = opacity.toFixed(3);
        runtime.panel.classList.toggle("is-hover", hovered);
        runtime.panelObject.visible = opacity > 0.01;
        runtime.title.style.opacity = (state.chapterTitle * (1 - state.back)).toFixed(3);
        runtime.titleObject.visible = state.chapterTitle > 0.01;
        void panelScreen;
      });
    }
    function updateChapterHover() {
      if (!engine.pointerInside || engine.dragging) { engine.chapterHover = null; return; }
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      if (angle <= 35) { engine.chapterHover = null; return; }
      const pointer = engine.pointer;
      if (!pointer) { engine.chapterHover = null; return; }
      let found: string | null = null;
      engine.chapters.forEach((runtime) => {
        if (found) return;
        if (pointInQuad(pointer.x, pointer.y, runtime.quad)) found = runtime.chapter.id;
      });
      engine.chapterHover = found;
    }
    function pointInQuad(x: number, y: number, quad: Array<{ x: number; y: number }>) {
      let inside = false;
      for (let index = 0, previous = quad.length - 1; index < quad.length; previous = index++) {
        const xi = quad[index].x, yi = quad[index].y;
        const xj = quad[previous].x, yj = quad[previous].y;
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }

    function updatePoints() {
      const count = engine.currentNodes.length;
      const capVis = capabilityVisible();
      const capSet = selectedCapabilitySet();
      for (let index = 0; index < count; index += 1) {
        const node = engine.currentNodes[index];
        const color = new THREE.Color(colorFor(node));
        const selectedCap = capSet && !capSet.has(node.id);
        const angleNow = tiltAngleDegrees(camera.position.clone().sub(controls.target));
        const ghostSide = Boolean(node.ghost) && angleNow > 40;
        const backKnowledge = engine.layer === "practice" && node.kind === "knowledge" && angleNow > 40;
        const backPractice = engine.layer === "skill" && node.kind === "assignment" && angleNow > 40;
        const layerHidden = ghostSide || backKnowledge || backPractice;
        const capabilityAlpha = node.kind === "capability" ? (capVis <= 0.02 ? 0 : 0.14 + 0.86 * capVis) : 1;
        const alpha = layerHidden ? 0 : (node.dim ? 0.24 : 1) * capabilityAlpha * (node.ghost ? 0.55 : 1) * (selectedCap ? 0.2 : 1);
        const hovered = engine.hover === node.id || engine.externalHover === node.id;
        pointPositions[index * 3] = node.x;
        pointPositions[index * 3 + 1] = -node.y;
        pointPositions[index * 3 + 2] = node.z;
        pointAlpha[index] = Math.max(0, Math.min(1, alpha * (hovered ? 1.4 : 1)));
        pointSize[index] = 13 * (node.kind === "capability" ? 0.9 : 1) * (hovered ? 1.55 : 1);
        color.toArray(pointColor, index * 3);
        // Status / current ring: screen-facing, fixed width, capped at 60px.
        ringPositions[index * 3] = node.x;
        ringPositions[index * 3 + 1] = -node.y;
        ringPositions[index * 3 + 2] = node.z;
        ringSize[index] = 13 * (node.kind === "capability" ? 0.9 : 1) * 2.1;
        const ringStatus = node.status === "completed" ? colors.acquired : node.status === "learning" ? colors.brand : node.status === "available" ? colors.target : colors.pending;
        const ring = new THREE.Color(ringStatus);
        ring.toArray(ringColor, index * 3);
        ringColor2[index * 3] = ringColor[index * 3];
        ringColor2[index * 3 + 1] = ringColor[index * 3 + 1];
        ringColor2[index * 3 + 2] = ringColor[index * 3 + 2];
        ringSplit[index] = 0;
        ringAlpha[index] = 0;
        if (!layerHidden && (engine.layer === "skill" || node.kind === "assignment" || node.kind === "capability")) {
          // Status rings belong to the dot stage; during the 35–55° pill stage
          // they would read as a second marker below the capsule.
          const side = smooth(55, 64, angleNow);
          ringAlpha[index] = side * (node.dim ? 0.12 : 0.58) * (node.kind === "capability" ? capVis : 1);
        }
        if (node.current) {
          const side = smooth(30, 42, tiltAngleDegrees(camera.position.clone().sub(controls.target)));
          const pulse = engine.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 3.1);
          const brand = new THREE.Color(colors.brand);
          brand.toArray(ringColor, index * 3);
          brand.toArray(ringColor2, index * 3);
          ringAlpha[index] = Math.max(ringAlpha[index], side * (0.62 + 0.3 * pulse));
          ringSize[index] *= 1 + 0.045 * side * pulse;
        }
        if (node.id === engine.hover || node.id === engine.externalHover) {
          ringAlpha[index] = Math.max(ringAlpha[index], 0.95);
          hoveredStatusColor(node).toArray(ringColor, index * 3);
        }
      }
      const geometry = pointGeometry;
      geometry.setDrawRange(0, count);
      (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute("alpha") as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      const ringGeometry = rings.geometry;
      ringGeometry.setDrawRange(0, count);
      (ringGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (ringGeometry.getAttribute("alpha") as THREE.BufferAttribute).needsUpdate = true;
      (ringGeometry.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;
      (ringGeometry.getAttribute("c1") as THREE.BufferAttribute).needsUpdate = true;
      (ringGeometry.getAttribute("c2") as THREE.BufferAttribute).needsUpdate = true;
      (ringGeometry.getAttribute("split") as THREE.BufferAttribute).needsUpdate = true;
      void count;
    }
    function selectedCapabilitySet() {
      if (!engine.selected) return null;
      const selectedNode = nodeById(engine.selected);
      if (!selectedNode || selectedNode.kind !== "capability") return null;
      const set = new Set<string>([selectedNode.id]);
      for (const edge of engine.currentEdges) {
        if (edge.kind === "capability" && edge.source && edge.target && (edge.source === selectedNode.id || edge.target === selectedNode.id)) {
          set.add(edge.source);
          set.add(edge.target);
        }
      }
      return set;
    }
    function hoveredStatusColor(node: StageNode) {
      return new THREE.Color(colorFor(node));
    }

    function rebuildCards() {
      const desired = new Map(engine.currentNodes.filter((node) => node.kind !== "route" && node.kind !== "route-chapter").map((node) => [node.id, node]));
      engine.cards.forEach((card, id) => {
        if (desired.has(id)) return;
        cssScene.remove(card.object);
        card.element.remove();
        engine.cards.delete(id);
      });
      desired.forEach((node) => {
        let card = engine.cards.get(node.id);
        if (!card) {
          const element = document.createElement("div");
          element.style.position = "absolute";
          element.style.top = "0";
          element.style.left = "0";
          element.style.pointerEvents = "none";
          element.dataset.stageNode = "true";
          element.dataset.stageId = node.id;
          element.dataset.kind = node.kind;
          element.className = cardClass(node);
          element.setAttribute("role", "button");
          element.tabIndex = 0;
          const object = new CSS3DObject(element);
          object.element.style.pointerEvents = "none";
          cssScene.add(object);
          card = {
            node, element, object, signature: "", width: node.width, height: node.height, opacity: 1,
            screen: { x: 0, y: 0, z: 0 }, distance: 1000, angle: simplificationForAngle(0)
          };
          element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const current = engine.cards.get(node.id);
              if (current) activate(current.node);
            }
          });
          engine.cards.set(node.id, card);
        }
        card.node = node;
        const signature = cardSignature(node);
        if (card.signature !== signature) {
          card.signature = signature;
          card.element.innerHTML = cardHtml(node);
        }
        card.element.dataset.status = node.status ?? "";
        card.element.dataset.selected = node.selected ? "true" : "false";
        card.element.className = cardClass(node);
        // Re-apply the continuous state classes after the class list refresh.
        card.element.classList.toggle("is-pill", card.angle.pill > 0.02);
        card.element.classList.toggle("is-dot", card.angle.dot > 0.6);
      });
    }
    function rebuildChapters() {
      const desired = new Map(engine.currentChapters.map((chapter) => [chapter.id, chapter]));
      engine.chapters.forEach((runtime, id) => {
        if (desired.has(id)) return;
        cssScene.remove(runtime.panelObject, runtime.titleObject);
        runtime.panel.remove();
        runtime.title.remove();
        engine.chapters.delete(id);
      });
      desired.forEach((chapter) => {
        let runtime = engine.chapters.get(chapter.id);
        if (!runtime) {
          const panel = document.createElement("div");
          panel.className = "ef-imm-tilt-chapter";
          panel.style.position = "absolute";
          panel.style.top = "0";
          panel.style.left = "0";
          panel.style.pointerEvents = "none";
          const panelObject = new CSS3DObject(panel);
          panelObject.element.style.pointerEvents = "none";
          const title = document.createElement("div");
          title.className = "ef-imm-chapter-label ef-imm-tilt-chapter-title";
          title.style.position = "absolute";
          title.style.top = "0";
          title.style.left = "0";
          title.style.pointerEvents = "none";
          const titleObject = new CSS3DObject(title);
          titleObject.element.style.pointerEvents = "none";
          cssScene.add(panelObject, titleObject);
          runtime = { chapter, panel, panelObject, title, titleObject, quad: [] };
          engine.chapters.set(chapter.id, runtime);
        }
        runtime.chapter = chapter;
        runtime.panel.style.width = `${chapter.width}px`;
        runtime.panel.style.height = `${chapter.height}px`;
        runtime.panel.dataset.chapterId = chapter.id;
        runtime.title.innerHTML = chapterTitleHtml(chapter);
        runtime.title.style.maxWidth = `${Math.min(196, Math.max(92, chapter.width * 0.94))}px`;
      });
    }

    function rebuildEdges() {
      engine.edgeGroup.children.slice().forEach((child) => {
        engine.edgeGroup.remove(child);
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
          else child.material.dispose();
        }
      });
      const add = (points: TiltedPoint[], color: string, opacity: number, dashed: boolean, kind: StageEdge["kind"]) => {
        if (points.length < 2) return;
        const positions = points.map((point) => new THREE.Vector3(point.x, -point.y, point.z));
        const geometry = new THREE.BufferGeometry().setFromPoints(positions);
        const material = dashed
          ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, depthWrite: false, dashSize: 5, gapSize: 6 })
          : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const line = new THREE.Line(geometry, material);
        if (dashed) line.computeLineDistances();
        line.userData.kind = kind;
        line.userData.baseOpacity = opacity;
        line.userData.source = points[0];
        line.userData.target = points[points.length - 1];
        line.renderOrder = 0;
        engine.edgeGroup.add(line);
      };
      const hasSelection = Boolean(engine.selected);
      for (const edge of engine.currentEdges) {
        if (edge.kind === "capability") add(edge.points, colors.brand, edge.highlighted ? 0.9 : hasSelection ? 0.06 : 0.15, true, edge.kind);
        else if (edge.kind === "practice") add(edge.points, colors.practice, edge.highlighted ? 0.74 : 0.25, true, edge.kind);
        else if (edge.kind === "chapter") add(edge.points, colors.line, 0.2, false, edge.kind);
        else add(edge.points, colors.brand, edge.highlighted ? 0.92 : hasSelection ? 0.07 : 0.27, false, edge.kind);
      }
    }

    function rebuildBeams() {
      engine.beamGroup.children.slice().forEach((child) => {
        engine.beamGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
          else child.material.dispose();
        } else if (child instanceof THREE.Line) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
      engine.packets = [];
      for (const beam of engine.currentBeams) {
        const points = beam.points.map((point) => new THREE.Vector3(point.x, -point.y, point.z));
        if (points.length < 2) continue;
        const color = beam.kind === "current" ? colors.brandInk : colors.target;
        if (beam.kind === "current" && beam.fallback) {
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineDashedMaterial({ color, transparent: true, opacity: beam.dimmed ? 0.16 : 0.42, depthWrite: false, dashSize: 9, gapSize: 10 });
          const line = new THREE.Line(geometry, material);
          line.computeLineDistances();
          engine.beamGroup.add(line);
          continue;
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const tube = new THREE.TubeGeometry(curve, Math.max(24, points.length * 10), 1.4, 6, false);
        const glow = new THREE.TubeGeometry(curve, Math.max(24, points.length * 10), 3.4, 8, false);
        const glowMesh = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: beam.dimmed ? 0.03 : 0.1, depthWrite: false }));
        glowMesh.renderOrder = 0;
        const mesh = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: beam.dimmed ? 0.16 : 0.55, depthWrite: false }));
        mesh.renderOrder = 2;
        engine.beamGroup.add(glowMesh, mesh);
        const packetGeometry = new THREE.SphereGeometry(2.2, 10, 8);
        const count = Math.min(6, Math.max(2, Math.floor(curve.getLength() / 140)));
        for (let index = 0; index < count; index += 1) {
          const packet = new THREE.Mesh(packetGeometry.clone(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: beam.dimmed ? 0.2 : 0.92, depthWrite: false }));
          packet.renderOrder = 3;
          engine.beamGroup.add(packet);
          engine.packets.push({ mesh: packet, points: beam.points, progress: 0, speed: 0.0002, offset: index / count });
        }
      }
    }

    function resize() {
      const width = Math.max(1, hostEl.clientWidth);
      const height = Math.max(1, hostEl.clientHeight);
      const changed = Math.abs(width - engine.width) > 1 || Math.abs(height - engine.height) > 1;
      engine.width = width;
      engine.height = height;
      renderer.setSize(width, height, false);
      cssRenderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const pixelRatio = renderer.getPixelRatio();
      pointMaterial.uniforms.uMaxPx.value = NODE_MAX_PX * pixelRatio;
      ringMaterial.uniforms.uNodeMax.value = NODE_MAX_PX * pixelRatio;
      ringMaterial.uniforms.uGap.value = RING_GAP_PX * pixelRatio;
      ringMaterial.uniforms.uRingMax.value = RING_MAX_PX * pixelRatio;
      ringMaterial.uniforms.uWidth.value = RING_WIDTH_PX * pixelRatio;
      if (changed) fit(false);
    }
    (engine as unknown as { resize(): void }).resize = resize;

    let lastFrame = performance.now();
    let lastDomSync = 0;
    const tick = (now: number) => {
      if (engine.disposed) return;
      const delta = Math.min(64, now - lastFrame);
      lastFrame = now;
      controls.update();
      // Pan bounds: keep the orbit centre inside the union of every layer.
      const offset = panOffsetToBounds({ x: controls.target.x, y: controls.target.y, z: controls.target.z }, engine.panBounds);
      if (offset) {
        controls.target.x += offset.x;
        controls.target.y += offset.y;
        controls.target.z += offset.z;
        camera.position.x += offset.x;
        camera.position.y += offset.y;
        camera.position.z += offset.z;
      }
      camera.updateMatrixWorld();
      const direction = camera.position.clone().sub(controls.target).normalize();
      const angle = tiltAngleDegrees(direction);
      const semantic = engine.lastZoomPercent < 84 ? "far" : engine.lastZoomPercent > 128 ? "near" : "mid";
      engine.semantic = semantic as SemanticZoom;
      const scale = engine.height / (2 * FOV_T) * renderer.getPixelRatio();
      pointMaterial.uniforms.uScale.value = scale;
      ringMaterial.uniforms.uScale.value = scale;
      pointMaterial.uniforms.uSize.value = semantic === "far" ? 0.7 : 1;
      pointMaterial.uniforms.uAlpha.value = semantic === "far" ? 0.75 : 1;
      engine.emitZoom();
      engine.selected = selectedIdRef.current;
      engine.externalHover = externalHoverRef.current;
      engine.layer = propsRef.current.layer;
      engine.reduced = propsRef.current.reducedMotion;
      engine.detailOpen = propsRef.current.detailOpen;
      updateHoverRing();
      updateCards();
      updateChapters();
      updateChapterHover();
      updatePoints();
      updateEdgeHighlights();
      updateLabels();
      updateChapterLabelElement();
      drawXray();
      updateBeams(delta);
      const domCount = hostEl.querySelectorAll("[data-stage-node]").length;
      engine.frameCount += 1;
      if (now - engine.fpsStarted > 800) {
        const fps = Math.round(engine.frameCount * 1000 / Math.max(1, now - engine.fpsStarted));
        propsRef.current.onFps?.(fps, engine.currentNodes.length, domCount);
        engine.frameCount = 0;
        engine.fpsStarted = now;
      }
      renderer.render(scene, camera);
      cssRenderer.render(cssScene, camera);
      engine.frame = requestAnimationFrame(tick);
      void delta; void lastDomSync;
    };
    function updateEdgeHighlights() {
      const hover = engine.hover ?? engine.externalHover;
      const selected = engine.selected;
      engine.edgeGroup.children.forEach((child) => {
        if (!(child instanceof THREE.Line)) return;
        const kind = child.userData.kind as StageEdge["kind"];
        const material = child.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial;
        const base = typeof child.userData.baseOpacity === "number" ? child.userData.baseOpacity : 0.2;
        if (kind === "capability") {
          // Support lines belong to the same mode as the capability markers.
          if (!propsRef.current.capabilitiesOn) { material.opacity = 0; return; }
          material.opacity = 0.15;
        } else if (kind === "knowledge") material.opacity = base;
        if (kind !== "capability" && kind !== "knowledge") return;
        const source = child.userData.source as TiltedPoint | undefined;
        const target = child.userData.target as TiltedPoint | undefined;
        const endpointHit = (point?: TiltedPoint) => {
          if (!point) return false;
          const node = nodeByIdForPoint(point);
          return Boolean(node && (node.id === hover || node.id === selected));
        };
        if (endpointHit(source) || endpointHit(target)) {
          material.opacity = kind === "capability" ? 0.9 : 0.92;
        }
      });
    }
    function nodeByIdForPoint(point: TiltedPoint) {
      return engine.currentNodes.find((node) => Math.abs(node.x - point.x) < 0.5 && Math.abs(-node.y - point.y) < 0.5 && Math.abs(node.z - point.z) < 8) ?? null;
    }

    function updateBeams(delta: number) {
      for (const packet of engine.packets) {
        if (propsRef.current.reducedMotion) {
          const point = packet.points[0];
          packet.mesh.position.set(point.x, -point.y, point.z + 12);
          continue;
        }
        packet.progress = (packet.progress + packet.speed * delta) % 1;
        const scaled = ((packet.progress + packet.offset) % 1) * (packet.points.length - 1);
        const index = Math.min(packet.points.length - 2, Math.max(0, Math.floor(scaled)));
        const local = scaled - index;
        const from = packet.points[index];
        const to = packet.points[Math.min(packet.points.length - 1, index + 1)];
        packet.mesh.position.set(
          from.x + (to.x - from.x) * local,
          -(from.y + (to.y - from.y) * local),
          from.z + (to.z - from.z) * local + 12
        );
      }
    }

    // Interaction: left drag rotates; right / Shift drag pans; wheel zooms;
    // every click is resolved by one screen-space picker.
    function pointerDown(event: PointerEvent) {
      if (event.button !== 0 && event.button !== 2) return;
      engine.userInteracted = true;
      const target = event.target as HTMLElement;
      if (target.closest(".ef-imm-tilt-ex-item")) return;
      stopCameraTween();
      engine.down = { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey, onLabel: Boolean(target.closest(".ef-imm-tilt-label")) };
      engine.dragging = true;
      engine.moved = false;
      engine.suppressClick = false;
      freezeLabels();
      if (event.shiftKey || event.button === 2) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      else controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
    function pointerMove(event: PointerEvent) {
      const rect = hostEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      engine.pointer = { x, y };
      engine.pointerInside = true;
      if (engine.exVisible && engine.exAnchor && !engine.exHovering && Math.hypot(x - engine.exAnchor.x, y - engine.exAnchor.y) > 7) hideExcentric();
      if (engine.down) {
        if (Math.hypot(event.clientX - engine.down.x, event.clientY - engine.down.y) > 5) {
          engine.moved = true;
          engine.suppressClick = true;
          hideExcentric();
        }
        return;
      }
      const hit = pickAt(x, y);
      engine.internalHover = hit;
      applyHover(hit);
      if (angle() > 35) scheduleExcentric(x, y);
    }
    function pointerUp(event: PointerEvent) {
      const down = engine.down;
      if (!down) return;
      engine.down = null;
      engine.dragging = false;
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const rect = hostEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (moved < 5 && event.button === 0 && !down.onLabel) {
        const hit = pickAt(x, y);
        if (hit) {
          const node = nodeById(hit);
          if (node) activate(node);
        } else {
          propsRef.current.onBackground?.();
        }
      }
      if (down.button === 0 && moved > 5) {
        window.setTimeout(() => {
          if (engine.dragging) return;
          const angleNow = angle();
          if (angleNow < 15) {
            const distance = camera.position.distanceTo(controls.target);
            const target = controls.target.clone();
            animateCamera(target.clone().add(new THREE.Vector3(0, 0, distance)), target, 450);
          }
        }, 180);
      }
      scheduleThaw(moved > 5 ? 260 : 0);
      propsRef.current.onPoseChange?.(angle() > 12 ? "rotated" : "front");
    }
    function wheel(event: WheelEvent) {
      if ((event.target as HTMLElement).closest(".ef-imm-detail, .ef-imm-object-shell")) return;
      engine.userInteracted = true;
      event.preventDefault();
      stopCameraTween();
      freezeLabels();
      scheduleThaw(300);
      hideExcentric();
      // OrbitControls owns the actual dolly; we only freeze the label set and
      // let the damping settle before recomputing it.
    }
    function doubleClick(event: MouseEvent) {
      engine.userInteracted = true;
      const rect = hostEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = pickAt(x, y);
      if (hit) {
        const node = nodeById(hit);
        if (node) {
          stopCameraTween();
          const world = new THREE.Vector3(node.x, -node.y, node.z);
          const delta = world.clone().sub(controls.target);
          controls.target.copy(world);
          camera.position.add(delta);
          controls.update();
          markLabelsDirty();
          return;
        }
      }
      frontView();
    }
    function angle() {
      return tiltAngleDegrees(camera.position.clone().sub(controls.target));
    }
    hostEl.addEventListener("pointerdown", pointerDown, true);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    hostEl.addEventListener("wheel", wheel, { passive: false });
    hostEl.addEventListener("dblclick", doubleClick);
    hostEl.addEventListener("contextmenu", (event) => event.preventDefault());
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(hostEl);
    resize();
    apiRef.current = { animateCamera, fit, frontView, capsView, markLabelsDirty, rebuildCards, rebuildChapters, rebuildEdges, rebuildBeams };
    if (import.meta.env.DEV) {
      (window as unknown as { __efTilt?: unknown }).__efTilt = {
        angle: () => tiltAngleDegrees(camera.position.clone().sub(controls.target)),
        setOrbit: (thetaDeg: number, pitchDeg = 0) => setOrbit(thetaDeg, pitchDeg),
        camera,
        controls,
        cards: engine.cards,
        chapters: engine.chapters,
        fitted: () => engine.fitted,
        lastFit: () => (engine as unknown as { lastFit?: unknown }).lastFit,
        lastOrbit: () => (engine as unknown as { lastOrbit?: unknown }).lastOrbit,
        bounds: () => engine.panBounds,
        nodeCount: () => engine.currentNodes.length,
        fitDistance: () => engine.fitDistance,
        labels: () => engine.labelChoices.map((choice) => ({ id: choice.id, anchor: choice.anchor, alpha: Number(choice.alpha.toFixed(2)), text: nodeById(choice.id)?.title })),
        labelDom: () => [...engine.labels.entries()].filter(([, element]) => Number(element.style.opacity) > 0.02).map(([id, element]) => ({ id, text: element.textContent, transform: element.style.transform, opacity: Number(element.style.opacity) })),
        frozen: () => engine.labelsFrozen,
        labelSet: () => engine.labelChoices.map((choice) => choice.id),
        ex: () => ({ visible: engine.exVisible, ids: [...engine.exRows.keys()] }),
        exItems: () => [...document.querySelectorAll<HTMLElement>('.ef-imm-tilt-ex-item')].map((element) => ({ text: element.textContent, left: element.style.left, top: element.style.top, rect: element.getBoundingClientRect().toJSON() })),
        chapterHover: () => engine.chapterHover,
        selected: () => engine.selected,
        selectedNode: () => {
          const node = engine.selected ? nodeById(engine.selected) : null;
          return node ? { id: node.id, kind: node.kind, title: node.title } : null;
        },
        layer: () => engine.layer,
        hover: () => engine.hover,
        xray: () => {
          const info = engine.selected ? nodeScreenFor(engine.selected) : null;
          return info ? { id: info.node.id, x: Math.round(info.screen.x), y: Math.round(info.screen.y) } : null;
        },
        pick: (x: number, y: number) => pickAt(x, y),
        nodeScreen: (id: string) => nodeScreenFor(id),
        nodeAlpha: (id: string) => {
          const index = engine.currentNodes.findIndex((node) => node.id === id);
          return index < 0 ? 0 : Number(renderedOpacity(index).toFixed(3));
        },
        capabilityVisible: () => Number(capabilityVisible().toFixed(3)),
        cardState: () => [...engine.cards.values()].map((card) => ({ id: card.node.id, kind: card.node.kind, op: Number(card.opacity.toFixed(2)), width: Number(card.width.toFixed(1)), height: Number(card.height.toFixed(1)), visible: card.object.visible }))
      };
    }
    engine.frame = requestAnimationFrame(tick);
    window.requestAnimationFrame(() => propsRef.current.onReady?.());
    setTimeout(() => propsRef.current.onReady?.(), 60);

    return () => {
      engine.disposed = true;
      cancelAnimationFrame(engine.frame);
      engine.cameraTweenStop?.();
      window.clearTimeout(engine.labelTimer);
      window.clearTimeout(engine.exTimer);
      resizeObserver.disconnect();
      hostEl.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      hostEl.removeEventListener("wheel", wheel);
      hostEl.removeEventListener("dblclick", doubleClick);
      xrayHost.remove();
      hoverRing.remove();
      engine.cards.forEach((card) => { cssScene.remove(card.object); card.element.remove(); });
      engine.cards.clear();
      engine.chapters.forEach((runtime) => { cssScene.remove(runtime.panelObject, runtime.titleObject); runtime.panel.remove(); runtime.title.remove(); });
      engine.chapters.clear();
      engine.labels.forEach((element) => element.remove());
      engine.labels.clear();
      exEl.innerHTML = "";
      engine.edgeGroup.children.slice().forEach((child) => {
        if (child instanceof THREE.Line) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
      });
      engine.beamGroup.children.slice().forEach((child) => {
        if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
        else if (child instanceof THREE.Line) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
      });
      cssRenderer.domElement.remove();
      renderer.dispose();
      apiRef.current = null;
      runtimeRef.current = null;
    };
  }, []);

  // Keep the imperative engine in sync with React data without rebuilding it.
  useEffect(() => {
    const engine = runtimeRef.current;
    if (!engine) return;
    const wasEmpty = engine.currentNodes.length === 0;
    engine.currentNodes = nodes;
    engine.currentChapters = chapters;
    engine.currentEdges = edges;
    engine.currentBeams = beams;
    const api = apiRef.current;
    if (!api) return;
    api.rebuildCards();
    api.rebuildChapters();
    api.rebuildEdges();
    api.rebuildBeams();
    api.markLabelsDirty();
    // The course layout can resolve after the stage mounted. Fit once when the
    // first real node set arrives so the camera never stays at its boot pose.
    if (wasEmpty && nodes.length) api.fit(false);
  }, [beams, chapters, edges, instantFit, nodes]);

  useEffect(() => {
    const engine = runtimeRef.current;
    if (!engine) return;
    engine.selected = selectedId;
    engine.externalHover = externalHoverId;
    engine.labelsDirty = true;
  }, [externalHoverId, hoverId, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const engine = runtimeRef.current;
    if (!engine) return;
    engine.detailOpen = detailOpen;
    engine.labelsDirty = true;
  }, [detailOpen, selectedId]);

  useEffect(() => {
    const engine = runtimeRef.current;
    if (!engine || !engine.currentNodes.length) return;
    apiRef.current?.fit(engine.fitted && !reducedMotion && !instantFit);
  }, [fitKey, instantFit, reducedMotion]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const direction = engine.camera.position.clone().sub(engine.controls.target);
      api.animateCamera(engine.controls.target.clone().add(direction.setLength(Math.max(180, direction.length() * 0.78))), engine.controls.target.clone(), 260);
    },
    zoomOut: () => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const direction = engine.camera.position.clone().sub(engine.controls.target);
      api.animateCamera(engine.controls.target.clone().add(direction.setLength(Math.min(5200, direction.length() * 1.28))), engine.controls.target.clone(), 260);
    },
    fit: () => {
      const engine = runtimeRef.current;
      if (!engine) return;
      engine.userInteracted = false;
      apiRef.current?.fit(!reducedMotion);
    },
    resetPose: () => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const distance = engine.fitDistance;
      const target = engine.controls.target.clone();
      api.animateCamera(target.clone().add(new THREE.Vector3(0, 0, distance)), target, 620);
    },
    setPose: (value) => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      if (value === "rotated") {
        const distance = engine.camera.position.distanceTo(engine.controls.target);
        const target = engine.controls.target.clone();
        const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(60)), 0, Math.cos(THREE.MathUtils.degToRad(60)));
        api.animateCamera(target.clone().add(direction.multiplyScalar(distance)), target, 620);
      } else {
        api.frontView();
      }
    },
    rotateBy: (radians) => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const offset = engine.camera.position.clone().sub(engine.controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
      api.animateCamera(engine.controls.target.clone().add(offset), engine.controls.target.clone(), 400);
    },
    zoomPercent: () => runtimeRef.current?.lastZoomPercent ?? 100,
    setZoomPercent: (percent) => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const direction = engine.camera.position.clone().sub(engine.controls.target);
      const distance = THREE.MathUtils.clamp(engine.fitDistance / Math.max(0.2, percent / 100), 180, 5200);
      api.animateCamera(engine.controls.target.clone().add(direction.setLength(distance)), engine.controls.target.clone(), 320);
    },
    getViewState: () => {
      const engine = runtimeRef.current;
      if (!engine) {
        return { distance: 1200, panX: 0, panY: 0, yaw: 0, pitch: 0, pose: "front" };
      }
      const offset = engine.camera.position.clone().sub(engine.controls.target);
      const distance = offset.length();
      const direction = offset.clone().normalize();
      return {
        distance,
        panX: engine.controls.target.x,
        panY: -engine.controls.target.y,
        yaw: Math.atan2(direction.x, direction.z),
        pitch: Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
        pose: tiltAngleDegrees(direction) > 12 ? "rotated" : "front"
      };
    },
    setViewState: (state: StageViewState) => {
      const api = apiRef.current;
      if (!api) return;
      const target = new THREE.Vector3(state.panX, -state.panY, 0);
      const cosPitch = Math.cos(state.pitch);
      const direction = new THREE.Vector3(
        Math.sin(state.yaw) * cosPitch,
        Math.sin(state.pitch),
        Math.cos(state.yaw) * cosPitch
      );
      api.animateCamera(target.clone().add(direction.multiplyScalar(state.distance)), target, 0);
    },
    focusCapabilities: () => apiRef.current?.capsView(),
    locate: (id: string) => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const node = engine.currentNodes.find((entry) => entry.id === id);
      if (!node) return;
      const now = engine.camera.position.distanceTo(engine.controls.target);
      const distance = THREE.MathUtils.clamp(now * 0.55, 260, 1500);
      const direction = engine.camera.position.clone().sub(engine.controls.target).normalize();
      const right = new THREE.Vector3().setFromMatrixColumn(engine.camera.matrixWorld, 0).normalize();
      const side = detailOpen ? 186 : 0;
      const target = new THREE.Vector3(node.x, -node.y, node.z).add(right.multiplyScalar(side / Math.max(0.0001, engine.height / (2 * distance * FOV_T))));
      api.animateCamera(target.clone().add(direction.multiplyScalar(distance)), target, 600);
    },
    front: () => apiRef.current?.frontView()
  }), [detailOpen, reducedMotion]);

  return (
    <div
      ref={hostRef}
      className={`ef-imm-stage ef-imm-tilt-stage ${className}`.trim()}
      data-pose={pose}
      data-layer={layer}
      data-mode="course"
      aria-label={`${ariaLabel ?? "课程场景"}。左键拖拽旋转，滚轮缩放，右键或 Shift 拖拽平移，双击卡片聚焦，双击空白回正面。`}
      title="左键拖拽旋转 · 滚轮/双指缩放 · 右键或 Shift 拖拽平移 · 双击卡片聚焦 · 双击空白回正"
    >
      <canvas ref={canvasRef} className="ef-imm-canvas" aria-hidden="true" />
      <div ref={labelsRef} className="ef-imm-tilt-labels" aria-hidden="true" />
      <div ref={exRef} className="ef-imm-tilt-ex" />
    </div>
  );
}

