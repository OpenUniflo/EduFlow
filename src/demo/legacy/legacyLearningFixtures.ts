export type CourseSection = {
  id: string;
  title: string;
  type: SectionType;
  content: string;
};

export type CourseChapter = {
  id: string;
  order: number;
  title: string;
  summary: string;
  status: ChapterStatus;
  duration: string;
  abilityTags: string[];
  workflowTemplateId: string;
  taskId: string;
  sections: CourseSection[];
};

export type CourseTask = {
  id: string;
  title: string;
  chapterId: string;
  status: ChapterStatus;
  score: number;
  deadline: string;
};

export type Course = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: CourseDifficulty;
  status: CourseStatus;
  progress: number;
  chapterCount: number;
  taskCount: number;
  completedChapters: number;
  completedTasks: number;
  estimatedHours: number;
  tags: string[];
  abilities: string[];
  recommended?: boolean;
  chapters: CourseChapter[];
  tasks: CourseTask[];
};

export type CourseDifficulty = "beginner" | "intermediate" | "advanced";
export type CourseStatus = "learning" | "not_started" | "completed";
export type ChapterStatus = "completed" | "learning" | "not_started" | "locked";
export type SectionType = "concept" | "diagram" | "config" | "practice";
export type TaskStatus = "not_started" | "in_progress" | "ready_to_submit" | "submitted" | "graded" | "overdue";
export type TaskDifficulty = "beginner" | "intermediate" | "advanced";
export type TaskTestStatus = "passed" | "failed" | "not_run";
export type TaskTestCase = {
  id: string;
  name: string;
  input: string;
  expectedBehavior: string;
  status: TaskTestStatus;
};
export type TaskChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
};
export type TaskRubricItem = {
  dimension: string;
  score: number;
  maxScore: number;
  comment: string;
};
export type AbilityReward = {
  ability: string;
  points: number;
};
export type MockTask = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  score: number | null;
  maxScore: number;
  deadline: string;
  estimatedMinutes: number;
  requiredAbilities: string[];
  requiredNodes: string[];
  workflowTemplateId: string;
  submittedWorkflowId: string | null;
  testCases: TaskTestCase[];
  requirements: string[];
  checklist: TaskChecklistItem[];
  gradingRubric: TaskRubricItem[];
  feedback: string;
  abilityRewards: AbilityReward[];
  createdAt: string;
  submittedAt: string | null;
};
export type TaskStatKey = "todo" | "inProgress" | "submitted" | "graded";
export const abilityDimensions = ["工作流结构力", "State 设计力", "节点建模力", "路由分支力", "Agent 编排力", "调试分析力"];

export function courseSections(topic: string, workflowHint: string): CourseSection[] {
  return [
    {
      id: "concept",
      title: `${topic}核心概念`,
      type: "concept",
      content: `理解 ${topic} 在 Agent 工作流中的职责边界，明确输入、输出和状态变化。`
    },
    {
      id: "diagram",
      title: "结构示意",
      type: "diagram",
      content: `观察 ${workflowHint} 的节点连接方式，区分顺序边、条件边和循环控制。`
    },
    {
      id: "practice",
      title: "实训任务",
      type: "practice",
      content: `基于示例工作流完成一次小改造，并说明每个节点读写了哪些 State 字段。`
    }
  ];
}

export const mockCourses: Course[] = [
  {
    id: "langgraph-basics",
    title: "LangGraph 工作流基础",
    subtitle: "从 State、节点和边开始建立工作流结构感。",
    description: "学习 LangGraph 工作流的最小构成，理解节点如何读写共享 State，并把顺序流程表达成可运行图。",
    difficulty: "beginner",
    status: "learning",
    progress: 68,
    chapterCount: 3,
    taskCount: 3,
    completedChapters: 2,
    completedTasks: 2,
    estimatedHours: 6,
    tags: ["LangGraph", "State", "基础图"],
    abilities: ["工作流结构力", "State 设计力", "节点建模力"],
    recommended: true,
    chapters: [
      {
        id: "state-and-node",
        order: 1,
        title: "State 与节点建模",
        summary: "把输入、过程变量和最终输出整理成清晰的 State Schema。",
        status: "completed",
        duration: "45 分钟",
        abilityTags: ["State 设计力", "节点建模力"],
        workflowTemplateId: "minimal",
        taskId: "task-state-schema",
        sections: courseSections("State 与节点", "最小工作流")
      },
      {
        id: "edges-and-runtime",
        order: 2,
        title: "边与执行顺序",
        summary: "理解 START、普通节点和 END 的执行顺序，以及边只表达连接关系。",
        status: "learning",
        duration: "50 分钟",
        abilityTags: ["工作流结构力", "调试分析力"],
        workflowTemplateId: "sequence",
        taskId: "task-sequence-runtime",
        sections: courseSections("边与执行顺序", "顺序工作流")
      },
      {
        id: "first-workflow",
        order: 3,
        title: "构建第一个教学工作流",
        summary: "把 State、节点和边组合成一个可解释的教学演示流程。",
        status: "not_started",
        duration: "60 分钟",
        abilityTags: ["工作流结构力", "节点建模力"],
        workflowTemplateId: "showcase",
        taskId: "task-first-workflow",
        sections: courseSections("教学工作流", "EduFlow LangGraph 示例")
      }
    ],
    tasks: [
      { id: "task-state-schema", title: "设计问答 State Schema", chapterId: "state-and-node", status: "completed", score: 92, deadline: "2026-06-05" },
      { id: "task-sequence-runtime", title: "标注顺序流程执行轨迹", chapterId: "edges-and-runtime", status: "learning", score: 76, deadline: "2026-06-08" },
      { id: "task-first-workflow", title: "提交第一个工作流说明", chapterId: "first-workflow", status: "not_started", score: 0, deadline: "2026-06-12" }
    ]
  },
  {
    id: "router-practice",
    title: "条件分支与 Router 实训",
    subtitle: "用 Router 把不同学习意图分发到合适路径。",
    description: "围绕条件分支、路由函数和分支命名完成实训，掌握分支可解释性和路径调试。",
    difficulty: "intermediate",
    status: "learning",
    progress: 42,
    chapterCount: 2,
    taskCount: 2,
    completedChapters: 1,
    completedTasks: 1,
    estimatedHours: 5,
    tags: ["Router", "条件边", "分支"],
    abilities: ["路由分支力", "调试分析力", "State 设计力"],
    recommended: true,
    chapters: [
      {
        id: "router-rule",
        order: 1,
        title: "Router 判定规则",
        summary: "根据 State 字段设计稳定的分支判定规则。",
        status: "completed",
        duration: "55 分钟",
        abilityTags: ["路由分支力", "State 设计力"],
        workflowTemplateId: "branch",
        taskId: "task-router-rule",
        sections: courseSections("Router 判定", "条件分支")
      },
      {
        id: "branch-debug",
        order: 2,
        title: "分支路径调试",
        summary: "通过执行轨迹定位分支误判，并调整条件字段。",
        status: "learning",
        duration: "70 分钟",
        abilityTags: ["路由分支力", "调试分析力"],
        workflowTemplateId: "branch",
        taskId: "task-branch-debug",
        sections: courseSections("分支调试", "条件分支")
      }
    ],
    tasks: [
      { id: "task-router-rule", title: "补全 task_type 路由规则", chapterId: "router-rule", status: "completed", score: 88, deadline: "2026-06-09" },
      { id: "task-branch-debug", title: "修复一次分支误判", chapterId: "branch-debug", status: "learning", score: 61, deadline: "2026-06-14" }
    ]
  },
  {
    id: "agent-tool-calls",
    title: "Agent 与 Tool 调用",
    subtitle: "让 Agent 能够判断何时调用工具并吸收结果。",
    description: "学习 Agent 节点、Tool 节点和消息 State 的基本协作方式。",
    difficulty: "intermediate",
    status: "not_started",
    progress: 0,
    chapterCount: 2,
    taskCount: 2,
    completedChapters: 0,
    completedTasks: 0,
    estimatedHours: 6,
    tags: ["Agent", "Tool", "Messages"],
    abilities: ["Agent 编排力", "State 设计力", "节点建模力"],
    chapters: [
      {
        id: "agent-decision",
        order: 1,
        title: "Agent 决策节点",
        summary: "设计 Agent 的输入消息、工具意图和停止条件。",
        status: "not_started",
        duration: "60 分钟",
        abilityTags: ["Agent 编排力", "State 设计力"],
        workflowTemplateId: "agent",
        taskId: "task-agent-decision",
        sections: courseSections("Agent 决策", "Agent 工具调用")
      },
      {
        id: "tool-result",
        order: 2,
        title: "Tool 结果回写",
        summary: "把工具返回写回 State，并让 Agent 基于 Observation 继续推理。",
        status: "locked",
        duration: "65 分钟",
        abilityTags: ["Agent 编排力", "调试分析力"],
        workflowTemplateId: "agent",
        taskId: "task-tool-result",
        sections: courseSections("Tool 回写", "Agent 工具调用")
      }
    ],
    tasks: [
      { id: "task-agent-decision", title: "配置 Agent 工具意图", chapterId: "agent-decision", status: "not_started", score: 0, deadline: "2026-06-16" },
      { id: "task-tool-result", title: "追踪 Tool Observation", chapterId: "tool-result", status: "locked", score: 0, deadline: "2026-06-20" }
    ]
  },
  {
    id: "agent-loop-trace",
    title: "Agent Loop 与运行轨迹",
    subtitle: "分析 Agent 多轮循环中的状态变化。",
    description: "聚焦 Loop 节点、迭代上限和运行轨迹，训练定位循环退出条件的能力。",
    difficulty: "advanced",
    status: "not_started",
    progress: 0,
    chapterCount: 2,
    taskCount: 2,
    completedChapters: 0,
    completedTasks: 0,
    estimatedHours: 7,
    tags: ["Loop", "Trace", "调试"],
    abilities: ["Agent 编排力", "调试分析力", "路由分支力"],
    chapters: [
      {
        id: "loop-condition",
        order: 1,
        title: "循环条件设计",
        summary: "用 should_continue 和 iteration 控制 Agent 是否继续调用工具。",
        status: "not_started",
        duration: "70 分钟",
        abilityTags: ["Agent 编排力", "路由分支力"],
        workflowTemplateId: "agent",
        taskId: "task-loop-condition",
        sections: courseSections("循环条件", "Agent 工具调用")
      },
      {
        id: "trace-analysis",
        order: 2,
        title: "运行轨迹分析",
        summary: "从执行轨迹中还原每轮 State 变化并定位异常。",
        status: "locked",
        duration: "75 分钟",
        abilityTags: ["调试分析力", "Agent 编排力"],
        workflowTemplateId: "showcase",
        taskId: "task-trace-analysis",
        sections: courseSections("运行轨迹", "EduFlow LangGraph 示例")
      }
    ],
    tasks: [
      { id: "task-loop-condition", title: "设计 Agent Loop 退出条件", chapterId: "loop-condition", status: "not_started", score: 0, deadline: "2026-06-22" },
      { id: "task-trace-analysis", title: "提交运行轨迹分析报告", chapterId: "trace-analysis", status: "locked", score: 0, deadline: "2026-06-26" }
    ]
  },
  {
    id: "eduflow-capstone",
    title: "EduFlow 综合项目实战",
    subtitle: "把课程中的能力组合成一个完整教学 Agent。",
    description: "以综合项目方式串联 State、Router、Agent、Tool 和运行调试，完成一个可演示的 EduFlow 项目。",
    difficulty: "advanced",
    status: "completed",
    progress: 100,
    chapterCount: 3,
    taskCount: 3,
    completedChapters: 3,
    completedTasks: 3,
    estimatedHours: 10,
    tags: ["项目实战", "综合能力", "演示"],
    abilities: abilityDimensions,
    chapters: [
      {
        id: "project-design",
        order: 1,
        title: "项目结构设计",
        summary: "定义项目目标、State Schema 和核心节点。",
        status: "completed",
        duration: "90 分钟",
        abilityTags: ["工作流结构力", "State 设计力"],
        workflowTemplateId: "showcase",
        taskId: "task-project-design",
        sections: courseSections("项目结构", "EduFlow LangGraph 示例")
      },
      {
        id: "project-routing",
        order: 2,
        title: "分支与工具接入",
        summary: "加入 Router 和 Tool，支持不同学习意图。",
        status: "completed",
        duration: "95 分钟",
        abilityTags: ["路由分支力", "Agent 编排力"],
        workflowTemplateId: "branch",
        taskId: "task-project-routing",
        sections: courseSections("分支与工具", "条件分支")
      },
      {
        id: "project-demo",
        order: 3,
        title: "运行调试与演示",
        summary: "完成演示路径，说明关键 State 变化和能力目标。",
        status: "completed",
        duration: "110 分钟",
        abilityTags: ["调试分析力", "节点建模力"],
        workflowTemplateId: "showcase",
        taskId: "task-project-demo",
        sections: courseSections("项目演示", "EduFlow LangGraph 示例")
      }
    ],
    tasks: [
      { id: "task-project-design", title: "提交项目结构图", chapterId: "project-design", status: "completed", score: 95, deadline: "2026-05-18" },
      { id: "task-project-routing", title: "实现项目分支流程", chapterId: "project-routing", status: "completed", score: 91, deadline: "2026-05-25" },
      { id: "task-project-demo", title: "录制项目演示说明", chapterId: "project-demo", status: "completed", score: 96, deadline: "2026-05-30" }
    ]
  }
];

export function createTask(input: {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  courseId: string;
  chapterId: string;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  score: number | null;
  deadline: string;
  estimatedMinutes: number;
  requiredAbilities: string[];
  requiredNodes: string[];
  workflowTemplateId: string;
  submittedWorkflowId?: string | null;
  createdAt: string;
  submittedAt?: string | null;
}): MockTask {
  const course = mockCourses.find((item) => item.id === input.courseId) ?? mockCourses[0];
  const chapter = course.chapters.find((item) => item.id === input.chapterId) ?? course.chapters[0];
  const checkedCount = input.status === "not_started" ? 0 : input.status === "in_progress" ? 1 : input.status === "overdue" ? 1 : 3;
  const testStatus: TaskTestStatus = input.status === "graded" || input.status === "submitted" || input.status === "ready_to_submit" ? "passed" : "not_run";
  const rubricScore = input.score ? Math.round(input.score / 6) : 0;

  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    courseId: input.courseId,
    courseTitle: course.title,
    chapterId: input.chapterId,
    chapterTitle: chapter.title,
    difficulty: input.difficulty,
    status: input.status,
    score: input.score,
    maxScore: 100,
    deadline: input.deadline,
    estimatedMinutes: input.estimatedMinutes,
    requiredAbilities: input.requiredAbilities,
    requiredNodes: input.requiredNodes,
    workflowTemplateId: input.workflowTemplateId,
    submittedWorkflowId: input.submittedWorkflowId ?? null,
    testCases: [
      {
        id: `${input.id}-case-1`,
        name: "基础路径可运行",
        input: "用户请求：解释本章核心概念并给出示例。",
        expectedBehavior: "工作流能从 START 到 END 完成一次完整执行，并产出 final_answer。",
        status: testStatus
      },
      {
        id: `${input.id}-case-2`,
        name: "State 字段完整",
        input: "检查节点读写字段和默认值。",
        expectedBehavior: "关键 State 字段被正确读取、写入，没有孤立或未声明字段。",
        status: input.status === "graded" ? "passed" : testStatus
      },
      {
        id: `${input.id}-case-3`,
        name: "异常输入可解释",
        input: "用户请求：输入为空或意图不明确。",
        expectedBehavior: "流程能进入可解释的兜底路径，并保留调试说明。",
        status: input.status === "graded" ? "passed" : testStatus
      }
    ],
    requirements: [
      "工作流必须包含 START、核心处理节点和 END，并保持连接清晰。",
      "每个业务节点必须说明读取和写入的 State 字段。",
      "提交前至少运行一次检查，并根据结果修正节点或路由配置。"
    ],
    checklist: [
      { id: `${input.id}-check-1`, label: "已补全任务要求中的核心节点", checked: checkedCount >= 1 },
      { id: `${input.id}-check-2`, label: "已说明关键 State 字段的读写关系", checked: checkedCount >= 2 },
      { id: `${input.id}-check-3`, label: "已运行测试用例并记录调试结论", checked: checkedCount >= 3 }
    ],
    gradingRubric: ["结构正确性", "State 设计合理性", "节点配置完整性", "路由 / Agent 逻辑", "可运行性", "调试与解释能力"].map((dimension) => ({
      dimension,
      score: input.status === "graded" ? Math.min(17, Math.max(12, rubricScore)) : 0,
      maxScore: 17,
      comment: input.status === "graded" ? `${dimension}达到本任务要求，可继续提升边界案例说明。` : "提交并评分后显示该维度反馈。"
    })),
    feedback:
      input.status === "graded"
        ? "整体结构清晰，核心节点和 State 字段匹配良好。下一步建议补充失败路径的解释和运行轨迹截图。"
        : "提交后将展示教师评分反馈、维度得分和能力成长建议。",
    abilityRewards: abilityDimensions.map((ability) => ({
      ability,
      points: input.requiredAbilities.includes(ability) ? 12 : 4
    })),
    createdAt: input.createdAt,
    submittedAt: input.submittedAt ?? null
  };
}

export const mockTasks: MockTask[] = [
  createTask({
    id: "task-state-schema",
    title: "设计问答 State Schema",
    subtitle: "为最小问答工作流定义输入、过程变量和输出字段。",
    description: "围绕 State 与节点建模章节，设计一个能支撑教学问答的 State Schema，并说明每个字段由哪个节点读写。",
    courseId: "langgraph-basics",
    chapterId: "state-and-node",
    difficulty: "beginner",
    status: "graded",
    score: 92,
    deadline: "2026-06-05",
    estimatedMinutes: 45,
    requiredAbilities: ["State 设计力", "节点建模力"],
    requiredNodes: ["Function Node", "Output Node"],
    workflowTemplateId: "minimal",
    submittedWorkflowId: "minimal",
    createdAt: "2026-05-28",
    submittedAt: "2026-06-01"
  }),
  createTask({
    id: "task-sequence-runtime",
    title: "标注顺序流程执行轨迹",
    subtitle: "根据顺序工作流说明每一步的 State 变化。",
    description: "打开顺序工作流模板，运行检查并标注节点执行顺序、边连接和最终输出字段。",
    courseId: "langgraph-basics",
    chapterId: "edges-and-runtime",
    difficulty: "beginner",
    status: "in_progress",
    score: null,
    deadline: "2026-06-08",
    estimatedMinutes: 50,
    requiredAbilities: ["工作流结构力", "调试分析力"],
    requiredNodes: ["Function Node", "File / Cloud Drive Node", "LLM Node", "Output Node"],
    workflowTemplateId: "sequence",
    createdAt: "2026-05-30"
  }),
  createTask({
    id: "task-first-workflow",
    title: "提交第一个工作流说明",
    subtitle: "把节点、边和 State 串成一次完整教学演示。",
    description: "基于 EduFlow LangGraph 示例提交你的第一个教学工作流说明，重点解释流程结构与运行结果。",
    courseId: "langgraph-basics",
    chapterId: "first-workflow",
    difficulty: "beginner",
    status: "not_started",
    score: null,
    deadline: "2026-06-12",
    estimatedMinutes: 60,
    requiredAbilities: ["工作流结构力", "节点建模力"],
    requiredNodes: ["Function Node", "Router Node", "Output Node"],
    workflowTemplateId: "showcase",
    createdAt: "2026-06-01"
  }),
  createTask({
    id: "task-router-rule",
    title: "补全 task_type 路由规则",
    subtitle: "让 Router 根据 State 字段稳定分发路径。",
    description: "为 task_type 设计清晰分支，并说明 search、writing 和 fallback 的命中条件。",
    courseId: "router-practice",
    chapterId: "router-rule",
    difficulty: "intermediate",
    status: "graded",
    score: 88,
    deadline: "2026-06-09",
    estimatedMinutes: 55,
    requiredAbilities: ["路由分支力", "State 设计力"],
    requiredNodes: ["Function Node", "Router Node", "LLM Node", "HTTP API Node"],
    workflowTemplateId: "branch",
    submittedWorkflowId: "branch",
    createdAt: "2026-05-29",
    submittedAt: "2026-06-02"
  }),
  createTask({
    id: "task-branch-debug",
    title: "修复一次分支误判",
    subtitle: "通过运行轨迹定位 Router 条件问题。",
    description: "运行分支工作流，找到一次误判路径，修正判断字段并记录调试过程。",
    courseId: "router-practice",
    chapterId: "branch-debug",
    difficulty: "intermediate",
    status: "ready_to_submit",
    score: null,
    deadline: "2026-06-14",
    estimatedMinutes: 70,
    requiredAbilities: ["路由分支力", "调试分析力"],
    requiredNodes: ["Router Node", "State Transform Node", "Output Node"],
    workflowTemplateId: "branch",
    createdAt: "2026-06-01"
  }),
  createTask({
    id: "task-agent-decision",
    title: "配置 Agent 工具意图",
    subtitle: "让 Agent 判断何时需要 Tool。",
    description: "配置 Agent 节点的消息输入、工具选择字段和停止条件，确保工具意图可解释。",
    courseId: "agent-tool-calls",
    chapterId: "agent-decision",
    difficulty: "intermediate",
    status: "not_started",
    score: null,
    deadline: "2026-06-16",
    estimatedMinutes: 60,
    requiredAbilities: ["Agent 编排力", "State 设计力"],
    requiredNodes: ["Agent Node", "Tool Node", "Loop Node"],
    workflowTemplateId: "agent",
    createdAt: "2026-06-02"
  }),
  createTask({
    id: "task-tool-result",
    title: "追踪 Tool Observation",
    subtitle: "把工具返回写回 State 并驱动下一轮推理。",
    description: "观察 Tool 节点返回后 messages、tool_result 和 final_answer 的变化，并补全说明。",
    courseId: "agent-tool-calls",
    chapterId: "tool-result",
    difficulty: "intermediate",
    status: "submitted",
    score: null,
    deadline: "2026-06-20",
    estimatedMinutes: 65,
    requiredAbilities: ["Agent 编排力", "调试分析力"],
    requiredNodes: ["Tool Node", "Agent Node", "Output Node"],
    workflowTemplateId: "agent",
    submittedWorkflowId: "agent",
    createdAt: "2026-06-03",
    submittedAt: "2026-06-03"
  }),
  createTask({
    id: "task-loop-condition",
    title: "设计 Agent Loop 退出条件",
    subtitle: "用 should_continue 和 iteration 控制循环。",
    description: "为 Agent Loop 补全继续和退出条件，避免无限循环并保留调试解释。",
    courseId: "agent-loop-trace",
    chapterId: "loop-condition",
    difficulty: "advanced",
    status: "not_started",
    score: null,
    deadline: "2026-06-22",
    estimatedMinutes: 70,
    requiredAbilities: ["Agent 编排力", "路由分支力"],
    requiredNodes: ["Agent Node", "Loop Node", "Tool Node"],
    workflowTemplateId: "agent",
    createdAt: "2026-06-03"
  }),
  createTask({
    id: "task-trace-analysis",
    title: "提交运行轨迹分析报告",
    subtitle: "从多轮执行中还原 State 变化。",
    description: "阅读 Agent 运行轨迹，说明每轮 tool_result、messages 和 should_continue 的变化。",
    courseId: "agent-loop-trace",
    chapterId: "trace-analysis",
    difficulty: "advanced",
    status: "overdue",
    score: null,
    deadline: "2026-05-31",
    estimatedMinutes: 75,
    requiredAbilities: ["调试分析力", "Agent 编排力"],
    requiredNodes: ["Agent Node", "Loop Node", "Tool Node", "Output Node"],
    workflowTemplateId: "showcase",
    createdAt: "2026-05-22"
  }),
  createTask({
    id: "task-project-design",
    title: "提交项目结构图",
    subtitle: "定义综合项目的 State、节点和核心路径。",
    description: "为 EduFlow 综合项目画出结构图，说明每个模块如何服务教学闭环。",
    courseId: "eduflow-capstone",
    chapterId: "project-design",
    difficulty: "advanced",
    status: "graded",
    score: 95,
    deadline: "2026-05-18",
    estimatedMinutes: 90,
    requiredAbilities: ["工作流结构力", "State 设计力"],
    requiredNodes: ["Function Node", "Router Node", "Agent Node"],
    workflowTemplateId: "showcase",
    submittedWorkflowId: "showcase",
    createdAt: "2026-05-08",
    submittedAt: "2026-05-17"
  }),
  createTask({
    id: "task-project-routing",
    title: "实现项目分支流程",
    subtitle: "接入 Router 与 Tool 支撑不同学习意图。",
    description: "为综合项目加入分支流程和工具调用，确保不同学习意图进入合适路径。",
    courseId: "eduflow-capstone",
    chapterId: "project-routing",
    difficulty: "advanced",
    status: "graded",
    score: 91,
    deadline: "2026-05-25",
    estimatedMinutes: 95,
    requiredAbilities: ["路由分支力", "Agent 编排力"],
    requiredNodes: ["Router Node", "Tool Node", "Agent Node", "HTTP API Node"],
    workflowTemplateId: "branch",
    submittedWorkflowId: "branch",
    createdAt: "2026-05-14",
    submittedAt: "2026-05-24"
  }),
  createTask({
    id: "task-project-demo",
    title: "录制项目演示说明",
    subtitle: "展示可运行路径、评分依据和能力成长。",
    description: "完成综合项目演示路径，说明关键 State 变化、运行检查结果和调试结论。",
    courseId: "eduflow-capstone",
    chapterId: "project-demo",
    difficulty: "advanced",
    status: "graded",
    score: 96,
    deadline: "2026-05-30",
    estimatedMinutes: 110,
    requiredAbilities: ["调试分析力", "节点建模力"],
    requiredNodes: ["Agent Node", "Loop Node", "Output Node"],
    workflowTemplateId: "showcase",
    submittedWorkflowId: "showcase",
    createdAt: "2026-05-20",
    submittedAt: "2026-05-29"
  })
];

