import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Handle, MarkerType, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import "@xyflow/react/dist/style.css";
import { flowAdvance, simulationTrajectory, transformationCells, transformationEvents, type FlowDefinition, type MechanismAnswer, type MicroMechanism, type SimulationDefinition, type TransformationDefinition } from "@/shared/learning/microMechanisms";
import { TimelineControls, useTeachingTimeline } from "./TeachingTimeline";

type Props<T = MicroMechanism> = { definition: T; disabled: boolean; onAnswer(answer: MechanismAnswer): void };
function useReport(answer: MechanismAnswer, onAnswer: Props["onAnswer"]) {
  const handler = useRef(onAnswer); handler.current = onAnswer;
  const serialized = JSON.stringify(answer);
  useEffect(() => { handler.current(JSON.parse(serialized) as MechanismAnswer); }, [serialized]);
}
function Cue({ title, children }: { title: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.div className="micro-mechanism-cue" key={title} initial={{ x: reduced ? 0 : -12 }} animate={{ x: 0 }} transition={{ type: "spring", stiffness: 260, damping: 24 }} aria-live="polite"><strong>{title}</strong><span>{children}</span></motion.div>;
}
function FlowNode({ data }: NodeProps) {
  return <div className={`micro-execution-node ${data.active ? "active" : ""}`}><Handle type="target" position={Position.Left}/><strong>{String(data.label)}</strong>{data.active ? <small>当前执行</small> : null}<Handle type="source" position={Position.Right}/></div>;
}
const nodeTypes = { execution: FlowNode };
function FlowInteraction({ definition, disabled, onAnswer }: Props<FlowDefinition>) {
  const canvas=useRef<HTMLDivElement>(null),instance=useRef<{fitView(options:{padding:number;duration:number}):Promise<boolean>}|null>(null);
  useEffect(()=>{const element=canvas.current;if(!element)return;const observer=new ResizeObserver(()=>{void instance.current?.fitView({padding:.2,duration:0});});observer.observe(element);return()=>observer.disconnect();},[]);
  const [selectedEdges,setSelectedEdges]=useState<string[]>([]);
  const [edgeIds, setEdgeIds] = useState(definition.initialEdgeIds), [error, setError] = useState<string | null>(null);
  const firstBlocked = definition.events.findIndex((event) => event.edgeId && !edgeIds.includes(event.edgeId));
  const timeline = useTeachingTimeline(firstBlocked < 0 ? definition.events.length : firstBlocked, disabled);
  const event = definition.events[timeline.cursor - 1];
  const nodes = useMemo(() => definition.nodes.map((node) => ({ id: node.id, type: "execution", position: { x: node.x, y: node.y }, data: { label: node.label, active: event?.nodeId === node.id }, draggable: false })), [definition.nodes, event?.nodeId]);
  const edges = definition.edges.filter((edge) => edgeIds.includes(edge.id)).map((edge) => ({ id: edge.id, selected:selectedEdges.includes(edge.id), source: edge.from, target: edge.to, label: edge.label, animated: event?.edgeId === edge.id, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: event?.edgeId === edge.id ? "#596ce0" : "#9ba8bb", strokeWidth: event?.edgeId === edge.id ? 3 : 1.5 } }));
  useReport({ kind: "flow", edgeIds, executed: timeline.cursor }, onAnswer);
  const edit = (next: string[]) => { if(disabled)return; setSelectedEdges([]);timeline.reset(); setError(null); setEdgeIds(next); };
  const step = () => { const next = flowAdvance(definition, edgeIds, timeline.cursor); setError(next.error); if (!next.error) timeline.step(); };
  return <div className="micro-mechanism"><p className="micro-operation-help">从节点右侧端点拖到下一节点左侧端点连接；选中连线按 Backspace 删除。下方连接按钮也可用键盘操作。修改连接后从头执行。</p><div ref={canvas} className="micro-flow-canvas"><ReactFlow onInit={(flow)=>{instance.current=flow;}} nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={!disabled} elementsSelectable={!disabled} deleteKeyCode={disabled?null:["Backspace","Delete"]} onEdgesChange={(changes)=>setSelectedEdges((current)=>changes.reduce((ids,change)=>change.type==="select"?change.selected?[...ids,change.id]:ids.filter((id)=>id!==change.id):ids,current))} onConnect={({ source, target }) => { const edge = definition.edges.find((item) => item.from === source && item.to === target); if (!edge) { setError("此连接没有当前示例需要传递的数据。请参考讲解中的消息方向。"); return; } edit([...new Set([...edgeIds, edge.id])]); }} onEdgesDelete={(deleted) => edit(edgeIds.filter((id) => !deleted.some((edge) => edge.id === id)))} fitView fitViewOptions={{ padding: .2 }} minZoom={.3} maxZoom={1.5} proOptions={{ hideAttribution: true }}><Background gap={18}/></ReactFlow></div><div className="micro-flow-connections" aria-label="流程连接"><button type="button" onClick={()=>void instance.current?.fitView({padding:.2,duration:0})}>适应画布 Fit</button>{definition.edges.map((edge) => <button type="button" key={edge.id} disabled={disabled} aria-pressed={edgeIds.includes(edge.id)} onClick={() => edit(edgeIds.includes(edge.id) ? edgeIds.filter((id) => id !== edge.id) : [...edgeIds, edge.id])}>{edgeIds.includes(edge.id) ? "断开" : "连接"} {edge.label}</button>)}</div><TimelineControls timeline={timeline} length={definition.events.length} disabled={disabled} onStep={step} onReset={() => { edit(definition.initialEdgeIds); }}/>{error ? <div className="micro-mechanism-error" role="alert">{error}</div> : null}{event ? <Cue title={event.title}>{event.message}<br/>{event.explanation}</Cue> : <Cue title="准备执行">点击单步，观察当前节点、流动连线和消息；播放可连续执行。</Cue>}{firstBlocked >= 0 && timeline.cursor === firstBlocked ? <div className="micro-mechanism-error" role="status">{flowAdvance(definition, edgeIds, timeline.cursor).error}</div> : null}</div>;
}
function SimulationInteraction({ definition, disabled, onAnswer }: Props<SimulationDefinition>) {
  const reduced = useReducedMotion();
  const [parameter, setParameter] = useState(definition.parameter.initial);
  const result = useMemo(() => simulationTrajectory(definition, parameter), [definition, parameter]);
  const timeline = useTeachingTimeline(result.trajectory.length, disabled);
  const visible = result.trajectory.slice(0, Math.max(1, timeline.cursor));
  const current = visible[visible.length - 1];
  const scale = Math.max(...visible.map((point) => Math.abs(point.value - definition.model.optimum)), 1);
  const x = (index: number) => 30 + index / definition.model.steps * 500;
  const y = (value: number) => 110 - (value - definition.model.optimum) / scale * 85;
  const display = (value: number) => Math.abs(value) >= 10000 ? value.toExponential(2) : Number(value.toFixed(4)).toString();
  useReport({ kind: "simulation", parameter, executed: timeline.cursor }, onAnswer);
  return <div className="micro-mechanism"><label className="micro-simulation-parameter"><span>{definition.parameter.label} η <strong>{parameter}</strong></span><input type="range" disabled={disabled} {...definition.parameter} value={parameter} onChange={(event) => { timeline.reset(); setParameter(Number(event.target.value)); }}/></label><p className="micro-formula">C(θ) = {definition.model.curvature} / 2 × (θ − {definition.model.optimum})² · θ₀ = {definition.model.initial}<br/>∇C = {definition.model.curvature} × (θ − {definition.model.optimum}) · θ下一步 = θ − η × ∇C</p><svg className="micro-trajectory" viewBox="0 0 560 240" role="img" aria-label="参数更新轨迹：横轴更新次数，纵轴参数 θ；虚线为最小值位置"><line x1="30" y1="110" x2="530" y2="110" stroke="#94a3b8" strokeDasharray="5 5"/><text x="30" y="20">θ（纵轴自动缩放 ±{display(scale)}）</text><text x="380" y="232">更新次数 0 → {definition.model.steps}</text><motion.polyline points={visible.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} fill="none" stroke="#6171d8" strokeWidth="3"/>{visible.map((point) => <circle key={point.index} cx={x(point.index)} cy={y(point.value)} r={3} fill="#6171d8"/>)}<motion.circle animate={{cx:x(current.index),cy:y(current.value)}} transition={{duration:reduced?0:.55}} r={6} fill="#e58a3d"/><text x="425" y="102">最小值 θ={definition.model.optimum}</text></svg><div className="micro-derived-values"><span>θ <strong>{display(current.value)}</strong></span><span>梯度 <strong>{display(current.gradient)}</strong></span><span>下一步更新 Δθ <strong>{display(current.delta)}</strong></span><span>Loss <strong>{display(current.loss)}</strong></span></div><TimelineControls timeline={timeline} length={result.trajectory.length} disabled={disabled} onReset={() => { timeline.reset(); setParameter(definition.parameter.initial); }}/><Cue title={`第 ${current.index} 次更新`}>{timeline.cursor < 2 ? "先观察初始参数与梯度，再单步看 −η × 梯度如何改变参数。" : current.loss > visible[0].loss ? "跨过最小值后距离更远了：梯度和更新幅度一起放大，Loss 上升。" : result.oscillating ? "参数跨过最小值后改变方向。比较摆动幅度：衰减才会收敛，增大则发散。" : "朝最小值移动时，误差和梯度变小，下一步更新也随之减小。"}</Cue>{definition.mode === "challenge" ? <p className="micro-operation-help">目标：{definition.model.steps} 次更新后 Loss ≤ {definition.target.maxLoss}，过程中 Loss 不超过初始值的 {definition.target.maxGrowth} 倍。</p> : null}</div>;
}
function TransformationInteraction({ definition, disabled, onAnswer }: Props<TransformationDefinition>) {
  const reduced = useReducedMotion();
  const events = useMemo(() => transformationEvents(definition), [definition]);
  const timeline = useTeachingTimeline(events.length, disabled);
  const [error, setError] = useState<string | null>(null);
  const cells = transformationCells(definition, timeline.cursor), event = events[timeline.cursor], previous = events[timeline.cursor - 1], size = definition.vocabulary.length;
  useReport({ kind: "transformation", cells, executed: timeline.cursor }, onAnswer);
  return <div className="micro-mechanism"><p className="micro-operation-help">窗口：中心词左、右各 {definition.window} 个词；不跨句。橙色是中心词，紫色是它当前的上下文词。点击对应的「行→列」单元格计数。</p><div className="micro-token-corpus">{definition.corpus.map((sentence, sentenceIndex) => <div key={sentenceIndex}>{sentence.map((token, index) => <span key={index} className={event?.sentenceIndex === sentenceIndex ? index === event.index ? "center" : index === event.contextIndex ? "context" : "" : ""}>{token}</span>)}<small>句 {sentenceIndex + 1}</small></div>)}</div><div className="micro-matrix-scroll"><table className="micro-count-matrix"><caption>行 = 中心词 · 列 = 上下文词</caption><thead><tr><th>↓ 中心 / 上下文 →</th>{definition.vocabulary.map((word) => <th key={word}>{word}</th>)}</tr></thead><tbody>{definition.vocabulary.map((word, row) => <tr key={word}><th>{word}</th>{definition.vocabulary.map((context, column) => { const index = row * size + column; return <td key={context}><motion.button type="button" disabled={disabled || !event || timeline.playing} aria-label={`${word} → ${context}: ${cells[index]}`} animate={{ backgroundColor: cells[index] ? `rgba(101,112,214,${Math.min(.15 + cells[index] * .18, .85)})` : "#f7f9fc", scale: !reduced && previous?.cell === index ? [1, 1.09, 1] : 1 }} onClick={() => { if (event.cell !== index) { setError(`当前中心词是「${event.center}」，应找它的行；窗口内上下文是「${event.context}」，应找它的列。「${word} → ${context}」不是当前事件，不计数。`); return; } setError(null); timeline.step(); }}>{cells[index]}</motion.button></td>; })}</tr>)}</tbody></table></div>{error ? <div className="micro-mechanism-error" role="alert">{error}</div> : null}{definition.mode === "explore" ? <TimelineControls timeline={timeline} length={events.length} disabled={disabled} onReset={() => { timeline.reset(); setError(null); }}/> : <div className="micro-timeline-controls"><button type="button" disabled={disabled} onClick={() => { timeline.reset(); setError(null); }}>重置 Reset</button><span>{timeline.cursor} / {events.length} 个事件</span></div>}<Cue title={event ? `当前事件：${event.center} → ${event.context}` : "所有窗口事件已计数"}>{event ? "找到中心词所在行与上下文词所在列的交叉点，点击后该计数增加 1。反方向事件会单独出现，因此左右窗口最终产生对称计数。" : "每行是该词的上下文分布。同一个词多次遇到某个邻居，那个维度的计数就更大；这为词向量提供了数据表示。"}</Cue></div>;
}
export default function MechanismInteraction(props: Props) {
  if (props.definition.type === "flow-execution") return <FlowInteraction {...props} definition={props.definition}/>;
  if (props.definition.type === "simulation") return <SimulationInteraction {...props} definition={props.definition}/>;
  return <TransformationInteraction {...props} definition={props.definition}/>;
}
