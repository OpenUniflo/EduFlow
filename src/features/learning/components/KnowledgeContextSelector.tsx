import type { KnowledgeLearningResources } from "@/features/learning/resources/knowledgeLearningResources";

type CourseContext = KnowledgeLearningResources["courseContexts"][number];

export function knowledgeContextLabel(context: CourseContext, hasDuplicateTitle: boolean) {
  if (!hasDuplicateTitle) return context.courseTitle;
  return `${context.courseTitle} · ${context.courseType === "personal" ? "个人课程" : "标准课程"}${context.updatedAt ? ` · ${new Date(context.updatedAt).toLocaleDateString("zh-CN")}` : ""}`;
}

export function KnowledgeContextSelector({ resources, value, onChange }: { resources: KnowledgeLearningResources; value: string; onChange(value: string): void }) {
  const myCourses = resources.courseContexts.filter((context) => context.isActive);
  const otherCourses = resources.courseContexts.filter((context) => !context.isActive);
  const duplicateTitles = new Set(resources.courseContexts.filter((context, index, items) => items.findIndex((item) => item.courseTitle === context.courseTitle) !== index).map((context) => context.courseTitle));
  return <label className="knowledge-context-selector"><span>当前学习上下文</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="standalone">独立学习</option>
    {myCourses.length ? <optgroup label="我的课程">{myCourses.map((context) => <option value={context.courseId} key={context.courseId}>{knowledgeContextLabel(context, duplicateTitles.has(context.courseTitle))}</option>)}</optgroup> : null}
    {otherCourses.length ? <optgroup label="其他公开课程">{otherCourses.map((context) => <option value={context.courseId} key={context.courseId}>{knowledgeContextLabel(context, duplicateTitles.has(context.courseTitle))}</option>)}</optgroup> : null}
  </select></label>;
}
