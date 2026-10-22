# Workflow 本地最终验收与签字（2026-10-23）

## 0. 验收口径

用户于 2026-10-23 明确：**远程 Hosted 版本无法验收时，先保证 Local 验收通过即可；不同用户的执行能力由用户登录后自行创建和配置，例如 DeepSeek Key 与模型。**

因此本次签字范围是：

- Local 真实 Worker + 真实公开工具 + 真实模型；
- S1–S4 产品模板 API 与浏览器 UI；
- 用户自建、加密保存、测试并使用自己的 DeepSeek 模型连接；
- 精确清理与残余风险记录。

**Hosted 不作为本次签字门**；Hosted 技术验收、模板内容迁移仍暂停。

## 1. 通过项

### 1.1 S1–S4 本地真实运行

| 场景 | 证据 |
| --- | --- |
| S1 技术简报（HN + StackExchange + npm + 函数 + 模型） | UI workflow `ccdd6f3a…`，run `b3e7923a-cd95-4e8e-887b-1687b3a6575f` · success；截图 [s1-three-source-ui-1440.png](evidence/workflow-s1-round13/s1-three-source-ui-1440.png) |
| S2 依赖健康（pypistats + npm + 模型） | UI workflow `36153215…`，run `0c69c9b0-3232-4ff0-9d6f-6ddce7a122a4` · success；截图 [s2-dependency-ui-1440.png](evidence/workflow-s1-round13/s2-dependency-ui-1440.png) |
| S3 社区分流（HN + 模型） | UI workflow `dfdf322c…`，run `8036cb00-3365-4ef5-a6b1-ae91d2018fd4` · success；截图 [s3-community-triage-ui-1440.png](evidence/workflow-s1-round13/s3-community-triage-ui-1440.png) |
| S4 内容事实核对（模型） | UI workflow `598b087e…`，run `261ef403-bf8a-4e0d-a774-349d536bd85c` · success；截图 [s4-content-review-ui-1440.png](evidence/workflow-s1-round13/s4-content-review-ui-1440.png) |

最终复核：四个 run 在 Local DB 中均为 `status=success`、`environmentRef=local`、`error=null`。

### 1.2 用户自建执行能力

- UI 路径：工作流编辑器 →“环境与连接”→“连接”；
- 连接类型支持 **DeepSeek 模型**；
- 测试账号创建 `my_deepseek_round22`，填写自己的 API Key；服务端加密保存，目录只显示“已配置加密凭据”；
- 环境返回 provider `origin=user`，模型引用 `deepseek-chat` / `deepseek-reasoner`；
- 连接测试成功；
- 使用该连接运行 S4 变体：workflow `ddada551…`，run `e44be04a-55e5-41d4-9e0f-6649e40d3427` · success；
- 截图：[round22-selfservice-deepseek.png](evidence/workflow-s1-round13/round22-selfservice-deepseek.png)。

这满足“用户登录后自己创建、配置自己的 DeepSeek Key 与模型”的要求。

### 1.3 视觉与隔离

- S1 四视口 390 / 768 / 1024 / 1440 截图与几何通过：[390](evidence/workflow-s1-round13/s1-390.png)、[768](evidence/workflow-s1-round13/s1-768.png)、[1024](evidence/workflow-s1-round13/s1-1024.png)、[1440](evidence/workflow-s1-round13/s1-1440.png)；
- 125% 等效视口（1152×720）通过：[s1-zoom125-1152.png](evidence/workflow-s1-round13/s1-zoom125-1152.png)；
- 当前 workflow 路径控制台 0 error；
- 跨账号 API：管理员读取/运行学生 workflow 均 404，库搜索 0 条；
- 已知非阻塞：390 初始视口裁掉最左节点，可“适应画布”恢复。

### 1.4 质量门

- `pnpm test`：171 文件 / 1280 项通过；
- worker：220 passed / 12 skipped；
- `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；
- 自助连接相关定向测试：10 项通过；
- 无新增 Vercel Function（前端保持 12/12 入口）。

## 2. 精确清理

已按自建 ID 删除 10 个验收 Workflow（S1–S4 UI/API、旧模板副本、自建模型验收等）；已禁用 12 个测试连接（HN、StackExchange、npm、pypistats、自建 DeepSeek、Wikipedia、PyPI、GitHub、失败端点等）。

清理后：

- Local active connections：**0**；
- 被禁用的测试连接：12；
- Local workflow templates：**24**（保留共享模板，包含四套产品模板草案）；
- 未删除共享模板、Local 账号、既有非本次验收数据或任何密钥明文。

**说明**：清理后本文档中的 Run/Workflow 记录不能再从 Local DB 直接复读；截图、Run ID 与验收记录保留在仓库文档中。若需复跑，使用模板与 Local 环境重新创建。

## 3. 残余风险与未签项

| 项 | 状态 |
| --- | --- |
| Hosted 四场景技术验收 | 未签。Worker 重部署后 Sandbox smoke 成功，但模型节点仍 `NODE_EXECUTION_FAILED` |
| 四套模板 Hosted 内容迁移 | 未执行；仅 INSERT 迁移仍待 Hosted 技术门通过 |
| Hosted 模型/凭据根因 | 未定位；env/log 读取受限 |
| 真实浏览器 zoom | 仅完成 1152×720 等效视口 |
| Wikipedia / arXiv | 未适配；S1 第三来源使用 StackExchange |
| Hosted 跨账号隔离 | 未覆盖；Local API 已覆盖 |
| Hosted 清理与最终运维签字 | 未执行 |

## 4. 签字结论

**Local 技术、产品模板、视觉、隔离、用户自建 DeepSeek 能力均通过；Hosted 按用户决定暂缓，不冒充通过。**

- Local：**PASS**
- 用户自建执行能力：**PASS**
- Hosted：**DEFERRED / NOT SIGNED**
- 模板内容迁移：**未执行**
