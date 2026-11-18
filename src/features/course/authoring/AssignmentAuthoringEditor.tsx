import { useMemo, useState } from "react";
import type { AssignmentCoverage, AssignmentCoverageRole, CourseAssignment } from "@/features/course/types";

const splitLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

/**
 * P2 practice authoring: one unified practice (problem, approach, one
 * submission). Retired answer/code/trace editors are not offered any more;
 * historical records remain readable through the runtime compatibility layer.
 */
export function AssignmentAuthoringEditor({ assignments, coverages, courseId, knowledgeId, onChange }: { assignments: CourseAssignment[]; coverages: AssignmentCoverage[]; courseId: string; knowledgeId: string; onChange: (assignments: CourseAssignment[], coverages: AssignmentCoverage[]) => void }) {
  const linked = useMemo(() => assignments.filter((assignment) => coverages.some((coverage) => coverage.assignmentId === assignment.id && coverage.nodeId === knowledgeId)), [assignments, coverages, knowledgeId]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [criteria, setCriteria] = useState("");
  const [minutes, setMinutes] = useState("20");
  const [required, setRequired] = useState(true);
  const [role, setRole] = useState<AssignmentCoverageRole>("assess");
  const create = () => {
    if (!title.trim() || !description.trim() || !expectedOutput.trim()) return;
    const assignmentId = `assignment-${crypto.randomUUID()}`;
    const assignment: CourseAssignment = {
      id: assignmentId,
      courseId,
      order: assignments.length,
      title: title.trim(),
      description: description.trim(),
      requirements: splitLines(requirements),
      expectedOutput: expectedOutput.trim(),
      acceptanceCriteria: splitLines(criteria),
      mode: "instruction",
      estimatedMinutes: Math.max(1, Number(minutes) || 1)
    };
    const coverage: AssignmentCoverage = { id: `${assignmentId}:coverage:${knowledgeId}`, assignmentId, nodeId: knowledgeId, role, required };
    onChange([...assignments, assignment], [...coverages, coverage]);
    setTitle(""); setDescription(""); setRequirements(""); setExpectedOutput(""); setCriteria("");
  };
  const edit = (assignment: CourseAssignment) => {
    const nextTitle = window.prompt("动手任务标题", assignment.title);
    if (!nextTitle?.trim()) return;
    const nextDescription = window.prompt("目标与说明", assignment.description);
    if (!nextDescription?.trim()) return;
    const nextOutput = window.prompt("预期输出", assignment.expectedOutput);
    if (!nextOutput?.trim()) return;
    onChange(assignments.map((item) => item.id === assignment.id ? { ...item, title: nextTitle.trim(), description: nextDescription.trim(), expectedOutput: nextOutput.trim() } : item), coverages);
  };
  const remove = (assignmentId: string) => onChange(assignments.filter((assignment) => assignment.id !== assignmentId), coverages.filter((coverage) => coverage.assignmentId !== assignmentId));
  const move = (assignment: CourseAssignment, delta: number) => { const index = assignments.findIndex((item) => item.id === assignment.id); const target = index + delta; if (target < 0 || target >= assignments.length) return; const next = [...assignments]; [next[index], next[target]] = [next[target], next[index]]; onChange(next.map((item, order) => ({ ...item, order })), coverages); };
  return <section className="atlas-drawer-section">
    <h3>实践编辑器</h3>
    <p>实践只有一种类型：问题描述、实现方式、一次提交。提交时可从作品选择工作流、上传文件或链接；评估由教师完成。</p>
    <div className="course-authoring-field">
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="实践标题" />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="问题描述 / 实现方式" />
      <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="要求：每行一项" />
      <input value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} placeholder="预期输出" />
      <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="验收标准：每行一项" />
      <div className="course-authoring-inline-actions">
        <select value={role} onChange={(event) => setRole(event.target.value as AssignmentCoverageRole)}><option value="practice">practice</option><option value="apply">apply</option><option value="assess">assess</option></select>
        <input type="number" min="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} aria-label="预计分钟" />
        <label><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />必修</label>
      </div>
      <button onClick={create}>创建实践</button>
    </div>
    {linked.length ? <div className="atlas-assignment-switcher">{linked.map((assignment) => {
      const coverage = coverages.find((item) => item.assignmentId === assignment.id && item.nodeId === knowledgeId)!;
      const legacy = assignment.experience?.type;
      return <div className="atlas-assignment-row" key={assignment.id}><span>{assignment.order + 1}</span><strong>{assignment.title}<small>统一实践 · {coverage.role} · {coverage.required ? "必修" : "选修"}{legacy ? " · 含历史记录（只读）" : ""}</small></strong><button onClick={() => edit(assignment)}>编辑</button><button disabled={assignment.order === 0} onClick={() => move(assignment, -1)}>↑</button><button disabled={assignment.order === assignments.length - 1} onClick={() => move(assignment, 1)}>↓</button><button className="danger" onClick={() => remove(assignment.id)}>删除</button></div>;
    })}</div> : <p>当前 Knowledge 尚无实践覆盖。</p>}
  </section>;
}
