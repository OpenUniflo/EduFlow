# 当前交付范围与验收边界

更新：2026-10-21。本文保留当前需要理解的能力、限制和验证入口；已完成阶段的实施经过、失败/复验明细及源码散列台账已归档。历史通过记录不表示当前线上环境刚被重新验收。

## 工作流能力

| 能力 | 已实现范围 | 当前依据 |
| --- | --- | --- |
| 定义与运行 | 单一 V2 画布、认证 API、版本化定义和服务端 LangGraph 执行 | [运行契约](../architecture/WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md)、[V2 设计](../architecture/WORKFLOW_V2_DESIGN.md) |
| 并行、子图与恢复 | 并行分发/汇合、嵌套子图、检查点、多节点中断和按身份部分恢复 | [运行契约](../architecture/WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md)；子图产品工作区仍有未解决问题，见下 |
| 扩展和隔离 | 版本化函数、Python/JavaScript 隔离、Context、Reducer、连接与执行策略 | [执行决策](../architecture/decisions/0004-workflow-p4-local-execution.md) |
| 流、多轮与历史 | 真实增量事件、多轮 Thread、作用域 Store、检查点查看、状态更新与分支 | [流与状态决策](../architecture/decisions/0005-workflow-p5-stream-memory-history.md) |
| Hosted | Vercel + Supabase 配置、Worker/watchdog、隔离执行、就绪信号和受控维护 | [部署决策](../architecture/decisions/0006-workflow-p6-hosted.md)、[运维手册](../architecture/WORKFLOW_HOSTED_RUNBOOK.md) |

上述功能不能绕过身份、版本、预算、外部副作用和课程完成边界。工作流运行成功不自动完成实训或授予知识掌握度。运行历史有保留上限，不代表旧 Run 和事件永久可读。

## 仍需保留的限制

- 2026-10-19 的 Hosted 验收只覆盖当时的指定 Production 部署、一个 Worker、两个测试 owner、有限并发和约 15 分钟观察；不证明无界容量、多日可用性或当前线上健康。Preview READY 不能替代后台就绪验证。
- 有活跃任务时直接切换部署曾出现失联；当时通过的是暂停新提交、自然排空、preflight 后提升的受控维护方式，不能宣称开放流量下零停机或原子切换。
- 备份/恢复结论覆盖冻结快照的一致隔离读回，不等于全站冷启动、连续 PITR 或可任意恢复历史执行器的外部写操作。秘密需单独重配。
- 外部写效果未知、不可恢复检查点、过期/撤权或执行器不兼容时应明确拒绝，不能盲目重试或伪造成功。模型截断、缺少成功结束原因、空正文也不能仅凭 Run success 认定内容合格。
- 历史分支说明与禁用原因有既有非阻塞易用性建议；历史报告中的 Supabase advisor 提醒及明确受限组合未被本次目录整理清除。具体运行组合以当前契约和 ADR 为准。
- [本次人工体验问题](WORKFLOW_USER_REVIEW_2026-10-20.md)仍未修复：运行输入/State 映射不直观、气泡摘要难读、人工介入缺少上下文、子图独立工作区/每次调用历史不足，以及表单空值与高级 JSON 的行为不一致。已有子图执行能力不等于已交付独立可复用子图画布。

## 其他模块的交付依据

课程路线与 Action 的当前语义见 [Capability/Route/Action 契约](../architecture/CAPABILITY_ROUTE_ACTION_CONTRACT.md)及 [V3 模型](../PROJECT_CAPABILITY_MODEL_V3.md)；对话式实训和证据权威见 [对话证据契约](../architecture/CONVERSATION_EVIDENCE_CONTRACT.md)。旧 V1/V2 模型规格和各批 Preview 验收报告不再作为当前定义。

历史报告曾记录 AI 语义误差、耗时/Embedding 超时、部分课程/关系缺少学习资源等限制。本次没有为这些问题重做验收或宣布解决；教学资源可用性依当前数据库和授权数据确定。教学演练结果也不证明真实企业绩效。后续实际问题应进入明确问题记录，不继续追加到旧阶段流水账。

## 当前验证与使用

```sh
pnpm test:workflow
pnpm workflow:check-layout
pnpm lint
pnpm build
```

固定离线回归包含目录、前端、Worker、跨语言 Schema/哈希和四类 SDK 契约，不读取历史阶段索引，不执行 Hosted、付费模型、真实浏览器或数据库重置。Local DB 集成测试在此入口跳过。当前手册见 [人工验收](WORKFLOW_MANUAL_ACCEPTANCE_GUIDE.md)与 [A/B/C 场景](WORKFLOW_AGENT_SCENARIOS_GUIDE.md)。

2026-10-21 本轮文档收尾验证：移开历史归档后，前端 157 文件/1229 项、Worker 212 项通过/12 项 Local DB 测试跳过、31 个跨语言向量一致、47 项 SDK 检查通过；lint 和生产构建通过。当前文档链接检查无缺失，Git 已忽略但仍跟踪文件为 0。115 份迁移及既有业务源码未变；没有重新执行 Hosted、付费模型或真实浏览器验收。详细命令输出保存在忽略的本机检查目录，不继续新增阶段台账。
