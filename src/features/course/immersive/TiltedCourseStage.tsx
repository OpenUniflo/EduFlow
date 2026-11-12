import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  chooseTiltedLabels,
  clampToPanBounds,
  labelLeaderFor,
  labelRectForAnchor,
  layoutSelectionLabels,
  findExcentricCluster,
  layoutExcentricOutside,
  panBoundsFor,
  panOffsetToBounds,
  pickScreenSpace,
  simplificationForAngle,
  simplificationForView,
  tiltAngleDegrees,
  type ExcentricNode,
  type TiltedLabelCandidate,
  type TiltedLabelChoice,
  type TiltedPoint,
  type TiltedSelectionLabelCandidate,
  type TiltedSelectionLabelMarker
} from "@/shared/scene/tiltedPlane";
import { SCENE_CAMERA, contentRadius, doubleClickAction, frontPose, isCameraDrag, isPanGesture, sceneCameraLimits, shouldSnapToFront, wheelZoomFactor, zoomDistance, zoomPercent } from "@/shared/scene/cameraInteraction";
import { cardNameOpacity, cardShowsOwnName, hoverStyleFor, isPickable } from "@/shared/scene/presentationRules";
import {
  COURSE_CARD_HEIGHT,
  LAYER_SWAP_MS,
  layerMixAt,
  layerOffsetsAt,
  type LayerOffsets
} from "./courseTreeLayout";
import { selectionXraySegments } from "@/shared/scene/xray";
import { projectColorVar, projectToneFor } from "./projectColors";
import { advancePulse, routeMetrics } from "@/shared/scene/routePulse";
import { buildRouteAnchorSequence, cometGradientStops, pointAtRouteDistance, routeBandComets, staggeredWindowCenters } from "./routeBand";
import { chapterNumberLabel } from "@/shared/learning/chapterNumbering";
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
  onSelect?(id: string, kind: StageNode["kind"], context: { angle: number }): void;
  onBackground?(): void;
  onPoseChange?(pose: "front" | "rotated"): void;
  /** True once the capability plane is readable (~35°). */
  onCapabilityReveal?(visible: boolean): void;
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
  /** Depth-only copy of the card quad. CSS3D sits above the WebGL canvas, so
   *  without this plane a capability / far star behind the card would be
   *  drawn on top of it instead of being hidden by it. */
  occluder: THREE.Mesh;
  signature: string;
  width: number;
  height: number;
  opacity: number;
  screen: { x: number; y: number; z: number };
  distance: number;
  angle: ReturnType<typeof simplificationForAngle>;
  /** Crossfade to the single WebGL point; 0 = card only, 1 = point only. */
  pointMix: number;
  /** 1 when this card's layer is in front, 0.52 when reflected. */
  layerOpacity: number;
  ghost: boolean;
  /** True only when a different, nearer plane actually dims this sheet. */
  xrayBlocked?: boolean;
  /** The selected card's own title is hidden under a page overlay. */
  hideOwnName?: boolean;
};

type ChapterRuntime = {
  chapter: StageChapter;
  panel: HTMLDivElement;
  panelObject: CSS3DObject;
  title: HTMLDivElement;
  titleObject: CSS3DObject;
  quad: Array<{ x: number; y: number }>;
};

type CapabilityLineRuntime = {
  id: string;
  source: string;
  target: string;
  line: Line2;
  material: LineMaterial;
  highlighted: boolean;
};

type RouteBandRuntime = {
  id: string;
  kind: StageBeam["kind"];
  dimmed: boolean;
  nodeIds: string[];
  anchors: THREE.Vector3[];
  cumulative: number[];
  total: number;
  stepDistance: number;
  distance: number;
  windowWorld: number;
  color: string;
  cometColor: string;
  cometHead: string;
};

type EngineApi = {
  animateCamera(position: THREE.Vector3, target: THREE.Vector3, duration?: number): void;
  fit(animated?: boolean): void;
  frontView(): void;
  capPresetView(): void;
  markLabelsDirty(): void;
  rebuildCards(): void;
  rebuildChapters(): void;
  rebuildEdges(): void;
  rebuildBeams(): void;
  reveal(id: string): void;
};

const FOV = 40;
const FOV_T = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const NODE_MAX_PX = 48;
const RING_GAP_PX = 9;
const RING_MAX_PX = 60;
const RING_WIDTH_PX = 2.2;
const PICK_RADIUS = 24;

/** Knowledge and practice cards move with their layer; capabilities never do. */
function nodeOffsetFor(node: StageNode, offsets: LayerOffsets) {
  return node.kind === "knowledge" ? offsets.knowledge
    : node.kind === "assignment" ? offsets.practice
      : { x: 0, y: 0, z: 0 };
}

/** The one world position the cards, points, labels, picking and x-ray use. */
function nodeWorldFor(node: StageNode, offsets: LayerOffsets) {
  const offset = nodeOffsetFor(node, offsets);
  return new THREE.Vector3(node.x + offset.x, -node.y - offset.y, node.z + offset.z);
}
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

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character] as string));
}

function nodeColor(node: StageNode) {
  // Whole course page: green acquired, blue pending Course target, gray
  // pending intermediate capability. "learning" only adds a ring and never
  // changes the main colour. Archive colours are untouched.
  return projectColorVar(projectToneFor({
    kind: node.kind === "assignment" ? "assignment" : node.kind === "capability" ? "capability" : "knowledge",
    status: node.status
  }));
}

function cardSignature(node: StageNode) {
  return [
    node.id, node.title, node.kind, node.status ?? "", node.meta ?? "", node.statusLine ?? "", node.code ?? "", node.count ?? "",
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
    node.mirror ? "is-mirror" : "",
    node.highlight ? "is-hl" : "",
    node.selected ? "is-sel" : ""
  ].filter(Boolean).join(" ");
}

function ghostPeekHtml(node: StageNode) {
  if (node.kind === "knowledge") {
    return `<span class="ef-imm-ghost-peek"><strong>${escapeHtml(node.title)}</strong><small>${escapeHtml(node.statusLine ?? node.meta ?? "知识")}</small></span>`;
  }
  if (node.kind === "assignment") {
    const code = node.code ? `动手任务 ${escapeHtml(node.code)}` : "动手任务";
    return `<span class="ef-imm-ghost-peek"><strong><em>${code}</em>${escapeHtml(node.title)}</strong><small>${escapeHtml(node.statusLine ?? "")}</small></span>`;
  }
  return "";
}

function actionChips(node: StageNode) {
  if (!node.actions?.length) return "";
  return `<span class="ef-imm-node-actions">${node.actions.map((action) => `<span>${escapeHtml(action)}</span>`).join("")}</span>`;
}

function cardHtml(node: StageNode) {
  const step = node.step ? `<i class="ef-imm-step">${node.step}</i>` : "";
  const badge = node.kind === "knowledge" && (node.current || node.target)
    ? `<em class="ef-imm-badge ${node.current ? "is-current" : "is-target"}">${node.current ? "当前" : "目标"}</em>`
    : "";
  if (node.kind === "assignment") {
    const code = node.empty ? "" : `<i class="ef-imm-node-index">${escapeHtml(node.code ?? node.meta ?? "")}</i>`;
    return `${code}
      <span class="ef-imm-node-copy">
        <span class="ef-imm-node-title-row"><strong>${escapeHtml(node.title)}</strong>${node.count && node.count > 1 ? `<em class="ef-imm-node-count">+${node.count - 1}</em>` : ""}</span>
        <small class="ef-imm-node-meta">${escapeHtml(node.statusLine ?? node.meta ?? "")}</small>
        ${actionChips(node)}
      </span>
      ${ghostPeekHtml(node)}`;
  }
  if (node.kind === "capability") {
    return `${step}<i class="ef-imm-node-dot" style="--dotc:${nodeColor(node)}"></i>
      <span class="ef-imm-node-copy"><strong>${escapeHtml(node.title)}</strong><small class="ef-imm-node-meta">${escapeHtml(node.meta ?? "")}</small></span>
      ${badge}`;
  }
  if (node.kind === "chapter-empty") {
    return `<i class="ef-imm-node-dot"></i><span class="ef-imm-node-copy"><strong>${escapeHtml(node.title)}</strong><small class="ef-imm-node-meta">${escapeHtml(node.meta ?? "")}</small></span>`;
  }
  return `${step}
    <span class="ef-imm-node-copy">
      <span class="ef-imm-node-title-row"><i class="ef-imm-node-dot" style="--dotc:${nodeColor(node)}"></i><strong>${escapeHtml(node.title)}</strong></span>
      <small class="ef-imm-node-meta">${escapeHtml(node.statusLine ?? node.meta ?? "")}</small>
      ${actionChips(node)}
    </span>
    ${badge}
    ${ghostPeekHtml(node)}`;
}

function chapterTitleHtml(chapter: StageChapter) {
  return `<b>${escapeHtml(chapterNumberLabel(chapter.displayNumber))} ·</b><span>${escapeHtml(chapter.title)}</span><em>${escapeHtml(chapter.meta ?? "")}</em>`;
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
  onSelect, onBackground, onPoseChange, onCapabilityReveal, onSemanticZoom, onFps, onHoverNode, onReady,
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
  const beamMaterialsRef = useRef<LineMaterial[]>([]);
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
    capabilityGroup: THREE.Group;
    beamGroup: THREE.Group;
    chapterGroup: THREE.Group;
    occluderGroup: THREE.Group;
    flows: Array<{
      material: LineMaterial;
      metrics: ReturnType<typeof routeMetrics>;
      distance: number;
      midpoint: THREE.Vector3;
      samples: THREE.Vector3[];
      pulseCount: number;
    }>;
    cards: Map<string, CardRuntime>;
    chapters: Map<string, ChapterRuntime>;
    xrayHost: HTMLDivElement;
    xraySvg: SVGSVGElement;
    hoverRing: HTMLDivElement;
    labels: Map<string, HTMLDivElement>;
    exRows: Map<string, HTMLButtonElement>;
    labelChoices: TiltedLabelChoice[];
    labelPrevious: Set<string>;
    labelsFrozen: boolean;
    labelsDirty: boolean;
    labelLayerOn: boolean;
    labelTimer: number;
    lastLabelAt: number;
    overlaySignature: string;
    lastOverlayAt: number;
    overlayRectsCache: Array<{ x: number; y: number; width: number; height: number }>;
    overlayRectsAt: number;
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
    /** Dev-only acceptance probe: a comet forced across a card title. */
    testComet: { x1: number; y1: number; x2: number; y2: number } | null;
    capabilityLines: CapabilityLineRuntime[];
    routeHost: HTMLDivElement;
    routeTrackCanvas: HTMLCanvasElement;
    routeCometCanvas: HTMLCanvasElement;
    routeBands: RouteBandRuntime[];
    minDistance: number;
    maxDistance: number;
    layer: "skill" | "practice";
    layerMix: number;
    layerTarget: number;
    layerSwapFrom: number;
    layerSwapStarted: number;
    occluders: Array<{ x: number; y: number; width: number; height: number }>;
    capabilityReveal: boolean;
    lastSizeStage: "full" | "pill" | "dot";
    frameCount: number;
    fpsStarted: number;
    emitZoom(force?: boolean): void;
  }>(null);

  const propsRef = useRef({ nodes, chapters, edges, beams, layer, selectedId, hoverId, reducedMotion, detailOpen, externalHoverId, rightInset, onSelect, onBackground, onPoseChange, onCapabilityReveal, onSemanticZoom, onFps, onHoverNode, onReady });
  propsRef.current = { nodes, chapters, edges, beams, layer, selectedId, hoverId, reducedMotion, detailOpen, externalHoverId, rightInset, onSelect, onBackground, onPoseChange, onCapabilityReveal, onSemanticZoom, onFps, onHoverNode, onReady };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const labelsLayer = labelsRef.current;
    const exLayer = exRef.current;
    if (!host || !canvas || !labelsLayer || !exLayer) return;
    const hostEl: HTMLDivElement = host;
    const labelsEl: HTMLDivElement = labelsLayer;
    const exEl: HTMLDivElement = exLayer;
    // Short leaders live under the labels: a moved name still points at its
    // own node, and a leader can never paint over a name box.
    const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    leaderSvg.setAttribute("class", "ef-imm-tilt-leaders");
    leaderSvg.setAttribute("aria-hidden", "true");
    labelsEl.insertBefore(leaderSvg, labelsEl.firstChild);
    let lastLeaderHtml = "";
    const colors = {
      brand: cssColor("--brand", "#6D5DF6"),
      brandInk: cssColor("--brand-ink", "#4338CA"),
      acquired: cssColor("--course-acquired", "#22C55E"),
      target: cssColor("--course-target", "#3B82F6"),
      pending: cssColor("--course-intermediate", "#94A3B8"),
      practice: cssColor("--practice", "#14A6A0"),
      preview: cssColor("--course-route-preview", "#F59E0B"),
      routeTrack: cssColor("--course-route-track", "#6D5DF6"),
      routeComet: cssColor("--course-route-comet", "#E3E0FE"),
      routeCometHead: cssColor("--course-route-comet-head", "#F4F2FF"),
      previewTrack: cssColor("--course-route-preview-track", "#F59E0B"),
      previewComet: cssColor("--course-route-preview-comet", "#FAD8A0"),
      previewCometHead: cssColor("--course-route-preview-comet-head", "#FEF5E7"),
      capability: cssColor("--course-capability-line", "#8B87C9"),
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
    controls.dampingFactor = SCENE_CAMERA.dampingFactor;
    controls.rotateSpeed = SCENE_CAMERA.rotateSpeed;
    controls.zoomSpeed = SCENE_CAMERA.zoomSpeed;
    controls.panSpeed = SCENE_CAMERA.panSpeed;
    controls.screenSpacePanning = true;
    controls.minDistance = SCENE_CAMERA.minDistance;
    controls.maxDistance = SCENE_CAMERA.maxDistance;
    // The wheel dollies toward the cursor; toolbar +/− still animates toward
    // the orbit target (the screen centre).
    controls.zoomToCursor = true;
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
    const capabilityGroup = new THREE.Group();
    const beamGroup = new THREE.Group();
    const chapterGroup = new THREE.Group();
    // Depth-only card quads. They are opaque to the depth buffer but write no
    // colour, so the WebGL points and lines behind a CSS3D card are clipped
    // exactly where the card is. Card bodies stay DOM elements on top.
    const occluderGroup = new THREE.Group();
    const occluderGeometry = new THREE.PlaneGeometry(1, 1);
    const occluderMaterial = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    occluderMaterial.colorWrite = false;
    occluderMaterial.depthWrite = true;
    occluderMaterial.depthTest = true;
    scene.add(edgeGroup, capabilityGroup, beamGroup, chapterGroup, occluderGroup);

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
    xrayHost.innerHTML = '<svg aria-hidden="true"></svg>';
    // The x-ray belongs to the stage, not to document.body: it must be
    // clipped by the stage and stay below every page overlay (detail panel,
    // toolbar, status / zoom strips, capability rail). The selected node's
    // name now lives in the shared label layer, so it participates in the
    // same avoidance as every other name.
    host.appendChild(xrayHost);
    const xraySvg = xrayHost.querySelector("svg")!;

    const hoverRing = document.createElement("div");
    hoverRing.className = "ef-imm-tilt-hover-ring";
    host.appendChild(hoverRing);
    // P4R8: the route band lives above the CSS3D cards and the capability
    // plane, but below every page overlay (z-index 4 vs. overlays at 34+).
    const routeHost = document.createElement("div");
    routeHost.className = "ef-imm-route-band";
    routeHost.setAttribute("aria-hidden", "true");
    // Canvas, not SVG: the CSS3D cards create a composited layer that keeps
    // dynamic SVG paths underneath it. A 2D canvas sibling reliably paints the
    // band above the cards, and still lets us stroke gradients and punch
    // glyph-shaped holes so card text keeps its contrast.
    routeHost.innerHTML = `
      <canvas class="ef-imm-route-band-canvas ef-imm-route-track-canvas" aria-hidden="true"></canvas>
      <canvas class="ef-imm-route-band-canvas ef-imm-route-comet-canvas" aria-hidden="true"></canvas>`;
    host.appendChild(routeHost);
    const routeTrackCanvas = routeHost.querySelector(".ef-imm-route-track-canvas") as HTMLCanvasElement;
    const routeCometCanvas = routeHost.querySelector(".ef-imm-route-comet-canvas") as HTMLCanvasElement;
    const routeTrackCtx = routeTrackCanvas.getContext("2d")!;
    const routeCometCtx = routeCometCanvas.getContext("2d")!;
    const routeTextRects: Array<{ x: number; y: number; width: number; height: number }> = [];

    const engine = {
      renderer, cssRenderer, scene, cssScene, camera, controls, points, rings,
      pointPositions, pointAlpha, pointSize, pointColor,
      ringPositions, ringAlpha, ringSize, ringColor, ringColor2, ringSplit,
      edgeGroup, capabilityGroup, beamGroup, chapterGroup, occluderGroup, flows: [],
      cards: new Map<string, CardRuntime>(), chapters: new Map<string, ChapterRuntime>(),
      xrayHost, xraySvg, hoverRing,
      labels: new Map<string, HTMLDivElement>(), exRows: new Map<string, HTMLButtonElement>(),
      labelChoices: [] as TiltedLabelChoice[], labelPrevious: new Set<string>(),
      labelsFrozen: false, labelsDirty: true, labelLayerOn: false, labelTimer: 0, lastLabelAt: 0,
      overlaySignature: "", lastOverlayAt: 0, overlayRectsCache: [], overlayRectsAt: 0,
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
      currentNodes: [] as StageNode[], currentChapters: [] as StageChapter[], currentEdges: [] as StageEdge[], currentBeams: [] as StageBeam[], testComet: null,
      capabilityLines: [] as CapabilityLineRuntime[], routeHost, routeTrackCanvas, routeCometCanvas, routeBands: [] as RouteBandRuntime[],
      minDistance: SCENE_CAMERA.minDistance, maxDistance: SCENE_CAMERA.maxDistance,
      layer: "skill" as "skill" | "practice",
      layerMix: 0, layerTarget: 0, layerSwapFrom: 0, layerSwapStarted: 0,
      occluders: [] as Array<{ x: number; y: number; width: number; height: number }>,
      capabilityReveal: false, lastSizeStage: "full" as "full" | "pill" | "dot",
      frameCount: 0, fpsStarted: performance.now(),
      emitZoom(force = false) {
        const percent = zoomPercent(engine.fitDistance, camera.position.distanceTo(controls.target));
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

    const colorFor = (node: StageNode) => {
      if (node.kind === "assignment") return colors.practice;
      if (node.kind === "capability") return node.status === "completed" ? colors.acquired : colors.pending;
      // Learning only adds a ring; the Knowledge stays target-blue (or green
      // once acquired).
      return node.status === "completed" ? colors.acquired : colors.target;
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
    /** The one world position the cards, points, labels, picking and x-ray use. */
    const nodeWorld = (node: StageNode, offsets = layerOffsetsAt(engine.layerMix)) => nodeWorldFor(node, offsets);

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
      // Reserve the bottom toolbar and status strip, including their 20px
      // inset, so a visible chapter frame is never cut by the HUD.
      const safeBottom = engine.width <= 1180 ? 164 : 140;
      const usableHeight = Math.max(240, engine.height - safeTop - safeBottom);
      // Knowledge labels must stay readable. If the seven chapter columns do
      // not fit at the floor, the view starts at the left edge and the user
      // pans; zooming out to ~6px text was the P4R2 problem this guard fixes.
      const scale = Math.max(0.28, Math.min(1.12, Math.min(usableWidth / contentWidth, usableHeight / contentHeight)));
      engine.pxPerWorld = scale;
      const distance = engine.height / (2 * scale * FOV_T);
      engine.fitDistance = distance;
      // P4R8 fix1: at the nearest zoom one knowledge card is ~25–30% of the
      // viewport height (220–260 px at 900 px), so the page stays useful.
      // The far limit comes from the drawn content bounding box.
      const worldPoints = currentNodes.map((node) => ({ x: node.x, y: -node.y, z: node.z }));
      const limits = sceneCameraLimits({
        contentRadius: contentRadius(worldPoints),
        viewportHeight: engine.height,
        cardHeight: COURSE_CARD_HEIGHT,
        nearCardViewportRatio: 0.27
      });
      engine.minDistance = limits.minDistance;
      engine.maxDistance = limits.maxDistance;
      controls.minDistance = limits.minDistance;
      controls.maxDistance = limits.maxDistance;
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
      (engine as unknown as { lastFit?: unknown }).lastFit = { nextTarget: nextTarget.toArray(), nextPosition: nextPosition.toArray(), animated, contentWidth, contentHeight, nodes: currentNodes.length, chapters: currentChapters.length, fitted: engine.fitted, scale };
      animateCamera(nextPosition, nextTarget, animated && wasFitted ? 620 : 0);
      engine.emitZoom(true);
    }
    (engine as unknown as { fit(animated?: boolean): void }).fit = fit;

    /** Pan the camera only when the selected node is outside the free area. */
    function revealNode(id: string) {
      const node = engine.currentNodes.find((entry) => entry.id === id);
      if (!node || engine.width < 2 || engine.height < 2) return;
      camera.updateMatrixWorld();
      const world = nodeWorldFor(node, layerOffsetsAt(engine.layerMix));
      const screen = project({ x: world.x, y: world.y, z: world.z });
      // The detail panel, bottom chrome and shared page header are DOM
      // overlays outside the stage. Use their measured rectangles (plus the
      // caller's inset while a panel mounts) as the free area instead of
      // assuming one panel width and fixed top / bottom margins.
      let freeLeft = 0;
      let freeTop = 0;
      let freeRight = Math.max(0, engine.width - Math.max(0, propsRef.current.rightInset ?? 0));
      let freeBottom = engine.height;
      for (const rect of pageOverlayRects()) {
        const left = Math.max(0, Math.min(engine.width, rect.x));
        const right = Math.max(0, Math.min(engine.width, rect.x + rect.width));
        const top = Math.max(0, Math.min(engine.height, rect.y));
        const bottom = Math.max(0, Math.min(engine.height, rect.y + rect.height));
        if (right <= left || bottom <= top) continue;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        const nearest = [
          { edge: "left" as const, distance: centerX },
          { edge: "right" as const, distance: engine.width - centerX },
          { edge: "top" as const, distance: centerY },
          { edge: "bottom" as const, distance: engine.height - centerY }
        ].sort((a, b) => a.distance - b.distance)[0].edge;
        if (nearest === "left") freeLeft = Math.max(freeLeft, right);
        else if (nearest === "right") freeRight = Math.min(freeRight, left);
        else if (nearest === "top") freeTop = Math.max(freeTop, bottom);
        else freeBottom = Math.min(freeBottom, top);
      }
      // Reserve the label around the anchor, not a guessed panel width.
      const labelWidth = Math.max(120, Math.min(420, sideTextWidth(node.title)));
      const minX = Math.min(engine.width / 2, freeLeft + labelWidth / 2);
      const maxX = Math.max(minX, freeRight - labelWidth / 2);
      const minY = Math.min(engine.height / 2, freeTop + SIDE_H);
      const maxY = Math.max(minY, freeBottom - SIDE_H);
      const desiredX = Math.max(minX, Math.min(maxX, screen.x));
      const desiredY = Math.max(minY, Math.min(maxY, screen.y));
      if (Math.abs(desiredX - screen.x) < 0.5 && Math.abs(desiredY - screen.y) < 0.5) return;
      // The selection moved the camera; a later resize must not undo it.
      engine.userInteracted = true;
      const distance = camera.position.distanceTo(controls.target);
      const worldPerPixel = (2 * Math.max(1, distance) * FOV_T) / Math.max(1, engine.height);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const target = controls.target.clone()
        .add(right.multiplyScalar((screen.x - desiredX) * worldPerPixel))
        .add(up.multiplyScalar(-(screen.y - desiredY) * worldPerPixel));
      const position = camera.position.clone().add(target.clone().sub(controls.target));
      animateCamera(position, target, 240);
    }

    function frontView() {
      const distance = Math.max(engine.minDistance, camera.position.distanceTo(controls.target));
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
      const distance = Math.max(engine.minDistance, camera.position.distanceTo(controls.target));
      const yaw = THREE.MathUtils.degToRad(thetaDeg);
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const target = controls.target.clone();
      (engine as unknown as { lastOrbit?: unknown }).lastOrbit = { target: target.toArray(), cam: camera.position.toArray(), distance, bounds: engine.panBounds };
      animateCamera(target.clone().add(direction.multiplyScalar(distance)), target, duration);
      // A programmatic orbit is a camera move like a drag: thaw the label set
      // shortly after it settles so the count reflects the new projection.
      scheduleThaw(duration + 80);
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
      const point = project(nodeWorld(node));
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
      // The front face owns a same-position click. When the practice tree is
      // in front its card beats the Knowledge reflection underneath; in the
      // skill tree the reverse is true.
      const practiceFront = engine.layer === "practice";
      if (node.kind === "assignment") return practiceFront ? 0 : 2;
      if (node.kind === "capability") return 1;
      return practiceFront ? 2 : 0;
    }
    function rankOf(node: StageNode) {
      if (engine.hover === node.id || engine.externalHover === node.id) return 0;
      if (node.current) return 1;
      if (node.step) return 2;
      return 3;
    }
    function cardOccludesPoint(screen: { x: number; y: number }, distance: number, padding = 2) {
      for (const card of engine.cards.values()) {
        if (!card.object.visible || card.opacity < 0.1 || card.angle.dot >= 0.72) continue;
        // Only a card physically in front of the node can hide it.
        if (card.distance >= distance - 3) continue;
        const rect = rectForCard(card.node, card);
        if (screen.x >= rect.x - padding && screen.x <= rect.x + rect.width + padding
          && screen.y >= rect.y - padding && screen.y <= rect.y + rect.height + padding) return true;
      }
      return false;
    }
    function cardLabelObstacles() {
      return [...engine.cards.values()].flatMap((card) => {
        if (!card.object.visible || card.opacity < 0.1 || card.angle.dot >= 0.72) return [];
        // Only a card that actually shows its own name can block another name.
        // Unrelated cards are dimmed and carry no title during a selection, so
        // a related capability name may use their body instead of being pushed
        // to a far corner with a long leader.
        if (card.node.dim || card.hideOwnName || card.angle.cardName < 0.35) return [];
        const rect = rectForCard(card.node, card);
        if (rect.width < 8 || rect.height < 8) return [];
        return [{ x: rect.x - 3, y: rect.y - 3, width: rect.width + 6, height: rect.height + 8 }];
      });
    }
    /** The label box and the DOM box use the same measured width. */
    function labelWidthFor(text: string) {
      return Math.max(24, sideTextWidth(text));
    }
    /**
     * The name layer is a child of the stage, but the page HUD (detail panel,
     * bottom toolbar / status / zoom, top bar, capability rail) floats above
     * the whole stage. A label may use any part of the stage that those real
     * rectangles leave free: the detail panel only blocks its own box, not the
     * full-height strip beneath it. Rectangles are converted to stage-local
     * coordinates and padded so a name never touches an overlay edge.
     */
    function pageOverlayRects() {
      const cacheNow = performance.now();
      if (cacheNow - engine.overlayRectsAt < 100 && engine.overlayRectsCache.length) return engine.overlayRectsCache;
      const hostRect = hostEl.getBoundingClientRect();
      const selectors = [
        ".ef-imm-detail",
        ".ef-imm-toolbar",
        ".ef-imm-status-legend",
        ".ef-imm-controls",
        ".ef-imm-top",
        ".ef-course-page-header",
        ".ef-imm-cap-rail",
        ".ef-imm-transition"
      ];
      const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (const selector of selectors) {
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
          if (!element.getClientRects().length) return;
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.02) return;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return;
          const local = {
            x: rect.left - hostRect.left - 3,
            y: rect.top - hostRect.top - 3,
            width: rect.width + 6,
            height: rect.height + 6
          };
          if (local.x + local.width <= 0 || local.y + local.height <= 0
            || local.x >= engine.width || local.y >= engine.height) return;
          rects.push(local);
        });
      }
      // During the detail panel's mount transition there may not be a DOM
      // rectangle yet. Reserve the same inset the page reports in that frame.
      const inset = Math.max(0, propsRef.current.rightInset ?? 0);
      const coveredRight = rects.some((rect) => rect.x > engine.width * 0.55 && rect.height > engine.height * 0.2);
      if (inset > 0 && !coveredRight) rects.push({ x: engine.width - inset, y: 0, width: inset, height: engine.height });
      engine.overlayRectsCache = rects;
      engine.overlayRectsAt = cacheNow;
      return rects;
    }
    /** Hover ring plus its step chip; both must stay out of every name box. */
    function hoverRingBox() {
      const id = engine.hover ?? engine.externalHover;
      if (!id) return null;
      const info = nodeScreenFor(id);
      if (!info || info.screen.z > 1) return null;
      const card = engine.cards.get(id);
      const stage = !card || card.pointMix > 0.62 ? "dot" : card.angle.pill > 0.02 ? "pill" : "full";
      if (hoverStyleFor(stage) !== "ring") return null;
      const diameter = Math.max(34, Math.min(58, 13 * (engine.height / (2 * info.distance * FOV_T)) * 0.8 + 14));
      // The chip is 18px wide and hangs 9px off the ring's left edge.
      return { x: info.screen.x - diameter / 2 - 9, y: info.screen.y - diameter / 2, width: diameter + 9, height: diameter };
    }
    /** The selected name must clear its ring / step chip, not just the dot. */
    function labelDiameterFor(node: StageNode, screen: { diameter: number }, distance: number) {
      let diameter = node.kind === "capability" ? Math.max(16, screen.diameter) : screen.diameter;
      if (node.id !== engine.selected) return diameter;
      const dotPx = Math.max(8, Math.min(18, 13 * (engine.height / (2 * distance * FOV_T)) * 1.15));
      const ring = Math.max(6, Math.min(14, dotPx / 2 + 2)) + 3;
      diameter = Math.max(diameter, ring * 2);
      const hover = hoverRingBox();
      if (hover) diameter = Math.max(diameter, hover.width, hover.height);
      return diameter;
    }
    function chooseLabels() {
      const candidates: TiltedLabelCandidate[] = [];
      const obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      const hovered = engine.hover ?? engine.externalHover;
      if (engine.exVisible) {
        engine.labelChoices = [];
        engine.labelPrevious.clear();
        return;
      }
      for (let index = 0; index < engine.currentNodes.length; index += 1) {
        const node = engine.currentNodes[index];
        if (node.kind === "route" || node.kind === "route-chapter") continue;
        // Reflection practice cards are the same step as their Knowledge; naming
        // both would duplicate text on the turned plane. The far face of a
        // selected node stays at normal brightness but is never named.
        // Only the front face is named: Knowledge in the skill tree, practice
        // cards in the practice tree. The far face keeps its glow but no name.
        // The selected node may carry the mirror flag (it owns the far face in
        // the other layer), but its visible face still needs one name.
        if (node.ghost || (node.mirror && node.id !== engine.selected)) continue;
        if (node.kind === "assignment" && engine.layer !== "practice") continue;
        // §10.7: while a node is selected only its related set is named.
        // Distance naming and the excentric list are disabled, and dimmed
        // unrelated markers no longer block the related names. The selected
        // node keeps its own name: selection must never leave it anonymous.
        if (engine.selected && !node.highlight && node.id !== engine.selected) continue;
        const dist = camera.position.distanceTo(nodeWorld(node));
        const screen = cardScreen(node, dist);
        if (screen.z > 1) continue;
        // With no selection a name is only anchored to a point the viewer can
        // actually see; when a nearer card covers the point, the oblique label
        // is omitted. During a selection the related set is a hard contract:
        // the point may sit behind a card, so the name moves out with a leader
        // rather than being dropped.
        if (!engine.selected && cardOccludesPoint(screen, dist)) continue;
        // A related node fully hidden by a page overlay is the one allowed
        // omission: the panel owns that screen area, so a name would have to
        // travel to the opposite side of the stage to be seen at all.
        if (engine.selected && node.id !== engine.selected) {
          const pad = 10;
          const fullyCovered = pageOverlayRects().some((rect) => screen.x - pad >= rect.x && screen.x + pad <= rect.x + rect.width
            && screen.y - pad >= rect.y && screen.y + pad <= rect.y + rect.height);
          if (fullyCovered) continue;
        }
        const isCapability = node.kind === "capability";
        const card = engine.cards.get(node.id);
        // One node, one name: full cards and capsules already carry their own
        // title, so the screen-facing layer must not hang a second one above.
        if (cardShowsOwnName({
          cardVisible: Boolean(card && card.object.visible && card.opacity > 0.05),
          pointMix: card?.pointMix ?? 1,
          cardNameOpacity: card?.hideOwnName ? 0 : card?.angle.cardName ?? 0,
          isCapability
        })) continue;
        const width = Math.max(14, Math.min(52, screen.diameter + 8));
        obstacles.push({ id: node.id, x: screen.x - width / 2, y: screen.y - width / 2, width, height: width });
        // Capability names follow the same oblique naming rule as Knowledge;
        // they are never revealed by a special angle switch.
        const visible = !node.dim && (!node.mirror || node.id === engine.selected) && renderedOpacity(index) >= 0.1;
        if (!visible) continue;
        // 35–58°: the turned plane is read through screen-facing names. The
        // card body is hidden (turnLabels), so the name layer is the only
        // owner. Capability names stay quiet until hovered / selected / current
        // so 42 capability labels cannot cover the course names.
        if (angle < 58 && !engine.selected) {
          if (isCapability && !(node.id === hovered || node.id === engine.selected || (node.current && node.kind !== "capability"))) continue;
        }
        // Ordinary hover only forces the hovered node's name. Every other
        // distance / fit decision stays as-is; the excentric list replaces
        // them only when the pick radius is ambiguous.
        candidates.push({
          id: node.id, x: screen.x, y: screen.y, distance: dist,
          diameter: labelDiameterFor(node, screen, dist),
          visibility: renderedOpacity(index), priority: engine.selected ? 0 : rankOf(node),
          text: node.title
        });
      }
      const overlays = pageOverlayRects();
      const turned = angle >= 34 && angle < 58;
      const selection = Boolean(engine.selected);
      let chosen: TiltedLabelChoice[];
      if (selection) {
        // Hard rule: the selected node and every lit one-hop neighbour keep a
        // name. Avoidance may move a name outward (with a short leader) but it
        // may never drop one; only a node outside the frustum or fully hidden
        // by a page overlay is allowed to stay anonymous.
        const cardBoxes = cardLabelObstacles();
        const markerBoxes: TiltedSelectionLabelMarker[] = [];
        engine.currentNodes.forEach((node) => {
          // Only the related set is an obstacle. Unrelated capability points
          // are dimmed in the front pose and may share a dense neighbourhood;
          // treating all of them as blockers would leave a selected capability
          // anonymous inside its own cluster.
          const related = node.highlight || node.id === engine.selected;
          if (!related) return;
          const info = nodeScreenFor(node.id);
          if (!info || info.screen.z > 1) return;
          const screen = cardScreen(node, info.distance);
          // A related name must clear the drawn point *and* its status ring.
          // The selected node's hover ring is larger (34–58px); its own name
          // uses labelDiameterFor, while every other name only has to clear the
          // ring itself, not the extra step-chip width.
          const selectedRing = Math.max(34, Math.min(58, 13 * (engine.height / (2 * info.distance * FOV_T)) * 0.8 + 14));
          const diameter = node.id === engine.selected ? selectedRing : screen.diameter;
          const size = node.id === engine.selected ? selectedRing : Math.max(16, Math.min(52, diameter + 8));
          markerBoxes.push({ id: node.id, x: info.screen.x - size / 2, y: info.screen.y - size / 2, width: size, height: size });
          if (node.id === hovered && node.id !== engine.selected) {
            const hover = hoverRingBox();
            if (hover) markerBoxes.push({ id: node.id, ...hover });
          }
        });
        const selectionCandidates: TiltedSelectionLabelCandidate[] = candidates.map((candidate) => ({
          ...candidate,
          width: labelWidthFor(candidate.text),
          selected: candidate.id === engine.selected
        }));
        chosen = layoutSelectionLabels(selectionCandidates, {
          width: engine.width,
          height: engine.height,
          lineHeight: SIDE_H,
          margin: 8,
          selectedId: engine.selected ?? undefined,
          markers: markerBoxes,
          exclusions: overlays,
          cardBoxes
        });
      } else {
        chosen = chooseTiltedLabels(candidates, {
          width: engine.width, height: engine.height,
          maxLabels: turned ? 90 : SIDE_MAX,
          showDiameter: turned ? 4 : SIDE_SHOW_PX,
          hideDiameter: turned ? 3 : SIDE_HIDE_PX,
          lineHeight: SIDE_H, margin: 8,
          measure: sideTextWidth, previous: engine.labelPrevious, obstacles,
          exclusions: overlays
        });
      }
      if (import.meta.env.DEV) {
        (engine as unknown as { lastCandidates?: unknown }).lastCandidates = candidates.map((candidate) => ({
          id: candidate.id, x: Number(candidate.x.toFixed(1)), y: Number(candidate.y.toFixed(1)),
          distance: Number(candidate.distance.toFixed(1)), visibility: Number(candidate.visibility.toFixed(2)),
          priority: candidate.priority, text: candidate.text
        }));
        (engine as unknown as { lastChosen?: unknown }).lastChosen = chosen.map((choice) => ({
          id: choice.id, anchor: choice.anchor, extra: choice.extra ?? 0,
          leader: Boolean(choice.leader), rect: choice.rect
        }));
        (engine as unknown as { lastObstacles?: unknown }).lastObstacles = obstacles;
      }
      if (selection) {
        // One name per related node, even when two nodes share a title: the
        // related set is a hard contract, not a text set.
        engine.labelChoices = chosen;
      } else {
        // One text label on screen at a time, even if two nodes share a title.
        const texts = new Set<string>();
        engine.labelChoices = chosen.filter((choice) => {
          const node = nodeById(choice.id);
          const key = (node?.title ?? "").trim().toLocaleLowerCase();
          if (!key) return true;
          if (texts.has(key)) return false;
          texts.add(key);
          return true;
        });
      }
      engine.labelPrevious = new Set(engine.labelChoices.map((choice) => choice.id));
      engine.lastLabelAt = performance.now();
      engine.labelsDirty = false;
    }
    function updateLabels() {
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      // A selection names its one-hop set at every angle, including the front
      // pose; otherwise the oblique label layer only exists past 34°.
      const on = angle > 34 || Boolean(engine.selected);
      if (!on || engine.exVisible) {
        engine.labelChoices = [];
        engine.labelPrevious.clear();
        engine.labels.forEach((element) => { element.style.opacity = "0"; });
        if (lastLeaderHtml) {
          leaderSvg.innerHTML = "";
          lastLeaderHtml = "";
        }
        engine.labelLayerOn = false;
        return;
      }
      // Crossing into the oblique zone must rebuild the set even when the
      // previous angle had cleared it (programmatic orbit / Esc / thaw).
      if (!engine.labelLayerOn) {
        engine.labelLayerOn = true;
        engine.labelsDirty = true;
      }
      // The detail panel / toolbar / rail mount and animate after selection.
      // Re-run the label layout when their real rectangles settle so a name is
      // never kept in the conservative placeholder strip for good.
      const overlayNow = performance.now();
      if (overlayNow - engine.lastOverlayAt > 180) {
        engine.lastOverlayAt = overlayNow;
        const signature = pageOverlayRects().map((rect) => `${rect.x.toFixed(0)},${rect.y.toFixed(0)},${rect.width.toFixed(0)},${rect.height.toFixed(0)}`).join(";");
        if (signature !== engine.overlaySignature) {
          engine.overlaySignature = signature;
          engine.labelsDirty = true;
        }
      }
      // While dragging / zooming the set is frozen, but the labels still track
      // their nodes; only joining or leaving the set waits for the 250ms thaw.
      if (!engine.labelsFrozen && engine.labelsDirty && performance.now() - engine.lastLabelAt > 30) chooseLabels();
      leaderSvg.setAttribute("viewBox", `0 0 ${engine.width} ${engine.height}`);
      leaderSvg.setAttribute("width", String(engine.width));
      leaderSvg.setAttribute("height", String(engine.height));
      const leaderLines: string[] = [];
      const used = new Set<string>();
      for (const choice of engine.labelChoices) {
        const node = nodeById(choice.id);
        if (!node) continue;
        const distance = camera.position.distanceTo(nodeWorld(node));
        const screen = cardScreen(node, distance);
        if (screen.z > 1) continue;
        const width = labelWidthFor(node.title);
        const diameter = labelDiameterFor(node, screen, distance);
        // Use the same anchor geometry as chooseLabels so the measured and the
        // rendered box are identical; the DOM box can never drift into a
        // neighbour or a marker.
        const base = labelRectForAnchor({ x: screen.x, y: screen.y, diameter }, choice.anchor, width, SIDE_H);
        const extra = choice.extra ?? 0;
        const shifted = {
          ...base,
          x: base.x + (choice.anchor === "left" ? -extra : choice.anchor === "right" ? extra : 0),
          y: base.y + (choice.anchor === "above" ? -extra : choice.anchor === "below" ? extra : 0)
        };
        const rect = choice.offset ? {
          ...base,
          x: Math.max(8, Math.min(base.x + choice.offset.x, engine.width - 8 - width)),
          y: Math.max(8, Math.min(base.y + choice.offset.y, engine.height - 8 - SIDE_H))
        } : extra > 0 ? {
          ...shifted,
          x: Math.max(8, Math.min(shifted.x, engine.width - 8 - width)),
          y: Math.max(8, Math.min(shifted.y, engine.height - 8 - SIDE_H))
        } : shifted;
        if (extra > 0) {
          const leader = labelLeaderFor({ x: screen.x, y: screen.y, diameter }, choice.anchor, rect);
          leaderLines.push(`<line data-label-id="${choice.id}" x1="${leader.x1.toFixed(1)}" y1="${leader.y1.toFixed(1)}" x2="${leader.x2.toFixed(1)}" y2="${leader.y2.toFixed(1)}"/>`);
        }
        let element = engine.labels.get(choice.id);
        if (!element) {
          element = document.createElement("div");
          element.className = "ef-imm-tilt-label";
          labelsEl.appendChild(element);
          engine.labels.set(choice.id, element);
        }
        if (element.textContent !== node.title) element.textContent = node.title;
        element.classList.toggle("is-capability-label", node.kind === "capability");
        element.classList.toggle("is-selected-label", node.id === engine.selected);
        element.dataset.status = node.status ?? "";
        element.dataset.kind = node.kind;
        element.style.fontSize = node.kind === "capability" ? "11px" : "";
        element.style.lineHeight = node.kind === "capability" ? "16px" : "";
        const fade = 1;
        element.style.transform = `translate(${rect.x.toFixed(1)}px, ${rect.y.toFixed(1)}px)`;
        element.style.opacity = (choice.alpha * fade * (node.dim ? 0.25 : 1)).toFixed(3);
        used.add(choice.id);
      }
      engine.labels.forEach((element, id) => {
        if (!used.has(id)) element.style.opacity = "0";
      });
      const leaderHtml = leaderLines.join("");
      if (leaderHtml !== lastLeaderHtml) {
        leaderSvg.innerHTML = leaderHtml;
        lastLeaderHtml = leaderHtml;
      }
    }

    function updateChapterLabelElement() {
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      const chapterLabel = angle > 35 && !engine.exVisible && !engine.hover && !engine.externalHover
        ? engine.chapters.get(engine.chapterHover ?? "")
        : null;
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
      const world = nodeWorld(node);
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
      const card = id ? engine.cards.get(id) : undefined;
      // P4R6 hover rule: card / capsule stages only brighten the outline.
      // The circle exists only for a point and is drawn outside the marker.
      const stage = !card || card.pointMix > 0.62 ? "dot" : card.angle.pill > 0.02 ? "pill" : "full";
      if (hoverStyleFor(stage) !== "ring") {
        engine.hoverRing.style.opacity = "0";
        return;
      }
      const diameter = Math.max(34, Math.min(58, 13 * (engine.height / (2 * info.distance * FOV_T)) * 0.8 + 14));
      engine.hoverRing.style.width = `${diameter.toFixed(1)}px`;
      engine.hoverRing.style.height = `${diameter.toFixed(1)}px`;
      engine.hoverRing.style.borderColor = nodeColor(node);
      engine.hoverRing.style.transform = `translate(${(info.screen.x - diameter / 2).toFixed(1)}px, ${(info.screen.y - diameter / 2).toFixed(1)}px)`;
      // The route step is hidden in the dot stage until hover, then it rides
      // the hover ring instead of becoming a second persistent marker.
      engine.hoverRing.dataset.step = node.step ? String(node.step) : "";
      engine.hoverRing.dataset.dot = stage === "dot" ? "1" : "";
      engine.hoverRing.style.opacity = "1";
    }

    function xrayFor(): { node: StageNode; world: THREE.Vector3; screen: { x: number; y: number; z: number }; distance: number; segments: Array<{ x1: number; y1: number; x2: number; y2: number }> } | null {
      if (!engine.selected) return null;
      const info = nodeScreenFor(engine.selected);
      if (!info) return null;
      // A Knowledge and its practice reflection are one node. Connect to the
      // drawn face of each lit neighbour, so the practice tree never gets two
      // lines for the same step and the skill tree keeps its cards.
      const keyOf = (node: StageNode) => node.kind === "assignment" ? node.chapterId ?? node.id : node.id;
      const selectedKey = keyOf(info.node);
      const chosen = new Map<string, string>();
      const chosenAlpha = new Map<string, number>();
      engine.currentNodes.forEach((node, index) => {
        if (!node.highlight || node.selected) return;
        const key = keyOf(node);
        if (key === selectedKey) return;
        if (project(nodeWorld(node)).z > 1) return;
        const alpha = renderedOpacity(index);
        if (alpha <= (chosenAlpha.get(key) ?? -1)) return;
        chosen.set(key, node.id);
        chosenAlpha.set(key, alpha);
      });
      const remap = (id?: string) => {
        if (!id) return id;
        const node = nodeById(id);
        if (!node) return id;
        const key = keyOf(node);
        if (key === selectedKey) return engine.selected!;
        return chosen.get(key) ?? id;
      };
      // Only edges that actually reach a drawn face may add a neighbour. The
      // other knowledge covered by a multi-Knowledge practice card is part of
      // the selection itself, not a second one-hop target.
      const drawnFaces = new Set(chosen.values());
      const litEdges = engine.currentEdges
        .filter((edge) => edge.highlighted)
        .flatMap((edge) => {
          const source = remap(edge.source);
          const target = remap(edge.target);
          if (source !== engine.selected && target !== engine.selected) return [];
          const other = source === engine.selected ? target : source;
          if (!other || other === engine.selected || !drawnFaces.has(other)) return [];
          return [{ id: edge.id, source, target }];
        });
      const xray = selectionXraySegments({
        selectedId: engine.selected,
        edges: litEdges,
        neighborIds: [...chosen.values()],
        // The x-ray must land on what is actually drawn: a hidden neighbour
        // (behind the camera or faded under 0.3) produces no line. The
        // selected node keeps its guide lines while it is only a marker.
        screenFor: (id) => {
          const found = nodeScreenFor(id);
          if (!found) return null;
          if (id === engine.selected) return found.screen;
          const index = engine.currentNodes.indexOf(found.node);
          if (index < 0 || renderedOpacity(index) < 0.3) return null;
          return found.screen;
        }
      });
      return { node: info.node, world: info.world, screen: info.screen, distance: info.distance, segments: xray.segments };
    }

    function rectForCard(node: StageNode, card: CardRuntime) {
      const width = card.width * (engine.height / (2 * Math.max(1, card.distance) * FOV_T));
      const height = card.height * (engine.height / (2 * Math.max(1, card.distance) * FOV_T));
      return { x: card.screen.x - width / 2, y: card.screen.y - height / 2, width, height };
    }
    /**
     * Only a sheet on a *different, parallel plane* that is genuinely nearer
     * along the view ray may dim itself for the x-ray. Perspective distance is
     * not depth: two cards on the same plane have the same view depth even
     * when one is 20 world units farther from the camera in Euclidean terms.
     * The selected node and its one-hop neighbours are never passed here.
     */
    function xrayBlocked(
      rect: { x: number; y: number; width: number; height: number },
      world: THREE.Vector3,
      normal: THREE.Vector3,
      xray: ReturnType<typeof xrayFor>,
      related = false,
      viewAngle = 0
    ) {
      if (!xray || related) return false;
      // The front pose is read through the gaps between sheets: nothing is
      // allowed to dim at 0°, where perspective distance is not occlusion.
      if (viewAngle < 8) return false;
      const delta = world.clone().sub(xray.world);
      // Backface / billboarded sheets are not the parallel stack we reason
      // about; they are dots by then and must not dim a neighbouring card.
      if (Math.abs(normal.clone().normalize().dot(new THREE.Vector3(0, 0, 1))) < 0.85) return false;
      // Same plane (or only the 6-unit reflection offset) never counts.
      if (Math.abs(delta.z) < 8) return false;
      const toCamera = camera.position.clone().sub(xray.world).normalize();
      if (delta.dot(toCamera) < 8) return false;
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
      if (!xray) {
        engine.xrayHost.style.opacity = "0";
        return;
      }
      engine.xrayHost.style.opacity = "1";
      engine.xraySvg.setAttribute("viewBox", `0 0 ${engine.width} ${engine.height}`);
      engine.xraySvg.setAttribute("width", String(engine.width));
      engine.xraySvg.setAttribute("height", String(engine.height));
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      // A capability never has a card, so its selected point always owns the
      // small ring; a turned-plane knowledge marker does too. The name is not
      // drawn here: it is a normal label, so it avoids every other name.
      const marker = angle > 35 || xray.node.kind === "capability";
      const dotPx = Math.max(8, Math.min(18, 13 * (engine.height / (2 * xray.distance * FOV_T)) * 1.15));
      const radius = Math.max(6, Math.min(14, dotPx / 2 + 2));
      const lines = xray.segments.map((segment) => `<line x1="${segment.x1.toFixed(1)}" y1="${segment.y1.toFixed(1)}" x2="${segment.x2.toFixed(1)}" y2="${segment.y2.toFixed(1)}"/>`).join("");
      // X-ray lines stay above the cards but never run across card copy or a
      // name: mask them out wherever a card body or a label box is visible.
      // The ring stays outside the mask.
      const hostRect = hostEl.getBoundingClientRect();
      const maskRects = [
        ...[...engine.cards.values()].flatMap((card) => {
          if (card.opacity < 0.12 || card.pointMix > 0.6) return [];
          const rect = rectForCard(card.node, card);
          return [{ ...rect }];
        }),
        ...[...engine.labels.values()].flatMap((element) => {
          if (Number(element.style.opacity) <= 0.02) return [];
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return [];
          return [{ x: rect.left - hostRect.left - 2, y: rect.top - hostRect.top - 2, width: rect.width + 4, height: rect.height + 4 }];
        })
      ];
      const maskSvg = maskRects.map((rect) =>
        `<rect x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.width.toFixed(1)}" height="${rect.height.toFixed(1)}" fill="black"/>`).join("");
      const xrayMask = maskSvg
        ? `<defs><mask id="ef-imm-xray-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${engine.width}" height="${engine.height}"><rect x="0" y="0" width="${engine.width}" height="${engine.height}" fill="white"/>${maskSvg}</mask></defs>`
        : "";
      const maskAttr = xrayMask ? ' mask="url(#ef-imm-xray-mask)"' : "";
      engine.xraySvg.innerHTML = `${xrayMask}<g class="ef-imm-tilt-xray-glow"${maskAttr}>${lines}</g><g class="ef-imm-tilt-xray-core"${maskAttr}>${lines}</g>${marker
        ? `<circle class="ef-imm-tilt-xray-halo" cx="${xray.screen.x.toFixed(1)}" cy="${xray.screen.y.toFixed(1)}" r="${(radius + 3).toFixed(1)}"/><circle class="ef-imm-tilt-xray-ring" cx="${xray.screen.x.toFixed(1)}" cy="${xray.screen.y.toFixed(1)}" r="${radius.toFixed(1)}"/>`
        : ""}`;
    }

    function denseNodesAt(x: number, y: number): ExcentricNode[] {
      const result: ExcentricNode[] = [];
      for (let index = 0; index < engine.currentNodes.length; index += 1) {
        const node = engine.currentNodes[index];
        if (node.kind === "route" || node.kind === "route-chapter" || node.kind === "assignment") continue;
        const distance = camera.position.distanceTo(nodeWorld(node));
        const screen = cardScreen(node, distance);
        const alpha = renderedOpacity(index);
        if (screen.z > 1 || alpha < 0.02) continue;
        const close = Math.hypot(screen.x - x, screen.y - y);
        if (close <= 22) result.push({ id: node.id, x: screen.x, y: screen.y, distance, visibility: 1, text: node.title });
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
    function planeScreenBounds() {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      engine.cards.forEach((card) => {
        if (card.node.kind === "capability") return;
        if (!card.object.visible) return;
        const rect = rectForCard(card.node, card);
        if (!Number.isFinite(rect.x) || rect.width <= 0) return;
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
      });
      engine.chapters.forEach((runtime) => {
        runtime.quad.forEach((point) => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      });
      if (!Number.isFinite(minX)) return { x: engine.width / 2 - 220, y: engine.height / 2 - 160, width: 440, height: 320 };
      return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }
    function drawExcentric(x: number, y: number) {
      if (engine.selected) { hideExcentric(); return; }
      const cluster = findExcentricCluster(denseNodesAt(x, y), { x, y }, { radius: 22, minNodes: 3, maxNodes: 6, snap: 7 });
      if (!cluster) { hideExcentric(); return; }
      const list = cluster.nodes.slice();
      const hoveredId = engine.hover ?? engine.externalHover;
      if (hoveredId && !list.some((node) => node.id === hoveredId)) {
        const info = nodeScreenFor(hoveredId);
        if (info && info.screen.z <= 1) {
          list.push({ id: hoveredId, x: info.screen.x, y: info.screen.y, distance: info.distance, visibility: 1, text: info.node.title });
        }
      }
      const nodesForList = list.slice(0, 6).sort((left, right) => left.y - right.y || left.id.localeCompare(right.id));
      const layout = layoutExcentricOutside(nodesForList, cluster.anchor, { width: engine.width, height: engine.height }, planeScreenBounds(), {
        measure: sideTextWidth, rowHeight: 22, margin: 12, gap: 18, topInset: 76, bottomInset: 76, maxNodes: 6
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
      }, 400);
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
      for (let index = 0; index < engine.currentNodes.length; index += 1) {
        const node = engine.currentNodes[index];
        if (node.kind === "route" || node.kind === "route-chapter") continue;
        const distance = camera.position.distanceTo(nodeWorld(node));
        const screen = cardScreen(node, distance);
        if (screen.z > 1) continue;
        // Dimmed nodes stay clickable; only a node that is not drawn leaves
        // the screen-space pick set.
        if (!isPickable(renderedOpacity(index))) continue;
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
      engine.occluders = [];
      const direction = camera.position.clone().sub(controls.target).normalize();
      const angle = tiltAngleDegrees(direction);
      const sample = engine.currentNodes.find((node) => node.kind === "knowledge");
      const sampleWorld = sample ? nodeWorld(sample) : controls.target.clone();
      const sampleDistance = Math.max(1, camera.position.distanceTo(sampleWorld));
      const samplePx = engine.height / (2 * sampleDistance * FOV_T);
      const state = simplificationForView({
        theta: angle,
        screenWidth: (sample?.width ?? 176) * samplePx,
        previousSizeStage: engine.lastSizeStage
      });
      engine.lastSizeStage = state.sizeStage;
      const xray = xrayFor();
      const offsets = layerOffsetsAt(engine.layerMix);
      const mix = engine.layerMix;
      // Between ~35° and ~58° the plane is read through screen-facing names,
      // not through foreshortened card bodies. The WebGL marker owns the node
      // and the card is hidden, so one node still has exactly one marker.
      const turnLabels = smooth(33, 37, angle) * (1 - smooth(56, 60, angle));
      const cardFade = (1 - smooth(0.5, 0.62, state.dot)) * (1 - turnLabels);
      const pointMix = Math.max(smooth(0.62, 0.86, state.dot), turnLabels);
      engine.cards.forEach((card) => {
        const node = card.node;
        const knowledge = node.kind === "knowledge";
        const assignment = node.kind === "assignment";
        const world = nodeWorld(node, offsets);
        card.object.position.copy(world);
        const distance = camera.position.distanceTo(world);
        const pxPerWorld = engine.height / (2 * Math.max(1, distance) * FOV_T);
        const screen = project({ x: world.x, y: world.y, z: world.z });
        const ghost = knowledge ? mix > 0.5 : assignment ? mix < 0.5 : false;
        card.screen = screen;
        card.distance = distance;
        card.angle = state;
        card.ghost = ghost;
        card.pointMix = pointMix;
        card.layerOpacity = knowledge ? offsets.knowledgeOpacity : assignment ? offsets.practiceOpacity : 1;
        let opacity = card.layerOpacity;
        if (node.dim) opacity *= 0.24;
        opacity *= 1 - state.back;
        if (node.id === selected && angle > 35) opacity *= 1 - smooth(35, 38, angle);
        // A reflection is text-only clutter once the plane turns; its copy is
        // gone by ~42°, and it never becomes a dot-stage marker (the front
        // layer's single point owns the node there).
        if (ghost) opacity *= (1 - smooth(35, 42, angle)) * (1 - smooth(0.16, 0.55, state.dot)) * (1 - turnLabels)
          * (1 - smooth(0.35, 0.65, state.pill));
        // The DOM card hands the node over to the WebGL point before the point
        // fades in, so one Knowledge never shows two markers.
        opacity *= cardFade;
        let width = node.width;
        let height = node.height;
        const name = node.title;
        // The capsule is defined in screen pixels and converted back into the
        // card's world units. Otherwise perspective and zoom shrink both the
        // capsule and its glyphs until a name collapses to "S…". The target is
        // wide enough for a readable run (>= 8 Latin characters) or the full
        // name, and never wider than the card itself.
        // Keep the glyph size legible as the capsule shrinks: a 60px capsule
        // at 50% zoom needs a smaller screen font, not a 13px font clipped to
        // a few vertical strokes.
        const safePxPerWorld = Math.max(0.0001, pxPerWorld);
        const pillFont = Math.max(9, Math.min(node.kind === "capability" ? 12 : 13, (node.width * safePxPerWorld) * 0.16));
        const targetPillPx = Math.max(
          node.kind === "capability" ? 72 : 78,
          Math.min(node.kind === "capability" ? 128 : 152, sideTextWidth(name) + (node.kind === "capability" ? 18 : 24))
        );
        const pillWorldWidth = Math.min(node.width, targetPillPx / safePxPerWorld);
        const pillWorldHeight = 26 / safePxPerWorld;
        const dotPx = Math.min(13 * (node.kind === "capability" ? 1.15 : 1) * pxPerWorld, NODE_MAX_PX);
        const dotSize = dotPx / Math.max(0.0001, pxPerWorld);
        width = THREE.MathUtils.lerp(THREE.MathUtils.lerp(node.width, pillWorldWidth, state.pill), dotSize, state.dot);
        height = THREE.MathUtils.lerp(THREE.MathUtils.lerp(node.height, pillWorldHeight, state.pill), dotSize, state.dot);
        const cardRect = {
          x: screen.x - width * pxPerWorld / 2,
          y: screen.y - height * pxPerWorld / 2,
          width: width * pxPerWorld,
          height: height * pxPerWorld
        };
        // The selected node is named by the shared label layer: it can use the
        // complete title (even when the card is a capsule) and, crucially, it
        // moves with the node when the detail panel pans the camera. Keeping
        // the card title too would show two names for one node.
        card.hideOwnName = node.id === selected;
        const cardNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(card.object.quaternion);
        const related = Boolean(selected) && !node.dim;
        const blocked = xrayBlocked(cardRect, world, cardNormal, xray, related, angle);
        card.xrayBlocked = blocked;
        if (blocked) opacity *= 0.16;
        // Keep the step-disc lane (30px) free; every other card pixel clips the
        // route band, so it cannot sit over a title or description.
        if (opacity > 0.12 && screen.z < 1 && state.dot < 0.72 && cardRect.width > 34) {
          // Reflections hide their copy and step disc, so their whole sheet is
          // opaque; solid cards keep the 30px step-disc lane.
          const lane = ghost || state.pill > 0.6 ? 0 : 30;
          engine.occluders.push({
            x: cardRect.x + lane,
            y: cardRect.y,
            width: Math.max(1, cardRect.width - lane),
            // The reflection's identity strip can overflow the 64px sheet by a
            // few pixels; include that strip so the band never crosses it.
            height: cardRect.height + (ghost ? 14 : 0)
          });
        }
        card.width = width;
        card.height = height;
        card.opacity = opacity;
        const element = card.element;
        element.style.width = `${width.toFixed(2)}px`;
        element.style.height = `${height.toFixed(2)}px`;
        const padY = THREE.MathUtils.lerp(THREE.MathUtils.lerp(8, 0, state.pill), 0, state.dot);
        const padRight = THREE.MathUtils.lerp(THREE.MathUtils.lerp(10, 4, state.pill), 0, state.dot);
        // In the capsule the copy itself reserves the step disc's lane. The
        // old code reserved 24px on the card AND 18px on the copy, leaving
        // only a few pixels for the name.
        const padLeft = node.kind === "knowledge" && node.step
          ? THREE.MathUtils.lerp(36, 2, state.pill)
          : padRight;
        element.style.padding = `${padY.toFixed(2)}px ${padRight.toFixed(2)}px ${padY.toFixed(2)}px ${padLeft.toFixed(2)}px`;
        const strongElement = element.querySelector<HTMLElement>("strong");
        if (strongElement) {
          if (state.pill > 0.02) {
            strongElement.style.fontSize = `${(pillFont / safePxPerWorld).toFixed(2)}px`;
            strongElement.style.lineHeight = `${(pillFont * 1.18 / safePxPerWorld).toFixed(2)}px`;
          } else {
            strongElement.style.removeProperty("font-size");
            strongElement.style.removeProperty("line-height");
          }
        }
        element.style.borderRadius = state.pill > 0.02 ? "999px" : "12px";
        // In the practice tree the Knowledge reflection sits behind every
        // practice card. Its translucent sheet let the route band shine
        // through the ghost title; make that sheet opaque and fade only its
        // content, so the band is truly occluded by the card stack.
        const occludeBeam = ghost && engine.layer === "practice" && angle < 35 && state.dot < 0.5;
        element.classList.toggle("is-beam-occluder", occludeBeam);
        if (occludeBeam) {
          element.style.setProperty("--ghost-content-op", Math.max(0, Math.min(1, opacity)).toFixed(3));
          element.style.opacity = "1";
        } else {
          element.style.removeProperty("--ghost-content-op");
          element.style.opacity = Math.max(0, Math.min(1, opacity)).toFixed(3);
        }
        // Unrelated cards keep their body at 20% but show no name. A
        // reflection is the other face of the same node: it may share the
        // brightness but never owns a second name or secondary rows.
        element.style.setProperty("--name-op", (ghost || card.hideOwnName ? 0 : cardNameOpacity(state.cardName, !node.dim)).toFixed(3));
        element.style.setProperty("--extra-op", (ghost || node.dim ? 0 : state.extra).toFixed(3));
        element.style.setProperty("--dotc", `var(--dotc, ${nodeColor(node)})`);
        element.classList.toggle("is-pill", state.pill > 0.02);
        element.classList.toggle("is-dot", state.dot > 0.6);
        element.classList.toggle("is-ghost", ghost);
        element.classList.toggle("is-dim", Boolean(node.dim));
        element.classList.toggle("is-sel", node.id === selected);
        element.classList.toggle("is-hover", node.id === (engine.hover ?? engine.externalHover));
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
        // A card must hide a capability / far point that sits behind it. The
        // full card and the capsule are opaque surfaces; in the dot stage the
        // marker itself is the only visible geometry, so its quad is disabled
        // to avoid clipping its own point.
        card.occluder.visible = card.object.visible && opacity > 0.1 && state.dot < 0.72 && cardRect.width > 6 && cardRect.height > 6;
        if (card.occluder.visible) {
          card.occluder.position.copy(card.object.position);
          card.occluder.quaternion.copy(card.object.quaternion);
          card.occluder.scale.set(width, height, 1);
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
        if (xrayBlocked(rect, panelCenter, new THREE.Vector3(0, 0, 1), xray, false, angle)) opacity *= 0.22;
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
      const angle = tiltAngleDegrees(camera.position.clone().sub(controls.target));
      // In the front / near-front poses the capability model is seen *through*
      // the gaps between cards. Keep those points as a faint depth cue instead
      // of a bright second layer; they become fully readable once the plane is
      // turned past ~35°. The depth-only card quads handle the covered ones.
      const capabilityFade = 0.16 + 0.84 * smooth(30, 46, angle);
      for (let index = 0; index < count; index += 1) {
        const node = engine.currentNodes[index];
        const card = engine.cards.get(node.id);
        const color = new THREE.Color(colorFor(node));
        const isCapability = node.kind === "capability";
        const world = nodeWorld(node);
        // One marker per node: the WebGL point only owns the node in the dot
        // stage. Earlier stages are the DOM card, so the point stays invisible.
        const ghost = card?.ghost ?? false;
        // A capability has no card: its point owns the node at every angle.
        const pointMix = isCapability ? 1 : ghost ? 0 : (card?.pointMix ?? 0);
        // P4R6: a selected capability and its lit neighbours are drawn at
        // their real position at every angle. Only unrelated capabilities keep
        // the front-view fade.
        const capabilityDim = isCapability && !node.selected && !node.highlight ? capabilityFade : 1;
        const alpha = pointMix * (node.dim ? 0.2 : 1) * capabilityDim;
        const hovered = engine.hover === node.id || engine.externalHover === node.id;
        pointPositions[index * 3] = world.x;
        pointPositions[index * 3 + 1] = world.y;
        pointPositions[index * 3 + 2] = world.z;
        pointAlpha[index] = Math.max(0, Math.min(1, alpha * (hovered ? 1.4 : 1)));
        pointSize[index] = 13 * (node.kind === "capability" ? 1.15 : 1) * (hovered ? 1.55 : 1);
        color.toArray(pointColor, index * 3);
        // Status / current ring: screen-facing, fixed width, capped at 60px.
        ringPositions[index * 3] = world.x;
        ringPositions[index * 3 + 1] = world.y;
        ringPositions[index * 3 + 2] = world.z;
        ringSize[index] = 13 * (node.kind === "capability" ? 1.15 : 1) * 2.1;
        const ringStatus = node.status === "completed" ? colors.acquired : node.status === "learning" ? colors.brand : colorFor(node);
        const ring = new THREE.Color(ringStatus);
        ring.toArray(ringColor, index * 3);
        ringColor2[index * 3] = ringColor[index * 3];
        ringColor2[index * 3 + 1] = ringColor[index * 3 + 1];
        ringColor2[index * 3 + 2] = ringColor[index * 3 + 2];
        ringSplit[index] = 0;
        ringAlpha[index] = 0;
        // Status rings belong to the dot stage; during the full / pill stages
        // they would read as a second marker beside the card.
        ringAlpha[index] = pointMix * (node.dim ? 0.12 : 0.58) * capabilityDim;
        if (node.current) {
          const pulse = engine.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 3.1);
          const brand = new THREE.Color(colors.brand);
          brand.toArray(ringColor, index * 3);
          brand.toArray(ringColor2, index * 3);
          ringAlpha[index] = Math.max(ringAlpha[index], pointMix * (0.62 + 0.3 * pulse) * capabilityDim);
          ringSize[index] *= 1 + 0.045 * pointMix * pulse;
        }
        if (hovered) {
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

    function hoveredStatusColor(node: StageNode) {
      return new THREE.Color(colorFor(node));
    }

    function rebuildCards() {
      // P4R6: capabilities are points at every angle; they never get a CSS3D
      // card (and therefore never leak "前置能力" card copy between trees).
      const desired = new Map(engine.currentNodes.filter((node) => node.kind !== "route" && node.kind !== "route-chapter" && node.kind !== "capability").map((node) => [node.id, node]));
      engine.cards.forEach((card, id) => {
        if (desired.has(id)) return;
        cssScene.remove(card.object);
        occluderGroup.remove(card.occluder);
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
          const occluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
          occluder.frustumCulled = false;
          occluder.renderOrder = 1;
          occluder.visible = false;
          occluderGroup.add(occluder);
          card = {
            node, element, object, occluder, signature: "", width: node.width, height: node.height, opacity: 0,
            screen: { x: 0, y: 0, z: 0 }, distance: 1000, angle: simplificationForAngle(0),
            pointMix: 0, layerOpacity: 1, ghost: false
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
        const nodeStatus = node.statusLine ?? node.meta ?? "";
        card.element.title = node.title;
        card.element.setAttribute("aria-label", [node.title, nodeStatus].filter(Boolean).join(" · "));
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
        runtime.title.title = [chapterNumberLabel(chapter.displayNumber), chapter.title, chapter.meta].filter(Boolean).join(" · ");
        // The chapter title follows its column width and may use two lines.
        runtime.title.style.width = `${Math.max(160, chapter.width - 12)}px`;
        runtime.title.style.maxWidth = `${Math.max(160, chapter.width - 12)}px`;
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
      const add = (points: TiltedPoint[], color: string, opacity: number, dashed: boolean, kind: StageEdge["kind"], weights: number[] = []) => {
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
        line.userData.sourceId = undefined;
        line.userData.targetId = undefined;
        line.userData.points = points;
        line.userData.weights = weights.length === points.length ? weights : points.map(() => 0);
        line.renderOrder = 0;
        engine.edgeGroup.add(line);
      };
      const hasSelection = Boolean(propsRef.current.selectedId);
      disposeCapabilityLines();
      for (const edge of engine.currentEdges) {
        if (edge.kind === "capability") {
          addCapabilityLine(edge);
        } else if (edge.kind === "practice") {
          add(edge.points, colors.practice, edge.highlighted ? 0.8 : 0.25, true, edge.kind);
          const line = engine.edgeGroup.children[engine.edgeGroup.children.length - 1];
          if (line instanceof THREE.Line) {
            line.userData.sourceId = edge.source;
            line.userData.targetId = edge.target;
          }
        } else if (edge.kind === "route-hop") {
          add(edge.points, colors.brandInk, 0.95, false, edge.kind);
        } else if (edge.kind === "chapter") add(edge.points, colors.line, 0.2, false, edge.kind);
        else add(edge.points, edge.highlighted ? colors.brandInk : colors.brand, edge.highlighted ? 1 : hasSelection ? 0.06 : 0.27, false, edge.kind, edge.pointWeights ?? edge.points.map(() => 1));
        const line = engine.edgeGroup.children[engine.edgeGroup.children.length - 1];
        if (line instanceof THREE.Line) {
          line.userData.highlighted = Boolean(edge.highlighted);
          line.userData.edgeId = edge.id;
          line.userData.sourceId = edge.source;
          line.userData.targetId = edge.target;
        }
      }
      (engine as unknown as { lastEdgeMix?: number }).lastEdgeMix = undefined;
      updateEdgeGeometry();
    }

    function disposeCapabilityLines() {
      engine.capabilityGroup.children.slice().forEach((child) => {
        engine.capabilityGroup.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          const material = child.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      engine.capabilityLines = [];
    }

    function addCapabilityLine(edge: StageEdge) {
      const source = nodeById(edge.source ?? "");
      const target = nodeById(edge.target ?? "");
      if (!source || !target || edge.points.length < 2) return;
      const offsets = layerOffsetsAt(engine.layerMix);
      const from = nodeWorldFor(source, offsets);
      const to = nodeWorldFor(target, offsets);
      const geometry = new LineGeometry();
      geometry.setPositions([from.x, from.y, from.z, to.x, to.y, to.z]);
      const highlighted = Boolean(edge.highlighted);
      const material = new LineMaterial({
        color: new THREE.Color(highlighted ? colors.brandInk : colors.capability),
        linewidth: highlighted ? 2.5 : 1.5,
        transparent: true,
        opacity: highlighted ? 1 : 0.57,
        depthWrite: false
      });
      const ratio = renderer.getPixelRatio();
      material.resolution.set(engine.width * ratio, engine.height * ratio);
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 1;
      line.userData.edgeId = edge.id;
      line.userData.sourceId = edge.source;
      line.userData.targetId = edge.target;
      engine.capabilityGroup.add(line);
      engine.capabilityLines.push({ id: edge.id, source: edge.source ?? "", target: edge.target ?? "", line, material, highlighted });
    }

    function updateEdgeGeometry() {
      const mix = engine.layerMix;
      const last = (engine as unknown as { lastEdgeMix?: number }).lastEdgeMix;
      if (last !== undefined && Math.abs(last - mix) < 0.0004) return;
      (engine as unknown as { lastEdgeMix?: number }).lastEdgeMix = mix;
      const offsets = layerOffsetsAt(mix);
      for (const child of engine.edgeGroup.children) {
        if (!(child instanceof THREE.Line)) continue;
        const points = child.userData.points as TiltedPoint[] | undefined;
        if (!points) continue;
        const kind = child.userData.kind as StageEdge["kind"];
        const attribute = child.geometry.getAttribute("position") as THREE.BufferAttribute;
        const source = nodeById(child.userData.sourceId as string);
        const target = nodeById(child.userData.targetId as string);
        // A line is a relation between two drawn nodes, never a relation
        // between two card borders. The first / last geometry vertices are
        // therefore written from the same nodeWorldFor() the cards, points,
        // labels, picking and hover ring use. Keeping the layout's edge
        // anchors here made a capability line start on the far side of its
        // source node and leave a 30–40px tail outside the node at 80°.
        const sourceWorld = source ? nodeWorldFor(source, offsets) : null;
        const targetWorld = target ? nodeWorldFor(target, offsets) : null;
        if (kind === "practice") {
          if (!sourceWorld || !targetWorld) continue;
          attribute.setXYZ(0, sourceWorld.x, sourceWorld.y, sourceWorld.z);
          attribute.setXYZ(1, targetWorld.x, targetWorld.y, targetWorld.z);
          attribute.needsUpdate = true;
          if (child.material instanceof THREE.LineDashedMaterial) child.computeLineDistances();
          continue;
        }
        if (sourceWorld && targetWorld && points.length === 4
          && (kind === "plain" || kind === "knowledge" || kind === "capability")) {
          // The layout uses an orthogonal 3-bend connector. Rebuild its two
          // bends from the real endpoints so no bend can sit outside the
          // source→target box and fold back over the node.
          const midX = (sourceWorld.x + targetWorld.x) / 2;
          const midZ = (sourceWorld.z + targetWorld.z) / 2;
          attribute.setXYZ(0, sourceWorld.x, sourceWorld.y, sourceWorld.z);
          attribute.setXYZ(1, midX, sourceWorld.y, midZ);
          attribute.setXYZ(2, midX, targetWorld.y, midZ);
          attribute.setXYZ(3, targetWorld.x, targetWorld.y, targetWorld.z);
          attribute.needsUpdate = true;
          if (child.material instanceof THREE.LineDashedMaterial) child.computeLineDistances();
          continue;
        }
        const weights = child.userData.weights as number[] | undefined;
        points.forEach((point, index) => {
          const weight = weights?.[index] ?? 0;
          attribute.setXYZ(
            index,
            point.x + offsets.knowledge.x * weight,
            -point.y - offsets.knowledge.y * weight,
            point.z + offsets.knowledge.z * weight
          );
        });
        // Route hops / other multi-point paths keep their shape but still end
        // exactly on the two nodes they connect.
        if (sourceWorld) attribute.setXYZ(0, sourceWorld.x, sourceWorld.y, sourceWorld.z);
        if (targetWorld) attribute.setXYZ(attribute.count - 1, targetWorld.x, targetWorld.y, targetWorld.z);
        attribute.needsUpdate = true;
        if (child.material instanceof THREE.LineDashedMaterial) child.computeLineDistances();
      }
    }

    function clearRouteBands() {
      engine.routeBands = [];
      routeTrackCtx.clearRect(0, 0, engine.width, engine.height);
      routeCometCtx.clearRect(0, 0, engine.width, engine.height);
    }

    /**
     * Glyph-shaped holes for the comet. The canvas sits above the cards, but a
     * light glowing line still lowers dark text contrast; punching the exact
     * title / meta / badge boxes keeps the card copy at its normal contrast.
     */
    function updateRouteTextRects(force = false) {
      const now = performance.now();
      const last = (engine as unknown as { lastRouteMaskAt?: number }).lastRouteMaskAt ?? 0;
      if (!force && now - last < 120) return;
      (engine as unknown as { lastRouteMaskAt?: number }).lastRouteMaskAt = now;
      const width = Math.max(1, engine.width);
      const height = Math.max(1, engine.height);
      const hostRect = hostEl.getBoundingClientRect();
      routeTextRects.length = 0;
      engine.cards.forEach((card) => {
        if (card.opacity < 0.12 || card.angle.dot > 0.6) return;
        const box = card.element.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) return;
        card.element.querySelectorAll<HTMLElement>("strong, small, .ef-imm-node-actions span, .ef-imm-badge, .ef-imm-step, .ef-imm-node-index, .ef-imm-node-count").forEach((text) => {
          const textContent = text.textContent?.trim();
          if (!textContent) return;
          const rect = text.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return;
          if (rect.right < 0 || rect.bottom < 0 || rect.left > width || rect.top > height) return;
          routeTextRects.push({
            x: rect.left - hostRect.left - 2,
            y: rect.top - hostRect.top - 2,
            width: rect.width + 4,
            height: rect.height + 4
          });
        });
      });
      // Node names are HTML pills above the band; punch them too so a comet
      // can never wash out a name if the compositor orders the layers tightly.
      engine.labels.forEach((element) => {
        if (Number(element.style.opacity || 1) < 0.05) return;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        if (rect.right < 0 || rect.bottom < 0 || rect.left > width || rect.top > height) return;
        routeTextRects.push({
          x: rect.left - hostRect.left - 2,
          y: rect.top - hostRect.top - 2,
          width: rect.width + 4,
          height: rect.height + 4
        });
      });
    }

    function rebuildBeams() {
      clearRouteBands();
      updateRouteTextRects(true);
      engine.currentBeams.forEach((beam) => {
        const nodeIds = beam.nodeIds?.length
          ? beam.nodeIds
          : engine.currentNodes.map((node) => node.id).filter((id) => beam.points.some((point) => {
            const node = nodeById(id);
            return Boolean(node && Math.abs(node.x - point.x) < 0.5 && Math.abs(-node.y - point.y) < 0.5);
          }));
        if (nodeIds.length < 2) return;
        const current = beam.kind === "current";
        engine.routeBands.push({
          id: beam.id,
          kind: beam.kind,
          dimmed: Boolean(beam.dimmed),
          nodeIds: [...nodeIds],
          anchors: [],
          cumulative: [],
          total: 0,
          stepDistance: 0,
          distance: 0,
          windowWorld: 1,
          color: current ? colors.routeTrack : colors.previewTrack,
          cometColor: current ? colors.routeComet : colors.previewComet,
          cometHead: current ? colors.routeCometHead : colors.previewCometHead
        });
      });
    }

    /** Screen polyline through the current world anchors of a route band. */
    function routeBandScreenAnchors(band: RouteBandRuntime) {
      const anchors = buildRouteAnchorSequence(band.nodeIds, engine.currentNodes.map((node) => {
        const world = nodeWorld(node);
        return { id: node.id, x: world.x, y: world.y, z: world.z };
      }));
      return anchors.map((anchor) => {
        const screen = project(anchor);
        return { world: anchor, screen: { x: screen.x, y: screen.y } };
      });
    }

    function routeBandPolyline(
      anchors: ReturnType<typeof routeBandScreenAnchors>,
      cumulative: number[],
      start: number,
      end: number
    ) {
      const total = cumulative[cumulative.length - 1] ?? 0;
      const from = Math.max(0, start);
      const to = Math.min(total, end);
      if (to - from < 0.01 || anchors.length < 2) return [] as Array<{ x: number; y: number }>;
      const distances = [from];
      for (let index = 1; index < cumulative.length - 1; index += 1) {
        const value = cumulative[index];
        if (value > from && value < to) distances.push(value);
      }
      distances.push(to);
      return distances.map((distance) => routeBandScreenPoint(anchors, cumulative, distance));
    }

    function routeBandScreenPoint(
      anchors: ReturnType<typeof routeBandScreenAnchors>,
      cumulative: number[],
      distance: number
    ) {
      if (!anchors.length) return { x: 0, y: 0 };
      const total = cumulative[cumulative.length - 1] ?? 0;
      const target = Math.max(0, Math.min(total, distance));
      let index = 0;
      while (index < cumulative.length - 2 && cumulative[index + 1] < target) index += 1;
      const span = Math.max(0.0001, cumulative[index + 1] - cumulative[index]);
      const t = Math.max(0, Math.min(1, (target - cumulative[index]) / span));
      const a = anchors[index].screen;
      const b = anchors[Math.min(anchors.length - 1, index + 1)].screen;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    function routeColorWithAlpha(color: string, alpha: number) {
      const srgb = /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(color);
      if (srgb) {
        return `rgba(${Math.round(Number(srgb[1]) * 255)},${Math.round(Number(srgb[2]) * 255)},${Math.round(Number(srgb[3]) * 255)},${alpha})`;
      }
      const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(color);
      if (rgb) {
        return `rgba(${Math.round(Number(rgb[1]))},${Math.round(Number(rgb[2]))},${Math.round(Number(rgb[3]))},${alpha})`;
      }
      return `rgba(109,93,246,${alpha})`;
    }

    function strokeRoutePolyline(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      ctx.stroke();
    }

    function routeGradient(
      ctx: CanvasRenderingContext2D,
      color: string,
      stops: ReturnType<typeof cometGradientStops>,
      head: { x: number; y: number },
      tail: { x: number; y: number },
      headColor: string = color
    ) {
      const gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      stops.forEach((stop, index) => {
        gradient.addColorStop(stop.offset, routeColorWithAlpha(index === 0 ? headColor : color, stop.opacity));
      });
      return gradient;
    }

    function syncRouteCanvasSize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(engine.width * dpr));
      const height = Math.max(1, Math.round(engine.height * dpr));
      [routeTrackCanvas, routeCometCanvas].forEach((canvas) => {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas === routeTrackCanvas ? routeTrackCtx : routeCometCtx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      return { width: engine.width, height: engine.height };
    }

    function updateBeams(delta: number) {
      const reduced = propsRef.current.reducedMotion;
      const size = syncRouteCanvasSize();
      updateRouteTextRects();
      routeTrackCtx.clearRect(0, 0, size.width, size.height);
      routeCometCtx.clearRect(0, 0, size.width, size.height);
      if (!engine.routeBands.length) return;
      engine.routeBands.forEach((band) => {
        const anchors = routeBandScreenAnchors(band);
        if (anchors.length < 2) return;
        const worldAnchors = anchors.map((anchor) => anchor.world);
        const metrics = routeMetrics(worldAnchors);
        band.anchors = worldAnchors.map((anchor) => new THREE.Vector3(anchor.x, anchor.y, anchor.z));
        band.cumulative = metrics.cumulative;
        band.total = metrics.total;
        band.stepDistance = metrics.stepDistance;
        // 8px soft glow under a 2px core: one luminous ribbon, clearly wider
        // than the 1.5px knowledge / capability edges.
        const track = anchors.map((anchor) => anchor.screen);
        routeTrackCtx.save();
        routeTrackCtx.lineCap = "round";
        routeTrackCtx.lineJoin = "round";
        routeTrackCtx.strokeStyle = band.color;
        routeTrackCtx.globalAlpha = reduced ? 0.10 : band.dimmed ? 0.05 : 0.12;
        routeTrackCtx.lineWidth = 8;
        strokeRoutePolyline(routeTrackCtx, track);
        routeTrackCtx.globalAlpha = reduced ? 0.20 : band.dimmed ? 0.12 : 0.30;
        routeTrackCtx.lineWidth = 2;
        strokeRoutePolyline(routeTrackCtx, track);
        routeTrackCtx.restore();
        if (reduced || metrics.total <= 0.0001) return;
        band.distance = advancePulse(band.distance, metrics, delta);
        const midpoint = anchors[Math.floor(anchors.length / 2)].world;
        const distanceToMid = camera.position.distanceTo(new THREE.Vector3(midpoint.x, midpoint.y, midpoint.z));
        const worldPerPixel = (2 * Math.max(1, distanceToMid) * FOV_T) / Math.max(1, engine.height);
        // Visible head-to-tail length is ~1.7x the shader window: 60–80px.
        const windowWorld = 72 / 1.7 * worldPerPixel;
        band.windowWorld = windowWorld;
        const comets = routeBandComets(band.distance, metrics, windowWorld, { count: 3 });
        comets.forEach((comet) => {
          const points = routeBandPolyline(anchors, metrics.cumulative, comet.start, comet.end);
          if (points.length < 2) return;
          const head = routeBandScreenPoint(anchors, metrics.cumulative, comet.head);
          const tail = routeBandScreenPoint(anchors, metrics.cumulative, comet.tail);
          const safeTail = Math.hypot(tail.x - head.x, tail.y - head.y) < 0.5 ? { x: head.x - 0.5, y: head.y } : tail;
          const halo = routeGradient(routeCometCtx, band.cometColor, cometGradientStops("halo"), head, safeTail);
          const core = routeGradient(routeCometCtx, band.cometColor, cometGradientStops("core"), head, safeTail, band.cometHead);
          routeCometCtx.save();
          routeCometCtx.lineCap = "round";
          routeCometCtx.lineJoin = "round";
          routeCometCtx.globalAlpha = band.dimmed ? 0.38 : 1;
          // Two soft halo strokes plus the 3px head-bright core. Multi-stroke
          // keeps the glow soft without a per-frame canvas blur.
          routeCometCtx.strokeStyle = halo;
          routeCometCtx.globalAlpha *= 0.55;
          routeCometCtx.lineWidth = 14;
          strokeRoutePolyline(routeCometCtx, points);
          routeCometCtx.globalAlpha = band.dimmed ? 0.38 : 1;
          routeCometCtx.lineWidth = 10;
          strokeRoutePolyline(routeCometCtx, points);
          routeCometCtx.strokeStyle = core;
          routeCometCtx.lineWidth = 3;
          strokeRoutePolyline(routeCometCtx, points);
          routeCometCtx.restore();
        });
      });
      if (engine.testComet) {
        const { x1, y1, x2, y2 } = engine.testComet;
        const head = { x: x2, y: y2 };
        const tail = { x: x1, y: y1 };
        const points = [tail, head];
        const halo = routeGradient(routeCometCtx, colors.routeComet, cometGradientStops("halo"), head, tail);
        const core = routeGradient(routeCometCtx, colors.routeComet, cometGradientStops("core"), head, tail, colors.routeCometHead);
        routeCometCtx.save();
        routeCometCtx.lineCap = "round";
        routeCometCtx.lineJoin = "round";
        routeCometCtx.strokeStyle = halo;
        routeCometCtx.globalAlpha = 0.55;
        routeCometCtx.lineWidth = 14;
        strokeRoutePolyline(routeCometCtx, points);
        routeCometCtx.globalAlpha = 1;
        routeCometCtx.lineWidth = 10;
        strokeRoutePolyline(routeCometCtx, points);
        routeCometCtx.strokeStyle = core;
        routeCometCtx.lineWidth = 3;
        strokeRoutePolyline(routeCometCtx, points);
        routeCometCtx.restore();
      }
      // Punch the glyph boxes out of the comet layer only: the track stays
      // continuous, the card title / meta keeps its original contrast.
      routeCometCtx.save();
      routeCometCtx.globalCompositeOperation = "destination-out";
      // Remove most, not all, of the comet over a glyph box: text keeps a
      // >=10:1 contrast while the glow stays visually continuous.
      routeCometCtx.fillStyle = "rgba(0,0,0,0.86)";
      routeTextRects.forEach((rect) => {
        routeCometCtx.beginPath();
        if (typeof routeCometCtx.roundRect === "function") {
          routeCometCtx.roundRect(rect.x, rect.y, rect.width, rect.height, 3);
        } else {
          routeCometCtx.rect(rect.x, rect.y, rect.width, rect.height);
        }
        routeCometCtx.fill();
      });
      routeCometCtx.restore();
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
      beamMaterialsRef.current.forEach((material) => material.resolution.set(width, height));
      engine.capabilityLines.forEach((capability) => capability.material.resolution.set(width * pixelRatio, height * pixelRatio));
      syncRouteCanvasSize();
      updateRouteTextRects(true);
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
      // Skill / practice swap: both layers interpolate their offset and
      // opacity over 420ms. No layout, camera or React data is rebuilt.
      const layerTarget = engine.layer === "practice" ? 1 : 0;
      if (layerTarget !== engine.layerTarget) {
        engine.layerSwapFrom = engine.layerMix;
        engine.layerSwapStarted = now;
        engine.layerTarget = layerTarget;
      }
      engine.layerMix = layerMixAt(engine.layerSwapFrom, engine.layerTarget, now - engine.layerSwapStarted, LAYER_SWAP_MS, engine.reduced);
      // The list rail is a ~35° affordance, not the first faint pixels of
      // the deeper plane.
      const capReveal = angle >= 33;
      if (capReveal !== engine.capabilityReveal) {
        engine.capabilityReveal = capReveal;
        propsRef.current.onCapabilityReveal?.(capReveal);
      }
      updateHoverRing();
      updateCards();
      updateChapters();
      updateChapterHover();
      updatePoints();
      updateEdgeGeometry();
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
        const highlighted = Boolean(child.userData.highlighted);
        const hasSelection = Boolean(selected);
        if (kind === "capability") {
          // Support lines are a visible 40% gray web at rest. A selection keeps
          // only the one-hop edges to the selected node lit, as solid lines.
          material.opacity = highlighted ? 1 : hasSelection ? 0.05 : 0.4;
        } else if (kind === "knowledge") {
          material.opacity = highlighted ? 0.92 : hasSelection ? 0.06 : base;
        }
        if (kind !== "capability" && kind !== "knowledge") return;
        const source = child.userData.source as TiltedPoint | undefined;
        const target = child.userData.target as TiltedPoint | undefined;
        const endpointHit = (point?: TiltedPoint) => {
          if (!point) return false;
          const node = nodeByIdForPoint(point);
          return Boolean(node && (node.id === hover || node.id === selected));
        };
        if (!hasSelection && (endpointHit(source) || endpointHit(target))) {
          material.opacity = kind === "capability" ? 1 : 0.95;
        }
      });
      const focusId = selected ?? hover;
      const anySelected = Boolean(selected);
      engine.capabilityLines.forEach((capability) => {
        const lit = capability.highlighted
          || (!anySelected && Boolean(focusId && (capability.source === focusId || capability.target === focusId)));
        capability.material.linewidth = lit ? 2.5 : 1.5;
        capability.material.opacity = lit ? 1 : anySelected ? 0.18 : 0.57;
        capability.material.color.set(lit ? colors.brandInk : colors.capability);
      });
    }
    function nodeByIdForPoint(point: TiltedPoint) {
      return engine.currentNodes.find((node) => Math.abs(node.x - point.x) < 0.5 && Math.abs(-node.y - point.y) < 0.5 && Math.abs(node.z - point.z) < 8) ?? null;
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
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const rect = hostEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (!isCameraDrag(moved) && event.detail < 2 && event.button === 0 && !down.onLabel) {
        const hit = pickAt(x, y);
        if (hit) {
          const node = nodeById(hit);
          if (node) activate(node);
        } else {
          propsRef.current.onBackground?.();
        }
      }
      if (!isPanGesture(down.button, down.shift) && isCameraDrag(moved)) {
        window.setTimeout(() => {
          if (engine.dragging) return;
          if (!shouldSnapToFront(angle())) return;
          const target = controls.target.clone();
          const pose = frontPose({ x: target.x, y: target.y, z: target.z }, camera.position.distanceTo(target));
          animateCamera(new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z), target, 450);
        }, SCENE_CAMERA.snapDelayMs);
      }
      if (isCameraDrag(moved)) {
        // A drag can end without another pointermove: name the node under the
        // resting cursor immediately instead of keeping a stale hover.
        const hit = pickAt(x, y);
        engine.internalHover = hit;
        applyHover(hit);
      }
      scheduleThaw(moved > 5 ? 240 : 0);
      propsRef.current.onPoseChange?.(angle() > 12 ? "rotated" : "front");
    }
    const wheelRaycaster = new THREE.Raycaster();
    const wheelPlane = new THREE.Plane();
    const wheelPoint = new THREE.Vector3();
    const wheelForward = new THREE.Vector3();
    function wheel(event: WheelEvent) {
      if ((event.target as HTMLElement).closest(".ef-imm-detail, .ef-imm-object-shell")) return;
      engine.userInteracted = true;
      event.preventDefault();
      // Cursor-centric dolly on the canvas, before OrbitControls' host
      // listener. Target and camera scale around the point under the pointer,
      // so the node under the cursor does not slide while zooming.
      event.stopPropagation();
      stopCameraTween();
      freezeLabels();
      scheduleThaw(300);
      hideExcentric();
      const rect = hostEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const hit = pickAt(localX, localY);
      const hitNode = hit ? nodeById(hit) : null;
      let cursor = controls.target;
      if (hitNode) {
        cursor = nodeWorld(hitNode);
      } else {
        wheelRaycaster.setFromCamera(new THREE.Vector2(
          (localX / rect.width) * 2 - 1,
          -(localY / rect.height) * 2 + 1
        ), camera);
        camera.getWorldDirection(wheelForward);
        wheelPlane.setFromNormalAndCoplanarPoint(wheelForward, controls.target);
        cursor = wheelRaycaster.ray.intersectPlane(wheelPlane, wheelPoint) ?? controls.target;
      }
      const distance = camera.position.distanceTo(controls.target);
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode, controls.zoomSpeed, rect.height);
      const next = Math.max(controls.minDistance, Math.min(controls.maxDistance, distance * factor));
      if (Math.abs(next - distance) < 0.0001) return;
      const scale = next / Math.max(0.0001, distance);
      camera.position.sub(cursor).multiplyScalar(scale).add(cursor);
      controls.target.sub(cursor).multiplyScalar(scale).add(cursor);
      controls.update();
      camera.updateMatrixWorld();
      markLabelsDirty();
    }
    function doubleClick(event: MouseEvent) {
      engine.userInteracted = true;
      const rect = hostEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = pickAt(x, y);
      const node = hit ? nodeById(hit) : null;
      if (doubleClickAction(node?.id ?? null) === "focus" && node) {
        stopCameraTween();
        const world = nodeWorld(node);
        const delta = world.clone().sub(controls.target);
        controls.target.copy(world);
        camera.position.add(delta);
        controls.update();
        markLabelsDirty();
        return;
      }
      frontView();
    }
    function angle() {
      return tiltAngleDegrees(camera.position.clone().sub(controls.target));
    }
    hostEl.addEventListener("pointerdown", pointerDown, true);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    hostEl.addEventListener("dblclick", doubleClick);
    hostEl.addEventListener("contextmenu", (event) => event.preventDefault());
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(hostEl);
    resize();
    apiRef.current = { animateCamera, fit, frontView, capPresetView: capsView, markLabelsDirty, rebuildCards, rebuildChapters, rebuildEdges, rebuildBeams, reveal: revealNode };
    if (import.meta.env.DEV) {
      (window as unknown as { __efTilt?: unknown }).__efTilt = {
        angle: () => tiltAngleDegrees(camera.position.clone().sub(controls.target)),
        fit: () => { engine.fitted = false; engine.userInteracted = false; fit(true); },
        setOrbit: (thetaDeg: number, pitchDeg = 0) => setOrbit(thetaDeg, pitchDeg),
        setZoomPercent: (percent: number) => {
          const direction = camera.position.clone().sub(controls.target);
          const distance = THREE.MathUtils.clamp(engine.fitDistance / Math.max(0.2, percent / 100), engine.minDistance, engine.controls.maxDistance);
          animateCamera(controls.target.clone().add(direction.setLength(distance)), controls.target.clone(), 320);
        },
        zoomPercent: () => engine.lastZoomPercent,
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
        labelCandidates: () => (engine as unknown as { lastCandidates?: unknown }).lastCandidates ?? [],
        labelObstacles: () => (engine as unknown as { lastObstacles?: unknown }).lastObstacles ?? [],
        labelChosen: () => (engine as unknown as { lastChosen?: unknown }).lastChosen ?? [],
        edges: () => engine.edgeGroup.children.filter((child): child is THREE.Line => child instanceof THREE.Line).map((line) => ({
          id: line.userData.edgeId as string | undefined,
          kind: line.userData.kind as string,
          source: line.userData.sourceId as string | undefined,
          target: line.userData.targetId as string | undefined,
          highlighted: Boolean(line.userData.highlighted),
          opacity: Number((line.material as THREE.LineBasicMaterial).opacity.toFixed(3))
        })),
        // The actual BufferGeometry vertices, projected to stage pixels. The
        // acceptance measurement must not read the x-ray SVG or the layout
        // data: this is what WebGL draws.
        edgeGeometry: () => engine.edgeGroup.children.filter((child): child is THREE.Line => child instanceof THREE.Line).map((line) => {
          const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
          const projected = (index: number) => {
            const world = new THREE.Vector3().fromBufferAttribute(attribute, index);
            const screen = project(world);
            return { world: world.toArray(), x: Number(screen.x.toFixed(2)), y: Number(screen.y.toFixed(2)), z: Number(screen.z.toFixed(4)) };
          };
          const points = Array.from({ length: attribute.count }, (_unused, index) => projected(index));
          return {
            id: line.userData.edgeId as string | undefined,
            kind: line.userData.kind as string,
            source: line.userData.sourceId as string | undefined,
            target: line.userData.targetId as string | undefined,
            highlighted: Boolean(line.userData.highlighted),
            opacity: Number((line.material as THREE.LineBasicMaterial).opacity.toFixed(3)),
            points
          };
        }),
        overlayRects: () => pageOverlayRects(),
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
        layerState: () => ({ mix: Number(engine.layerMix.toFixed(3)), target: engine.layerTarget, from: engine.layerSwapFrom, started: engine.layerSwapStarted, reduced: engine.reduced }),
        beams: () => engine.currentBeams.map((beam) => ({ id: beam.id, kind: beam.kind, points: beam.points.length, nodeIds: beam.nodeIds ?? [], dimmed: Boolean(beam.dimmed) })),
        routeAnchors: () => engine.routeBands.map((band) => ({
          id: band.id,
          kind: band.kind,
          nodeIds: band.nodeIds,
          total: Number(band.total.toFixed(2)),
          stepDistance: Number(band.stepDistance.toFixed(2)),
          anchors: band.anchors.map((anchor, index) => {
            const screen = project(anchor);
            return { id: band.nodeIds[index], x: Number(screen.x.toFixed(1)), y: Number(screen.y.toFixed(1)) };
          })
        })),
        pulses: () => engine.routeBands.map((band) => {
          const metrics = { cumulative: band.cumulative, total: band.total, stepDistance: band.stepDistance, stepCount: band.anchors.length };
          const centers = staggeredWindowCenters(band.distance, metrics, 3);
          return {
            id: band.id,
            distance: Number(band.distance.toFixed(2)),
            total: Number(band.total.toFixed(2)),
            stepDistance: Number(band.stepDistance.toFixed(2)),
            centers,
            screens: centers.map((center) => {
              const world = pointAtRouteDistance(band.anchors.map((anchor, index) => ({ id: band.nodeIds[index] ?? String(index), x: anchor.x, y: anchor.y, z: anchor.z })), metrics, center);
              const screen = world ? project(world) : { x: 0, y: 0 };
              return { x: Number(screen.x.toFixed(1)), y: Number(screen.y.toFixed(1)) };
            })
          };
        }),
        pulsePaths: () => engine.routeBands.flatMap((band) => {
          const anchors = routeBandScreenAnchors(band);
          if (anchors.length < 2) return [];
          const metrics = { cumulative: band.cumulative, total: band.total, stepDistance: band.stepDistance, stepCount: band.anchors.length };
          return routeBandComets(band.distance, metrics, band.windowWorld, { count: 3 }).flatMap((comet) => {
            const points = routeBandPolyline(anchors, band.cumulative, comet.start, comet.end);
            const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
            const opacity = band.dimmed ? 0.38 : 1;
            return [
              { id: band.id, window: comet.window, layer: "halo", d, stroke: band.cometColor, width: "14/10", opacity },
              { id: band.id, window: comet.window, layer: "core", d, stroke: band.cometColor, width: "3", opacity }
            ];
          });
        }),
        routeBandOpacity: () => engine.routeBands.map((band) => ({
          id: band.id,
          track: propsRef.current.reducedMotion ? 0.20 : band.dimmed ? 0.12 : 0.30,
          glow: propsRef.current.reducedMotion ? 0.10 : band.dimmed ? 0.05 : 0.12
        })),
        routeBandStyle: () => engine.routeBands.map((band) => {
          const anchors = routeBandScreenAnchors(band);
          const metrics = { cumulative: band.cumulative, total: band.total, stepDistance: band.stepDistance, stepCount: band.anchors.length };
          const comets = anchors.length >= 2
            ? routeBandComets(band.distance, metrics, band.windowWorld, { count: 3 })
            : [];
          return {
            id: band.id,
            trackOpacity: propsRef.current.reducedMotion ? 0.20 : band.dimmed ? 0.12 : 0.30,
            trackWidth: "2",
            glowOpacity: propsRef.current.reducedMotion ? 0.10 : band.dimmed ? 0.05 : 0.12,
            glowWidth: "8",
            cometCoreWidth: "3",
            cometHaloWidth: "14/10",
            cometFilter: "canvas: multi-stroke glow",
            cometMask: "canvas: destination-out glyph holes",
            cometLengths: comets.map((comet) => {
              const points = routeBandPolyline(anchors, band.cumulative, comet.start, comet.end);
              let length = 0;
              for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
              return Math.round(length);
            }),
            color: band.color,
            cometColor: band.cometColor
          };
        }),
        cometGeometry: () => engine.routeBands.flatMap((band) => {
          const anchors = routeBandScreenAnchors(band);
          const metrics = { cumulative: band.cumulative, total: band.total, stepDistance: band.stepDistance, stepCount: band.anchors.length };
          if (anchors.length < 2) return [];
          return routeBandComets(band.distance, metrics, band.windowWorld, { count: 3 }).map((comet) => {
            const points = routeBandPolyline(anchors, band.cumulative, comet.start, comet.end);
            return {
              id: band.id,
              window: comet.window,
              d: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
              head: routeBandScreenPoint(anchors, band.cumulative, comet.head),
              tail: routeBandScreenPoint(anchors, band.cumulative, comet.tail),
              stops: cometGradientStops("core").map((stop) => ({
                offset: stop.offset,
                opacity: stop.opacity,
                color: band.cometColor
              }))
            };
          });
        }),
        routeBandColors: () => ({
          current: colors.routeTrack,
          comet: colors.routeComet,
          cometHead: colors.routeCometHead,
          preview: colors.previewTrack,
          previewComet: colors.previewComet,
          previewCometHead: colors.previewCometHead
        }),
        beamOffset: () => engine.beamGroup.position.toArray().map((value) => Number(value.toFixed(2))),
        setBeamVisible: (value: boolean) => { engine.beamGroup.visible = value; routeHost.style.display = value ? "" : "none"; },
        routeTextRects: () => routeTextRects.map((rect) => ({ ...rect })),
        drawTestComet: (x1: number, y1: number, x2: number, y2: number) => { engine.testComet = { x1, y1, x2, y2 }; },
        clearTestComet: () => { engine.testComet = null; },
        // Dev-only route injection: proves a route that contains cardless
        // capability / intermediate ids gets anchors without writing state.
        setRouteNodeIds: (ids: string[]) => {
          if (!engine.currentBeams.length) return;
          engine.currentBeams = [{ ...engine.currentBeams[0], nodeIds: [...ids], points: [] }];
          rebuildBeams();
        },
        setPreviewRouteNodeIds: (ids: string[]) => {
          if (!engine.currentBeams.length) return;
          engine.currentBeams = [
            { ...engine.currentBeams[0], nodeIds: [...engine.currentBeams[0].nodeIds ?? []], points: [] },
            { id: "dev-preview", kind: "preview", points: [], nodeIds: [...ids] }
          ];
          rebuildBeams();
        },
        capabilityEdges: () => engine.capabilityLines.map((capability) => {
          const source = nodeById(capability.source);
          const target = nodeById(capability.target);
          const sourceScreen = source ? project(nodeWorld(source)) : null;
          const targetScreen = target ? project(nodeWorld(target)) : null;
          return {
            id: capability.id,
            source: capability.source,
            target: capability.target,
            highlighted: capability.highlighted,
            linewidth: capability.material.linewidth,
            opacity: Number(capability.material.opacity.toFixed(3)),
            color: `#${capability.material.color.getHexString()}`,
            from: sourceScreen ? { x: Number(sourceScreen.x.toFixed(1)), y: Number(sourceScreen.y.toFixed(1)) } : null,
            to: targetScreen ? { x: Number(targetScreen.x.toFixed(1)), y: Number(targetScreen.y.toFixed(1)) } : null
          };
        }),
        occluderInfo: () => ({
          count: engine.occluders.length,
          rects: engine.occluders,
          uniforms: beamMaterialsRef.current.map((material) => {
            const uniforms = material.userData.occluderUniforms as { uOccluderCount: { value: number }; uOccluders: { value: THREE.Vector4[] } } | undefined;
            return uniforms ? { count: uniforms.uOccluderCount.value, first: uniforms.uOccluders.value[0]?.toArray(), injected: material.userData.occluderInjected } : null;
          })
        }),
        hover: () => engine.hover,
        colorOf: (id: string) => {
          const node = nodeById(id);
          return node ? { id: node.id, kind: node.kind, status: node.status ?? "", color: nodeColor(node) } : null;
        },
        nodeStates: () => engine.currentNodes.map((node) => ({
          id: node.id, title: node.title, kind: node.kind, status: node.status ?? "", dim: Boolean(node.dim), highlight: Boolean(node.highlight), selected: Boolean(node.selected)
        })),
        xray: () => {
          const info = engine.selected ? nodeScreenFor(engine.selected) : null;
          return info ? { id: info.node.id, x: Math.round(info.screen.x), y: Math.round(info.screen.y) } : null;
        },
        xraySegments: () => xrayFor()?.segments ?? [],
        xrayBlockedCards: () => [...engine.cards.values()].filter((card) => card.xrayBlocked).map((card) => ({
          id: card.node.id, kind: card.node.kind, opacity: Number(card.opacity.toFixed(3))
        })),
        labelBoxes: () => [...engine.labels.entries()].filter(([, element]) => Number(element.style.opacity) > 0.02).map(([id, element]) => {
          const rect = element.getBoundingClientRect();
          const host = hostEl.getBoundingClientRect();
          return { id, text: element.textContent, x: Number((rect.left - host.left).toFixed(1)), y: Number((rect.top - host.top).toFixed(1)), width: Number(rect.width.toFixed(1)), height: Number(rect.height.toFixed(1)) };
        }),
        pick: (x: number, y: number) => pickAt(x, y),
        nodeScreen: (id: string) => {
          const info = nodeScreenFor(id);
          return info ? {
            id: info.node.id,
            x: Number(info.screen.x.toFixed(1)),
            y: Number(info.screen.y.toFixed(1)),
            z: Number(info.screen.z.toFixed(3)),
            distance: Number(info.distance.toFixed(1))
          } : null;
        },
        nodeAlpha: (id: string) => {
          const index = engine.currentNodes.findIndex((node) => node.id === id);
          return index < 0 ? 0 : Number(renderedOpacity(index).toFixed(3));
        },
        beamWidths: () => beamMaterialsRef.current.map((material) => material.linewidth),
        pointAlphaOf: (id: string) => {
          const index = engine.currentNodes.findIndex((node) => node.id === id);
          return index < 0 ? 0 : Number((engine.pointAlpha[index] ?? 0).toFixed(3));
        },
        cardState: () => [...engine.cards.values()].map((card) => ({ id: card.node.id, kind: card.node.kind, op: Number(card.opacity.toFixed(2)), width: Number(card.width.toFixed(1)), height: Number(card.height.toFixed(1)), visible: card.object.visible })),
        cardsScreen: () => [...engine.cards.values()].filter((card) => card.object.visible && card.opacity > 0.1 && card.angle.dot < 0.72).map((card) => {
          const rect = rectForCard(card.node, card);
          return { id: card.node.id, kind: card.node.kind, ...rect, distance: Number(card.distance.toFixed(1)), opacity: Number(card.opacity.toFixed(2)), occluder: card.occluder.visible };
        }),
        capabilityOcclusion: () => {
          const cards = [...engine.cards.values()].filter((card) => card.object.visible && card.opacity > 0.1 && card.angle.dot < 0.72).map((card) => ({ card, rect: rectForCard(card.node, card) }));
          const covered: Array<{ id: string; x: number; y: number; distance: number }> = [];
          const uncovered: Array<{ id: string; x: number; y: number; distance: number; alpha: number }> = [];
          let inFrontIntersections = 0;
          engine.currentNodes.forEach((node, index) => {
            if (node.kind !== "capability") return;
            const info = nodeScreenFor(node.id);
            if (!info || info.screen.z > 1) return;
            const intersects = cards.filter(({ rect }) => info.screen.x >= rect.x && info.screen.x <= rect.x + rect.width && info.screen.y >= rect.y && info.screen.y <= rect.y + rect.height);
            const behind = intersects.filter(({ card }) => card.distance < info.distance - 3);
            if (behind.length) covered.push({ id: node.id, x: Number(info.screen.x.toFixed(1)), y: Number(info.screen.y.toFixed(1)), distance: Number(info.distance.toFixed(1)) });
            else {
              if (intersects.length) inFrontIntersections += 1;
              uncovered.push({ id: node.id, x: Number(info.screen.x.toFixed(1)), y: Number(info.screen.y.toFixed(1)), distance: Number(info.distance.toFixed(1)), alpha: Number((engine.pointAlpha[index] ?? 0).toFixed(3)) });
            }
          });
          return {
            coveredCount: covered.length,
            covered: covered.slice(0, 8),
            gapCount: uncovered.length,
            gapAlpha: uncovered.length ? [Math.min(...uncovered.map((item) => item.alpha)), Math.max(...uncovered.map((item) => item.alpha))] : [],
            inFrontIntersections,
            cards: cards.length
          };
        }
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
      engine.occluderGroup.clear();
      occluderGeometry.dispose();
      occluderMaterial.dispose();
      engine.chapters.forEach((runtime) => { cssScene.remove(runtime.panelObject, runtime.titleObject); runtime.panel.remove(); runtime.title.remove(); });
      engine.chapters.clear();
      engine.labels.forEach((element) => element.remove());
      engine.labels.clear();
      leaderSvg.remove();
      exEl.innerHTML = "";
      engine.edgeGroup.children.slice().forEach((child) => {
        if (child instanceof THREE.Line) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
      });
      engine.capabilityLines.forEach((capability) => { capability.line.geometry.dispose(); capability.material.dispose(); });
      engine.capabilityLines = [];
      routeHost.remove();
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
      api.animateCamera(engine.controls.target.clone().add(direction.setLength(zoomDistance(direction.length(), SCENE_CAMERA.zoomInFactor))), engine.controls.target.clone(), 260);
    },
    zoomOut: () => {
      const engine = runtimeRef.current;
      const api = apiRef.current;
      if (!engine || !api) return;
      const direction = engine.camera.position.clone().sub(engine.controls.target);
      api.animateCamera(engine.controls.target.clone().add(direction.setLength(zoomDistance(direction.length(), SCENE_CAMERA.zoomOutFactor))), engine.controls.target.clone(), 260);
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
      const distance = THREE.MathUtils.clamp(engine.fitDistance / Math.max(0.2, percent / 100), engine.minDistance, engine.controls.maxDistance);
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
    focusCapabilities: () => apiRef.current?.capPresetView(),
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
      const target = nodeWorldFor(node, layerOffsetsAt(engine.layerMix)).add(right.multiplyScalar(side / Math.max(0.0001, engine.height / (2 * distance * FOV_T))));
      api.animateCamera(target.clone().add(direction.multiplyScalar(distance)), target, 600);
    },
    reveal: (id: string) => {
      apiRef.current?.reveal(id);
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
    >
      <canvas ref={canvasRef} className="ef-imm-canvas" aria-hidden="true" />
      <div ref={labelsRef} className="ef-imm-tilt-labels" aria-hidden="true" />
      <div ref={exRef} className="ef-imm-tilt-ex" />
    </div>
  );
}

