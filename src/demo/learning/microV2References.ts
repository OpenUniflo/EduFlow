import type { MicroLearningPath, MicroStep, MicroInteraction } from "@/features/learning/micro/microLearning";
import type { FlowDefinition, SimulationDefinition, TransformationDefinition } from "@/shared/learning/microMechanisms";

// Reference teaching data, original authored explanations derived from mapped course sources.
// Runtime authority is the generated forward migration and /api/micro, never this fixture.
const flow: FlowDefinition = {
  type: "flow-execution", mode: "explore",
  teaching: { explanation: "模型只知道这次请求携带的消息。框架先执行工具，再把调用意图与对应结果一同发回模型；工具输出本身不等于最终回答。沿高亮连线核对每次信息由谁产生、交给谁。", feedback: {
    "missing-required-edge": "缺少必要的数据连接。检查工具观测是否回到了模型；模型没有收到结果，就没有再次决策的依据。",
    "unexpected-edge": "这条额外连接跳过了模型读取工具观测的过程。工具提供数据，模型结合请求形成最终回答。",
    "invalid-edge": "当前定义没有这条消息通路，请检查发送方与接收方。",
  } },
  nodes: [{ id: "user", label: "用户请求", x: 0, y: 30 }, { id: "model", label: "模型", x: 230, y: 30 }, { id: "tool", label: "框架执行工具", x: 470, y: 170 }, { id: "final", label: "最终回复", x: 470, y: -90 }],
  edges: [{ id: "request", from: "user", to: "model", label: "发送请求" }, { id: "call", from: "model", to: "tool", label: "tool_calls" }, { id: "result", from: "tool", to: "model", label: "tool 结果回传" }, { id: "answer", from: "model", to: "final", label: "无 tool_calls，返回文本" }, { id: "shortcut", from: "tool", to: "final", label: "工具直接结束" }],
  initialEdgeIds: ["request", "call", "result", "answer"], correctEdgeIds: ["request", "call", "result", "answer"],
  events: [
    { nodeId: "user", title: "1 · 用户提问", message: "user: 北京现在适合出门吗？", explanation: "本例需要实时天气。模型仅凭已有知识无法知道当前观测。" },
    { nodeId: "model", edgeId: "request", title: "2 · 模型决定调用工具", message: 'assistant.tool_calls: weather({city: "北京"}), id=call_1', explanation: "模型生成调用意图与参数；它还没有执行天气服务。" },
    { nodeId: "tool", edgeId: "call", title: "3 · 框架执行", message: "框架读取 tool_calls，调用 weather；收到：晴，22°C。", explanation: "实际代码由框架执行。工具返回数据，不替模型撰写最终回答。" },
    { nodeId: "model", edgeId: "result", title: "4 · 携带工具结果再次调用模型", message: "追加 assistant 的调用消息，以及 tool: 晴，22°C，tool_call_id=call_1；连同历史再次发送。", explanation: "模型必须看到调用和结果，才能依据观测继续推理；漏掉回传边会在这里停止。" },
    { nodeId: "final", edgeId: "answer", title: "5 · 返回最终文字", message: "assistant: 当前晴，22°C，适合出门。无 tool_calls。", explanation: "这次模型没有再请求工具，框架退出循环并把回复交给用户。这是示意数据，并非实时天气查询。" },
  ],
};
const simulation: SimulationDefinition = { teaching: { explanation: "梯度给出 Loss 上升的方向和变化率；沿负梯度移动才能局部降低它。学习率乘以梯度决定本次位移，而曲率决定移动之后梯度变化多快。比较相邻两次的参数、位移和 Loss，才能区分摆动衰减与发散。", feedback: {
  initial: "先读初始参数，乘以曲率得到梯度，再乘以负学习率得到下一步位移。",
  slow: "每次只消除少量误差，给定更新次数后仍未达到目标。适度增加学习率，再比较轨迹。",
  oscillating: "参数跨过最小值后改变方向。比较摆动幅度：衰减可能收敛，增大则会发散。",
  diverging: "跨过最小值后误差反而放大，梯度和更新幅度一起增大，Loss 上升。减小学习率再试。",
  converged: "更新幅度随梯度减小，参数趋近最小值。检查最终 Loss 是否达到当前目标。",
} }, type: "simulation", mode: "explore", parameter: { label: "学习率", min: .02, max: 1.4, step: .02, initial: .1 }, model: { kind: "quadratic-descent", curvature: 2, optimum: 0, initial: 4, steps: 12 }, target: { maxLoss: .02, maxGrowth: 1 } };
const transformation: TransformationDefinition = { teaching: { explanation: "矩阵的每个计数都必须能追溯到一句话中的窗口事件。中心词决定行，上下文词决定列。左右窗口会产生两个方向的独立事件，对称计数来自规则，不能手工补数，也不代表词义相同。", feedback: {
  "wrong-matrix-cell": "按中心词找行、上下文词找列；只给当前窗口事件对应的单元格加 1。",
  "current-event": "沿中心词 → 上下文词，找到行列交叉点；执行后这里加 1。反方向会作为另一个事件单独计数。",
  completed: "每个数字都来自真实窗口事件；每一行记录该词在这份语料中的邻居分布。",
} }, type: "data-transform", mode: "explore", corpus: [["I", "love", "AI"], ["I", "love", "deep", "learning"], ["I", "enjoy", "learning"]], vocabulary: ["I", "love", "AI", "deep", "learning", "enjoy"], window: 1 };
const step = (id: string, kind: MicroStep["kind"], title: string, body: string, interaction?: MicroInteraction, successFeedback?: string, retryFeedback?: string): MicroStep => ({ id, kind, title, body, interaction, successFeedback, retryFeedback: retryFeedback ?? (interaction && "teaching" in interaction ? interaction.teaching?.explanation : undefined) });
function path(id: string, knowledgeId: string, courseId: string, title: string, minutes: number, steps: MicroStep[]): MicroLearningPath {
  return { id, knowledgeId, courseId, scope: "course", title, description: "从最小解释到机制观察、动手实践与迁移。", estimatedMinutes: minutes, mode: "learn", required: true, status: "published", units: [{ id: `${id}-unit`, pathId: id, title, position: 0, estimatedMinutes: minutes, required: true, steps }] };
}
export const microV2References: MicroLearningPath[] = [
  path("aiad-rt01-agent-loop", "RT01", "ai-agents-in-depth", "Agent Loop：从调用意图到可靠回复", 10, [
    step("aiad-rt01-trace", "explanation", "为什么一次模型回复还不够？", "用户问实时天气时，模型需要外部观测。Agent Loop 把模型的一次调用变成可继续的循环：请求 → 模型决定 → 框架执行工具 → 结果回传 → 模型再决定。目标：分清谁决定、谁执行、什么时候结束。"),
    step("aiad-rt01-explain", "explanation", "先分清模型与框架", "模型返回 tool_calls 表示‘请调用这个工具’，不等于工具已执行。框架执行后，把 assistant 的调用消息和带 tool_call_id 的 tool 结果加入历史，再调用模型。只有模型不再返回 tool_calls 时，本例才结束。下面使用一个工具和示意天气数据。单步观察高亮节点与消息，或播放完整示范。", flow),
    step("aiad-rt01-demo", "interaction", "亲眼走一遍调用与回传", "先单步看每条消息，再播放完整过程。试着断开‘tool 结果回传’，观察为什么模型无法继续；恢复后重新运行。", flow, "你看到了意图、执行、结果回传和再次决策的不同阶段。", "检查数据是否回到了模型，并执行到最终回复。"),
    step("aiad-rt01-insight", "feedback", "工具输出为什么不能直接结束？", "工具输出只是观测。模型还要结合用户问题与历史解释观测；它也可能继续请求工具。调用消息与结果缺一不可，结果用调用 ID 对应回原请求。"),
    step("aiad-rt01-structure", "application", "修复一个库存查询循环", "换成查询库存：模型请求 stock，框架拿到‘剩余 3 件’，但错误连接把工具直接当成最终回复。断开错误连接，补回模型能读取观测的连接，再执行验证。", { ...flow, mode: "challenge", initialEdgeIds: ["request", "call", "shortcut", "answer"], events: flow.events.map((event) => ({ ...event, message: event.message.replace("北京现在适合出门吗？", "商品 A 还有库存吗？").replace('weather({city: "北京"})', 'stock({sku: "A"})').replace("天气服务", "库存服务").replace("weather", "stock").replace("晴，22°C", "剩余 3 件").replace("当前晴，22°C，适合出门", "商品 A 剩余 3 件").replace("适合出门", "可以下单"), explanation: event.explanation.replace("实时天气", "库存查询").replace("天气", "库存") })) }, "你把工具观测交回模型，并等到了不含 tool_calls 的最终回复。", "工具提供数据；最终回答需要模型结合用户问题。缺少结果回传，就缺少再次决策的依据。"),
    step("aiad-rt01-summary", "summary", "你现在能解释 Agent Loop", "模型 → 调用意图\n框架 → 执行工具，tool 消息回传结果\n模型 → 再决定；无 tool_calls 时结束\n\n换成搜索、库存或数据库查询时，仍应检查这条信息链是否完整。来源：课程原书第 2 章，PDF 第 40–47 页。"),
  ]),
  path("aiad-ctx01-message-context", "CTX01", "ai-agents-in-depth", "Message Context：谁说了什么，模型看到了什么", 10, [
    step("aiad-ctx01-hook", "explanation", "模型为什么会漏掉刚查到的信息？", "框架已经查询到库存，模型却说‘不知道’。先检查请求里是否带了正确角色的消息。目标：区分 system、user、assistant、tool 与独立的 tools 字段，并组织一次单工具请求的完整上下文。"),
    step("aiad-ctx01-explain", "explanation", "角色表示来源，tools 描述能力", "system 是行为约束；user 是用户请求；assistant 是模型的文字或 tool_calls；tool 是框架执行后返回的数据。tools 是独立字段，描述可调用工具及参数，并非聊天消息。下一次调用需要携带历史：模型不会自动知道框架刚刚做了什么。单步观察消息怎样进入下一次请求。", flow),
    step("aiad-ctx01-demo", "interaction", "观察上下文如何随着调用增长", "tools 字段先描述 weather 能力。随后观察 user 请求、assistant 调用、框架执行、tool 结果与再次模型请求：模型只能使用实际发送给它的消息。单步检查调用 ID 与结果 ID 的对应关系。", flow, "再次请求携带先前的请求、assistant 调用和 tool 结果，模型才能依据新观测回答。", "请完整执行，并检查工具结果是否回到模型上下文。"),
    step("aiad-ctx01-categorize", "interaction", "把信息放回正确位置", "拖动卡片按来源与作用分组。注意‘想调用工具’来自模型，‘工具查到的数据’来自框架。", { type: "categorize", items: [{ id: "policy", label: "你是库存助手；不要编造库存" }, { id: "question", label: "商品 A 还有几件？" }, { id: "decision", label: 'tool_calls: stock(A), id=call_1' }, { id: "observation", label: "剩余 3 件；tool_call_id=call_1" }, { id: "capability", label: "stock 工具描述：参数 sku 为字符串" }], categories: ["system", "user", "assistant", "tool", "tools 字段"], correctCategories: ["system", "user", "assistant", "tool", "tools 字段"] }, "来源分清了：assistant 生成意图，tool 保存观测；tools 描述可调用能力。", "约束属于 system，请求属于 user，模型的调用决定属于 assistant，执行结果属于 tool，函数描述属于独立 tools 字段。"),
    step("aiad-ctx01-insight", "feedback", "调用 ID 连接意图与结果", "assistant 中的 tool_calls 给出 call_1；tool 消息用 tool_call_id=call_1 对应它。发送给模型的上下文必须保留这个关系。工具定义不会替代工具结果；一段结果文字也不会替代先前的调用消息。"),
    step("aiad-ctx01-order", "application", "换成天气查询：整理单工具请求过程", "把五张卡片拖成正确时序。这是只有一个工具调用的例子；它不要求独立并行工具结果之间存在固定先后。", { type: "ordering", items: ["发送 system 约束、user 天气问题与 tools 定义", "模型返回 assistant.tool_calls，ID 为 call_7", "框架执行天气工具", "追加 assistant 调用及 tool 结果，结果引用 call_7", "把完整历史再次发给模型，获得解释天气的回复"], correctOrder: ["发送 system 约束、user 天气问题与 tools 定义", "模型返回 assistant.tool_calls，ID 为 call_7", "框架执行天气工具", "追加 assistant 调用及 tool 结果，结果引用 call_7", "把完整历史再次发给模型，获得解释天气的回复"] }, "结果是在真实执行之后产生的；再次请求让模型真正看到新观测。", "先有模型调用意图，再由框架执行；先执行获得结果，再把调用与结果一同加入历史发送。"),
    step("aiad-ctx01-summary", "summary", "你能检查一次模型请求了", "先按来源判断角色，再检查 tools 是否是能力定义、tool 是否是真实结果，最后用调用 ID 核对意图与结果。换一个工具时，这些规则不变。模型需要收到完整相关上下文。来源：原书第 2 章，PDF 第 39–47 页。"),
  ]),
  path("cds525-k012-learning-rate", "CDS525-K012", "cds525-deep-learning", "Learning Rate：看见更新如何收敛", 10, [
    step("cds525-k012-hook", "explanation", "步子越大，学得越快吗？", "训练通过降低 Loss 调整参数。小步可能很慢，大步可能跨过最小值并越来越远。目标：从真实更新轨迹解释学习率的影响，而不是记住一个固定的‘正确区间’。"),
    step("cds525-k012-explain", "explanation", "每一步都由同一个公式计算", "参数 \\(\\theta\\) 沿负梯度更新，学习率 \\(\\eta\\) 控制位移大小。\n\\[\\theta_{t+1}=\\theta_t-\\eta\\nabla C(\\theta_t)\\]\n这里 \\(C(\\theta)=\\theta^2\\)，梯度 \\(\\nabla C=2\\theta\\)，最小值在 \\(\\theta=0\\)。\n固定 \\(\\eta=0.1\\)，先读下方计算，再单步看参数和 Loss 如何变化。", simulation),
    step("cds525-k012-explore", "interaction", "比较慢、收敛、摆动与发散", "依次试 η=0.02、0.3、0.8、1.2；每次先单步，再播放。看参数是否跨过 0，以及跨过后距离是缩小还是放大。改学习率会重置轨迹，避免把两次实验混在一起。", simulation, "你观察了真实梯度更新；跨过最小值不一定失败，关键是摆动是否衰减。", "先执行完整轨迹，再解释 Loss 与步长的关系。"),
    step("cds525-k012-insight", "feedback", "决定稳定性的还有曲率", "这个模型里，误差每一步乘上 \\(1-\\eta\\times\\text{曲率}\\)。绝对值小于 1 时误差衰减；负号表示来回跨过最小值；绝对值大于 1 时误差放大。曲率变大，同样的 η 会带来更大的更新，因此没有所有任务通用的学习率区间。"),
    step("cds525-k012-challenge", "application", "换一个更陡的 Loss", "现在 \\(C(\\theta)=2(\\theta-1)^2\\)，曲率从 2 变成 4，最小值移到 θ=1。当前 η=0.8 会怎样？先观察，再调整，让 12 次更新后的 Loss 达标且不超过初始 Loss。", { ...simulation, mode: "challenge", parameter: { ...simulation.parameter, initial: .8 }, model: { ...simulation.model, curvature: 4, optimum: 1, initial: 5 } }, "你根据曲率变化调整了步长，并用计算后的 Loss 验证结果。", "曲率更大时，相同学习率会产生更大更新；根据轨迹与误差衰减调整。"),
    step("cds525-k012-summary", "summary", "你能用轨迹判断学习率", "位移：\\(\\Delta\\theta=-\\eta\\nabla C\\)\n轨迹：太小会慢；合适时误差缩小；太大可能摆动甚至发散。\n验证：比较更新前后的 Loss。\n\n换 Loss 时要重新观察曲率、轨迹和 Loss，不能照搬固定区间。本例是可解释的二次函数，不代表所有深度模型的完整行为。来源：Lecture 2，第 50 页的参数更新公式。"),
  ]),
  path("cds525-k021-cooccurrence-matrix", "CDS525-K021", "cds525-deep-learning", "Co-occurrence：词的邻居如何变成向量", 12, [
    step("cds525-k021-hook", "explanation", "一段文字如何变成数字表示？", "‘一个词经常和谁一起出现’可以描述它的上下文。共现矩阵把邻居事件变成计数；一行就是一个词的上下文向量。目标：能说出每个 cell 的数字来自哪些文本事件，而不只是修改数字。"),
    step("cds525-k021-explain", "explanation", "一次事件只增加一个 cell", "固定窗口为左、右各 1 个词，不跨句。句子 I love AI 中，以 love 为中心，会遇到左边 I、右边 AI：分别给 love 行的 I 列、AI 列加 1。换 I 为中心时，再给 I 行的 love 列加 1。行是中心词，列是上下文词。单步看每次高亮怎样对应矩阵加 1。", { ...transformation, corpus: [["I", "love", "AI"]], vocabulary: ["I", "love", "AI"] }),
    step("cds525-k021-explore", "interaction", "从原课例句逐个生成矩阵", "先自己点几个 cell，看数字从哪里来，再用单步或播放观察全部事件。橙色中心词与紫色上下文词对应唯一的行列交叉点；错误位置不会改变数据。", transformation, "课件中的三句话已经转成窗口计数；每行是一个词的邻居分布。", "用中心词找行，用它当前窗口内的上下文词找列。"),
    step("cds525-k021-insight", "feedback", "为什么出现对称计数？", "本例使用左右对称窗口，所以 love→AI 和 AI→love 各有独立事件。对称是这个统计定义的结果，并非手工补齐的目标。不同窗口或按整篇文档计共现，会改变事件集合。数字描述上下文关系，不自动证明两个词同义。"),
    step("cds525-k021-challenge", "application", "换一句话，自己构造计数", "对 I enjoy AI 逐事件点击 cell；这里没有自动填数。仍使用左右各 1 的窗口：I 与 AI 中间隔着 enjoy，不能直接计为邻居。", { ...transformation, mode: "challenge", corpus: [["I", "enjoy", "AI"]], vocabulary: ["I", "enjoy", "AI"] }, "你从新句子重建了四个有方向的邻居事件，并正确映射到矩阵。", "检查中心/上下文方向与词间距离；只统计当前窗口内的真实事件。"),
    step("cds525-k021-summary", "summary", "你知道这些数字从哪里来", "文本 + 窗口 → 中心词与上下文词事件\n事件 → 对应行列交叉点 +1\n矩阵的一行 → 该词的上下文向量\n\n换语料或窗口要重新计算事件，不能沿用原矩阵。来源：Lecture 3，第 25–26 页；探索使用第 26 页原始三句语料，练习是更小的迁移例句。"),
  ]),
];
