import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, useReducedMotion } from "motion/react";
import type { NativeMicroInteraction } from "@/shared/learning/nativeMicroInteraction";

function SortableCard({ id, disabled }: { id: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id, disabled });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .3 : 1 }} className={`micro-spatial-card ${isOver ? "insertion" : ""}`}><button type="button" disabled={disabled} {...attributes} {...listeners} aria-label={`拖动 ${id}`} className="micro-spatial-handle">⠿</button><span>{id}</span></div>;
}
export function OrderingInteraction({ value, disabled, onChange }: { value: string[]; disabled: boolean; onChange(value: string[]): void }) {
  const [active, setActive] = useState<string | null>(null);
  const reduced=useReducedMotion();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return <div className="micro-spatial"><p className="micro-operation-help">拖动把手调整顺序。键盘：聚焦把手，空格抓取，方向键移动，空格放下，Esc 取消。</p><DndContext sensors={sensors} collisionDetection={(args)=>args.pointerCoordinates?pointerWithin(args):closestCenter(args)} onDragStart={({ active }) => setActive(String(active.id))} onDragCancel={() => setActive(null)} onDragEnd={({ active, over }) => { setActive(null); if (over && active.id !== over.id) onChange(arrayMove(value, value.indexOf(String(active.id)), value.indexOf(String(over.id)))); }}><SortableContext items={value} strategy={verticalListSortingStrategy}><div className="micro-spatial-order">{value.map((item) => <SortableCard key={item} id={item} disabled={disabled}/>)}</div></SortableContext><DragOverlay dropAnimation={reduced?null:{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>{active ? <div className="micro-spatial-card overlay">⠿ {active}</div> : null}</DragOverlay></DndContext></div>;
}
function DraggableCard({ id, label, selected, disabled, onSelect }: { id: string; label: string; selected: boolean; disabled: boolean; onSelect(): void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, disabled });
  const reduced = useReducedMotion();
  return <motion.div layout={!reduced} transition={{ type: "spring", stiffness: 320, damping: 28 }} ref={setNodeRef} style={{ opacity: isDragging ? .2 : 1 }} className={`micro-spatial-card ${selected ? "selected" : ""}`}><button type="button" className="micro-spatial-handle" disabled={disabled} {...attributes} {...listeners} aria-label={`拖动 ${label}`}>⠿</button><button type="button" disabled={disabled} aria-pressed={selected} onClick={onSelect}>{label}</button></motion.div>;
}
function Zone({ id, title, children, disabled, onPlace }: { id: string; title: string; children: React.ReactNode; disabled: boolean; onPlace(): void }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return <section ref={setNodeRef} className={`micro-spatial-zone ${isOver ? "over" : ""}`}><button type="button" disabled={disabled} className="micro-zone-title" onClick={onPlace}>{title}</button><div>{children}</div></section>;
}
export function CategorizeInteraction({ definition, value, disabled, onChange }: { definition: Extract<NativeMicroInteraction, { type: "categorize" }>; value: string[]; disabled: boolean; onChange(value: string[]): void }) {
  const reduced=useReducedMotion();
  const [active, setActive] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null), [notice, setNotice] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const place = (id: string | null, category: string) => {
    if (!id || disabled) return;
    const index = definition.items.findIndex((item) => item.id === id); if (index < 0) return;
    const next = definition.items.map((_, index) => value[index] ?? ""); next[index] = category; onChange(next); setSelected(null); setNotice(`「${definition.items[index].label}」已放入「${category || "待分类"}」。检查答案后可根据反馈调整。`);
  };
  const end = ({ active, over }: DragEndEvent) => { setActive(null); if (!over) { setNotice("已返回原位：请放入一个分类区域。"); return; } place(definition.items[Number(String(active.id).slice(5))]?.id??null, zones[Number(String(over.id).slice(5))]??""); };
  const zones = ["", ...definition.categories];
  return <div className="micro-spatial"><p className="micro-operation-help">把卡片拖进分类区域。键盘或点击：先选择卡片，再点击目标分类标题；点「待分类」可退回。</p><DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={({ active }) => setActive(String(active.id))} onDragEnd={end} onDragCancel={() => { setActive(null); setNotice("拖动已取消，卡片保持原位。"); }}><div className="micro-spatial-zones">{zones.map((category,zoneIndex) => <Zone key={category} id={`zone:${zoneIndex}`} title={category || "待分类"} disabled={disabled} onPlace={() => place(selected, category)}>{definition.items.filter((_, index) => (value[index] ?? "") === category).map((item) => <DraggableCard key={item.id} id={`item:${definition.items.indexOf(item)}`} label={item.label} selected={selected === item.id} disabled={disabled} onSelect={() => setSelected(item.id)}/>)}</Zone>)}</div><DragOverlay dropAnimation={reduced?null:undefined}>{active ? <div className="micro-spatial-card overlay">{definition.items[Number(active.slice(5))]?.label}</div> : null}</DragOverlay></DndContext><p role="status" className="micro-operation-help">{notice}</p></div>;
}
