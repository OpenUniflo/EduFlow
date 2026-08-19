import { ArrowRight, Check, Lock, Play } from "lucide-react";
import type { CourseGraphData } from "../runtime/courseRuntime";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { buildCoursePath } from "./coursePath";

export function CoursePathView({ graph, userKnowledge, onSelect }: { graph: CourseGraphData; userKnowledge: UserKnowledgeRecord[]; onSelect(nodeId: string): void }) {
  const path = buildCoursePath(graph, userKnowledge);
  const labels = { completed:"已完成", current:"进行中", available:"可以开始", blocked:"暂不可用" };
  return <section className="atlas-content-wrap course-path" aria-label="课程学习路径"><header className="atlas-course-title"><span className="atlas-kicker">COURSE PATH</span><h2>按课程顺序继续学习</h2><p>课程顺序决定展示次序；真实 Knowledge 前置关系决定是否可开始。</p></header><div className="course-management-grid">{path.map((item) => <article className={`course-management-card glass-v2 course-path-item ${item.state}`} key={item.node.id}><div className="atlas-pill">{item.state === "completed" ? <Check size={13}/> : item.state === "blocked" ? <Lock size={13}/> : <Play size={13}/>} {labels[item.state]}</div><h3>{item.node.title}</h3><p>{item.node.description}</p>{item.blockedBy.length ? <small>需要先完成：{item.blockedBy.join("、")}</small> : <small>第 {item.node.primaryCoverage.lessonOrder} 课 · {item.node.assignmentCount} 项实训</small>}<button className="atlas-primary" disabled={item.state === "blocked"} onClick={() => onSelect(item.node.id)}>{item.state === "blocked" ? "等待前置 Knowledge" : item.state === "completed" ? "查看详情" : "继续"}<ArrowRight size={14}/></button></article>)}</div></section>;
}
