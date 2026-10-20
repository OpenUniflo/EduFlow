import { createContext, useContext, useEffect } from "react";
import { BaseEdge, NodeToolbar, EdgeLabelRenderer, Handle, Position, getSmoothStepPath, type EdgeProps, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { nodeTypeLabel } from "../../domain/v2/authoring";
import { Bot, Check, GitBranch, Hammer, Play, Braces, ArrowRight, Route, GitFork, Combine, Send, Boxes, Code2 } from "lucide-react";
import type { WorkflowPortPlacement, WorkflowRouting } from "../../domain/v2/types";
import { automaticRouteCorridor, routeEntersConnectedNode, type NodeBounds } from "./routing";
import { canvasPortSignature } from "./portReadiness";

export type CanvasNode = Node<{ label: string; type: string; active: boolean; failed?: boolean; status?: string; onConfigure?: () => void; onDelete?: () => void; onPortsReady?: (id: string, signature: string) => void; outlets: string[]; sources?: Record<string, WorkflowPortPlacement>; targets?: { id: string; placement?: WorkflowPortPlacement }[] }>;
const positions = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };
function handleStyle(placement: WorkflowPortPlacement) { return placement.side === "top" || placement.side === "bottom" ? { left: `${placement.offset * 100}%` } : { top: `${placement.offset * 100}%` }; }
const icons = { "core.start": Play, "core.end": Check, "core.llm": Bot, "core.router": GitBranch, "core.tool": Hammer, "core.tool_dispatch": Route, "core.transform": Braces, "core.function":Code2, "core.subgraph":Boxes, "control.fork":GitFork, "control.join":Combine, "control.send":Send };
export function WorkflowNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const updateInternals = useUpdateNodeInternals();
  const portSignature = canvasPortSignature(data);
  const onPortsReady = data.onPortsReady;
  useEffect(() => {
    updateInternals(id);
    // The SDK schedules its handle measurement in the first animation frame.
    const frame = requestAnimationFrame(() => onPortsReady?.(id, portSignature));
    return () => cancelAnimationFrame(frame);
  }, [id,portSignature,updateInternals,onPortsReady]);
  const Icon = icons[data.type as keyof typeof icons] ?? Braces;
  return <><NodeToolbar isVisible={selected && Boolean(data.onConfigure)} position={Position.Top}><div className="wf-node-toolbar"><button onClick={data.onConfigure}>配置</button>{data.onDelete?<button onClick={data.onDelete}>删除</button>:null}</div></NodeToolbar><div className={`wf-v2-node ${selected ? "selected" : ""} ${data.active ? "running" : ""} ${data.failed ? "failed" : ""} ${data.status === "cancelled" ? "cancelled" : data.status === "interrupted" ? "interrupted" : data.status === "waiting" ? "waiting" : ""}`} data-kind={data.type.split(".")[1]}><div className="wf-node-orb"><Icon size={34} aria-hidden="true" /></div><strong>{data.label}</strong><small>{({"core.start":"入口","core.end":"结束","core.llm":"模型","core.router":"条件分支","core.tool":"工具 / 函数","core.tool_dispatch":"工具执行","core.transform":"数据处理"})[data.type] ?? nodeTypeLabel(data.type) ?? data.type}</small>{data.type !== "core.start" && !data.targets?.length ? <Handle id="input" type="target" position={Position.Left} aria-label={`${data.label} 输入端口`} /> : null}{data.targets?.map(target => { const placement = target.placement ?? { side: "left", offset: .5 }; return <Handle key={target.id} id={`target-${target.id}`} type="target" position={positions[placement.side]} style={handleStyle(placement)} aria-label={`${data.label} 已连接入口`} />; })}{data.outlets.map((outlet,index) => { const placement = data.sources?.[outlet] ?? { side: "right", offset: (index + 1) / (data.outlets.length + 1) }; return <Handle key={outlet} id={outlet} type="source" position={positions[placement.side]} style={handleStyle(placement)} aria-label={`${data.label} ${outlet} 输出端口`} />; })}{data.outlets.length > 1 ? <div className="wf-node-branches">{data.outlets.map(outlet => <span key={outlet}><ArrowRight size={12} />{outlet === "default" ? "否则" : outlet === "has_calls" ? "有工具调用" : outlet}</span>)}</div> : null}{data.status === "cancelled" ? <span className="wf-node-status">已取消</span> : data.status === "interrupted" ? <span className="wf-node-status">执行中断</span> : data.status === "waiting" ? <span className="wf-node-status">等待回应</span> : data.active ? <span className="wf-node-status">执行中</span> : data.failed ? <span className="wf-node-status">失败</span> : data.status === "completed" ? <span className="wf-node-status">已执行</span> : null}</div></>;
}
export const EdgeEditingContext = createContext<(id: string, point: { x: number; y: number }, index: number, phase: "move" | "end") => void>(() => undefined);
export function WorkflowEdge(props: EdgeProps) {
  const editing = useContext(EdgeEditingContext);
  const routing = props.data?.routing as WorkflowRouting | undefined;
  const points = routing?.mode === "manual" ? routing.points ?? [] : [];
  const bounds = [props.data?.sourceBounds, props.data?.targetBounds].filter(Boolean) as NodeBounds[];
  const automatic = getSmoothStepPath({ ...props, ...automaticRouteCorridor({ x: props.sourceX, y: props.sourceY }, { x: props.targetX, y: props.targetY }, props.sourcePosition, props.targetPosition, bounds), borderRadius: 14 });
  const all = [{ x: props.sourceX, y: props.sourceY }, ...points, { x: props.targetX, y: props.targetY }];
  const invalidRoute = Boolean(points.length && routeEntersConnectedNode(all, bounds));
  const path = points.length && !invalidRoute ? all.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ") : automatic[0];
  const labelX = !invalidRoute && points[0]?.x !== undefined ? points[0].x : automatic[1]; const labelY = !invalidRoute && points[0]?.y !== undefined ? points[0].y : automatic[2];
  return <><BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={28} style={{ ...props.style, strokeWidth: props.selected ? 3 : 2 }} /><EdgeLabelRenderer>{props.label || invalidRoute ? <span role={invalidRoute ? "status" : undefined} title={invalidRoute ? "控制点或线段进入相连节点，当前显示已回退为自动走线；请调整控制点或恢复自动走线。" : undefined} className={`wf-edge-label ${props.selected ? "selected" : ""} ${invalidRoute ? "routing-warning" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 14}px)` }}>{invalidRoute ? "路径已自动调整" : props.label}</span> : null}{props.selected ? (points.length ? points : [{ x: automatic[1], y: automatic[2] }]).map((point,index) => <button key={index} className="nodrag nopan wf-edge-control" aria-label={`调整连线控制点 ${index + 1}`} style={{ transform: `translate(-50%, -50%) translate(${point.x}px,${point.y}px)` }} onKeyDown={event => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }; const delta = moves[event.key]; if (!delta) return;
    event.preventDefault(); event.stopPropagation(); const distance = event.shiftKey ? 1 : 10; editing(props.id, { x: point.x + delta[0] * distance, y: point.y + delta[1] * distance }, index, "end");
  }} onPointerDown={event => {
    event.preventDefault(); event.stopPropagation(); const start = { x: event.clientX, y: event.clientY }; const zoom = Number(props.data?.zoom ?? 1);
    const move = (next: PointerEvent) => editing(props.id, { x: point.x + (next.clientX - start.x) / zoom, y: point.y + (next.clientY - start.y) / zoom }, index, "move");
    const end = (next: PointerEvent) => { editing(props.id, { x: point.x + (next.clientX - start.x) / zoom, y: point.y + (next.clientY - start.y) / zoom }, index, "end"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  }}>↔</button>) : null}</EdgeLabelRenderer></>;
}
