# 可复用验收输入

这里保留可以重复使用的输入资料，不保存运行输出、账号、数据库快照或模型响应。

- `capability-evidence-action-loop/gold-inputs/`：20 份能力证据诊断输入，覆盖正确/错误计算、部分证据、跨资料、无匹配等情形。它们是输入，不能作为固定诊断结论或生产内容 fallback。
- `capability-evidence-action-loop/practice-inputs/shortage-window-result.md`：明确标注虚构数据的实训工作记录，可用于人工上传演练。

能力证据验收工具仍为 `artifacts/archive/final-script-cleanup-20261020/files/scripts/acceptance/capability-evidence.ts`。使用 `gold` 模式时显式传入这里的文件路径，并按工具要求提供私有环境配置。该工具会访问 Hosted、上传资料并调用诊断，不是离线校验；只有明确执行真实验收时才运行。

本次目录迁移不重跑 Hosted 或模型验收，也不改变输入字节。原位置、散列和归档信息见 [迁移索引](../../artifacts/archive/document-history-20261020/files/docs/acceptance/repository-artifacts.json)。输出位于忽略的 `artifacts/acceptance/`；私有配置仍留在 `.acceptance/`。
