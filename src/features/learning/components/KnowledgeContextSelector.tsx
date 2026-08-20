import type { KnowledgeLearningResources } from "@/features/learning/resources/knowledgeLearningResources";

export function KnowledgeContextSelector({ resources, value, onChange }: { resources: KnowledgeLearningResources; value: string; onChange(value: string): void }) {
  const myCourses = resources.courseContexts.filter((context) => context.isActive);
  const otherCourses = resources.courseContexts.filter((context) => !context.isActive);
  return <label className="knowledge-context-selector"><span>当前学习上下文</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="standalone">独立学习</option>
    {myCourses.length ? <optgroup label="我的课程">{myCourses.map((context) => <option value={context.courseId} key={context.courseId}>{context.courseTitle}</option>)}</optgroup> : null}
    {otherCourses.length ? <optgroup label="其他公开课程">{otherCourses.map((context) => <option value={context.courseId} key={context.courseId}>{context.courseTitle}</option>)}</optgroup> : null}
  </select></label>;
}
