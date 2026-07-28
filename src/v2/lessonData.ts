import type { Material } from "./types";
import { COURSE_ID, MATERIAL_ID } from "./data";

export const lessonFourMaterial: Material = {
  id: MATERIAL_ID,
  courseId: COURSE_ID,
  title: "第四课：推理、规划与反思范式",
  subtitle: "智能体如何决定下一步",
  duration: "110 分钟",
  pageCount: 32,
  pages: [
    {
      id: "page-01",
      number: 1,
      section: "为什么需要不同的决策范式",
      title: "推理、规划与反思范式",
      lead: "当智能体收到目标后，它究竟应该怎样决定下一步做什么？本课研究的不是哪个 Prompt 更好，而是不同的任务求解结构。",
      bullets: ["Reasoning", "Planning", "Acting", "Observation", "Replanning", "Reflection"],
      knowledge: ["推理", "规划", "行动", "观察", "反思"]
    },
    {
      id: "page-02",
      number: 2,
      section: "为什么需要不同的决策范式",
      title: "一个看似简单的任务",
      lead: "比较三所高校的生成式 AI 使用政策，并提供带引用的建议。同一模型、同一组工具和同一批资料，可以采用完全不同的执行方式。",
      bullets: ["直接生成答案", "边搜索边判断", "先制定研究计划", "失败后修改计划", "完成初稿后评价并重写"],
      knowledge: ["任务分解", "执行结构", "完成条件"]
    },
    {
      id: "page-03",
      number: 3,
      section: "为什么需要不同的决策范式",
      title: "回答正确不等于任务完成",
      lead: "Agent 任务需要评价的不只是最后一句答案，还包括任务状态、信息来源、行动过程和约束满足情况。",
      knowledge: ["任务完成", "过程评价", "约束满足"],
      table: {
        headers: ["情况", "文字看似正确", "任务真正完成"],
        rows: [
          ["没有查阅指定资料", "可能", "否"],
          ["引用不存在", "可能", "否"],
          ["漏掉一所高校", "部分正确", "否"],
          ["忽略追加要求", "旧目标下正确", "否"],
          ["经过验证并满足约束", "是", "是"]
        ]
      }
    },
    {
      id: "page-04",
      number: 4,
      section: "为什么需要不同的决策范式",
      title: "五个核心概念",
      lead: "推理形成判断，规划组织行动，行动改变环境，观察读取反馈，反思评价过去的过程。",
      knowledge: ["Reasoning", "Planning", "Acting", "Observation", "Reflection"],
      table: {
        headers: ["概念", "含义", "典型问题"],
        rows: [
          ["推理", "根据现有信息形成判断", "当前缺少什么信息"],
          ["规划", "生成面向目标的行动结构", "按什么顺序完成"],
          ["行动", "对外部环境执行操作", "搜索、查询、调用工具"],
          ["观察", "获取行动后的反馈", "得到了什么、是否失败"],
          ["反思", "评价过程并提出改进", "为什么失败、怎样调整"]
        ]
      }
    },
    {
      id: "page-05",
      number: 5,
      section: "为什么需要不同的决策范式",
      title: "决策范式的两条轴",
      lead: "横轴表示是否预先规划，纵轴表示是否根据环境反馈调整。Reflection 可以附加在多种范式外部。",
      bullets: ["无预先规划 + 强反馈：ReAct", "强预先规划 + 弱反馈：Plan-and-Execute", "强预先规划 + 强反馈：Replanning", "无预先规划 + 弱反馈：Direct / Reactive"],
      knowledge: ["范式坐标", "反馈调整", "预先规划"]
    },
    {
      id: "page-06",
      number: 6,
      section: "Direct 与 Reactive",
      title: "Direct Response",
      lead: "当输入已经包含完成任务所需的全部信息，并且输出可以一次生成时，Direct 往往是正确选择。",
      bullets: ["单次生成", "没有外部行动", "没有环境观察", "没有显式循环", "适合改写、摘要、分类与提取"],
      code: "输入 → 模型 → 输出",
      knowledge: ["Direct", "最简单可行结构"],
      practiceId: "lesson-04-direct"
    },
    {
      id: "page-07",
      number: 7,
      section: "Direct 与 Reactive",
      title: "Reactive 范式",
      lead: "Reactive 系统根据当前状态立即选择行动，对局部变化敏感，但不一定维护完整长期计划。",
      bullets: ["关注当前状态", "响应速度快", "对局部变化敏感", "容易缺少全局一致性"],
      code: "当前观察 → 规则或模型决策 → 立即行动 → 新的观察",
      knowledge: ["Reactive", "环境反馈"]
    },
    {
      id: "page-08",
      number: 8,
      section: "Direct 与 Reactive",
      title: "Direct 与 Reactive 的局限",
      lead: "Direct 无法主动补充信息，Reactive 容易重复行动、缺少进度管理，并在长任务中偏离目标。",
      bullets: ["输入不完整时容易猜测", "无法根据反馈修正", "局部合理但全局不完整", "缺少步数与预算限制时成本失控"],
      knowledge: ["信息缺口", "局部最优", "成本控制"]
    },
    {
      id: "page-09",
      number: 9,
      section: "ReAct",
      title: "为什么只有推理或只有行动都不够",
      lead: "只有推理会缺少外部事实，只有行动会失去目标关联。ReAct 把决策与环境交互组成闭环。",
      bullets: ["只有推理：错误假设与幻觉会累积", "只有行动：工具选择缺少理由", "推理负责维护方向，行动负责获取新信息"],
      knowledge: ["ReAct", "推理与行动"]
    },
    {
      id: "page-10",
      number: 10,
      section: "ReAct",
      title: "ReAct 的基本结构",
      lead: "每一步决策都可以使用最新观察，需要明确停止条件与最大循环次数。",
      code: "目标 → 判断当前需要什么 → 选择行动 → 环境执行 → 获得观察 → 更新判断 → 继续或结束\n\nReason → Act → Observe → Reason → …",
      knowledge: ["ReAct Loop", "条件边", "停止条件"],
      practiceId: "lesson-04-react"
    },
    {
      id: "page-11",
      number: 11,
      section: "ReAct",
      title: "ReAct 执行示例",
      lead: "Agent 逐步搜索三所高校政策；发现学生博客不可信后，限定官方域名重新搜索并继续推进。",
      code: "步骤 1：搜索高校 A 官方政策 → 找到 2024 年页面\n步骤 2：搜索高校 B → 结果为学生博客\n步骤 3：限定官方域名重新搜索 → 找到教务处 PDF\n步骤 4：继续搜索高校 C",
      knowledge: ["执行轨迹", "来源验证", "状态更新"]
    },
    {
      id: "page-12",
      number: 12,
      section: "ReAct",
      title: "ReAct 的优势",
      lead: "ReAct 能适应环境反馈、降低封闭推理风险，并通过轨迹逐步缩小未知范围。",
      bullets: ["工具结果会改变下一步", "适合开放式信息任务", "轨迹容易观察", "可以逐步解决最关键的信息缺口"],
      knowledge: ["反馈适应", "开放环境", "可观察轨迹"]
    },
    {
      id: "page-13",
      number: 13,
      section: "ReAct",
      title: "ReAct 的典型失败",
      lead: "ReAct 解决了静态回答无法与环境交互的问题，但没有自动解决长期规划。",
      knowledge: ["无效循环", "过早结束", "工具漂移", "观察污染"],
      table: {
        headers: ["失败类型", "表现", "原因"],
        rows: [
          ["无效循环", "反复调用同一搜索", "状态没有变化"],
          ["过早结束", "一条资料后就回答", "完成条件不明确"],
          ["工具漂移", "调用无关工具", "当前目标丢失"],
          ["观察污染", "把不可信结果当事实", "缺少来源检查"],
          ["成本失控", "频繁调用模型和工具", "没有预算限制"]
        ]
      }
    },
    {
      id: "page-14",
      number: 14,
      section: "ReAct",
      title: "不要把 ReAct 等同于公开完整思维链",
      lead: "工程上需要的是可审计的决策证据，而不是无限制暴露冗长的内部生成文本。",
      bullets: ["展示当前子目标", "记录选择的行动", "保留行动理由摘要", "记录工具参数、观察结果和状态变化"],
      code: '{\n  "current_goal": "查找高校 B 的官方政策",\n  "action": "official_site_search",\n  "reason_summary": "现有来源不是官方材料",\n  "status_update": "university_b_complete"\n}',
      knowledge: ["结构化轨迹", "可审计性", "隐私"]
    },
    {
      id: "page-15",
      number: 15,
      section: "Plan-and-Execute",
      title: "为什么需要先规划",
      lead: "复杂任务具有多个子目标、依赖关系、不同工具、中间产物和完成标准。只做即时判断容易遗漏整体目标。",
      code: "确定研究范围 → 收集三所高校资料 → 验证可信度 → 抽取政策条款 → 比较差异 → 形成建议 → 检查引用与约束",
      knowledge: ["任务分解", "依赖", "完成标准"]
    },
    {
      id: "page-16",
      number: 16,
      section: "Plan-and-Execute",
      title: "Plan-and-Execute 结构",
      lead: "Planner 负责分解目标与定义步骤，Executor 读取当前步骤、选择工具、执行操作并更新状态。",
      code: "用户目标 → Planner → 结构化计划 → Executor → 逐项执行 → 完成检查 → 最终输出",
      bullets: ["Planner：步骤、依赖、产物、完成条件", "Executor：工具、执行、结果、状态", "二者可以使用不同模型和成本策略"],
      knowledge: ["Planner", "Executor", "结构化计划"],
      practiceId: "lesson-04-plan"
    },
    {
      id: "page-17",
      number: 17,
      section: "Plan-and-Execute",
      title: "一个合格的计划应包含什么",
      lead: "如果某一步无法回答输入是什么、输出是什么、怎样判断完成，它只是概括，不是可执行计划。",
      knowledge: ["计划质量", "输入输出", "完成条件"],
      table: {
        headers: ["步骤", "输入", "行动", "输出", "完成条件"],
        rows: [
          ["1", "任务要求", "提取范围和约束", "约束清单", "硬性要求全部识别"],
          ["2", "高校名单", "搜索官方政策", "三组来源", "每校至少一条官方来源"],
          ["3", "政策材料", "抽取条款", "结构化政策表", "包含允许、限制、禁止"],
          ["4", "政策表", "比较差异", "差异矩阵", "三校全部覆盖"],
          ["5", "差异矩阵", "生成建议", "初稿", "包含三条建议"],
          ["6", "初稿和来源", "验证", "最终稿", "引用、范围和字数通过"]
        ]
      }
    },
    {
      id: "page-18",
      number: 18,
      section: "Plan-and-Execute",
      title: "Plan-and-Execute 的优势和风险",
      lead: "计划可以保持全局目标、追踪进度并支持并行，但初始计划可能建立在错误假设上。",
      bullets: ["优势：保持整体结构、独立验收、估算成本、人工审核", "风险：计划失效、粒度失衡、规划成本、执行器机械执行错误计划"],
      knowledge: ["长程规划", "计划风险", "外部规划器"]
    },
    {
      id: "page-19",
      number: 19,
      section: "Replanning",
      title: "计划为什么会失效",
      lead: "工具失败、环境变化、目标追加、预算压力和权限约束都会让原计划不再有效。",
      bullets: ["工具超时", "新证据推翻假设", "用户追加隐私分析", "发现新的必要子任务", "原计划违反安全约束"],
      knowledge: ["计划失效", "环境变化", "目标变化"]
    },
    {
      id: "page-20",
      number: 20,
      section: "Replanning",
      title: "Replanning 不是重新从头生成",
      lead: "正确的 Replanning 应保留已完成结果，只修改尚未完成、受新信息影响的步骤。",
      code: "原计划：A✓ → B✓ → C失败 → 比较 → 写作\n新计划：保留 A/B → 为 C 增加替代来源 → 更新比较与写作约束",
      knowledge: ["增量重规划", "保留进度", "剩余计划"],
      practiceId: "lesson-04-replan"
    },
    {
      id: "page-21",
      number: 21,
      section: "Replanning",
      title: "Replanning 触发器",
      lead: "触发器需要被显式记录，并对应清楚的处理策略。",
      knowledge: ["触发器", "异常恢复", "预算压力"],
      table: {
        headers: ["触发器", "示例", "推荐处理"],
        rows: [
          ["Action Failure", "搜索超时", "重试、替代工具或修改路径"],
          ["Invalid Result", "来源不可信", "增加约束后重新搜索"],
          ["Missing Dependency", "缺少高校 C", "增加资料获取步骤"],
          ["Goal Change", "追加隐私分析", "修改剩余计划与验收"],
          ["Budget Pressure", "剩余 Token 不足", "缩小范围或切换模型"],
          ["Evaluation Failure", "初稿缺少引用", "新增引用检查与修订"]
        ]
      }
    },
    {
      id: "page-22",
      number: 22,
      section: "Reflection 与 Evaluator-Optimizer",
      title: "什么是反思",
      lead: "反思不是让模型重复回答，而是把结果或环境反馈转化为下一次行动的改进信息。",
      bullets: ["评价当前结果", "识别失败原因", "形成可执行改进", "决定是否继续、重试或改变策略"],
      knowledge: ["Reflection", "反馈转化", "策略改进"]
    },
    {
      id: "page-23",
      number: 23,
      section: "Reflection 与 Evaluator-Optimizer",
      title: "四种容易混淆的结构",
      lead: "Self-Critique、Self-Refine、Reflexion 与 Evaluator-Optimizer 的反馈来源和记忆范围不同。",
      knowledge: ["Self-Critique", "Self-Refine", "Reflexion", "Evaluator-Optimizer"],
      table: {
        headers: ["结构", "反馈来源", "是否保存经验", "主要用途"],
        rows: [
          ["Self-Critique", "模型评价当前输出", "通常不保存", "发现当前问题"],
          ["Self-Refine", "反馈并迭代修改", "当前任务内", "改善文本或答案"],
          ["Reflexion", "环境反馈形成语言反思", "保存到情景记忆", "改善后续尝试"],
          ["Evaluator-Optimizer", "独立标准或评价器", "可保存", "质量控制和返工"]
        ]
      }
    },
    {
      id: "page-24",
      number: 24,
      section: "Reflection 与 Evaluator-Optimizer",
      title: "Evaluator-Optimizer",
      lead: "评价器根据明确 Rubric 输出通过或修订建议，优化器据此修改结果。",
      code: "Generator → Evaluator → Pass / Revise → Optimizer → 再评价",
      knowledge: ["Evaluator", "Optimizer", "Rubric"],
      practiceId: "lesson-04-evaluator",
      table: {
        headers: ["维度", "通过标准"],
        rows: [
          ["覆盖度", "三所高校全部包含"],
          ["证据", "至少四条可验证引用"],
          ["准确性", "不得虚构政策"],
          ["结构", "包含比较、风险和建议"],
          ["约束", "800-1200 字"],
          ["可执行性", "建议可以落实到教学流程"]
        ]
      }
    },
    {
      id: "page-25",
      number: 25,
      section: "Reflection 与 Evaluator-Optimizer",
      title: "为什么评价器可能失败",
      lead: "评价器仍可能共享生成器的知识盲点，或因标准模糊而给出泛化反馈。",
      bullets: ["评价标准不明确", "同一模型共享盲点", "事实错误缺少外部验证", "对文风的偏好掩盖硬性约束", "循环修改造成成本上升"],
      knowledge: ["评价器偏差", "外部验证", "硬规则"]
    },
    {
      id: "page-26",
      number: 26,
      section: "Reflection 与 Evaluator-Optimizer",
      title: "反思什么时候值得使用",
      lead: "反思适合高价值、可评价、允许迭代的任务；不应成为所有请求的默认步骤。",
      bullets: ["有明确质量标准", "失败信息能转化为改进", "一次错误代价较高", "允许多轮修改", "有最大迭代与预算限制"],
      knowledge: ["反思边界", "停止条件", "迭代预算"]
    },
    {
      id: "page-27",
      number: 27,
      section: "多路径搜索与 Tree of Thoughts",
      title: "单一路径推理的局限",
      lead: "如果早期判断错误，后续步骤可能全部建立在错误基础上，并且很难回到前面比较其他方案。",
      code: "状态 0 → 判断 1 → 判断 2 → 判断 3 → 结果",
      bullets: ["无法比较多个可行方案", "局部合理不代表全局最优", "需要回溯的问题适合引入搜索"],
      knowledge: ["单一路径", "回溯", "候选方案"]
    },
    {
      id: "page-28",
      number: 28,
      section: "多路径搜索与 Tree of Thoughts",
      title: "Tree of Thoughts",
      lead: "ToT 生成多个候选中间状态，对候选进行评价、保留有希望的分支，并在必要时回溯。",
      code: "状态 0\n├─ 候选 A ─┬─ A1\n│          └─ A2\n└─ 候选 B ─┬─ B1\n           └─ B2",
      bullets: ["定义分支生成方式", "定义评分方法", "设置剪枝、停止和预算"],
      knowledge: ["Tree of Thoughts", "搜索", "剪枝"]
    },
    {
      id: "page-29",
      number: 29,
      section: "多路径搜索与 Tree of Thoughts",
      title: "搜索式推理的成本",
      lead: "当每层生成多个候选时，调用数量会快速增长，因此必须限制宽度、深度和预算。",
      bullets: ["Beam Search", "Top-K 保留", "规则剪枝", "低成本模型初筛", "外部验证器", "搜索深度限制"],
      knowledge: ["搜索预算", "Beam Search", "剪枝"]
    },
    {
      id: "page-30",
      number: 30,
      section: "范式选择",
      title: "六种范式比较",
      lead: "范式之间不是互斥标签，选择应从任务特征和主要失败模式出发。",
      knowledge: ["范式比较", "反馈", "循环"],
      table: {
        headers: ["范式", "预先规划", "利用反馈", "主要优势", "主要风险"],
        rows: [
          ["Direct", "否", "否", "快、便宜、稳定", "无法补充信息"],
          ["Reactive", "弱", "是", "响应环境快", "缺少全局目标"],
          ["ReAct", "局部", "是", "边做边调整", "循环与漂移"],
          ["Plan-and-Execute", "强", "较弱", "保持整体结构", "初始计划可能错误"],
          ["Replanning", "强且动态", "是", "适应变化", "复杂度和成本高"],
          ["Reflection", "不固定", "使用结果反馈", "改善输出或策略", "评价器可能不可靠"]
        ]
      }
    },
    {
      id: "page-31",
      number: 31,
      section: "范式选择",
      title: "选择范式的决策表",
      lead: "先采用最简单可行结构，识别失败模式，再只增加解决该失败所需的机制。",
      knowledge: ["架构选择", "任务特征", "失败模式"],
      table: {
        headers: ["任务特征", "推荐起点"],
        rows: [
          ["信息完整、一步可完成", "Direct"],
          ["只需根据当前状态响应", "Reactive"],
          ["需要反复使用工具", "ReAct"],
          ["有稳定多步骤结构", "Plan-and-Execute"],
          ["计划容易失效", "Replanning"],
          ["输出有明确质量标准", "Evaluator-Optimizer"],
          ["需要比较多个策略", "Tree of Thoughts"],
          ["高风险且不可自动判断", "人工审核"]
        ]
      }
    },
    {
      id: "page-32",
      number: 32,
      section: "范式选择",
      title: "一个现实系统通常是混合的",
      lead: "混合不是堆叠所有复杂机制，每一层都应解决一个明确问题。",
      code: "用户目标\n↓\nPlan-and-Execute：总体计划\n↓\nReAct：逐步搜集资料\n↓\nReplanning：处理工具失败与目标变化\n↓\nEvaluator-Optimizer：检查质量\n↓\n高风险结论进入人工审核",
      bullets: ["Plan 解决任务遗漏", "ReAct 解决环境交互", "Replanning 解决计划失效", "Evaluator 解决质量不达标", "Human 承担不可自动化的风险"],
      knowledge: ["混合架构", "Human-in-the-Loop", "失败模式"]
    }
  ]
};

export const lessonFourPractices = [
  {
    id: "lesson-04-direct",
    title: "模板一：Direct",
    structure: "START → LLM → END",
    actions: ["输入研究任务并运行一次", "记录是否主动查找资料", "检查引用完整度"],
    observation: "成本低、速度快，但可能虚构来源，也无法处理工具故障。"
  },
  {
    id: "lesson-04-react",
    title: "模板二：ReAct",
    structure: "Agent → conditional → Tools → Agent",
    actions: ["把最大步骤设为 4、8 和 12", "比较完成度、成本和循环", "找出一次低价值工具调用"],
    observation: "能根据搜索结果继续行动，但需要明确完成条件和循环上限。"
  },
  {
    id: "lesson-04-plan",
    title: "模板三：Plan-and-Execute",
    structure: "Planner → Plan → Executor → Completion Check",
    actions: ["检查计划的输入、输出和完成条件", "删除一个必要步骤后运行", "比较计划完整性"],
    observation: "计划是可检查的中间产物，错误计划也会被执行器机械执行。"
  },
  {
    id: "lesson-04-replan",
    title: "模板四：Replanning",
    structure: "Planner → Executor → Success? → Replanner",
    actions: ["触发搜索超时", "模拟高校 C 无公开政策", "追加隐私分析要求"],
    observation: "应保留已完成结果，只修改受影响的剩余步骤。"
  },
  {
    id: "lesson-04-evaluator",
    title: "模板五：Evaluator-Optimizer",
    structure: "Generator → Evaluator → Pass / Revise → Optimizer",
    actions: ["先使用模糊评价标准", "再使用结构化 Rubric", "比较反馈与最终结果"],
    observation: "硬规则应由程序检查，开放质量可以交给模型评价。"
  }
];

export const discussionQuestions = [
  {
    question: "ReAct 调用更多工具，是否必然比 Direct 更可靠？",
    answer: "不一定。工具可能返回错误或过时资料，也可能被错误调用。可靠性来自正确选择、结果验证和完成标准。"
  },
  {
    question: "Plan-and-Execute 是否一定比 ReAct 适合长任务？",
    answer: "不一定。高度动态的环境会让长期计划快速失效，更好的方式可能是高层规划、阶段内 ReAct、定期 Replan。"
  },
  {
    question: "同一个模型评价自己的输出，是否可信？",
    answer: "可以发现部分结构问题，但可能共享知识盲点，需要结合规则、外部工具、不同模型和人工抽检。"
  },
  {
    question: "什么时候应该停止反思和修改？",
    answer: "当硬性标准通过、质量达到阈值、连续提升不足、达到最大迭代、预算不足或需要人工判断时停止。"
  }
];

export const acceptanceItems = [
  "至少运行四种模板",
  "每种模板保存一条完整执行轨迹",
  "记录模型调用和工具调用次数",
  "找出每种模板的一个主要失败模式",
  "对同一任务推荐一种最终架构",
  "说明为什么不选择其他方案",
  "提供至少三项量化证据"
];

export const homeworkItems = [
  "定义任务目标与可能的环境变化",
  "选择 Direct、ReAct、Plan-and-Execute、Replanning 或 Reflection",
  "画出简化执行结构并定义完成条件",
  "定义至少两个失败触发器",
  "说明是否需要评价器与人工介入",
  "估计主要成本来源和最可能的失败"
];

export const teacherChecklist = [
  "五个可运行模板与固定政策资料库",
  "搜索工具或模拟搜索结果",
  "搜索超时、过期资料与内容冲突场景",
  "中途追加要求与引用不足初稿",
  "运行轨迹、调用次数、Token 和时间统计",
  "学生实验记录表与自动验收规则"
];

