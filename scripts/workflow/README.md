# 工作流正式工具

从仓库根运行。这里保留当前操作入口；阶段验收脚本已退出维护目录。

| 目录 | 当前职责 | 入口 |
| --- | --- | --- |
| `local/` | 本地启动、进程控制、显式开发数据刷新 | `pnpm workflow:local`、`pnpm workflow:control restart`；刷新另行显式执行 |
| `examples/` | 当前 A/B/C 智能体场景、节点回应示例、人工演示准备 | `create-agent-scenarios.mjs`、`create-node-response-example.mjs`、`prepare-manual-demo.mjs` |
| `checks/` | 目录校验、固定离线回归、本机运行冒烟、当前场景验证 | `pnpm workflow:check-layout`、`pnpm test:workflow`、`pnpm test:workflow:local-smoke`；实模验证须显式开启 |

本地刷新可能修改工作流数据，不是启动必需步骤；端口被占用时不要重复运行初始 launcher。示例准备与场景验证也不会在普通测试中自动运行。已有 A/B/C 数据和用户历史不因目录整理而改变。

长期契约检查在 [tests/workflow-integration/contracts](../../tests/workflow-integration/contracts/README.md)。可重复的本机 API 集成检查在 [live](../../tests/workflow-integration/live/README.md)，不属于默认离线回归。

旧 `scripts/acceptance/workflow`、其他阶段脚本、旧 P3/P4/P5 示例与补验入口已撤掉，不再提供阶段用例清单或 `test:workflow:acceptance` 命令。原始文件本地保全，详见 [目录与测试规则](../../docs/acceptance/README.md)。

P6 专用运维脚本已归档；当前发布约束见 [Hosted 运维手册](../../docs/architecture/WORKFLOW_HOSTED_RUNBOOK.md)。`local/` 是可重复使用的开发工具源码，必须跟踪；其生成的凭据、PID、日志和环境配置位于忽略的 `.acceptance/`，不得提交。
