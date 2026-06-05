import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge as ReactFlowEdge,
  type EdgeChange,
  type Node as ReactFlowNode,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  ClipboardList,
  Code2,
  Download,
  Folder,
  FolderOpen,
  GitBranch,
  Grid2X2,
  Hammer,
  Layers3,
  List,
  ListChecks,
  LogOut,
  Loader2,
  Lock,
  MessageSquare,
  MousePointer2,
  Network,
  Play,
  Plus,
  RefreshCcw,
  Route,
  Save,
  Search,
  Settings2,
  Sparkles,
  Square,
  StepForward,
  Target,
  TerminalSquare,
  Trash2,
  User,
  Wand2,
  X,
  type LucideIcon
} from "lucide-react";
import * as Model from "../../../app/model";
import {
  NodeKind,
  EdgeKind,
  Selection,
  ConfigTarget,
  Field,
  FlowNode,
  FlowEdge,
  EdgeSide,
  edgeSides,
  Template,
  CourseSection,
  CourseChapter,
  CourseTask,
  Course,
  WorkflowNodeData,
  PortDirection,
  PopoverPosition,
  DragState,
  NodeTestStatus,
  HomeNavSection,
  WorkflowViewMode,
  CourseDifficulty,
  CourseStatus,
  ChapterStatus,
  SectionType,
  TaskStatus,
  TaskDifficulty,
  TaskTestStatus,
  TaskTestCase,
  TaskChecklistItem,
  TaskRubricItem,
  AbilityReward,
  MockTask,
  TaskStatKey,
  CreateNodePayload,
  CodeFile,
  RenameNodeResult,
  MockSession,
  WorkflowStatusKind,
  WorkflowHealthItem,
  WorkflowHealthSummary,
  schemaFields,
  templates,
  abilityDimensions,
  courseSections,
  mockCourses,
  createTask,
  mockTasks,
  nodePalette,
  bottomTabs,
  BottomTab,
  stateTabs,
  StateTab,
  nodeWorkbenchTabs,
  NodeWorkbenchTab,
  storageKey,
  sessionStorageKey,
  settingsStorageKey,
  PersistedAppState,
  node,
  systemNode,
  edge,
  isEdgeSideHandle,
  isControlNode,
  addBranch,
  getOppositeSide,
  getUniqueNodeName,
  getStateCode,
  getNodeFnName,
  getNodeCode,
  getControlNodeCode,
  getGeneratedNodeCode,
  getNodeExampleCode,
  getExportedNodeCode,
  formatGraphNodeRef,
  isControlOutletEdge,
  getControlBranches,
  getNodeCanvasPosition,
  getNodeCanvasSize,
  getAutoEdgeHandles,
  getStoredOrInitialEdgeHandles,
  mergePortDirection,
  getNodePortDirections,
  getEdgeCode,
  showcaseGraphCode,
  showcaseCodeFiles,
  getGraphCode,
  getRunCode,
  getWorkflowExportFiles,
  getCanvasExportTemplate,
  slugifyFileName,
  downloadJson,
  inferTemplateIdFromDescription,
  getNodeKindLabel,
  getMockFieldValue,
  createNodeTestInput,
  createNodeTestOutput,
  formatJson,
  parseJsonObject,
  formatFormValue,
  parseFormValue,
  createStateSnapshotForStep,
  getDefaultPopoverPosition,
  clampPopoverPosition,
  getUniqueWorkflowName,
  createBlankWorkflow,
  getPaletteNodeKind,
  getDefaultNodeIO,
  createPaletteNode,
  getEdgeDefaults,
  readStoredAppState,
  mergeStoredTasks,
  readMockSession
} from "../../../app/model";
import { WorkflowPreview } from "../workflows/WorkflowPages";
export function CoursesPage({ courses, onOpenCourse }: { courses: Course[]; onOpenCourse: (courseId: string) => void }) {
  const [filter, setFilter] = useState<"all" | CourseStatus | "recommended">("all");
  const learningCourses = courses.filter((item) => item.status === "learning");
  const completedCourses = courses.filter((item) => item.status === "completed");
  const recommendedCourse = courses.find((item) => item.recommended) ?? learningCourses[0] ?? courses[0];
  const overallProgress = Math.round(courses.reduce((sum, item) => sum + item.progress, 0) / courses.length);
  const filteredCourses = courses.filter((item) => {
    if (filter === "all") return true;
    if (filter === "recommended") return item.recommended;
    return item.status === filter;
  });

  return (
    <>
      <header className="course-hero glass">
        <div>
          <div className="eyebrow">COURSES</div>
          <h2>我的课程</h2>
          <p>选择一门课程，继续推进你的 Agent 工作流能力成长。</p>
          <div className="course-hero-actions">
            <button className="tool-button primary" onClick={() => onOpenCourse(recommendedCourse.id)}>
              <Play size={16} />
              继续学习
            </button>
          </div>
        </div>
        <div className="course-hero-stats">
          <Metric label="学习中" value={`${learningCourses.length} 门`} />
          <Metric label="已完成" value={`${completedCourses.length} 门`} />
          <Metric label="总体进度" value={`${overallProgress}%`} />
          <Metric label="今日推荐" value={recommendedCourse.title} />
        </div>
      </header>

      <div className="course-filter-row">
        <div className="view-switch" aria-label="课程筛选">
          {[
            ["all", "全部"],
            ["learning", "学习中"],
            ["not_started", "未开始"],
            ["completed", "已完成"],
            ["recommended", "推荐"]
          ].map(([id, label]) => (
            <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id as typeof filter)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="courses-layout">
        <div className="course-grid">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} onOpen={() => onOpenCourse(course.id)} />
          ))}
        </div>
        <LearningAdvice courses={courses} />
      </div>
    </>
  );
}

export function CourseCard({ course, onOpen }: { course: Course; onOpen: () => void }) {
  return (
    <article className="course-card glass" onClick={onOpen}>
      <div className="course-card-head">
        <div>
          <span className="course-kicker">{difficultyLabel(course.difficulty)}</span>
          <h3>{course.title}</h3>
        </div>
        <StatusBadge status={course.status} />
      </div>
      <p>{course.description}</p>
      <TagRow tags={course.tags} />
      <div className="course-card-metrics">
        <span>{course.chapterCount} 章节</span>
        <span>{course.taskCount} 任务</span>
        <span>{course.completedChapters}/{course.chapterCount} 已学</span>
        <span>{course.completedTasks}/{course.taskCount} 已完成</span>
      </div>
      <ProgressBar value={course.progress} />
      <div className="course-card-foot">
        <span>{course.estimatedHours} 小时</span>
        <button className="tool-button primary" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          {courseActionLabel(course.status)}
          <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}

export function LearningAdvice({ courses }: { courses: Course[] }) {
  const recent = courses.find((item) => item.status === "learning") ?? courses[0];
  const weakAbility = "调试分析力";
  return (
    <aside className="learning-advice glass">
      <div className="panel-heading">
        <Sparkles size={17} />
        <h3>学习建议</h3>
      </div>
      <div className="advice-block">
        <span>最近学习课程</span>
        <strong>{recent.title}</strong>
      </div>
      <div className="advice-block">
        <span>建议下一步</span>
        <strong>{nextChapter(recent)?.title ?? "复习已完成课程"}</strong>
      </div>
      <div className="advice-block">
        <span>薄弱能力提示</span>
        <strong>{weakAbility}</strong>
      </div>
    </aside>
  );
}

export function CourseDetailPage({
  course,
  onBack,
  onOpenChapter,
  onOpenWorkflow
}: {
  course: Course;
  onBack: () => void;
  onOpenChapter: (courseId: string, chapterId: string) => void;
  onOpenWorkflow: (templateId: string) => void;
}) {
  const activeChapter = nextChapter(course) ?? course.chapters[0];
  return (
    <>
      <header className="course-detail-hero glass">
        <button className="back-button" onClick={onBack} aria-label="返回课程列表">
          <ArrowLeft size={18} />
        </button>
        <div className="course-detail-copy">
          <div className="eyebrow">COURSE DETAIL</div>
          <h2>{course.title}</h2>
          <p>{course.description}</p>
          <div className="course-meta-row">
            <span>{difficultyLabel(course.difficulty)}</span>
            <span>{course.chapterCount} 章节</span>
            <span>{course.taskCount} 任务</span>
            <span>{course.estimatedHours} 小时</span>
            <span>{course.progress}%</span>
          </div>
          <div className="course-hero-actions">
            <button className="tool-button primary" onClick={() => onOpenChapter(course.id, activeChapter.id)}>
              <Play size={16} />
              {courseActionLabel(course.status)}
            </button>
            <button className="tool-button">
              <ClipboardList size={16} />
              查看相关任务
            </button>
          </div>
        </div>
        <WorkflowPreview template={templates.find((item) => item.id === activeChapter.workflowTemplateId) ?? templates[0]} />
      </header>

      <div className="course-stat-grid">
        <Metric label="已学章节" value={`${course.completedChapters}/${course.chapterCount}`} />
        <Metric label="已完成任务" value={`${course.completedTasks}/${course.taskCount}`} />
        <Metric label="已构建工作流" value="5" />
        <Metric label="当前掌握度" value={`${course.progress}%`} />
      </div>

      <div className="course-detail-layout">
        <section className="chapter-list">
          <div className="section-heading">
            <h3>章节目录</h3>
            <span>{course.chapters.length} 个章节</span>
          </div>
          {course.chapters.map((chapter) => (
            <ChapterCard key={chapter.id} course={course} chapter={chapter} onOpenChapter={onOpenChapter} onOpenWorkflow={onOpenWorkflow} />
          ))}
        </section>
        <aside className="course-side-panel glass">
          <div className="section-heading">
            <h3>能力目标</h3>
          </div>
          <TagRow tags={course.abilities} />
          <div className="task-mini-list">
            {course.tasks.map((task) => (
              <div key={task.id}>
                <span>{task.title}</span>
                <small>{taskStatusLabel(task.status)} · {task.score ? `${task.score} 分` : "未评分"} · {task.deadline}</small>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

export function ChapterCard({
  course,
  chapter,
  onOpenChapter,
  onOpenWorkflow
}: {
  course: Course;
  chapter: CourseChapter;
  onOpenChapter: (courseId: string, chapterId: string) => void;
  onOpenWorkflow: (templateId: string) => void;
}) {
  const task = course.tasks.find((item) => item.id === chapter.taskId);
  const locked = chapter.status === "locked";
  return (
    <article className={`chapter-card glass ${chapter.status}`}>
      <div className="chapter-index">{locked ? <Lock size={16} /> : chapter.order}</div>
      <div>
        <div className="chapter-title-row">
          <h4>{chapter.title}</h4>
          <StatusBadge status={chapter.status} />
        </div>
        <p>{chapter.summary}</p>
        <div className="course-meta-row">
          <span>{chapter.duration}</span>
          <span>{task?.title ?? "未关联任务"}</span>
          <span>{templates.find((item) => item.id === chapter.workflowTemplateId)?.name ?? chapter.workflowTemplateId}</span>
        </div>
        <TagRow tags={chapter.abilityTags} />
      </div>
      <div className="chapter-actions">
        <button className="tool-button" onClick={() => onOpenWorkflow(chapter.workflowTemplateId)} disabled={locked}>
          <Network size={15} />
          示例
        </button>
        <button className="tool-button primary" onClick={() => onOpenChapter(course.id, chapter.id)} disabled={locked}>
          {chapterActionLabel(chapter.status)}
        </button>
      </div>
    </article>
  );
}

export function ChapterLearningPage({
  course,
  chapter,
  onBack,
  onOpenWorkflow
}: {
  course: Course;
  chapter: CourseChapter;
  onBack: () => void;
  onOpenWorkflow: (templateId: string) => void;
}) {
  const task = course.tasks.find((item) => item.id === chapter.taskId);
  return (
    <>
      <header className="chapter-hero glass">
        <button className="back-button" onClick={onBack} aria-label="返回课程详情">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="eyebrow">{course.title}</div>
          <h2>{chapter.order}. {chapter.title}</h2>
          <p>{chapter.summary}</p>
          <div className="course-meta-row">
            <span>{chapter.duration}</span>
            <span>{task?.title ?? "未关联任务"}</span>
            <span>{task ? `${task.score ? `${task.score} 分` : "未评分"}` : "无评分"}</span>
          </div>
        </div>
        <div className="chapter-hero-actions">
          <button className="tool-button" onClick={() => onOpenWorkflow(chapter.workflowTemplateId)}>
            <Network size={16} />
            打开示例工作流
          </button>
          <button className="tool-button primary" onClick={() => onOpenWorkflow(chapter.workflowTemplateId)}>
            <Play size={16} />
            开始实训
          </button>
        </div>
      </header>

      <div className="chapter-learning-layout">
        <section className="chapter-content-list">
          {chapter.sections.map((section) => (
            <article key={section.id} className="chapter-section glass">
              <span className={`section-type ${section.type}`}>{sectionTypeLabel(section.type)}</span>
              <h3>{section.title}</h3>
              <p>{section.content}</p>
            </article>
          ))}
        </section>
        <aside className="course-side-panel glass">
          <div className="section-heading">
            <h3>本章目标</h3>
          </div>
          <TagRow tags={chapter.abilityTags} />
          <div className="advice-block">
            <span>关联模板</span>
            <strong>{templates.find((item) => item.id === chapter.workflowTemplateId)?.name ?? chapter.workflowTemplateId}</strong>
          </div>
          <div className="advice-block">
            <span>关联任务</span>
            <strong>{task?.title ?? "未关联任务"}</strong>
          </div>
        </aside>
      </div>
    </>
  );
}

export function TasksPage({
  tasks,
  activeTaskId,
  onOpenTask,
  onSelectTask
}: {
  tasks: MockTask[];
  activeTaskId: string;
  onOpenTask: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
}) {
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const filteredTasks = tasks.filter((task) => {
    const courseMatched = courseFilter === "all" || task.courseId === courseFilter;
    const statusMatched = statusFilter === "all" || task.status === statusFilter;
    return courseMatched && statusMatched;
  });
  const selectedTask = filteredTasks.find((item) => item.id === activeTaskId) ?? filteredTasks[0] ?? tasks[0];
  const stats = getTaskStats(tasks);
  const recentTask = tasks.find((task) => task.status === "in_progress" || task.status === "ready_to_submit") ?? tasks.find((task) => task.status === "not_started") ?? tasks[0];
  const recommendedTask = tasks.find((task) => task.status === "ready_to_submit") ?? recentTask;

  return (
    <>
      <header className="task-hero glass">
        <div>
          <div className="eyebrow">TASKS</div>
          <h2>实训任务</h2>
          <p>完成课程实训，提交你的工作流，并获得能力成长反馈。</p>
          <div className="course-hero-actions">
            <button className="tool-button primary" onClick={() => onOpenTask(recentTask.id)}>
              <Play size={16} />
              继续最近任务
            </button>
          </div>
        </div>
        <div className="course-hero-stats">
          <Metric label="待完成" value={`${stats.todo} 个`} />
          <Metric label="进行中" value={`${stats.inProgress} 个`} />
          <Metric label="已提交" value={`${stats.submitted} 个`} />
          <Metric label="已评分" value={`${stats.graded} 个`} />
          <Metric label="今日推荐" value={recommendedTask.title} />
        </div>
      </header>

      <div className="task-stat-grid">
        <TaskStatCard icon={CircleDot} label="待完成" value={stats.todo} note="未开始或已逾期任务" />
        <TaskStatCard icon={Loader2} label="进行中" value={stats.inProgress} note="正在编辑或待提交" />
        <TaskStatCard icon={SendIcon} label="已提交" value={stats.submitted} note="等待教师评分" />
        <TaskStatCard icon={CheckCircle2} label="已评分" value={stats.graded} note="可查看反馈" />
      </div>

      <div className="task-filter-row">
        <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} aria-label="课程筛选">
          <option value="all">全部课程</option>
          {mockCourses.map((course) => (
            <option key={course.id} value={course.id}>{course.title}</option>
          ))}
        </select>
        <div className="view-switch" aria-label="任务状态筛选">
          {[
            ["all", "全部"],
            ["not_started", "未开始"],
            ["in_progress", "进行中"],
            ["ready_to_submit", "待提交"],
            ["submitted", "已提交"],
            ["graded", "已评分"],
            ["overdue", "已逾期"]
          ].map(([id, label]) => (
            <button key={id} className={statusFilter === id ? "active" : ""} onClick={() => setStatusFilter(id as TaskStatus | "all")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="task-layout">
        <section className="task-list">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} active={task.id === selectedTask.id} onSelect={() => onSelectTask(task.id)} onOpen={() => onOpenTask(task.id)} />
          ))}
          {!filteredTasks.length ? <div className="empty-state glass">当前筛选下没有任务。</div> : null}
        </section>
      </div>
    </>
  );
}

export function TaskStatCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: number; note: string }) {
  return (
    <article className="task-stat-card glass">
      <Icon size={18} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{note}</small>
      </div>
    </article>
  );
}

export const SendIcon = StepForward;

export function TaskCard({ task, active, onSelect, onOpen }: { task: MockTask; active: boolean; onSelect: () => void; onOpen: () => void }) {
  return (
    <article className={`task-card glass ${active ? "active" : ""}`} onClick={onSelect}>
      <div className="task-card-head">
        <div>
          <span className="course-kicker">{task.courseTitle}</span>
          <h3>{task.title}</h3>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      <p>{task.subtitle}</p>
      <div className="course-meta-row">
        <span>{task.chapterTitle}</span>
        <span>{difficultyLabel(task.difficulty)}</span>
        <span>{task.deadline}</span>
        <span>{task.estimatedMinutes} 分钟</span>
        {task.score !== null ? <span>{task.score}/{task.maxScore} 分</span> : null}
      </div>
      <TagRow tags={task.requiredAbilities} />
      <TagRow tags={task.requiredNodes} />
      <div className="course-card-foot">
        <span>{task.submittedAt ? `提交于 ${task.submittedAt}` : "尚未提交"}</span>
        <button className="tool-button primary" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          {taskActionLabel(task.status)}
          <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}

export function TaskDetailPage({
  task,
  onBack,
  onOpenWorkflow,
  onToggleChecklist,
  onRunChecks,
  onSubmitTask
}: {
  task: MockTask;
  onBack: () => void;
  onOpenWorkflow: () => void;
  onToggleChecklist: (taskId: string, checklistId: string) => void;
  onRunChecks: (taskId: string) => void;
  onSubmitTask: (taskId: string) => void;
}) {
  const canSubmit = task.status === "ready_to_submit" || task.testCases.every((item) => item.status === "passed");
  const isClosed = task.status === "submitted" || task.status === "graded";

  return (
    <>
      <header className="task-detail-hero glass">
        <button className="back-button" onClick={onBack} aria-label="返回任务列表">
          <ArrowLeft size={18} />
        </button>
        <div className="task-detail-copy">
          <div className="eyebrow">{task.courseTitle}</div>
          <h2>{task.title}</h2>
          <p>{task.description}</p>
          <div className="course-meta-row">
            <span>{task.chapterTitle}</span>
            <span>{difficultyLabel(task.difficulty)}</span>
            <span>截止 {task.deadline}</span>
            <span>{task.estimatedMinutes} 分钟</span>
            <span>{task.score !== null ? `${task.score}/${task.maxScore} 分` : "未评分"}</span>
          </div>
          <div className="chapter-hero-actions">
            <button className="tool-button" onClick={onOpenWorkflow}>
              <Network size={16} />
              打开工作流
            </button>
            <button className="tool-button" onClick={() => onRunChecks(task.id)} disabled={isClosed}>
              <Play size={16} />
              运行检查
            </button>
            {!isClosed ? (
              <button className="tool-button primary" onClick={() => onSubmitTask(task.id)} disabled={!canSubmit}>
                <Check size={16} />
                提交任务
              </button>
            ) : null}
          </div>
        </div>
        <div className="task-detail-status">
          <TaskStatusBadge status={task.status} />
          <Metric label="提交时间" value={task.submittedAt ?? "未提交"} />
          <Metric label="模板" value={templates.find((item) => item.id === task.workflowTemplateId)?.name ?? task.workflowTemplateId} />
        </div>
      </header>

      <div className="task-detail-layout">
        <section className="task-detail-main">
          <TaskSection title="任务要求">
            <ul className="task-list-block">
              {task.requirements.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </TaskSection>

          <TaskSection title="提交检查">
            <div className="task-checklist">
              {task.checklist.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={item.checked} onChange={() => onToggleChecklist(task.id, item.id)} disabled={isClosed} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </TaskSection>

          <TaskSection title="测试用例">
            <div className="test-case-list">
              {task.testCases.map((testCase) => (
                <article key={testCase.id} className={`test-case ${testCase.status}`}>
                  <div>
                    <strong>{testCase.name}</strong>
                    <p>{testCase.input}</p>
                    <small>{testCase.expectedBehavior}</small>
                  </div>
                  <span>{testCaseStatusLabel(testCase.status)}</span>
                </article>
              ))}
            </div>
          </TaskSection>

          <TaskSection title="评分反馈">
            {task.status === "graded" ? (
              <>
                <p className="feedback-copy">{task.feedback}</p>
                <div className="rubric-grid">
                  {task.gradingRubric.map((item) => (
                    <article key={item.dimension} className="rubric-item">
                      <strong>{item.dimension}</strong>
                      <span>{item.score}/{item.maxScore}</span>
                      <p>{item.comment}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="feedback-copy">{task.feedback}</p>
            )}
          </TaskSection>
        </section>

        <aside className="task-detail-side glass">
          <div className="section-heading">
            <h3>能力成长</h3>
          </div>
          <TagRow tags={task.requiredAbilities} />
          <div className="ability-reward-list">
            {task.abilityRewards.map((item) => (
              <div key={item.ability}>
                <span>{item.ability}</span>
                <strong>+{item.points}</strong>
              </div>
            ))}
          </div>
          <div className="section-heading">
            <h3>必须节点</h3>
          </div>
          <TagRow tags={task.requiredNodes} />
        </aside>
      </div>
    </>
  );
}

export function TaskSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="task-section glass">
      <div className="section-heading">
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="course-metric glass">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusBadge({ status }: { status: CourseStatus | ChapterStatus }) {
  const Icon = status === "completed" ? CheckCircle2 : status === "locked" ? Lock : status === "learning" ? Play : CircleDot;
  return (
    <span className={`course-status ${status}`}>
      <Icon size={13} />
      {taskStatusLabel(status)}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const Icon = status === "graded" ? CheckCircle2 : status === "submitted" ? Check : status === "ready_to_submit" ? ListChecks : status === "overdue" ? AlertTriangle : status === "in_progress" ? Play : CircleDot;
  return (
    <span className={`course-status task-status ${status}`}>
      <Icon size={13} />
      {taskStatusLabel(status)}
    </span>
  );
}

export function TagRow({ tags }: { tags: string[] }) {
  return (
    <div className="tag-row">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="course-progress" aria-label={`进度 ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function nextChapter(course: Course) {
  return course.chapters.find((item) => item.status === "learning") ?? course.chapters.find((item) => item.status === "not_started");
}

export function difficultyLabel(value: CourseDifficulty) {
  return value === "beginner" ? "入门" : value === "intermediate" ? "进阶" : "高级";
}

export function taskStatusLabel(status: CourseStatus | ChapterStatus | TaskStatus) {
  if (status === "learning") return "学习中";
  if (status === "in_progress") return "进行中";
  if (status === "ready_to_submit") return "待提交";
  if (status === "submitted") return "已提交";
  if (status === "graded") return "已评分";
  if (status === "overdue") return "已逾期";
  if (status === "not_started") return "未开始";
  if (status === "completed") return "已完成";
  return "锁定";
}

export function taskActionLabel(status: TaskStatus) {
  if (status === "not_started") return "开始任务";
  if (status === "in_progress") return "继续编辑";
  if (status === "ready_to_submit") return "去提交";
  if (status === "submitted") return "查看提交";
  if (status === "graded") return "查看反馈";
  return "继续处理";
}

export function testCaseStatusLabel(status: TaskTestStatus) {
  if (status === "passed") return "通过";
  if (status === "failed") return "失败";
  return "未运行";
}

export function getTaskStats(tasks: MockTask[]): Record<TaskStatKey, number> {
  return {
    todo: tasks.filter((task) => task.status === "not_started" || task.status === "overdue").length,
    inProgress: tasks.filter((task) => task.status === "in_progress" || task.status === "ready_to_submit").length,
    submitted: tasks.filter((task) => task.status === "submitted").length,
    graded: tasks.filter((task) => task.status === "graded").length
  };
}

export function courseActionLabel(status: CourseStatus) {
  if (status === "learning") return "继续学习";
  if (status === "completed") return "复习课程";
  return "开始学习";
}

export function chapterActionLabel(status: ChapterStatus) {
  if (status === "completed") return "复习";
  if (status === "learning") return "继续学习";
  if (status === "locked") return "锁定";
  return "开始学习";
}

export function sectionTypeLabel(type: SectionType) {
  if (type === "concept") return "概念";
  if (type === "diagram") return "图示";
  if (type === "config") return "配置";
  return "实训";
}

