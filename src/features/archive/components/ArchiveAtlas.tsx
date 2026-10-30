import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PersonAccent } from "@/features/profile/people/PeopleRepository";
import type { ArchiveEdge, ArchiveNode } from "../model/atlasModel";
import {
  boundsForIds,
  cameraPercent,
  fitCamera,
  MINE_LEFT_INSET,
  MINE_ZOOM_RATIO,
  panCamera,
  worldToScreen,
  zoomCamera,
  type AtlasCamera,
  type AtlasGroup,
  type AtlasLayout,
  type AtlasPoint,
  type AtlasViewport
} from "../model/atlasLayout";

export type AtlasFocusMode = "all" | "mine" | "search" | "course" | "draft" | "peer";
export type AtlasComparePerson = {
  id: string;
  name: string;
  accent: PersonAccent;
  color: string;
  nodeIds: ReadonlySet<string>;
};
export type ArchiveCameraTarget = {
  key: string;
  type: "all" | "mine" | "ids";
  ids?: readonly string[];
  padding?: number;
  maxScaleRatio?: number;
};

export type ArchiveAtlasHandle = {
  zoomBy: (factor: number) => void;
  fitAll: () => void;
  fitMine: () => void;
  fitIds: (ids: readonly string[], padding?: number) => void;
  fitNode: (id: string) => void;
};

export type ArchiveAtlasProps = {
  nodes: ArchiveNode[];
  edges: ArchiveEdge[];
  layout: AtlasLayout;
  cameraTarget?: ArchiveCameraTarget | null;
  focusMode: AtlasFocusMode;
  mineNodeIds: ReadonlySet<string>;
  selectedId?: string | null;
  hoveredId?: string | null;
  searchHitIds?: readonly string[];
  courseNodeIds?: ReadonlySet<string>;
  draftNodeIds?: ReadonlySet<string>;
  draftDepth?: ReadonlyMap<string, number>;
  comparePeople?: readonly AtlasComparePerson[];
  dimmed?: boolean;
  reducedMotion?: boolean;
  onCameraStateChange?: (percent: number) => void;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null, point?: AtlasPoint) => void;
  onViewportChange?: (viewport: AtlasViewport) => void;
  className?: string;
};

type TokenPalette = {
  ink: string; ink2: string; muted: string; line: string; lineStrong: string; surface: string;
  brand: string; brandInk: string; target: string; pending: string; acquired: string;
  me: string; orange: string; cyan: string; rose: string; neutral: string; edge: string;
  domain: string[];
};

function readPalette(): TokenPalette {
  if (typeof window === "undefined") {
    return {
      ink: "#0F172A", ink2: "#334155", muted: "#6B7280", line: "#E5E7EB", lineStrong: "#CBD5E1", surface: "#FFFFFF",
      brand: "#6D5DF6", brandInk: "#4338CA", target: "#22C55E", pending: "#9CA3AF", acquired: "#3B82F6",
      me: "#6D5DF6", orange: "#F59E0B", cyan: "#06B6D4", rose: "#EC4899", neutral: "#A7B0BF", edge: "#6F829B",
      domain: ["#E07A7A", "#E0A060", "#C9B24A", "#6FBF73", "#4FB8B0", "#8C7BE0"]
    };
  }
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: token("--ink", "#0F172A"), ink2: token("--ink-2", "#334155"), muted: token("--muted", "#6B7280"),
    line: token("--line", "#E5E7EB"), lineStrong: token("--line-strong", "#CBD5E1"), surface: token("--surface", "#FFFFFF"),
    brand: token("--brand", "#6D5DF6"), brandInk: token("--brand-ink", "#4338CA"), target: token("--target", "#22C55E"),
    pending: token("--pending", "#9CA3AF"), acquired: token("--acquired", "#3B82F6"), me: token("--p-me", "#6D5DF6"),
    orange: token("--p-orange", "#F59E0B"), cyan: token("--p-cyan", "#06B6D4"), rose: token("--p-rose", "#EC4899"),
    neutral: token("--pending", "#A7B0BF"), edge: "#6F829B",
    domain: [1, 2, 3, 4, 5, 6].map((index) => token(`--domain-${index}`, ["#E07A7A", "#E0A060", "#C9B24A", "#6FBF73", "#4FB8B0", "#8C7BE0"][index - 1]))
  };
}

function hexToRgb(color: string) {
  const normalized = color.trim();
  if (normalized.startsWith("#")) {
    const value = normalized.slice(1);
    const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value.slice(0, 6);
    const number = Number.parseInt(full, 16);
    if (Number.isFinite(number)) return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }
  const rgb = normalized.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return { r: 51, g: 65, b: 85 };
}

function rgba(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shade(color: string, amount: number) {
  const { r, g, b } = hexToRgb(color);
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return `rgb(${Math.round(r + (target - r) * ratio)}, ${Math.round(g + (target - g) * ratio)}, ${Math.round(b + (target - b) * ratio)})`;
}

function personColor(accent: PersonAccent, palette: TokenPalette) {
  if (accent === "orange") return palette.orange;
  if (accent === "cyan") return palette.cyan;
  if (accent === "rose") return palette.rose;
  return palette.me;
}

function nodeColor(node: ArchiveNode, palette: TokenPalette) {
  return node.domainColorIndex === null ? palette.neutral : palette.domain[node.domainColorIndex] ?? palette.neutral;
}

function nodeRadius(node: ArchiveNode, scale: number, allScale: number) {
  const zoom = Math.sqrt(Math.max(0.4, scale / Math.max(0.001, allScale)));
  return Math.min(10.2, Math.max(2.3, (3.8 + node.visualImportance * 5.2) * Math.min(1.5, zoom)));
}

function strokeStatusRing(ctx: CanvasRenderingContext2D, center: AtlasPoint, radius: number, node: ArchiveNode, palette: TokenPalette) {
  if (node.status === "learned") {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(palette.ink, 0.56);
    ctx.lineWidth = 1.35;
    ctx.stroke();
    return;
  }
  if (node.status === "mastered") {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(palette.target, 0.84);
    ctx.lineWidth = 1.7;
    ctx.stroke();
    return;
  }
  if (node.status === "learning" || node.status === "practicing") {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(palette.lineStrong, 0.78);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * (node.isCurrent ? 1 : 0.54));
    ctx.strokeStyle = node.isCurrent ? palette.brand : rgba(palette.brand, 0.82);
    ctx.lineWidth = node.isCurrent ? 2.2 : 1.8;
    ctx.stroke();
    return;
  }
  if (node.isMine) {
    // An owned but not started Knowledge is the learner's target.
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(palette.target, 0.62);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function drawArcRing(ctx: CanvasRenderingContext2D, center: AtlasPoint, radius: number, colors: string[], width = 2.8) {
  if (!colors.length) return;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = rgba("#0F172A", 0.42);
  ctx.lineWidth = width;
  ctx.stroke();
  const gap = colors.length > 1 ? 0.07 : 0;
  const part = Math.PI * 2 / colors.length;
  colors.forEach((color, index) => {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, -Math.PI / 2 + index * part + gap / 2, -Math.PI / 2 + (index + 1) * part - gap / 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  });
}

function drawNumberBadge(ctx: CanvasRenderingContext2D, point: AtlasPoint, index: number, palette: TokenPalette) {
  const label = String(index + 1).padStart(2, "0");
  const x = point.x + 11;
  const y = point.y - 12;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = palette.target;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = palette.target;
  ctx.font = "700 9px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 0.5);
}

type Box = { x: number; y: number; width: number; height: number };
type LabelCandidate = { node: ArchiveNode; point: AtlasPoint; radius: number; priority: number; preferred: "below" | "right" | "left" | "above" };

function labelBox(candidate: LabelCandidate, width: number, placement: LabelCandidate["preferred"]): Box {
  const { point, radius } = candidate;
  if (placement === "below") return { x: point.x - width / 2, y: point.y + radius + 8, width, height: 16 };
  if (placement === "above") return { x: point.x - width / 2, y: point.y - radius - 24, width, height: 16 };
  if (placement === "left") return { x: point.x - radius - 8 - width, y: point.y - 8, width, height: 16 };
  return { x: point.x + radius + 8, y: point.y - 8, width, height: 16 };
}

function overlaps(left: Box, right: Box) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function hashAlpha(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return 0.12 + (hash % 11) / 100;
}

function convexHull(points: AtlasPoint[]) {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (origin: AtlasPoint, a: AtlasPoint, b: AtlasPoint) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower: AtlasPoint[] = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: AtlasPoint[] = [];
  sorted.slice().reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function paddedHull(points: AtlasPoint[], pad = 18) {
  if (!points.length) return [];
  const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
  return convexHull(points).map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + dx / length * pad, y: point.y + dy / length * pad };
  });
}

function drawSmoothHull(ctx: CanvasRenderingContext2D, points: AtlasPoint[]) {
  if (points.length < 3) return;
  const middle = (left: AtlasPoint, right: AtlasPoint) => ({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 });
  const first = middle(points[points.length - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  points.forEach((point, index) => {
    const next = middle(point, points[(index + 1) % points.length]);
    ctx.quadraticCurveTo(point.x, point.y, next.x, next.y);
  });
  ctx.closePath();
}

export const ArchiveAtlas = forwardRef<ArchiveAtlasHandle, ArchiveAtlasProps>(function ArchiveAtlas({
  nodes, edges, layout, cameraTarget, focusMode, mineNodeIds, selectedId = null, hoveredId = null,
  searchHitIds = [], courseNodeIds, draftNodeIds, draftDepth, comparePeople = [], dimmed = false, reducedMotion = false,
  onCameraStateChange, onSelectNode, onHoverNode, onViewportChange, className = ""
}, forwardedRef) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteCacheRef = useRef(new Map<string, { canvas: HTMLCanvasElement; size: number }>());
  const [camera, setCamera] = useState<AtlasCamera>({ scale: 0.9, x: 0, y: 0 });
  const cameraRef = useRef(camera);
  const animationRef = useRef<number | null>(null);
  const activityTimerRef = useRef<number | null>(null);
  const cameraMovingRef = useRef(false);
  const dragRef = useRef<{ start: AtlasPoint; camera: AtlasCamera; moved: boolean; nodeId: string | null } | null>(null);
  const [viewport, setViewport] = useState<AtlasViewport>({ width: 1, height: 1 });
  const palette = useMemo(readPalette, []);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const groupTitleById = useMemo(() => {
    const titles = new Map<string, string>();
    nodes.forEach((node) => { if (node.domainId) titles.set(node.domainId, node.domainTitle); });
    return titles;
  }, [nodes]);
  const compareSets = useMemo(() => comparePeople.map((person) => ({ ...person, color: personColor(person.accent, palette) })), [comparePeople, palette]);

  cameraRef.current = camera;

  const stopAnimation = useCallback(() => {
    if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  const markCameraActivity = useCallback((active: boolean) => {
    if (cameraMovingRef.current === active) return;
    cameraMovingRef.current = active;
    const root = wrapperRef.current?.closest(".ef-archive");
    root?.classList.toggle("is-camera-moving", active);
  }, []);

  const emitCamera = useCallback((next: AtlasCamera) => {
    cameraRef.current = next;
    setCamera(next);
    markCameraActivity(true);
    if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current);
    activityTimerRef.current = window.setTimeout(() => { markCameraActivity(false); activityTimerRef.current = null; }, 280);
  }, [markCameraActivity]);

  const animateTo = useCallback((target: AtlasCamera) => {
    stopAnimation();
    const start = cameraRef.current;
    if (reducedMotion) { emitCamera(target); return; }
    if (Math.abs(start.scale - target.scale) < 0.0005 && Math.abs(start.x - target.x) < 0.5 && Math.abs(start.y - target.y) < 0.5) { emitCamera(target); return; }
    const started = performance.now();
    const duration = 260;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = {
        scale: start.scale + (target.scale - start.scale) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased
      };
      emitCamera(next);
      if (progress < 1) animationRef.current = requestAnimationFrame(tick);
      else animationRef.current = null;
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [emitCamera, reducedMotion, stopAnimation]);

  const fitIds = useCallback((ids: readonly string[], padding = 90) => {
    const bounds = boundsForIds(layout, ids, true);
    animateTo(fitCamera(bounds, viewport, padding));
  }, [animateTo, layout, viewport]);

  const fitAll = useCallback(() => animateTo(fitCamera(layout.bounds, viewport, 54)), [animateTo, layout, viewport]);
  const fitMine = useCallback(() => {
    if (!mineNodeIds.size) { fitAll(); return; }
    const allScale = fitCamera(layout.bounds, viewport, 54).scale;
    animateTo(fitCamera(boundsForIds(layout, mineNodeIds, true), viewport, Math.min(96, Math.max(52, Math.min(viewport.width, viewport.height) * 0.075)), allScale * MINE_ZOOM_RATIO, { left: MINE_LEFT_INSET }));
  }, [animateTo, fitAll, layout, mineNodeIds, viewport]);

  useImperativeHandle(forwardedRef, () => ({
    zoomBy: (factor: number) => emitCamera(zoomCamera(cameraRef.current, factor, { x: viewport.width / 2, y: viewport.height / 2 })),
    fitAll,
    fitMine,
    fitIds,
    fitNode: (id: string) => fitIds([id], Math.max(120, Math.min(viewport.width, viewport.height) * 0.22))
  }), [emitCamera, fitAll, fitIds, fitMine, viewport.height, viewport.width]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const resize = () => {
      const next = { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) };
      setViewport((current) => current.width === next.width && current.height === next.height ? current : next);
      onViewportChange?.(next);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onViewportChange]);

  // A camera target is presentation-only; it never recalculates node positions.
  const targetKey = cameraTarget?.key ?? "";
  useEffect(() => {
    if (!cameraTarget || viewport.width <= 1) return;
    const padding = cameraTarget.padding ?? 90;
    const allScale = fitCamera(layout.bounds, viewport, 54).scale;
    if (cameraTarget.type === "all") animateTo(fitCamera(layout.bounds, viewport, 54));
    else if (cameraTarget.type === "mine") {
      if (mineNodeIds.size) animateTo(fitCamera(boundsForIds(layout, mineNodeIds, true), viewport, padding, allScale * MINE_ZOOM_RATIO, { left: MINE_LEFT_INSET }));
      else animateTo(fitCamera(layout.bounds, viewport, 54));
    } else {
      animateTo(fitCamera(boundsForIds(layout, cameraTarget.ids ?? [], true), viewport, padding, cameraTarget.maxScaleRatio ? allScale * cameraTarget.maxScaleRatio : undefined));
    }
  }, [targetKey, viewport.width, viewport.height]);

  useEffect(() => () => {
    stopAnimation();
    if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current);
    markCameraActivity(false);
  }, [markCameraActivity, stopAnimation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width <= 1 || viewport.height <= 1) return;
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(viewport.width * dpr) || canvas.height !== Math.round(viewport.height * dpr)) {
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    const allCamera = fitCamera(layout.bounds, viewport, 54);
    const currentScale = camera.scale;
    const near = currentScale >= allCamera.scale * 1.05;
    const far = currentScale <= allCamera.scale * 1.02;
    const guest = mineNodeIds.size === 0;
    const hitSet = new Set(searchHitIds);
    const courseSet = courseNodeIds ?? new Set<string>();
    const draftSet = draftNodeIds ?? new Set<string>();
    const selected = selectedId ? nodeById.get(selectedId) : null;
    const focusedNodeId = selectedId ?? hoveredId;
    const strictFocus = focusMode === "search" || focusMode === "course" || focusMode === "draft";

    const alphaForNode = (node: ArchiveNode) => {
      if (dimmed) return node.isMine ? 0.2 : 0.12;
      if (selectedId && node.id === selectedId) return 1;
      if (hoveredId && node.id === hoveredId) return 1;
      if (focusMode === "search") return hitSet.has(node.id) ? 1 : 0.16;
      if (focusMode === "course") return courseSet.has(node.id) ? 1 : 0.12;
      if (focusMode === "draft") return draftSet.has(node.id) ? 1 : 0.12;
      if (focusMode === "peer") {
        const anyPeer = compareSets.some((person) => person.nodeIds.has(node.id));
        return anyPeer || node.isMine ? 0.98 : 0.14;
      }
      if (near) return node.isMine ? 1 : hashAlpha(node.id);
      if (far) return node.isMine ? 1 : 0.34;
      return node.isMine ? 1 : 0.48;
    };

    // Factual edges are curved and visible; nearby and focused facts stay
    // stronger while distant/context edges recede. No synthetic edge appears.
    edges.forEach((edge) => {
      const source = layout.positions[edge.source];
      const target = layout.positions[edge.target];
      if (!source || !target) return;
      const from = worldToScreen(camera, source);
      const to = worldToScreen(camera, target);
      if (Math.max(from.x, to.x) < -80 || Math.min(from.x, to.x) > viewport.width + 80 || Math.max(from.y, to.y) < -80 || Math.min(from.y, to.y) > viewport.height + 80) return;
      const incident = Boolean(focusedNodeId && (edge.source === focusedNodeId || edge.target === focusedNodeId));
      const mineEdge = mineNodeIds.has(edge.source) && mineNodeIds.has(edge.target);
      const oneMine = mineNodeIds.has(edge.source) || mineNodeIds.has(edge.target);
      let alpha = 0.12;
      if (selectedId) alpha = incident ? 0.58 : 0.05;
      else if (focusMode === "search") alpha = hitSet.has(edge.source) && hitSet.has(edge.target) ? 0.46 : 0.035;
      else if (focusMode === "course") alpha = courseSet.has(edge.source) && courseSet.has(edge.target) ? 0.44 : 0.03;
      else if (focusMode === "draft") alpha = draftSet.has(edge.source) && draftSet.has(edge.target) ? 0.42 : 0.03;
      else if (focusMode === "peer") alpha = oneMine || compareSets.some((person) => person.nodeIds.has(edge.source) || person.nodeIds.has(edge.target)) ? 0.32 : 0.08;
      else if (dimmed) alpha = 0.05;
      else if (near && !guest) alpha = mineEdge ? 0.58 : oneMine ? 0.32 : 0.07;
      else if (far) alpha = mineEdge ? 0.4 : oneMine ? 0.2 : 0.11;
      else alpha = guest ? 0.18 : oneMine ? 0.24 : 0.12;
      if (incident) alpha = Math.max(alpha, hoveredId && !selectedId ? 0.42 : 0.58);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const bend = Math.min(18, length * 0.055) * (edge.id.length % 2 ? 1 : -1);
      const control = { x: (from.x + to.x) / 2 - dy / length * bend, y: (from.y + to.y) / 2 + dx / length * bend };
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(control.x, control.y, to.x, to.y);
      context.strokeStyle = rgba(palette.edge, alpha);
      context.lineWidth = incident ? 1.5 : edge.strength === "hard" || edge.relation === "prerequisite" ? 1.1 : 0.85;
      context.stroke();
    });

    // Far camera: a dashed envelope names my subset without changing coordinates.
    let hullLabelBox: Box | null = null;
    const minePoints = far && !dimmed && mineNodeIds.size > 1
      ? [...mineNodeIds].flatMap((id) => layout.positions[id] ? [worldToScreen(camera, layout.positions[id])] : [])
      : [];
    if (minePoints.length > 2) {
      const hull = paddedHull(minePoints, 20);
      drawSmoothHull(context, hull);
      context.fillStyle = rgba(palette.brand, 0.055);
      context.fill();
      context.save();
      context.setLineDash([7, 6]);
      context.lineWidth = 1.5;
      context.strokeStyle = rgba(palette.brand, 0.58);
      context.stroke();
      context.restore();
      const top = hull.reduce((best, point) => point.y < best.y ? point : best, hull[0]);
      const label = `我的知识 ${mineNodeIds.size}`;
      context.font = "700 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      const width = context.measureText(label).width + 18;
      const x = Math.min(Math.max(8, top.x - width / 2), viewport.width - width - 8);
      const y = Math.max(8, top.y - 34);
      hullLabelBox = { x, y, width, height: 24 };
      context.fillStyle = rgba(palette.surface, 0.82);
      context.strokeStyle = rgba(palette.brand, 0.26);
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(x, y, width, 24, 12);
      context.fill();
      context.stroke();
      context.fillStyle = palette.brandInk;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, x + width / 2, y + 12.5);
    }

    // Far camera: a domain capsule sits at every cluster centroid.
    const accepted: Box[] = [];
    if (hullLabelBox) accepted.push(hullLabelBox);
    const domainCapsules: Array<{ box: Box; title: string; color: string }> = [];
    if (far && !dimmed && !strictFocus) {
      context.textBaseline = "middle";
      context.font = "600 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      layout.groups.forEach((group: AtlasGroup) => {
        if (!group.count) return;
        if (group.id === "__unclassified" && group.count < 2) return;
        const title = group.id === "__unclassified" ? "未分类" : groupTitleById.get(group.id) ?? "未分类";
        const anchor = worldToScreen(camera, { x: group.centroid.x, y: group.centroid.y - 18 / Math.max(0.3, currentScale) });
        const width = context.measureText(title).width + 26;
        const x = Math.min(Math.max(10, anchor.x - width / 2), viewport.width - width - 10);
        const y = Math.max(10, anchor.y);
        const box = { x, y, width, height: 22 };
        if (accepted.some((item) => overlaps(item, box))) return;
        accepted.push(box);
        const color = group.id === "__unclassified" ? palette.neutral : palette.domain[nodes.find((node) => node.domainId === group.id)?.domainColorIndex ?? 0] ?? palette.neutral;
        domainCapsules.push({ box, title, color });
      });
    }

    // Person segments and learner status rings live between edges and spheres.
    nodes.forEach((node) => {
      const point = layout.positions[node.id];
      if (!point) return;
      const screen = worldToScreen(camera, point);
      if (screen.x < -40 || screen.x > viewport.width + 40 || screen.y < -40 || screen.y > viewport.height + 40) return;
      const radius = nodeRadius(node, currentScale, allCamera.scale);
      const alpha = alphaForNode(node);
      const segments = compareSets.filter((person) => person.nodeIds.has(node.id)).map((person) => person.color);
      if (focusMode === "peer" && node.isMine) segments.unshift(palette.me);
      if (segments.length) drawArcRing(context, screen, radius + 5.4, segments, 3.2);
      if (node.isMine && !guest && !dimmed && alpha > 0.25) strokeStatusRing(context, screen, radius + 3.4, node, palette);
      if (node.isCurrent && node.isMine && !guest && !dimmed) {
        const halo = context.createRadialGradient(screen.x, screen.y, radius, screen.x, screen.y, radius * 2.8);
        halo.addColorStop(0, rgba(palette.brand, 0.26));
        halo.addColorStop(1, rgba(palette.brand, 0));
        context.beginPath();
        context.arc(screen.x, screen.y, radius * 2.8, 0, Math.PI * 2);
        context.fillStyle = halo;
        context.fill();
      }
      if (focusMode === "draft" && draftSet.has(node.id)) {
        const depth = draftDepth?.get(node.id) ?? 1;
        context.save();
        context.setLineDash([3, 3]);
        context.beginPath();
        context.arc(screen.x, screen.y, radius + 6.2, 0, Math.PI * 2);
        context.strokeStyle = rgba(palette.brand, Math.max(0.28, 0.9 - (depth - 1) * 0.22));
        context.lineWidth = 1.2;
        context.stroke();
        context.restore();
      }
      if (hitSet.has(node.id)) {
        context.beginPath();
        context.arc(screen.x, screen.y, radius + 5.5, 0, Math.PI * 2);
        context.strokeStyle = palette.target;
        context.lineWidth = 2;
        context.stroke();
      }
    });

    // Spheres are cached as small offscreen sprites per colour and radius
    // bucket. Drawing 300 sprites is far cheaper than 300 gradients + shadows
    // per frame, especially under software rasterisation.
    const sprites = spriteCacheRef.current;
    const spriteFor = (color: string, radius: number) => {
      const bucket = Math.round(radius * 2) / 2;
      const key = `${color}|${bucket}`;
      const cached = sprites.get(key);
      if (cached) return cached;
      const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
      const size = Math.ceil((bucket + 2) * 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      const sprite = canvas.getContext("2d");
      if (sprite) {
        sprite.scale(dpr, dpr);
        const center = size / 2;
        sprite.save();
        sprite.shadowColor = rgba(palette.ink, 0.2);
        sprite.shadowBlur = 2.4;
        sprite.shadowOffsetY = 1;
        sprite.beginPath();
        sprite.arc(center, center, bucket, 0, Math.PI * 2);
        sprite.fillStyle = color;
        sprite.fill();
        sprite.restore();
        const gradient = sprite.createRadialGradient(center - bucket * 0.36, center - bucket * 0.38, Math.max(0.4, bucket * 0.12), center, center, bucket * 1.06);
        gradient.addColorStop(0, shade(color, 0.42));
        gradient.addColorStop(0.48, color);
        gradient.addColorStop(1, shade(color, -0.3));
        sprite.beginPath();
        sprite.arc(center, center, bucket, 0, Math.PI * 2);
        sprite.fillStyle = gradient;
        sprite.fill();
        sprite.beginPath();
        sprite.arc(center, center, bucket, 0, Math.PI * 2);
        sprite.strokeStyle = rgba(palette.surface, 0.78);
        sprite.lineWidth = 0.9;
        sprite.stroke();
        sprite.beginPath();
        sprite.arc(center, center, bucket + 0.4, 0, Math.PI * 2);
        sprite.strokeStyle = rgba(palette.ink, 0.3);
        sprite.lineWidth = 0.6;
        sprite.stroke();
        sprite.beginPath();
        sprite.ellipse(center - bucket * 0.3, center - bucket * 0.34, bucket * 0.3, bucket * 0.2, -0.6, 0, Math.PI * 2);
        sprite.fillStyle = rgba(palette.surface, 0.28);
        sprite.fill();
      }
      const result = { canvas, size };
      sprites.set(key, result);
      return result;
    };
    nodes.forEach((node) => {
      const point = layout.positions[node.id];
      if (!point) return;
      const screen = worldToScreen(camera, point);
      if (screen.x < -30 || screen.x > viewport.width + 30 || screen.y < -30 || screen.y > viewport.height + 30) return;
      const radius = nodeRadius(node, currentScale, allCamera.scale);
      const alpha = alphaForNode(node);
      const sprite = spriteFor(nodeColor(node, palette), radius);
      context.globalAlpha = alpha;
      context.drawImage(sprite.canvas, screen.x - sprite.size / 2, screen.y - sprite.size / 2, sprite.size, sprite.size);
      context.globalAlpha = 1;
    });

    [hoveredId, selectedId].forEach((id, index) => {
      if (!id) return;
      const node = nodeById.get(id);
      const point = layout.positions[id];
      if (!node || !point) return;
      const screen = worldToScreen(camera, point);
      const radius = nodeRadius(node, currentScale, allCamera.scale);
      context.beginPath();
      context.arc(screen.x, screen.y, radius + (index === 1 ? 8 : 6), 0, Math.PI * 2);
      context.strokeStyle = rgba(index === 1 ? palette.brand : palette.ink, index === 1 ? 0.9 : 0.35);
      context.lineWidth = index === 1 ? 1.6 : 1;
      context.stroke();
    });

    if (searchHitIds.length) {
      searchHitIds.forEach((id, index) => {
        const point = layout.positions[id];
        if (!point) return;
        drawNumberBadge(context, worldToScreen(camera, point), index, palette);
      });
    }

    // Labels: my nodes first, then important context; overlapping labels are
    // culled deterministically. Near view shows only mine + key neighbours,
    // far view prefers domain capsules and my subset.
    const keyIds = new Set(nodes.filter((node) => !node.isMine).sort((left, right) => right.visualImportance - left.visualImportance || left.id.localeCompare(right.id)).slice(0, far ? 14 : 10).map((node) => node.id));
    const candidates: LabelCandidate[] = [];
    nodes.forEach((node) => {
      const point = layout.positions[node.id];
      if (!point) return;
      const screen = worldToScreen(camera, point);
      if (screen.x < 12 || screen.x > viewport.width - 12 || screen.y < 18 || screen.y > viewport.height - 18) return;
      const forced = hitSet.has(node.id) || node.id === selectedId || node.id === hoveredId || courseSet.has(node.id) || draftSet.has(node.id) || compareSets.some((person) => person.nodeIds.has(node.id));
      const focusMember = focusMode === "search" ? hitSet.has(node.id)
        : focusMode === "course" ? courseSet.has(node.id)
        : focusMode === "draft" ? draftSet.has(node.id)
        : focusMode === "peer" ? node.isMine || compareSets.some((person) => person.nodeIds.has(node.id))
        : true;
      if (!focusMember && !forced) return;
      const visible = forced || (near ? node.isMine || keyIds.has(node.id) : node.isMine || keyIds.has(node.id));
      if (!visible) return;
      let priority = 8 + node.visualImportance * 20;
      if (node.isMine) priority += near ? 46 : 30;
      if (keyIds.has(node.id)) priority += 12;
      if (hitSet.has(node.id)) priority += 80;
      if (node.id === selectedId) priority += 100;
      if (node.id === hoveredId) priority += 96;
      if (courseSet.has(node.id)) priority += 60;
      if (draftSet.has(node.id)) priority += 58;
      if (compareSets.some((person) => person.nodeIds.has(node.id))) priority += 36;
      candidates.push({ node, point: screen, radius: nodeRadius(node, currentScale, allCamera.scale), priority, preferred: node.isMine || forced ? "below" : "right" });
    });
    candidates.sort((left, right) => right.priority - left.priority || left.node.id.localeCompare(right.node.id));
    context.textBaseline = "middle";
    context.font = "600 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const limit = far ? 22 : 30;
    let drawn = 0;
    for (const candidate of candidates) {
      if (drawn >= limit) break;
      const width = Math.min(170, Math.max(34, context.measureText(candidate.node.title).width + 10));
      const placements: LabelCandidate["preferred"][] = candidate.preferred === "below" ? ["below", "above", "right", "left"] : ["right", "left", "below", "above"];
      let box: Box | null = null;
      let usedPlacement: LabelCandidate["preferred"] = candidate.preferred;
      for (const placement of placements) {
        const proposal = labelBox(candidate, width, placement);
        if (proposal.x < 4 || proposal.x + proposal.width > viewport.width - 4 || proposal.y < 4 || proposal.y + proposal.height > viewport.height - 4) continue;
        if (accepted.some((item) => overlaps(item, proposal))) continue;
        box = proposal;
        usedPlacement = placement;
        break;
      }
      if (!box) continue;
      accepted.push(box);
      const alpha = alphaForNode(candidate.node);
      const centered = usedPlacement === "below" || usedPlacement === "above";
      const x = centered ? box.x + box.width / 2 : box.x;
      const y = box.y + box.height / 2;
      context.textAlign = centered ? "center" : "left";
      context.font = `${candidate.node.id === selectedId ? 700 : 600} 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      context.lineWidth = 3;
      context.strokeStyle = rgba(palette.surface, Math.min(0.96, 0.55 + alpha * 0.45));
      context.strokeText(candidate.node.title, x, y);
      context.fillStyle = rgba(candidate.node.id === selectedId ? palette.brandInk : palette.ink, Math.min(1, alpha + 0.12));
      context.fillText(candidate.node.title, x, y);
      drawn += 1;
    }

    // Domain capsules are painted above spheres so the cluster name stays
    // legible; labels already reserved their boxes above.
    domainCapsules.forEach(({ box, title, color }) => {
      context.fillStyle = rgba(palette.surface, 0.78);
      context.strokeStyle = rgba(palette.lineStrong, 0.72);
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, 22, 11);
      context.fill();
      context.stroke();
      context.beginPath();
      context.arc(box.x + 10, box.y + 11, 3, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.fillStyle = palette.ink2;
      context.font = "600 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      context.textAlign = "left";
      context.fillText(title, box.x + 17, box.y + 11.5);
    });
  }, [camera, compareSets, courseNodeIds, dimmed, draftDepth, draftNodeIds, edges, focusMode, groupTitleById, hoveredId, layout, mineNodeIds, nodeById, nodes, palette, searchHitIds, selectedId, viewport]);

  const percentTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!onCameraStateChange || viewport.width <= 1) return;
    if (percentTimerRef.current) window.clearTimeout(percentTimerRef.current);
    percentTimerRef.current = window.setTimeout(() => {
      onCameraStateChange(cameraPercent(camera, fitCamera(layout.bounds, viewport, 54)));
      percentTimerRef.current = null;
    }, 360);
    return () => { if (percentTimerRef.current) { window.clearTimeout(percentTimerRef.current); percentTimerRef.current = null; } };
  }, [camera, layout.bounds, onCameraStateChange, viewport]);

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): AtlasPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const findNode = useCallback((point: AtlasPoint) => {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const allScale = fitCamera(layout.bounds, viewport, 54).scale;
    nodes.forEach((node) => {
      const world = layout.positions[node.id];
      if (!world) return;
      const screen = worldToScreen(camera, world);
      const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
      const radius = Math.max(9, nodeRadius(node, camera.scale, allScale) + 5);
      if (distance <= radius && distance < bestDistance) { bestId = node.id; bestDistance = distance; }
    });
    return bestId;
  }, [camera, layout, nodes, viewport]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const point = localPoint(event);
    const nodeId = findNode(point);
    dragRef.current = { start: point, camera, moved: false, nodeId };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!nodeId) event.currentTarget.style.cursor = "grabbing";
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event);
    const drag = dragRef.current;
    if (drag) {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.nodeId && drag.moved) emitCamera(panCamera(drag.camera, dx, dy));
      return;
    }
    const nodeId = findNode(point);
    onHoverNode(nodeId, point);
    event.currentTarget.style.cursor = nodeId ? "pointer" : "grab";
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grab";
    if (!drag || drag.moved) return;
    if (drag.nodeId) onSelectNode(drag.nodeId);
    else onSelectNode(null);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0014);
    emitCamera(zoomCamera(camera, factor, localPoint(event)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = 44;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); emitCamera(zoomCamera(camera, 1.2, { x: viewport.width / 2, y: viewport.height / 2 })); return; }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); emitCamera(zoomCamera(camera, 0.84, { x: viewport.width / 2, y: viewport.height / 2 })); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); emitCamera(panCamera(camera, step, 0)); return; }
    if (event.key === "ArrowRight") { event.preventDefault(); emitCamera(panCamera(camera, -step, 0)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); emitCamera(panCamera(camera, 0, step)); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); emitCamera(panCamera(camera, 0, -step)); return; }
    if (event.key === "0") { event.preventDefault(); fitAll(); return; }
    if (event.key.toLowerCase() === "m") { event.preventDefault(); fitMine(); return; }
    if (event.key === "Escape") { event.preventDefault(); onSelectNode(null); }
  };

  return (
    <div ref={wrapperRef} className={`ef-archive-atlas ${className}`.trim()} data-focus-mode={focusMode} data-dimmed={dimmed ? "true" : undefined}>
      <canvas
        ref={canvasRef}
        className="ef-archive-canvas"
        style={{ width: viewport.width, height: viewport.height }}
        role="application"
        tabIndex={0}
        aria-label="知识星图。使用加减号缩放，方向键平移，M 定位到我，0 查看全图。可按 L 打开可聚焦的知识列表。"
        aria-describedby="ef-archive-canvas-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { dragRef.current = null; onHoverNode(null); }}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onDoubleClick={(event) => { if (!findNode(localPoint(event))) fitAll(); }}
      />
      <span id="ef-archive-canvas-help" className="ef-sr-only">地图可拖动平移、滚轮或加减号缩放。所有知识节点与关系来自课程知识图谱，缩放不会重新布局。</span>
    </div>
  );
});
