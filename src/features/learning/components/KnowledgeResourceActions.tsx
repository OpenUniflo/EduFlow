import { BookOpen, Sparkles, Workflow } from "lucide-react";
import { useState } from "react";
import type { KnowledgeAssignmentResource, KnowledgeLearningContext, KnowledgeMaterialResource } from "@/features/learning/resources/knowledgeLearningResources";

const microAction = { not_started: "开始", in_progress: "继续", completed: "查看" } as const;
const microState = { not_started: "未开始", in_progress: "进行中", completed: "已完成" } as const;

export function KnowledgeResourceActions({ context, onMicro, onMaterial, onAssignment }: {
  context: KnowledgeLearningContext;
  onMicro(): void;
  onMaterial(resource: KnowledgeMaterialResource): void;
  onAssignment(resource: KnowledgeAssignmentResource): void;
}) {
  const [chooser, setChooser] = useState<"materials" | "assignments" | null>(null);
  const chooseMaterial = () => context.materials.length === 1 ? onMaterial(context.materials[0]) : setChooser("materials");
  const chooseAssignment = () => context.assignments.length === 1 ? onAssignment(context.assignments[0]) : setChooser("assignments");
  return <div className="learning-resource-grid">
    <section><span><Sparkles size={16}/>微学习</span><strong>{context.micro.available ? `${context.micro.path!.estimatedMinutes} min · ${microState[context.micro.progressStatus]}` : "暂无"}</strong><button disabled={!context.micro.available} onClick={onMicro}>{context.micro.available ? microAction[context.micro.progressStatus] : "暂无微学习"}</button></section>
    <section><span><BookOpen size={16}/>课件</span><strong>{context.materials.length ? `${context.materials.length} 个` : "暂无"}</strong><button disabled={!context.materials.length} onClick={chooseMaterial}>{context.materials.length > 1 ? "选择课件" : context.materials.length ? "查看课件" : "暂无课件"}</button></section>
    <section><span><Workflow size={16}/>实训</span><strong>{context.assignments.length ? `${context.assignments.length} 项` : "暂无"}</strong><button disabled={!context.assignments.length} onClick={chooseAssignment}>{context.assignments.length > 1 ? "选择实训" : context.assignments.length ? "开始 / 继续" : "暂无实训"}</button></section>
    {chooser ? <div className="knowledge-resource-chooser" role="dialog" aria-modal="true" aria-label={chooser === "materials" ? "选择课件" : "选择实训"}>
      <header><strong>{chooser === "materials" ? "选择课件" : "选择实训"}</strong><button onClick={() => setChooser(null)}>关闭</button></header>
      {chooser === "materials" ? context.materials.map((resource) => <button key={resource.materialId} onClick={() => { setChooser(null); onMaterial(resource); }}><strong>{resource.materialTitle}</strong><small>{[resource.chapterTitle, resource.lessonTitle, resource.segmentTitle].filter(Boolean).join(" · ")}</small></button>) : context.assignments.map((resource) => <button key={resource.assignmentId} onClick={() => { setChooser(null); onAssignment(resource); }}><strong>{resource.title}</strong><small>{resource.status.replace(/_/g, "-")}</small></button>)}
    </div> : null}
  </div>;
}
