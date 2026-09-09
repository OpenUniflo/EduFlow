# Student-Facing Content — Full Step Audit

2026-09-10 (Asia/Shanghai). Single Agent semantic review. Source and Hosted baseline: 12 Published Paths / 65 Steps. Every title, body/Summary, Step success/retry feedback, interaction option/instruction, event message/explanation and mechanism teaching/reason feedback was read. Runtime source is Hosted; reviewed offline authority is `data/gold-courses/ai-agents-in-depth-rich-content.json` → existing generator → forward migration.

## Findings and decisions

12 Steps contain source locators; 14 contain authoring/textbook voice (11 with 教学改编 labels); combined source/authoring candidates are 26 distinct Steps. Route review expands beyond the known 10 forward-route Steps to 19 cross-item or syllabus references. Two completion/capability disclaimers include the known S03 Summary and the A02 introductory claim. These categories overlap: 36 unique changed Steps, 29 unchanged. No behavior or feedback field changes.

“角色表示来源”, “按来源与作用分组”, message-source feedback and mechanism “下一步” are legitimate knowledge, retained. “先前的示例” in S01 s4 refers to the current Micro example and remains. “这里的文字只是教学中的决策说明” protects simulation truthfulness, retained. Material, source PDF, mapping and provenance records remain untouched.

## All 65 Steps

Each row covers all visible fields, including those with no keyword match.

| Knowledge | Step / title | Decision | Necessary caveat explicitly checked |
| --- | --- | --- | --- |
| LLM Message Context | aiad-ctx01-hook · 模型为什么会漏掉刚查到的信息？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| LLM Message Context | aiad-ctx01-explain · 角色表示来源，tools 描述能力 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 示意数据，非实时天气查询 |
| LLM Message Context | aiad-ctx01-demo · 观察上下文如何随着调用增长 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 示意数据，非实时天气查询 |
| LLM Message Context | aiad-ctx01-categorize · 把信息放回正确位置 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| LLM Message Context | aiad-ctx01-insight · 调用 ID 连接意图与结果 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| LLM Message Context | aiad-ctx01-order · 换成天气查询：整理单工具请求过程 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 单工具示例不约束独立并行结果顺序 |
| LLM Message Context | aiad-ctx01-summary · 检查模型请求的关键点 | Removed — Provenance | Other teaching/interaction limits preserved |
| LLM Agent Architecture | aiad-l1-a02-s1 · 先从你用过的聊天开始 | Removed — Product State | Other teaching/interaction limits preserved |
| LLM Agent Architecture | aiad-l1-a02-s2 · Agent 先看，再决定，再行动 | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| LLM Agent Architecture | aiad-l1-a02-s3 · 先认识三个协作角色 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| LLM Agent Architecture | aiad-l1-a02-s4 · 谁把这些角色连起来？ | Rewritten — Authoring Metadata | Retained — Necessary Caveat: Harness 定义范围；图不表示全部 State 原样进入 Context |
| LLM Agent Architecture | aiad-l1-a02-s4-bridge · 把关系放回同一个任务 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| LLM Agent Architecture | aiad-l1-a02-s5 · Agent 内外的职责与信息链 | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Observation and Action Spaces | aiad-l1-agc01-s1 · 为什么懂订票，却只能给建议？ | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Observation and Action Spaces | aiad-l1-agc01-s2 · 两个“空间”是两份范围 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Observation and Action Spaces | aiad-l1-agc01-s3 · 同一个模型，两种卡点 | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Observation and Action Spaces | aiad-l1-agc01-s4 · 检查一下：还缺哪一块？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Observation and Action Spaces | aiad-l1-agc01-s5 · 看得见与做得到 | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agent Harness | aiad-l1-agc02-s1 · 能转一圈，还可能出什么错？ | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agent Harness | aiad-l1-agc02-s2 · 先让任务运行起来 | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agent Harness | aiad-l1-agc02-s3 · 再问三件事：允许吗、做对吗、怎么办？ | Rewritten — Authoring Metadata | Retained — Necessary Caveat: 治理不保证永不出错，也不总是重试 |
| Agent Harness | aiad-l1-agc02-s4 · 不要把整个世界都叫 Harness | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agent Harness | aiad-l1-agc02-s5 · 是谁应该解决这个问题？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Agent Harness | aiad-l1-agc02-s6 · 两层职责不要混在一起 | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Model Selection | aiad-l1-agc03-s1 · 排行榜第一，就一定适合吗？ | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Model Selection | aiad-l1-agc03-s2 · 用同一个真实任务比较 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Model Selection | aiad-l1-agc03-s3 · 别混淆两种失败 | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Model Selection | aiad-l1-agc03-s4 · 你会先做哪一步？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Model Selection | aiad-l1-agc03-s5 · 选择是一组取舍 | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Workflow | aiad-l1-h02-s1 · 有些顺序不能随意改变 | Rewritten — Authoring Metadata | Retained — Necessary Caveat: 订票次序是该示例的业务规则，不是通用事实 |
| Workflow | aiad-l1-h02-s2 · 固定的是控制路径 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Workflow | aiad-l1-h02-s3 · 换需求时，两种路线怎样不同？ | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Workflow | aiad-l1-h02-s4 · 模型出现了，就不是工作流了吗？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Workflow | aiad-l1-h02-s5 · 固定与自主如何选？ | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| ReAct | aiad-l1-r10-s1 · 有了工具，为什么还要循环？ | Removed — Route Coupling | Other teaching/interaction limits preserved |
| ReAct | aiad-l1-r10-s2 · 看两轮：结果怎样改变查询 | Rewritten — Authoring Metadata | Retained — Necessary Caveat: 预设轨迹，不调用真实服务；决策说明不是实际模型执行 |
| ReAct | aiad-l1-r10-s3 · 断开与恢复结果回传 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 预设教学轨迹；不能推断所有系统的报错方式 |
| ReAct | aiad-l1-r10-s4 · 循环不是永远调用工具 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| ReAct | aiad-l1-r10-s5 · ReAct 的反馈循环 | Removed — Provenance | Other teaching/interaction limits preserved |
| Guardrail | aiad-l1-s01-s1 · 只检查最后一句话，来得及吗？ | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Guardrail | aiad-l1-s01-s2 · 三道边界，各管不同问题 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Guardrail | aiad-l1-s01-s3 · 把检查放在出事之前 | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Guardrail | aiad-l1-s01-s4 · 把三种检查放回边界 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Guardrail | aiad-l1-s01-s5 · 护栏是分层控制，不是安全保证 | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Sandbox | aiad-l1-s02-s1 · 工具执行错了，会碰到什么？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Sandbox | aiad-l1-s02-s2 · 沙盒隔离的是什么？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Sandbox | aiad-l1-s02-s3 · 隔离前后，观察影响范围 | Rewritten — Authoring Metadata | Retained — Necessary Caveat: 隔离不保证计算正确，过度开放仍有风险 |
| Sandbox | aiad-l1-s02-s4 · 隔离成功，汇总结果就可靠吗？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Sandbox | aiad-l1-s02-s5 · 隔离回答的是“能影响哪里” | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Least Privilege | aiad-l1-s03-s1 · 隔离好了，还要给多少权限？ | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Least Privilege | aiad-l1-s03-s2 · 先列任务，再列权限 | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Least Privilege | aiad-l1-s03-s3 · 选一份够用的权限 | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Least Privilege | aiad-l1-s03-s4 · 三种控制互相配合 | Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Least Privilege | aiad-l1-s03-s5 · 行动、反馈与权限的关键边界 | Removed — Provenance; Removed — Product State; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agentic Workflow | aiad-l1-wf05-s1 · 既要灵活，也有不能跳过的关口 | Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agentic Workflow | aiad-l1-wf05-s2 · 一个混合流程：寻找方案与确认分开 | Rewritten — Authoring Metadata | Retained — Necessary Caveat: 混合流程为示例，具体关口取决于任务规则 |
| Agentic Workflow | aiad-l1-wf05-s3 · 说完成，与真完成，是两件事 | Removed — Route Coupling; Rewritten — Authoring Metadata | Other teaching/interaction limits preserved |
| Agentic Workflow | aiad-l1-wf05-s4 · 哪一步不能交给一句承诺？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Agentic Workflow | aiad-l1-wf05-s5 · 不是在两种模式之间二选一 | Removed — Provenance; Removed — Route Coupling | Other teaching/interaction limits preserved |
| Agent Loop | aiad-rt01-trace · 为什么一次模型回复还不够？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Agent Loop | aiad-rt01-explain · 先分清模型与框架 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 单工具、示意天气；本例退出条件 |
| Agent Loop | aiad-rt01-demo · 亲眼走一遍调用与回传 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 示意数据，非实时天气查询 |
| Agent Loop | aiad-rt01-insight · 工具输出为什么不能直接结束？ | Reviewed — unchanged teaching | Other teaching/interaction limits preserved |
| Agent Loop | aiad-rt01-structure · 修复一个库存查询循环 | Reviewed — unchanged teaching | Retained — Necessary Caveat: 库存为示意数据，非服务调用（原有“库存查询查询”重复字样保留，interaction 不在本轮修改） |
| Agent Loop | aiad-rt01-summary · Agent Loop 的完整信息链 | Removed — Provenance | Other teaching/interaction limits preserved |

## Exact reviewed edits

- **aiad-ctx01-summary — Removed — Provenance**: “来源：原书第 2 章，PDF 第 39–47 页。” → removed; remaining teaching retained.
- **aiad-l1-a02-s5 — Removed — Provenance**: “来源：教材 PDF15–16、27。” → removed; remaining teaching retained.
- **aiad-l1-agc01-s5 — Removed — Provenance**: “来源：教材 PDF16–17。” → removed; remaining teaching retained.
- **aiad-l1-agc02-s6 — Removed — Provenance**: “来源：教材 PDF26–28。” → removed; remaining teaching retained.
- **aiad-l1-agc03-s5 — Removed — Provenance**: “来源：教材 PDF29–30。” → removed; remaining teaching retained.
- **aiad-l1-h02-s5 — Removed — Provenance**: “来源：教材 PDF30–32。” → removed; remaining teaching retained.
- **aiad-l1-r10-s5 — Removed — Provenance**: “来源：教材 PDF22–23、31。” → removed; remaining teaching retained.
- **aiad-l1-s01-s5 — Removed — Provenance**: “来源：教材 PDF33–34。” → removed; remaining teaching retained.
- **aiad-l1-s02-s5 — Removed — Provenance**: “来源：教材 PDF121的执行隔离、PDF27的边界、PDF19的受限代码工具。” → removed; remaining teaching retained.
- **aiad-l1-s03-s5 — Removed — Provenance**: “来源：教材 PDF115、152。” → removed; remaining teaching retained.
- **aiad-l1-wf05-s5 — Removed — Provenance**: “来源：教材混合模式 PDF31–32、人工干预33–34、过程与结果173。” → removed; remaining teaching retained.
- **aiad-rt01-summary — Removed — Provenance**: “来源：课程原书第 2 章，PDF 第 40–47 页。” → removed; remaining teaching retained.
- **aiad-l1-a02-s1 — Removed — Product State**: “本节带你认识 Agent 的组成、反馈循环、工作流取舍与安全边界。你不需要先会编程；学完要能解释它如何做事，不代表已经能独立开发系统。” → “这里从 Agent 的组成与信息交接开始，不需要先会编程。”.
- **aiad-l1-a02-s2 — Rewritten — Authoring Metadata**: “以上为教材场景的教学改编。” → removed; remaining teaching retained.
- **aiad-l1-a02-s4 — Rewritten — Authoring Metadata**: “教材用 Harness 指” → “这里的 Harness 指”.
- **aiad-l1-a02-s5 — Removed — Route Coupling**: “下一项介绍系统开放的信息与操作范围。” → removed; remaining teaching retained.
- **aiad-l1-agc01-s1 — Removed — Route Coupling**: “上一项分清了模型与环境。现在假设” → “假设”.
- **aiad-l1-agc01-s3 — Rewritten — Authoring Metadata**: “教学改编：” → “同一订票任务中的两种情况：”.
- **aiad-l1-agc01-s5 — Removed — Route Coupling**: “下一项把这些角色放进一次循环：为什么做完还要再看？” → removed; remaining teaching retained.
- **aiad-l1-agc02-s1 — Removed — Route Coupling**: “上一项已经把反馈交回模型。但如果” → “即使反馈已经交回模型，如果”.
- **aiad-l1-agc02-s2 — Removed — Route Coupling**: “这里先理解职责；怎样保存状态、组织具体消息，是下一节内容。” → removed; remaining teaching retained.
- **aiad-l1-agc02-s3 — Rewritten — Authoring Metadata**: “以上是教材机制的教学改编。” → removed; remaining teaching retained.
- **aiad-l1-agc02-s4 — Removed — Route Coupling**: “后面会用同一任务展开。” → removed; remaining teaching retained.
- **aiad-l1-agc02-s6 — Removed — Route Coupling**: “下一项再讨论模型选型：先分清问题属于哪一层，才知道换模型是否有帮助。” → “先分清问题属于哪一层，才知道换模型是否有帮助。”.
- **aiad-l1-agc03-s1 — Removed — Route Coupling**: “前面练习过模型与运行层的职责区别。选模型也要” → “选模型要”.
- **aiad-l1-agc03-s3 — Rewritten — Authoring Metadata**: “教学改编：两个候选模型” → “设想两个候选模型”.
- **aiad-l1-agc03-s5 — Removed — Route Coupling**: “接下来比较另一种选择：步骤由程序预设，还是由模型根据结果决定？” → removed; remaining teaching retained.
- **aiad-l1-h02-s1 — Rewritten — Authoring Metadata**: “选好模型后，还要决定怎样组织步骤。教材的订票示例规定：” → “在这个订票示例中，流程依次为：”.
- **aiad-l1-h02-s3 — Rewritten — Authoring Metadata**: “教学改编：两种系统” → “设想两种系统”.
- **aiad-l1-h02-s5 — Removed — Route Coupling**: “下一项把两者放到一个任务中，看看怎样分工。” → removed; remaining teaching retained.
- **aiad-l1-r10-s1 — Removed — Route Coupling**: “前一项介绍了观察与动作。” → removed; remaining teaching retained.
- **aiad-l1-r10-s2 — Rewritten — Authoring Metadata**: “教学改编：用户” → “在这个示例中，用户”.
- **aiad-l1-s01-s1 — Removed — Route Coupling**: “前面看到，Agent” → “Agent”.
- **aiad-l1-s01-s3 — Rewritten — Authoring Metadata**: “教学改编：” → “以订票任务为例：”.
- **aiad-l1-s01-s5 — Removed — Route Coupling**: “下一项看执行侧的一种具体控制：把代码的影响限制在隔离环境里。” → removed; remaining teaching retained.
- **aiad-l1-s02-s3 — Rewritten — Authoring Metadata**: “教学改编：任务” → “设想任务”.
- **aiad-l1-s02-s5 — Removed — Route Coupling**: “下一项用最小权限收束这一节。” → removed; remaining teaching retained.
- **aiad-l1-s03-s1 — Removed — Route Coupling**: “上一项用沙盒缩小影响范围。但如果” → “沙盒可以缩小影响范围。但如果”.
- **aiad-l1-s03-s2 — Rewritten — Authoring Metadata**: “教学改编：任务是” → “设想任务是”.
- **aiad-l1-s03-s4 — Rewritten — Authoring Metadata**: “教材也要求凭证范围与有效期受限” → “凭证应限制作用范围和有效期”.
- **aiad-l1-s03-s5 — Removed — Product State**: “学习活动完成不是独立开发能力或掌握证明。” → removed; remaining teaching retained.
- **aiad-l1-s03-s5 — Removed — Route Coupling**: “下一节展开上下文、状态与 Agent Loop 的具体组织方式。” → removed; remaining teaching retained.
- **aiad-l1-wf05-s1 — Removed — Route Coupling**: “本节还关注相应的检查和审批。” → “相应的检查和审批仍需落实。”.
- **aiad-l1-wf05-s2 — Rewritten — Authoring Metadata**: “跨节教学改编：” → “在这个订票示例中：”.
- **aiad-l1-wf05-s2 — Rewritten — Authoring Metadata**: “这段是教材混合模式、人工干预和结果检查原则的组合示例，不是原书完整流程照录。” → “这个示例把灵活查询放在固定检查与审批之间；具体关口取决于任务规则。”.
- **aiad-l1-wf05-s3 — Removed — Route Coupling**: “前面 Harness 的验证就是运行中进行检查；” → “Harness 的验证是在运行中进行检查；”.
- **aiad-l1-wf05-s3 — Rewritten — Authoring Metadata**: “教学改编：Agent” → “设想 Agent”.
- **aiad-l1-wf05-s5 — Removed — Route Coupling**: “下一项把这些安全检查放回输入、执行和输出的边界。” → removed; remaining teaching retained.

## Final semantic audit

All 65 Steps rechecked after edits. Source/PDF/author metadata = 0; authoring labels = 0; Course-route prose = 0; product-state prose = 0. Thirteen explicitly reviewed caveat-bearing Steps above preserve simulation and factual limits (including the rewritten WF05 example scope). The allowed knowledge uses of 来源 and 下一步 remain. All existing interaction objects, answers, grading configuration, explanations/captions and Step feedback are byte/structure-equivalent to baseline. Only newly empty rich-text structures were removed; shared Rich Text code, schema and styles were not changed.
