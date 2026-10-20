# 当前 Local API 集成回归

这里保留三个可重复的真实 API 检查，按能力命名而非阶段命名：节点测试/运行边界、前端配置校验、工作流列表管理。

它们需要运行中的 Local EduFlow、Compiler/Worker、Local Supabase、私有本地配置，以及各脚本要求的 fixture。会创建测试数据，部分列表管理检查使用特权测试数据设置；不应对共享 Hosted 执行，也不在默认离线回归中运行。

从仓库根显式执行，例如：

```sh
node --env-file=.env.local --import tsx tests/workflow-integration/live/verify-unified.ts
```

这些源码从原 checks 目录迁入，行为未因整理而更改。原阶段开发探针已归档，不能把它们的旧结果当作新集成验收。
