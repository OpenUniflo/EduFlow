# Hosted 切换交接（M14 / M12）

状态：本地实施、Hosted 数据库迁移与清理、模板更新已完成；`edu-flow` 的 **Preview 构建**已成功（`dpl_Ccjn21Sfv6t7SjDrPsWH8G23eDBh`，commit `538c63e`，含 Python Compiler Function 与 worker/watchdog Daemon 镜像构建）。生产切换只差环境变量、生产部署、Hosted 冒烟与删除旧项目。

## 1. 目标与现状

| 项 | 值 |
| --- | --- |
| Vercel 项目 | `edu-flow`（`prj_po8NNFg8tIXZJnanYCDR8uxGnpDz`，team `july-nanas-projects`） |
| 生产域名 | `https://edu-flow-six-phi.vercel.app` |
| Hosted Supabase | KnowledgeAtlas `uyljtdbvlivxniililay`（M13 迁移已应用，旧画布数据已清理，模板 23 行） |
| 旧 Vercel 项目 | `edu-flow-workflow`（`prj_tDaQ3riDUpFHggr8rtBye9jJcFyd`），Daemon `worker`/`watchdog` 当前 desired 1 / ready 0 |
| Preview 证据 | `dpl_Ccjn21Sfv6t7SjDrPsWH8G23eDBh` READY；构建日志含 CPython 3.13、`api/workflow-compiler.py` bundle、`daemon.worker` / `daemon.watchdog` 镜像推送 |

## 2. `edu-flow` 缺少的 Production 环境变量

以下名称来自旧项目 `edu-flow-workflow` 与环境变量表对比；**值由用户填写，不要提交到仓库**。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `WORKFLOW_DEPLOYMENT_MODE` | 是 | `hosted` |
| `WORKFLOW_DATABASE_URL` | 是 | Hosted Supabase session pooler，`workflow_worker` 受限用户，`sslmode=require/verify-ca/verify-full`；密码只在旧项目环境变量中，需从旧项目面板复制或重置该角色密码 |
| `WORKFLOW_ENVIRONMENTS_JSON` | 是 | 用下方第 3 节的单一公共环境 JSON 替换旧值；`ref` 已从 Hosted `workflow_private.p4_catalog.environment_ref` 确认为 `hosted`，保持不变 |
| `WORKFLOW_SANDBOX_BACKEND` | 是 | `vercel` |
| `WORKFLOW_SANDBOX_IMAGE` | 是 | 形如 `registry/image@sha256:<64 hex>`，沿用旧项目已验证的沙箱镜像摘要（旧项目 Daemon 镜像摘要可从 Vercel Daemons API 读取，但沙箱镜像不同，需从旧项目环境变量面板复制） |
| `WORKFLOW_INTERNAL_TOKEN` | 已存在 | 保持现值（API 与 Worker 同项目共享，无需从旧项目复制） |
| `WORKFLOW_COMPILER_URL` | 已存在 | 改为 `https://edu-flow-six-phi.vercel.app/api/workflow-compiler`（Production 与 Preview 均指向生产，Worker 只在生产运行） |
| `LLM_PROVIDER_KEY` | 可选 | 旧项目用于平台提供方；公共环境不含 providers，如 Worker 启动不读取可省略 |

`WORKFLOW_ALLOW_LOCAL_FIXTURES` 不得设置为 `1`；`assert_hosted_configuration()` 会 fail closed。

## 3. 公共运行环境 JSON（替换 `WORKFLOW_ENVIRONMENTS_JSON`）

```json
{
  "environments": [
    {
      "ref": "hosted",
      "name": "公共环境",
      "access": "authenticated",
      "capabilities": [],
      "providers": [],
      "connectors": [],
      "tools": [],
      "variables": [],
      "functions": []
    }
  ]
}
```

规则（`services/workflow/src/eduflow_workflow/operations.py · assert_hosted_configuration`）：只能有一个或多个 `access:"authenticated"` 公共环境时，不得带 `ownerIds`、`providers`、`connectors`、`tools`、`variables`、`functions`、`localFixtures`；`ref` 一经使用不再修改（用户连接与函数按 “用户 + 运行环境标识” 存放，改标识会失联）。平台 DeepSeek/DeepWiki 不再提供，所有连接由用户在资源中心自建。

## 4. 生产发布与验证（需要用户确认后执行）

1. 用户完成第 2 节环境变量（Production 环境）。
2. 发布生产：把 `feat/workflow` 合入生产分支（当前项目未显式设置 productionBranch，默认应为 `main`）并推送，或以受控方式 `vercel --prod`；发布后读回部署 ID。
3. 读回证据：
   - 部署 `readyState=READY`、target=production；
   - Function 数量 12（11 TS + `workflow-compiler.py`；以真实构建产物/项目 Functions 面板为准）；
   - `GET /v1/projects/<edu-flow>/daemons`：`worker`、`watchdog` 各 1 个 ready 实例；
   - `POST /api/workflow-compiler/v1/document`（带认证）返回编译结果而不是 404/折叠路径错误（ADR 0007 必验项）；
   - `/api/workflows?resource=environments` 登录后 200，响应不出现「运行环境」；
   - 普通登录账号可打开编辑器、资源中心、校验与运行（无需 owner 名单）。
4. Hosted 冒烟（仅生产部署后）：
   - 资源中心新建两个变量环境、编辑覆盖值并保存，刷新仍在；顶栏可切换；
   - 编译校验（含工具必填参数）；
   - `入口 → 数据转换（读取环境变量）→ 结束` 在两个变量环境下各跑一次，Run 成功且冻结不同环境/值；
   - 模型相关验收由用户人工完成并填计划 §8「人工验收」表。
5. 验证通过后删除 `edu-flow-workflow`：先确认其 Daemon 不领取任务（当前 ready 0），再删除项目；删除后重跑第 3 步的登录/编译/运行冒烟。

## 5. 回滚

- 生产发布前保留当前生产部署 ID；Vercel promotion/rollback 会同时更新同项目 Daemons。
- 数据库只向前修复，不回滚迁移；M13 已应用的 `20261023184824` 与仓库一致。
- 若 Compiler rewrite 子路径在 Hosted 被折叠（404/405），按 ADR 0007 调整为读取原始路径头的入口实现，并登记计划 §9。
