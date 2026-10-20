# 长期工作流契约回归

这些源码检查跨语言契约和底层 SDK 行为，不依赖 P3/P4/P5 等历史验收报告、Run 或账号。

从仓库根执行 `pnpm test:workflow`，包含目录检查、前端、Worker、Schema/语义哈希一致性，以及并行中断、执行策略、Checkpoint/Store、模型流结束语义四类 SDK 检查，共 9 个命令。

Worker 的 Local DB 测试在此入口强制关闭；uv 使用已安装/本地缓存依赖，不联网下载包。测试结果写入忽略的 `artifacts/workflow/checks/`，历史归档缺失不影响运行。

`network_policy.py` 是可选的 loopback 网络边界测试：

```sh
uv run --project services/workflow --frozen python tests/workflow-integration/contracts/network_policy.py
```

它启动临时本机 HTTP 接收端，不需要产品服务。它不在默认离线集合中。Hosted/真实浏览器验收仍需按当前产品场景重新设计，不执行旧阶段脚本。
