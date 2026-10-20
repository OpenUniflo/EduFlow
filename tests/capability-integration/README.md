# Capability 数据库集成回归

三个 SQL 用例分别验证 frontier、Node Action 路线和有序 Action 路线的真实 RPC。它们包含事务回滚，不属于数据库迁移，也不在普通离线测试中自动执行。

仅在已应用仓库迁移的隔离 Local Supabase 上，由操作者明确选择执行。回滚只保护 SQL 事务，不应据此授权对共享 Hosted 执行。它们不依赖旧账号/旧 Run 的现场报告。
