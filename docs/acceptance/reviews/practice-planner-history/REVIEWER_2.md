# Reviewer 2 · Practice / Planner / History

评审完成：2026-10-06，Asia/Shanghai。限定真实体验、视觉与 E2E；未修改核心代码、未 Reset、未额外派生评审。Phase 3、4、5 均为第一轮；没有需要第二轮复查的 BLOCKER / REAL DEFECT。

评审 Preview：<https://edu-flow-2zmim7jyv-july-nanas-projects.vercel.app>。
实施 SHA：`516f1b025ef163608a8087457844c1f81b241088`，分支 `feature/project-capability-model`。

## 结论与证据边界

**十项视觉结果均 PASS。没有未解决 BLOCKER / REAL DEFECT。**

本人使用真实 Chromium、正常登录和正常 UI 完成 Acceptance B 的结构调整、合法恢复、失效历史重规划和文字 Gold。主实施者独占 Acceptance A；其 Action 调整、文件 Gold、双标签 Stale 和 Micro Learning 操作的证据在本报告明确标为主实施者证据，未冒充本人操作。数据库、不变量、migration、最终 Reset 和工程检查由主实施者 / Reviewer 1 收口，不属于本报告的独立证明范围。

实际浏览器视口覆盖 1366×768、1440×900、390×844，浏览器缩放 / visualViewport.scale 为 1；Reduced Motion 实际通过浏览器媒体偏好启用。未通过脚本注入路线决策、提交结果、ActionRun、Evidence 或数据库状态。DOM 读取和截图只用于观察。

## Phase 3 · 第一轮

**PASS。** B 正式 V9 → 结构调整 → V10。

- 初始 Planner 明确显示正式版本与尚未采用的草稿；普通 Node 选择打开 Inspector，Draft 项数保持 0。搜索定位与之后的真实 Canvas Node 点击均验证了选择语义；能力状态颜色保留，选择使用独立外层描边 / halo。
- `物料净需求计算` Inspector 展示描述、能力状态、项目角色、正式路线、Draft、Preview、前置和支撑关系；加入 / 排除 / 撤销是明确操作。
- 明确加入后 Preview 的能力 +1、关系 0、Action 0、待处理 2 分开呈现。出现真实的 source / target 可达性问题，原因可读；“定位下一项”打开对应 Node Inspector，而非空转寻找 edgeId。
- 明确排除该不可达目标后旧 Preview 失效；操作区提示重新预览。再次 Preview 待处理 0、采用启用，实际 Adopt 创建 V10。没有灰按钮死路，也没有隐式 Adopt。
- 本人另外实际打开 hard prerequisite Edge Inspector：保留 checkbox 已选且禁用；正式行动和调整后行动各自显示，radio 与文案一致；只查看 Edge 时 Draft 保持 0。
- 主实施者真实 Canvas Edge 点击 → Action 更换 → Preview → Adopt V9→V10 证明 Action Adjustment；其 18 个节点屏幕坐标完全一致、selectedEdge 保留。本人独立查看其 Edge 高亮和 Inspector 截图。
- 本人的普通选择 / hover 前后 18 个节点屏幕坐标完全一致，详见 `selection-geometry.json`。这份记录不冒充成功的 Canvas Edge 点击：该次 midpoint 点击停留于 hover，主实施者的真实 Canvas Edge 成功记录承担该项证明。

Dirty：本人 390 Reduced Motion 下修改后退出，实际出现继续编辑 / 放弃保护；Escape 保留草稿，明确放弃后正式 V13 不变。主实施者双标签实测旧 Preview 被 API 409 拒绝、UI 引导重算，重算后 Adopt V12 成功，承担 Stale 证明。

## Phase 4 · 第一轮

**PASS。** B V10 → 合法恢复 V9 生成 V11 → 失效 V8 重规划 → 修复 → Adopt V12。

- 打开 History 默认当前版本；当前恢复按钮禁用，明确“当前使用中，无需恢复”。
- 在 1366 和 1440 桌面点击历史行，不滚动页面即可看到右侧“正在查看 Vx”、与当前版本差异和固定 Footer。完整路线、规划约束、技术信息渐进披露，UUID 默认折叠。
- 选择合法 V9 并实际恢复，产生新 V11；不是覆盖 V9。新版页头正确反映 V11。恢复后的选中对象有轻微体验建议，见下文。
- 选择旧 V8 后仍可阅读差异和行动名称；明确不可精确恢复，恢复禁用，同时提供“基于此版本重新规划”。
- 390×844 实际进入历史重规划，Preview 出现 `action_unavailable`，定位打开 `供应商样品质量证据判读 → 来料质量异常判定` 的正确 Edge Inspector，正式 Action 与失效 Draft Action 分开显示。通过真实 radio 选择当前合法 Micro Action，重新 Preview 后待处理 0、Action 更换 1、Adopt 启用；实际采用 V12。
- 手机 History 列表 → 详情 → 返回列表可操作；内容滚动与 Footer 分开，当前保护和失效恢复提示在 Reduced Motion 下保留。

随后通过正常 History 合法恢复 V9 生成 V13，以从包含 `impact-record` Gold 的正式路线启动下一项验收。没有 Reset。

## Phase 5 · 第一轮

**PASS。** B 正式 Course Route V13 → 文字 Gold → 正式提交 → Result → 实际 AI Feedback → 后续对话。

文字 Gold：`推导订单停线与恢复窗口`；从正式路线 Step 12 的查看详情 / 开始已选行动启动。ActionRun：`25a13762-3a7a-47bd-bdf4-c48322445ed3`。

- 任务页包含工作场景、必要资料、成果要求和正式成果输入，未出现 Quiz / Trace / 单选 / 多选作为任务。实际 DOM radio 0、checkbox 0。
- 提交个人文字成果，按场景计算 45 台×2件=90件需求、现货30件、缺口60件；O1 优先开工15台、停5台，O2停25台；10月6日补10件恢复剩余5台O1，10月7日补50件恢复25台O2；明确“具备开工条件”不能推断完成或交付。
- 实际正式提交出现“本次提交已记录”的 Result，状态为待审核，没有伪装为自动通过或能力获得。
- 点击实际 AI 反馈，真实模型复算数字并保留正式审核边界。普通 Composer 追问“10月7日只到49件”得到24台可以开工、剩1件库存但第25台仍缺1件，以及开工不等于完成交付的回答。后续消息没有偷偷替代正式提交。
- 1440 / 1366 / 390 实测成果输入、正式提交、Result、Feedback、conversation；390 Reduced Motion Composer 和上传 / 发送控制仍可达，无水平页面溢出。新会话 console 0 errors、0 warnings。
- 主实施者 A 文件 Gold：正式 Course Route → CSV 附件 → 正式待审核 Result → 真实 AI 复算 CSV → 后续对话，radio 0、checkbox 0；其实际录像及桌面 / 手机截图作为文件路径补充证明。本人独立查看其手机反馈 / 对话截图。
- 主实施者最小真实 Micro Learning 结构化理解检查证明学习检查仍有独立入口；本报告不扩大 Micro 内容重写范围。

## 十项视觉结果

| 项目 | 结果 | 实际观察与证据 |
| --- | --- | --- |
| Practice UI | PASS | 成果任务 → 正式 Result → Feedback → conversation；文本本人实操，文件引用 A 实操证据。任务没有 Quiz / Trace；移动端 Composer 固定可达。 |
| Node Selection | PASS | 普通 Canvas Node 点击只打开 Inspector，Draft 0；独立 halo，蓝 / 绿 / 灰状态意义保留。`planner-native-node-selected-1440-reduced.png`、`node-selected-1366.png`。 |
| Edge Selection | PASS | A 实际 Canvas Edge 高亮与 Inspector；本人 1440 Reduced Motion 实际关系导航打开相同 Inspector，hard checkbox 不可取消，formal / Draft Action 一致。 |
| Planner Information Hierarchy | PASS | 顶部当前版本 / Draft，Inspector 对象信息，底部操作区；四项 Preview 摘要独立。1366 / 1440 / 390 可理解与可操作。 |
| Issue Resolution | PASS | 真实 Node 可达性问题和历史 Action 失效问题均定位到正确对象，有可执行修复，重新 Preview 到 0；没有无法收敛循环。 |
| Preview / Adopt | PASS | 实际 enabled → click → 新 V10 / V12；未采用时仍标 Draft；Dirty / Stale 有真实保护。 |
| History | PASS | 桌面立即 master-detail / diff，UUID 折叠，Footer 可达；当前禁用、合法新版本、旧 Action 重规划成功，手机列表与详情可往返。 |
| Responsive | PASS | 1366×768、1440×900 @100%，390×844 Planner / History / Practice；内容使用区域内部滚动，主操作不被裁掉；无页面水平溢出。 |
| Animation | PASS | 实操期间 selection / Inspector / History 的状态切换轻量；未观察到无原因的页面滚动跳变、Bottom Bar 漂移、相机重置或选择消失。真实视频保留操作过程；18 节点屏幕坐标观察补充稳定性证明。显式定位 / 聚焦的相机动作不误判为重置。 |
| Reduced Motion | PASS | 实际 matchMedia=true；17 个流光对象 computed animationName 均 none；静态方向 / 选择 / 信息 / 操作仍在。1440 与390实测，见 `reduced-motion-geometry.json` 与对应截图。 |

## 分类

### BLOCKER

无。

### REAL DEFECT

无未解决项。

### IMPROVEMENT

1. **修复后的重新校验可更省一步。** 现行为是立即废弃旧 Preview，操作区明确“预览后才能采用”，用户再次 Preview 后新的 unresolved count 和 Adopt 状态更新。实测可收敛、不会误用旧 Preview；可考虑复用当前 Preview 请求自动重新校验，以更贴近“处理后自动更新数量”的措辞。本轮不以此阻断有效的显式 Preview→Adopt 闭环。
2. **恢复后选中版本可更符合用户刚才的意图。** 从 V10 查看 V9 并恢复为 V11 后，History 刷新选中旧 active V10；标题、历史属性、diff 和页头 V11 均正确，不影响当前版本保护。建议保留刚查看的 V9 或选择新 current V11，减少一次认知切换。
3. **未纳入节点的 Preview 状态措辞。** 原本不在正式路线、Preview 也不在路线时，Inspector 可以显示“未纳入”，避免“移除”使人误以为摘要应有 −1。实际能力删除摘要正确为 0。

### OUT OF SCOPE

既有 AI 正文 Markdown 未渲染的展示限制、全面 Micro Learning 内容重做、无关页面、生产推广、外部 embedding、历史 Advisor、数据库和最终 Reset 证明。没有把工具录制停止 / 容器 metadata 问题计为产品缺陷。

## 截图索引

以下路径均相对于仓库 `output/playwright/practice-planner-history/`；原图是实际全视口截图。

| 状态 | 文件 |
| --- | --- |
| 初始 Planner / Node Inspector | `reviewer2/planner-initial-1366.png`、`reviewer2/node-selected-1366.png` |
| Node Include 与真实 typed issues | `reviewer2/typed-issue-node-1366.png` |
| 排除修复 / Preview 0 / Adopt enabled | `reviewer2/issue-resolved-adopt-enabled-1366.png` |
| Adopt V10 | `reviewer2/adopt-success-v10-1366.png` |
| 原生 Canvas Node 选择，1440 Reduced Motion | `reviewer2/planner-native-node-selected-1440-reduced.png` |
| Edge 高亮 / Inspector | `main/edge-selected-inspector.png`、`reviewer2/planner-edge-1440-reduced.png` |
| Action 更换 / Preview / Adopt | `main/action-changed.png`、`main/preview-adopt-enabled.png`、`main/action-adopt-success-v10.png` |
| Dirty / Stale | `reviewer2/dirty-protection-390-reduced.png`、`main/stale-preview-blocked.png`、`main/stale-recovered-v12.png` |
| History 当前 / diff | `reviewer2/history-current-1366.png`、`reviewer2/history-diff-v9-1366.png` |
| 1440 History 当前 / 失效 | `reviewer2/history-current-1440-reduced.png`、`reviewer2/history-invalid-1440-reduced.png` |
| 手机 History 列表 / 详情 | `reviewer2/history-list-390.png`、`reviewer2/history-detail-390.png` |
| 失效历史 issue / 修复 / Adopt V12 | `reviewer2/history-replan-issue-edge-390.png`、`reviewer2/history-replan-adopt-enabled-390.png`、`reviewer2/history-replan-adopt-success-v12-390.png` |
| 文字成果任务 | `reviewer2/practice-text-initial-1440.png`、`reviewer2/practice-text-initial-390.png` |
| 正式 Result / 实际 Feedback | `reviewer2/practice-text-result-1440.png`、`reviewer2/practice-text-feedback-1366.png` |
| 后续对话 | `reviewer2/practice-text-conversation-1440.png`、`reviewer2/practice-text-conversation-390-reduced.png` |
| 文件成果任务 / Result / 手机反馈对话 | `main/practice-file-task.png`、`main/practice-file-result.png`、`main/practice-file-mobile.png` |
| 手机 Planner / Reduced Motion History | `reviewer2/planner-node-390-reduced.png`、`reviewer2/history-current-390-reduced.png`、`reviewer2/history-list-390-reduced.png`、`reviewer2/history-invalid-390-reduced.png` |

`planner-native-node-1440-reduced.png` 是一次尚未命中 Canvas Node 的早期截图，不作为选择成功证据；只使用带 `selected` 的后续实际成功截图。

## 实际录像索引与工具限制

| 录像 | 内容 / 时长 |
| --- | --- |
| `reviewer2/phase3-structure-adopt.webm` | 真实结构加入 → Preview issues → 修复 → Preview 0 → Adopt；193.12s。 |
| `reviewer2/phase4-history-restore-replan-final.webm` | 真实 History 当前 / 选择 V9 / 合法恢复新 V11 / 失效历史进入重规划；529.24s。 |
| `reviewer2/phase5-practice-text-feedback.webm` | 正式路线文字 Gold 启动 → 个人成果提交 / Result → 实际 AI Feedback / 后续对话；173.32s。 |
| `main/action-adjustment.webm` | 主实施者真实 Edge / Action → Preview → Adopt。 |
| `main/practice-file.webm` | 主实施者真实 CSV 成果 → 正式提交 → Feedback / conversation。 |

所有录像为实际浏览器录制，工具编码 VP8 800×600；实际操作视口由全视口截图和 DOM 几何证明。本人检查实操过程，并抽取每段四张原始视频帧核对证据连续性，保存在 `reviewer2/video-frames/`。抽帧不会代替现场观察。

History 原始录制停止时工具未完成容器 metadata；原始及 recovered 文件保留。`final` 文件仅对原始帧 remux 补全容器信息，未重绘或生成内容；主实施者 ffprobe 和全帧 decode 验证通过。该段完整记录合法恢复及进入重规划，**没有宣称其中包含稍后完成的全部修复 / Adopt**；重规划修复与 V12 成功由实际操作和连续阶段截图证明。录制停止后退出 ForceGraph 视图可以正常完成工具停止。

## 收口状态

B 最后正式版本 V13；Gold Run 已完成上述 Result / Feedback / conversation 检查。本人已停止 B 所有写入，并关闭实际 browser session `eduflow-r2-fresh`。已通知主实施者可执行最终 A/B Reset、历史不变性和共享数据保护检查。本评审不以测试过程产生的版本 / Run 残留作为最终 baseline。
