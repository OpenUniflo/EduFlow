import { BookOpen } from "lucide-react";
import type { MicroLearningPath, MicroPathProgress } from "@/features/learning/micro/microLearning";
import { ConversationCard } from "@/shared/ui/Conversation";
import { ObjectShell } from "@/shared/ui/ObjectShell";
import { Pill } from "@/shared/ui/Pill";

/** S card for a real in-progress micro path inside the conversation. */
export function ConversationMicroCard({ path, progress, currentUnitId, completeSteps, totalSteps, onOpen }: {
  path: MicroLearningPath;
  progress: MicroPathProgress;
  currentUnitId?: string;
  completeSteps: number;
  totalSteps: number;
  onOpen(): void;
}) {
  const unitIndex = Math.max(0, path.units.findIndex((unit) => unit.id === currentUnitId));
  const unit = path.units[unitIndex];
  const percent = totalSteps ? Math.round(completeSteps / totalSteps * 100) : 0;
  return <ConversationCard size="s" label={`小练习进行中 ${path.title}`}>
    <ObjectShell
      size="s"
      icon={<BookOpen size={15} />}
      kicker="小练习 · 进行中"
      title={path.title}
      badge={<Pill tone="brand" dot>进行中</Pill>}
      context={<span>第 {unitIndex + 1} / {path.units.length} 单元 · 约 {path.estimatedMinutes} 分钟</span>}
      footer={<div className="ef-home-micro-foot"><span>{completeSteps} / {totalSteps} 步已完成</span><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onOpen}>继续</button></div>}
    >
      <div className="ef-home-micro-s">
        <div className="ef-home-micro-s-progress" aria-label={`${percent}%`}><i style={{ width: `${percent}%` }} /></div>
        <p><strong>{unit?.title ?? "当前单元"}</strong><span>{completeSteps} / {totalSteps} 步</span></p>
      </div>
    </ObjectShell>
  </ConversationCard>;
}
