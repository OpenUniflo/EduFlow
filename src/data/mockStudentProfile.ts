import type { StudentProfile } from "../types/profile";

export const mockStudentProfile: StudentProfile = {
  id: "student-lin-001",
  name: "林同学",
  avatar: "林",
  className: "AI 工作流实训 1 班",
  studentNo: "EF20260601",
  title: "Router Apprentice",
  level: 12,
  currentExp: 1280,
  nextLevelExp: 1600,
  totalExp: 8420,
  learningDays: 18,
  completedCourses: 1,
  completedChapters: 6,
  completedTasks: 7,
  builtWorkflows: 18,
  successfulRuns: 46,
  averageScore: 91,
  abilities: [
    {
      id: "workflow-structure",
      name: "工作流结构力",
      level: 12,
      value: 82,
      maxValue: 100,
      exp: 510,
      nextExp: 640,
      description: "能把学习目标拆成稳定节点、边和执行顺序。",
      trend: "up",
      recentGain: "本周 +10",
      sourceCourses: ["LangGraph 工作流基础", "EduFlow 综合项目实战"]
    },
    {
      id: "state-design",
      name: "State 设计力",
      level: 11,
      value: 74,
      maxValue: 100,
      exp: 420,
      nextExp: 600,
      description: "能设计输入、过程变量和输出字段的共享状态。",
      trend: "stable",
      recentGain: "本周 +4",
      sourceCourses: ["LangGraph 工作流基础", "条件分支与 Router 实训"]
    },
    {
      id: "node-modeling",
      name: "节点建模力",
      level: 10,
      value: 69,
      maxValue: 100,
      exp: 360,
      nextExp: 560,
      description: "能为 Function、LLM、Output 等节点定义清晰职责。",
      trend: "up",
      recentGain: "本周 +6",
      sourceCourses: ["LangGraph 工作流基础", "EduFlow 综合项目实战"]
    },
    {
      id: "router-branch",
      name: "路由分支力",
      level: 12,
      value: 78,
      maxValue: 100,
      exp: 470,
      nextExp: 620,
      description: "能设计可解释的条件分支，并调试路径误判。",
      trend: "up",
      recentGain: "本周 +12",
      sourceCourses: ["条件分支与 Router 实训", "EduFlow 综合项目实战"]
    },
    {
      id: "agent-orchestration",
      name: "Agent 编排力",
      level: 8,
      value: 49,
      maxValue: 100,
      exp: 250,
      nextExp: 520,
      description: "能让 Agent、Tool 和消息 State 协同推进任务。",
      trend: "stable",
      recentGain: "本周 +3",
      sourceCourses: ["Agent 与 Tool 调用", "Agent Loop 与运行轨迹"]
    },
    {
      id: "debug-analysis",
      name: "调试分析力",
      level: 9,
      value: 58,
      maxValue: 100,
      exp: 310,
      nextExp: 540,
      description: "能从运行轨迹中定位 State 变化和节点异常。",
      trend: "down",
      recentGain: "本周 +2",
      sourceCourses: ["条件分支与 Router 实训", "Agent Loop 与运行轨迹"]
    }
  ],
  courseProgress: [
    {
      courseId: "langgraph-basics",
      courseTitle: "LangGraph 工作流基础",
      progress: 68,
      status: "learning",
      completedChapters: 2,
      chapterCount: 3,
      completedTasks: 2,
      taskCount: 3,
      mainAbilities: ["工作流结构力", "State 设计力", "节点建模力"]
    },
    {
      courseId: "router-practice",
      courseTitle: "条件分支与 Router 实训",
      progress: 42,
      status: "learning",
      completedChapters: 1,
      chapterCount: 2,
      completedTasks: 1,
      taskCount: 2,
      mainAbilities: ["路由分支力", "调试分析力", "State 设计力"]
    },
    {
      courseId: "agent-tool-calls",
      courseTitle: "Agent 与 Tool 调用",
      progress: 12,
      status: "not_started",
      completedChapters: 0,
      chapterCount: 2,
      completedTasks: 0,
      taskCount: 2,
      mainAbilities: ["Agent 编排力", "State 设计力", "节点建模力"]
    },
    {
      courseId: "agent-loop-trace",
      courseTitle: "Agent Loop 与运行轨迹",
      progress: 0,
      status: "not_started",
      completedChapters: 0,
      chapterCount: 2,
      completedTasks: 0,
      taskCount: 2,
      mainAbilities: ["Agent 编排力", "调试分析力", "路由分支力"]
    },
    {
      courseId: "eduflow-capstone",
      courseTitle: "EduFlow 综合项目实战",
      progress: 100,
      status: "completed",
      completedChapters: 3,
      chapterCount: 3,
      completedTasks: 3,
      taskCount: 3,
      mainAbilities: ["工作流结构力", "路由分支力", "Agent 编排力"]
    }
  ],
  skillTree: [
    {
      id: "workflow-basics",
      title: "基础工作流",
      skills: [
        { id: "start-end", title: "理解 START / END", description: "识别工作流入口、出口和基础执行闭环。", status: "mastered", requiredLevel: 1, relatedAbility: "工作流结构力", progress: 100, recommendation: "复盘 LangGraph 工作流基础第 1 章。" },
        { id: "sequence-node", title: "创建顺序节点", description: "用普通边连接多个节点形成可运行流程。", status: "mastered", requiredLevel: 3, relatedAbility: "节点建模力", progress: 100, recommendation: "继续练习顺序流程执行轨迹。" },
        { id: "complex-layout", title: "优化复杂流程布局", description: "整理多节点画布，让流程结构更可读。", status: "unlocked", requiredLevel: 10, relatedAbility: "工作流结构力", progress: 64, recommendation: "打开综合项目模板练习布局说明。" }
      ]
    },
    {
      id: "state-schema",
      title: "State Schema",
      skills: [
        { id: "state-fields", title: "定义 State 字段", description: "为输入、过程变量和结果字段建立边界。", status: "mastered", requiredLevel: 4, relatedAbility: "State 设计力", progress: 100, recommendation: "巩固 State 与节点建模章节。" },
        { id: "state-read-write", title: "标注读写关系", description: "说明每个节点读取和写回的 State 字段。", status: "unlocked", requiredLevel: 9, relatedAbility: "State 设计力", progress: 72, recommendation: "完成设计问答 State Schema 任务复盘。" },
        { id: "schema-versioning", title: "Schema 版本演进", description: "在迭代中保持字段命名稳定。", status: "locked", requiredLevel: 14, relatedAbility: "State 设计力", progress: 0, recommendation: "先完成 Agent 与 Tool 调用课程。" }
      ]
    },
    {
      id: "router-branch",
      title: "Router 分支",
      skills: [
        { id: "router-node", title: "创建 Router 节点", description: "基于 State 字段输出稳定分支。", status: "mastered", requiredLevel: 6, relatedAbility: "路由分支力", progress: 100, recommendation: "复盘补全 task_type 路由规则。" },
        { id: "conditional-edge", title: "条件边配置", description: "为不同分支配置清晰路径。", status: "unlocked", requiredLevel: 10, relatedAbility: "路由分支力", progress: 76, recommendation: "继续完成分支路径调试任务。" },
        { id: "dynamic-routing", title: "动态路由策略", description: "根据运行上下文调整分支策略。", status: "locked", requiredLevel: 16, relatedAbility: "路由分支力", progress: 0, recommendation: "先提升调试分析力到 70。" }
      ]
    },
    {
      id: "agent-tool",
      title: "Agent 与 Tool",
      skills: [
        { id: "agent-message", title: "Agent 消息输入", description: "组织 Agent 决策所需消息和上下文。", status: "unlocked", requiredLevel: 8, relatedAbility: "Agent 编排力", progress: 38, recommendation: "进入 Agent 与 Tool 调用课程。" },
        { id: "tool-call", title: "Tool 调用意图", description: "让 Agent 判断何时需要工具。", status: "unlocked", requiredLevel: 11, relatedAbility: "Agent 编排力", progress: 24, recommendation: "完成配置 Agent 工具意图任务。" },
        { id: "tool-observation", title: "Observation 回写", description: "把工具返回写回 State 供下一轮推理。", status: "locked", requiredLevel: 13, relatedAbility: "Agent 编排力", progress: 0, recommendation: "先完成 Tool Observation 追踪。" }
      ]
    },
    {
      id: "loop-debug",
      title: "Loop 与调试",
      skills: [
        { id: "run-trace", title: "阅读运行轨迹", description: "按执行顺序还原每个节点的输入输出。", status: "unlocked", requiredLevel: 8, relatedAbility: "调试分析力", progress: 58, recommendation: "完成分支路径调试任务。" },
        { id: "loop-condition", title: "循环退出条件", description: "用条件字段控制 Agent 是否继续运行。", status: "locked", requiredLevel: 15, relatedAbility: "Agent 编排力", progress: 0, recommendation: "进入 Agent Loop 与运行轨迹课程。" },
        { id: "zero-error-run", title: "0 报错运行复盘", description: "总结一次稳定运行的关键配置。", status: "unlocked", requiredLevel: 12, relatedAbility: "调试分析力", progress: 42, recommendation: "整理最近一次成功运行记录。" }
      ]
    }
  ],
  achievements: [
    { id: "first-workflow", title: "第一个工作流", description: "成功构建并保存第一个工作流。", status: "unlocked", unlockedAt: "2026-05-17", icon: "Flow", rarity: "common", source: "工作流画布" },
    { id: "first-run", title: "第一次成功运行", description: "完成一次无阻塞工作流运行。", status: "unlocked", unlockedAt: "2026-05-18", icon: "Run", rarity: "common", source: "运行面板" },
    { id: "first-router", title: "第一个 Router", description: "创建并解释第一个 Router 节点。", status: "unlocked", unlockedAt: "2026-05-24", icon: "Route", rarity: "rare", source: "Router 实训" },
    { id: "first-tool", title: "第一次使用 Tool Node", description: "让工具节点参与 Agent 流程。", status: "locked", unlockedAt: null, icon: "Tool", rarity: "rare", source: "Agent 与 Tool 调用" },
    { id: "seven-days", title: "连续学习 7 天", description: "连续 7 天完成学习或实训动作。", status: "unlocked", unlockedAt: "2026-05-30", icon: "7D", rarity: "rare", source: "学习记录" },
    { id: "five-tasks", title: "提交 5 个任务", description: "累计提交 5 个实训任务。", status: "unlocked", unlockedAt: "2026-06-01", icon: "Task", rarity: "common", source: "任务模块" },
    { id: "zero-error", title: "单次运行 0 报错", description: "一次运行检查没有阻塞项。", status: "unlocked", unlockedAt: "2026-06-02", icon: "OK", rarity: "epic", source: "运行检查" },
    { id: "high-score", title: "高分作业", description: "获得 90 分以上任务评分。", status: "unlocked", unlockedAt: "2026-05-29", icon: "A+", rarity: "rare", source: "教师评分" },
    { id: "agent-loop", title: "Agent Loop 入门", description: "掌握 Agent 循环退出条件。", status: "locked", unlockedAt: null, icon: "Loop", rarity: "epic", source: "Agent Loop 与运行轨迹" },
    { id: "capstone", title: "综合项目完成者", description: "完成 EduFlow 综合项目实战。", status: "unlocked", unlockedAt: "2026-05-30", icon: "Pro", rarity: "legendary", source: "综合项目" }
  ],
  recentGrowthLogs: [
    { id: "growth-1", date: "今天", title: "完成任务：补全 task_type 路由规则", description: "补全 search、writing 和 fallback 分支条件。", ability: "路由分支力", gain: 12, sourceType: "task", sourceTitle: "条件分支与 Router 实训" },
    { id: "growth-2", date: "今天", title: "成功运行 Router 工作流", description: "验证条件边命中路径并记录执行轨迹。", ability: "调试分析力", gain: 5, sourceType: "run", sourceTitle: "条件分支运行检查" },
    { id: "growth-3", date: "昨天", title: "完成 State Schema 设计", description: "明确输入、过程字段和最终输出字段。", ability: "State 设计力", gain: 8, sourceType: "task", sourceTitle: "设计问答 State Schema" },
    { id: "growth-4", date: "昨天", title: "学习边与执行顺序", description: "标注顺序流程中每个节点的读写职责。", ability: "工作流结构力", gain: 6, sourceType: "course", sourceTitle: "LangGraph 工作流基础" },
    { id: "growth-5", date: "2026-06-01", title: "提交综合项目结构图", description: "将课程能力组合成可演示教学 Agent。", ability: "节点建模力", gain: 10, sourceType: "workflow", sourceTitle: "EduFlow 综合项目实战" },
    { id: "growth-6", date: "2026-05-31", title: "复盘项目分支流程", description: "解释 Router 和 Tool 如何支撑学习意图。", ability: "路由分支力", gain: 9, sourceType: "workflow", sourceTitle: "综合项目分支流程" },
    { id: "growth-7", date: "2026-05-30", title: "获得高分作业反馈", description: "教师确认项目演示说明完整清晰。", ability: "调试分析力", gain: 7, sourceType: "task", sourceTitle: "录制项目演示说明" },
    { id: "growth-8", date: "2026-05-29", title: "运行第一个教学工作流", description: "完成从 START 到 END 的完整演示路径。", ability: "工作流结构力", gain: 8, sourceType: "run", sourceTitle: "EduFlow LangGraph 示例" }
  ],
  recommendations: [
    {
      id: "rec-agent-tool",
      title: "继续学习《Agent 与 Tool 调用》",
      reason: "你的 Agent 编排力当前为 49 / 100，是当前最需要提升的能力。",
      targetAbility: "Agent 编排力",
      actionLabel: "去学习",
      targetUrl: "/courses/agent-tool-calls"
    },
    {
      id: "rec-branch-debug",
      title: "完成分支路径调试任务",
      reason: "调试分析力最近增长较慢，建议通过真实误判路径训练定位能力。",
      targetAbility: "调试分析力",
      actionLabel: "查看任务",
      targetUrl: "/tasks/task-branch-debug"
    },
    {
      id: "rec-workflows",
      title: "复盘一次成功运行",
      reason: "将成功运行转成结构说明，可以同时提升工作流结构力和调试分析力。",
      targetAbility: "工作流结构力",
      actionLabel: "打开工作流",
      targetUrl: "/workflows"
    }
  ]
};
