# BLOCKER

Reviewer 1（领域与数据权威），2026-10-06。审查对象为既有 `feature/project-capability-model` 分支上的 Phase 0 / 1 / 2 增量；起始 HEAD 为 `036b95caf4684dbc2a584e9ca46fb32d7e5964e2`。已完整读取本轮目标及四份正式契约。未修改核心代码，未执行 Reset、迁移或共享数据写入。

限定审查结束后，无未解决 BLOCKER。该结论仅覆盖以下已执行检查，不替代后续浏览器、视觉及最终 baseline 验收。

# REAL DEFECT

无未解决 REAL DEFECT。已提出、实施修复并限定复查的问题如下。

- **Phase 0，基线洁净性。** 旧 `.acceptance/practice-semantics/acceptance-ab-baseline-v2.json` 含 B 的一条 `in_progress` ActionRun，而原 verifier 仅检查与基线一致。主实施者未复用该旧基线，并在 `verify-workbench-reset.ts` 增加拒绝未结束基线 Run 的断言。Reviewer 检查了新的 `.acceptance/practice-planner-history/phase0-baseline.json.verify-current.json`：`pass=true`，A/B 的 ActionRun、Evidence、Diagnosis 均为零，外部保护哈希为 `b740c2f4e75c1d294fcec00154bb7231`。两次 Reset 同哈希由主实施者执行并报告；Reviewer 本人没有执行 Reset。
- **Phase 0 → Phase 1，Practice / Trace 边界。** 原规划 executor 只排除 Workflow，正式 Workbench 仍显示 Trace 最早失败点选择。Phase 1 增加共享 `isArtifactPracticeExecutor`，在 Route options、Action execution、Action catalog 和新 Assignment 提交入口设置守卫；Workbench 移除 Trace 提交 UI，旧理解检查 URL 不再进入成果 Workbench。历史结果读取与已保存提交的幂等恢复位于新执行 gate 之前。
- **Phase 0 → Phase 2，optional Edge 默认选择。** 原 Node 修改清空 `selectedEdgeIds` 后，执行规划默认采用所有事实关系。现实现自动纳入 hard prerequisite，保留仍在范围内的既有 optional 意图，新增 optional 不默认选择；缺少入口时返回 typed support / reachability issues。
- **Phase 0 → Phase 2，问题类型与历史恢复。** 原 issue 只有 Edge、Action 和中文 reason，目标不可达使用空 Edge ID；当前版本可恢复自己，失效历史没有重新规划入口。现模型明确八种 typed issue，API 与 hook 拒绝恢复当前版本，历史重新规划通过现有 Draft / Preview / Adopt 保留结构意图，旧快照不修改。
- **Phase 2 第一轮 → 第二轮，History inspect 与 restore 不一致。** 无文件写入的 `tsx` probe 复现：历史 prerequisite 同 stable Edge 从 hard 改为 soft，inspect 返回 `complete=true`，restore scope 校验却失败。修复后两处共用 `isExecutionScopeValid`，一致校验快照 valid、可见节点、旧 prerequisite 身份、端点和强度。回归测试覆盖 hard → soft、失效快照及不可见节点。
- **Phase 2 第一轮 → 第二轮，retained scope 遗漏新 hard Edge。** 无文件写入的 `tsx` probe 复现：旧范围中新增 live hard Edge，Preview 完整但 Adopt 后 inspector 报 `hard_edge_required`。修复后非历史 retained scope 从当前事实重建范围内 prerequisite 投影，并在 Preview 选择中纳入 live hard Edge；精确恢复继续校验历史决策，不修改旧快照。Handler 回归测试验证新增 hard Edge 自动纳入及历史对象未变化。
- **Phase 1 seed 复核，旧测试断言。** Trace seed 已改为 archived / unavailable，旧测试仍要求所有 Action active，首次复跑出现 1 项失败。断言随后同步为 Micro active、Trace retired；限定第二轮复跑通过。

已执行的验证：

- 只读审查 `reset-conversation-evidence.ts`、相关 guards、baseline scope、四份正式契约及 Route / Practice 当前边界。Reset 使用精确 A/B owner 与 enterprise course scope，事务保护哈希，混合 Diagnosis / 非测试 lineage abort，以及 Micro path / unit 归属校验。
- Phase 1 只读 Hosted 查询：active 且 available 的正式成果 Practice 绑定为 Answer 1、Code 1；Trace 绑定 27 条，均 archived 且 unavailable；跨 Edge active Assignment 重复组为 0。数据迁移为 `20261005154706_retire_trace_practice_and_enforce_artifact_bindings.sql`，保留 Action / Assignment / Route 历史身份，通过绑定、Action 和 Assignment 三个写入表面的约束维护成果 executor 与 canonical Edge。
- Phase 1 执行 `practiceBoundary`、`edge-actions`、`learning`、`assignmentEvaluator`、`enterprise-route-actions` 五个测试文件，37 / 37 PASS。
- Phase 2 第二轮执行 `routeExecution`、`route-plan`、`useRoutePlanning`、`enterprise-route-actions` 四个测试文件，62 / 62 PASS。仅复查第一轮的两项领域缺陷及既有 seed 断言；未新增审查范围。

# IMPROVEMENT

四份正式契约的旧 Trace Practice、加入 / 排除工具及旧验收数量表述，在 Phase 0 已指出需要随本轮更新。此项属于后续文档交付工作，不改变以上已复查代码与数据边界结论。

旧 enterprise seed 的退休状态与相应测试断言已经同步，原建议已处理。Trace 内容和历史 evaluator 保留可读性，既有 Micro 结构化理解检查测试仍有效。

# OUT OF SCOPE

本报告不涵盖 Phase 3 / 4 / 5 的真实浏览器体验、视觉、响应式、动画、录像及最终新 baseline 重建；这些交由对应阶段验收。未审 Graph 重建、Micro 全量迁移、旧 Advisor、embedding 或 `url.parse`。

本报告不声称 Reviewer 本人执行了 Hosted migration、Reset 两次或完整工程测试。相应实施与执行证据由主实施者负责；本报告只记录本 Reviewer 实际检查、执行的相关测试和收到的明确实施结果。
