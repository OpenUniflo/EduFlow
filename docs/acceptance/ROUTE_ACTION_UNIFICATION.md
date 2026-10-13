# Route / Action unification — final acceptance

## 新契约最终验收 · 2026-10-05（Asia/Shanghai）

**45 PASS / 0 FAIL / 0 NOT APPLICABLE。** 此表覆盖新产品契约；后面的历史阶段记录不再是当前产品定义。此前 31 PASS / 2 FAIL 属于上一版产品契约的阶段结果；本轮新产品契约增加了新的验收要求，因此重新完成了最终验收。

功能验收代码：`184fc283d97e0bb2e4f3fb6c17828196819e5100`，READY [Feature Preview](https://edu-flow-lejy34mqc-july-nanas-projects.vercel.app)。最终文档提交与其对应的最新 READY 地址在交付回复中给出；不会以历史地址冒充最新 HEAD。所有部署均为 Preview，未 Promote Production。

- 当前正式路线：普通用户 A V4／18能力／23 Steps；管理员 B V4／14能力／17 Steps。两个账号看到相同完整 Project 18 nodes／23事实关系／52 Active Actions（24 Micro、28 Practice），每关系至少2个，关键关系3/4/5个。缺Action=0，无executor=0。各Step和每条Edge计数见 [两账号完整报告](SELECTED_ROUTE_V3_ACCOUNTS.md) 与 [真实API/RLS捕获](SELECTED_ROUTE_V3_HOSTED.json)。A6/B7 acquired；两账号新增quality/admission均只保持learning，未因完成获得能力。
- A Action-only Preview 保留18/23，只换criteria→quality的Micro到Practice，采用后生成V3；窄屏再换criteria→qualification生成V4。B显式移除quality→defect形成V3/16Steps；恢复它的有效Preview含唯一added青色方向脉冲，采用后V4/17Steps。Preview逐次零Version写入。两账号历史保持，不按weight静默改正式选择。
- Course顺序执行示例：A Step1 quality Practice（completed）→Step2 capacity Micro（current）→Step3 qualification Practice；B Step1 admission Micro（completed）→Step2 admission Micro（source=capacity）。标题相同的Action仍由Edge/Action ID区分；序列线不是KnowledgeEdge。
- 实际A Micro Run `32e6d5f5-d16f-4c0c-a1f4-2e43bd2917d3` 精确quality资源3/3；B `65b5d45f-ec43-4169-af1d-7294f0607c48` 精确admission资源3/3。A Practice `ce46cd08-5ee4-438d-8233-fd753ee72e28` 与repeat `3bb6f4ea-2e8b-4e0f-a42a-8712fd4d0e9c` 对应两个独立Attempt、Result、KnowledgeEvidence。见 [历史执行lineage](SELECTED_ROUTE_V3_EXECUTION.json) 和 [当前Run读验](SELECTED_ROUTE_V3_CURRENT_RUNS.json)。
- Desktop1440×1000与390×844完成Current、Preview、调整、Action选择、采用、顺序Course、NodeDetail、Assistant/Evidence。收起窄屏目标与编辑面板保留草稿；Assistant launch不再合成hover重开；modal关闭焦点返回trigger并保留草稿；footer给入口留空间，实际Analyze201完成。最近plan-only Run `57b5f6b1-6692-4ddd-a8ed-70be32ac93e2` v18在1.93s完成，零units/候选，未改Route/UKS。
- 图实际采样：A18节点Current/Preview/reduced位置完全相同；B Include未具备真实祖先14→15时原14坐标相同；移除和合法新增可选关系时14坐标相同；Project ring=0。脉冲source→target，静态事实线不编码虚实差异；reduced停止持续流动但保留23/17静态方向箭头。见 [A视觉DOM](SELECTED_ROUTE_V3_VISUAL_DOM.json)、[B坐标/diff/焦点/按钮命中](SELECTED_ROUTE_V3_ADMIN_VISUAL.json)。未具备且无可到达前序的起点可查看/规划，但诚实阻止Adopt，未制造灰色入口或降低门禁。
- 最终自动回归：117文件／870测试PASS；typecheck、lint、production build PASS（10.68s）；Knowledge与client-secret审计PASS。真实本地数据库47事务检查PASS（包括并发、版本冲突、幂等、repeat、锁顺序）；测试资料明确标记且不写Hosted。
- 本目标的增量migration：`20261004095510_action_execution_resources_v2.sql`、`20261004162208_route_selected_action_execution.sql`。前者增加nullable executor/attempt链接；后者仅增加service-only SECURITY INVOKER包装。旧列、旧RPC、旧版本仍可用；legacy snapshot不自动补选。61个版本本地/Hosted逐项一致。测试数据仅补Action与真实教学/Assignment资源；Knowledge全表hash保持原值，未重写事实图。
- Security Advisor新增高危0：保留既有5个service-only RLS INFO，以及can_read_course SECURITY DEFINER执行权限与泄漏密码保护WARN；不声称历史告警全清。见 [Advisor原始结果](SELECTED_ROUTE_V3_SECURITY.json)。Runtime核心请求均成功，已知DEP0169出现在HTTP200日志。184fc28首次匿名初始化曾有单次courses503，显式重载恢复；该失败不计PASS，后续登录和核心API正常，日志未定位其原因。
- 四位只读Reviewer独立审查产品、图/动画、UI、数据/RLS。发现的范围、完成导航、hover重开、焦点与footer遮挡已修复并实际重测；最后审查无剩余阻断。

### 45 条成功标准

| # | 标准 | 结果与证据 |
|---|---|---|
| 1 | Personal Route 包含 Edge + selected Action | PASS — immutable executionSteps；两账号逐步引用报告 |
| 2 | Route Version 版本化选择 | PASS — optimistic adoption；历史快照与事务回归 |
| 3 | 改 Action 可以产生 Preview | PASS — A criteria→quality 与 B quality→admission Action-only 实测 |
| 4 | 仅 Adopt 创建新版本 | PASS — 真实 Preview 零写入；显式 A/B V4 |
| 5 | Course 恢复顺序式前端 | PASS — 纵向课程路线截图 |
| 6 | Course 不展示 DAG | PASS — Course Path 结构回归及实际截图 |
| 7 | Course 不重新要求路线决策 | PASS — 正式 Step 只有开始/继续与次级调整 |
| 8 | Course 每步明确 Action | PASS — A23/B17 executionSteps 引用完整 |
| 9 | 顺序视觉不制造 Edge | PASS — 序列连接仅为 DOM presentation |
| 10 | Project 是 Route + Action Planner | PASS — 完整18/23结构与关系/行动编辑 |
| 11 | 可调整节点路线 | PASS — 未具备真实祖先 Include +合法性提示实测 |
| 12 | 可调整每条 Edge 的 Action | PASS — 两账号 radios、Preview、Adopt |
| 13 | 普通关系线统一 | PASS — 实线，实际DOM与截图 |
| 14 | hard/soft/enables 无虚线主编码 | PASS — 实线共享样式；虚线仅候选分支 |
| 15 | 底层 relation 语义保留 | PASS — 事实审计、hard gates、enables单独数据 |
| 16 | Project Route Ring 删除 | PASS — DOM rings=0；其他Atlas未改 |
| 17 | Current 默认持续显示 | PASS — A/B进入Project立即可见 |
| 18 | Current 有方向脉冲 | PASS — 紫色source→target，实际连续偏移采样 |
| 19 | Preview 有方向脉冲 | PASS — 青色route-forward-flow；合法added边实景 |
| 20 | Current/Preview 可区分 | PASS — 紫/青，baseline减弱；kept/added/removed |
| 21 | Pulse 不改变 topology | PASS — 结构始终18/23；Engine记录回归 |
| 22 | Pulse 不改变 coordinates | PASS — A18与B14保留节点逐一坐标完全相同 |
| 23 | Pulse 不重置 Camera | PASS — 投影坐标及用户Fit后稳定；无自动fit/engine camera |
| 24 | 两账号项目数据完整 | PASS — 同项目18/23/52，个人UKS不同 |
| 25 | 每条可规划 Edge ≥2 Action | PASS — 23条逐条API校验；缺失0 |
| 26 | 关键 Edge 多方案可切换 | PASS — 3/4/5方案与实际五分支截图 |
| 27 | 全部测试 Action 有真实 executor | PASS — 24 Micro /28 Practice，未绑定0 |
| 28 | 没有第二套 Practice | PASS — 既有Assignment Attempt/Result/Evidence |
| 29 | Micro 精确执行指定资源 | PASS — A quality/B admission ActionRun各3/3 |
| 30 | Practice 精确执行指定资源 | PASS — quality-trace两次Run和具体Attempt |
| 31 | ActionRun 与 Route selection 分明 | PASS — 历史RouteVersion引用；独立执行记录 |
| 32 | Repeat 不改 Route selection | PASS — V3重复时仍3版本；V4为后续显式Adopt |
| 33 | Completion 不自动赋予能力 | PASS — quality/admission保持learning；无acquired/mastery |
| 34 | Evidence/UKS 权威不变 | PASS — Attempt→Result→Evidence；原明确确认lineage保留 |
| 35 | 两账号不同 Personal Route | PASS — A18节点23Step；B14节点17Step |
| 36 | Desktop 核心流程 | PASS — 两个账号实际Project/Planner/执行与截图 |
| 37 | Narrow 核心流程 | PASS — 390×844两账号；面板折叠、选择、Adopt、详情、Assistant/Evidence |
| 38 | Reduced Motion | PASS — 持续Pulse none/display none，静态箭头保留 |
| 39 | 自动测试/typecheck/lint/build | PASS — 117文件870测试；全部PASS；47本地事务 |
| 40 | Migration history 一致 | PASS — 61本地/Hosted exact version相同 |
| 41 | 无新增高危Advisor | PASS — 基线告警保留，新增0 |
| 42 | 最新Feature Preview READY | PASS — 实现184fc28 READY；交付HEAD的文档部署另作最终核验 |
| 43 | 不 Promote Production | PASS — 所有部署target=null，feature分支 |
| 44 | Embedding 真实成功/timeout已记录 | PASS — v18 wrong-calculation实际1024检索成功；不改模型/标准 |
| 45 | Fresh UX 全流程 | PASS — 四Reviewer收口；所有本轮实际缺陷修复并重测 |

### 截图索引

路径均为 `output/playwright/route-selected-v3/`；记录功能代码所在部署，后续文档部署不改变这些UI实现。静态截图配合实际DOM/网络/数据库验证，不能单独证明动画或执行。

| 场景 | 截图 | 部署代码 |
|---|---|---|
| Current directional pulse / ordinary完整Project | fresh-ordinary-project.png |184fc28|
| Preview directional pulse | fresh-narrow-preview-pulse.png |be9de51|
| 合法新增边Preview pulse | fresh-admin-valid-added-pulse.png |158e193|
| 移除边Preview | fresh-admin-removed-preview.png |158e193|
| Adjust Route + Action选择 | adjust-route-actions-desktop.png、fresh-admin-narrow-action-selection.png |f65fa12 /158e193|
| Multi Action Edge五分支 | fresh-multi-action-edge.png |158e193|
| Adopted路线V4 | fresh-narrow-adopted-course.png |be9de51|
| Course恢复顺序式 / Current Step | course-current-desktop.png、fresh-admin-course-route.png |f65fa12 /158e193|
| Admin完整Project | fresh-admin-project.png |158e193|
| Narrow Project | fresh-admin-narrow-project.png、fresh-narrow-project-current.png |158e193 /be9de51|
| Narrow Course | fresh-admin-narrow-course.png、fresh-narrow-adopted-course.png |158e193 /be9de51|
| Narrow Node Detail | fresh-admin-narrow-detail.png、fresh-narrow-node-detail.png |158e193 /be9de51|
| Reduced Motion | fresh-admin-narrow-reduced.png、fresh-reduced-static-preview.png |158e193 /be9de51|
| Micro exact executor完成 | fresh-admin-micro-complete.png、micro-exact-resource-complete.png |158e193 /f65fa12|
| Practice repeat完成 | practice-repeat-completed.png |f65fa12|
| Assistant桌面/窄屏 | fresh-desktop-assistant.png、fresh-admin-narrow-assistant.png |184fc28 /158e193|
| Evidence桌面/窄屏已修复底栏 | fresh-desktop-evidence.png、fresh-narrow-evidence-footer-fixed.png |184fc28|
| Evidence plan-only完成 | fresh-narrow-evidence-plan-only-complete.png |184fc28|

其他早期`narrow-*`失败/过渡截图只保留为历史，不是最终视觉PASS证据；`fresh-admin-narrow-evidence.png`也仅记录修复前footer遮挡。

### Known limitations

当前v18配置已有真实1024维Embedding成功检索（wrong-calculation Run `90125704-b63a-4d93-88e5-d570fda6f2d1`；[质量控制](final-quality-controls.json)）。Vercel→Aliyun仍可能UND_ERR_CONNECT_TIMEOUT，正样本历史调用也存在provider截断/高延迟；本轮依据新契约记为外部可靠性限制，不伪造retrieval、不换弱模型、不降低Evidence标准。零候选plan-only不被当成Embedding成功证据。历史v16明确确认的Evidence/lineage保留，也不冒充新的v18正样本质量证明。

Workflow-mode Assignment仍不开放为Action executor，因为既有Workflow完成尚未携带ActionRun身份；普通Workflow能力保留。未配置legacy Action不猜资源，旧Route缺executionSteps需要显式调整。Production build既有H5P/大chunk提示保留。单次初始化503已重载恢复，不声称所有网络请求永久无失败。

正式契约：[Capability / Route / Action](../architecture/CAPABILITY_ROUTE_ACTION_CONTRACT.md)、[Frontend Design System](../design/FRONTEND_DESIGN_SYSTEM.md)。原有阶段记录保留在下方，仅用于审计历史。

---

## Incremental contract revision — 2026-10-04

此前 31 PASS / 2 FAIL 属于上一版产品契约的阶段结果；本轮新产品契约增加了新的验收要求，因此需要重新完成最终验收。

Baseline: `8a9c1dc2f9a740d9a558bab717f97443534a3cf2`, clean required branch, no remote divergence, exact READY https://edu-flow-c8ch7fre5-july-nanas-projects.vercel.app, 60 Hosted migrations. Preserve factual graph, execution/evidence/state/RLS authority and existing Assistant/Evidence surfaces. Revise immutable Route snapshot to Edge + selected Action + order; restore the historical sequential Course Path; make Project the full planner; unify Project factual line styles, remove default Route rings and add directional Current/Preview pulses. Existing JSON snapshot can hold reference-only executionSteps without new columns; backend validation and explicit adoption remain necessary. Historical snapshots remain readable and do not receive silently persisted choices. Risks: incomplete legacy routes, stale Action resources and presentation accidentally triggering graph/camera lifecycle.

Stage success gates: (1) versioned choices/legacy read/preview-only/action-only adopt tests; (2) sequential formal-Step UI and exact Navigator execution; (3) stable directional Project pulses plus planning UI; (4) two-account complete executable fixture and read-only integrity report; (5) all 45 criteria, latest READY browser desktop/narrow, reviewers, tests/audits/advisors and final artifacts. Historical embedding success under current v18 configuration is retained in `final-quality-controls.json`; intermittent external timeout is now a known limitation and does not block this goal.

## Historical checkpoint — superseded by the 45-criterion contract

The following records describe earlier implementations and failures, not the current product contract. The current authorities are CAPABILITY_ROUTE_ACTION_CONTRACT.md and FRONTEND_DESIGN_SYSTEM.md.

### Checkpoint — 2026-10-04 14:47 UTC

Implementation HEAD `d06b0b9dafabcc170913b5d5f331674a2d1e8bd0` is READY at https://edu-flow-m4upxj1ka-july-nanas-projects.vercel.app. The status below supersedes historical pending statements, which remain as the phase-by-phase audit trail. **Whole-goal acceptance is not complete.**

- Full suite: 115 files / 831 tests PASS; lint, typecheck, production build, Knowledge audit and client-secret audit PASS. Adapter metadata follow-up: 11 focused tests and production build PASS. Hosted migration count: 60, matching local; Security Advisor baseline unchanged.
- Hosted factual route audit: 17 courses / 11 active routes / 28 scenarios / zero mismatches. Fresh enterprise DOM: 15 factual relations (11 prerequisite, 4 enables). Fresh missing-source execution rejected with 422 `target_prerequisite_required`, with no ActionRun write.
- Latest desktop candidate/confirmation and 390×844 explicit confirmation PASS. Only CTX01 from v16 Run `b8ae8e4f-5177-476f-b316-b7d9c0b911dd` was confirmed; the other six proposals remain pending. An intentionally mismatched Run returned 409 `diagnosis_scope_mismatch` without mutation. Formal evidence `bfcfbfa7-7473-40ca-906e-8fa544a8558a` preserves proposal, diagnosis, revision and six source-unit identities. The route remains V6 / six versions. See `final-confirmation-audit.json`.
- Library and Source Detail show one formal confirmation separately from pending contributions. Four final desktop/narrow screenshots passed independent UI review. Assistant presentation contexts and keyboard/draft/modal behavior passed fresh checks.
- v18 plan-only negative control completed in 2.909s with zero units/proposals. Positive repeat and wrong-calculation control remain unverified: extraction works, but embedding calls fail with `UND_ERR_CONNECT_TIMEOUT` before retrieval. Most recent positive Run `17fbfaff-3a05-4db2-81db-f5931aefb07b` failed at 14:37:41 UTC after 53.65s. Latest Preview runtime logs contain corresponding `/api/evidence` 503s. No fake retrieval, fallback model, weaker threshold or partial proposals were introduced to obtain a PASS.
- Remaining: restore provider connectivity, repeat the same positive source and wrong-calculation control under v18, and complete same-mounted Project post-confirmation coordinate/camera verification. A successful historical v16 confirmation does not validate v18 judgment quality.

Later check on READY documentation checkpoint `904199ab81735463e41a25e5c4ab5e743163f52d`, https://edu-flow-qkxdtrja7-july-nanas-projects.vercel.app: the existing local embedding smoke test passed with aliyun / qwen3.7-text-embedding / 1024 finite dimensions. This does not establish identical local and Preview configuration. Fresh Preview wrong-calculation Run `90125704-b63a-4d93-88e5-d570fda6f2d1` completed in 18.15s, retrieved the relevant net-material-requirement node, and explicitly rejected 100−40=170 as incorrect. Its sole diagnostic proposal has `sufficiency=insufficient`, `proposed_status=null`, no evidence and no confirmation. Independent data review marks this specific negative control PASS; it was rejected at sufficiency, so independent-verifier negative behavior is not established. The fixture labels itself a synthetic incorrect attempt, so general error-detection reliability is not claimed. See `final-quality-controls.json`.

The subsequent positive Run `95b7e999-f2b4-4671-93bc-edbd2601ca0e` failed after 55.86s with the same embedding connection timeout, zero persisted units and zero proposals. Connectivity is intermittent. Final outstanding work is now the positive repeat and same-mounted Project confirmation stability; criteria 29 and 33 remain FAIL. The latest deployment's initial zero-5xx window preceded this failure and must not be represented as a clean final runtime check.

### 33-criterion checkpoint

PASS refers to the recorded implementation and browser evidence, including previous phase deployments where noted; it does not claim every historical screenshot was captured on the latest deployment. FAIL includes required verification blocked by the live provider.

| # | Success criterion | Result / evidence |
|---|---|---|
| 1 | No fabricated Course Route edges | PASS — Hosted audit and fresh DOM |
| 2 | Ordered IDs never define edges | PASS — factual projection and DAG regression |
| 3 | Prerequisite and enables display | PASS — fresh 11/4 relation split |
| 4 | Hard prerequisite differs from enables | PASS — gates, styles and tests |
| 5 | Personal Route remains authority | PASS — formal snapshot and adoption checks |
| 6 | Micro and Practice are Action types | PASS — explicit common execution contract |
| 7 | One Practice executor | PASS — existing Assignment attempts/results/evidence |
| 8 | Explicit execution resource | PASS — exact bound Micro and Assignment |
| 9 | Missing source blocks execution | PASS — fresh 422 and zero writes |
| 10 | Weight participates in ranking | PASS — available, weight, stable ID |
| 11 | Completed Action repeat | PASS — fresh repeated execution and retained history |
| 12 | Switching requires confirmation | PASS — cancel retains run; confirm changes run |
| 13 | Shared Node Detail core | PASS — Skill Tree / Route context |
| 14 | Bridge detail works | PASS — optional curriculum, explicit resource |
| 15 | Full Skill Tree content | PASS — excluded target remains in Skill Tree |
| 16 | Route detail emphasizes route growth | PASS — source-oriented factual relations |
| 17 | No automatic Project switch | PASS — ordinary and Bridge clicks |
| 18 | Current Route visible by default | PASS — baseline overlay |
| 19 | Visible Preview Diff | PASS — retained/added/removed screenshots |
| 20 | No version before Adopt | PASS — Hosted counts before/after |
| 21 | Hover/branch spatial stability | PASS — engine regression and ≤1px browser comparison |
| 22 | No unrelated Global project relations | PASS — displayed factual project scope |
| 23 | Correct Assistant context | PASS — Learning/Evidence/Skill Tree/Route/Project/Assignment |
| 24 | Consistent visual system | PASS — independently reviewed final surfaces |
| 25 | Evidence readability | PASS — desktop/narrow Library and detail |
| 26 | Library and diagnosis separated | PASS — summary/detail/run interfaces |
| 27 | Run-scoped confirmation | PASS — explicit payload, 409 negative and actual confirmation |
| 28 | Reduced motion | PASS — actual narrow controls and no progress animation |
| 29 | Desktop/narrow complete core flows | FAIL — final v18 analysis is blocked before retrieval |
| 30 | State/evidence/route/Micro/Assignment/RLS authority | PASS — tests, Hosted lineage and unchanged versions |
| 31 | No Production promotion | PASS — Feature Preview only |
| 32 | Latest Feature READY | PASS — exact implementation HEAD deployment |
| 33 | Complete Fresh UX acceptance | FAIL — v18 quality controls and Project confirmation stability outstanding |

### Screenshot index

All paths are under `output/playwright/route-action-unification/`. Earlier defect screenshots are retained as history, not selected as final visual PASS evidence.

| Requested view | Selected artifact |
|---|---|
| 1 Course Route default | `phase3-route-default.png` |
| 2 Route Node Detail | `phase3-action-in-progress.png` |
| 3 Bridge Node Detail | `phase3-bridge-detail.png` |
| 4 Current Route | `phase5-current-route.png` |
| 5 Preview Diff | `phase5-preview-diff.png`, `phase5-preview-added.png` |
| 6 Edge Hover | `phase5-edge-hover.png` |
| 7 Multiple Actions | `phase5-numbered-actions.png` |
| 8 Action in progress | `phase3-action-in-progress.png` |
| 9 Compact Assistant | `phase7-assistant-compact.png`, `final-assistant-assignment.png` |
| 10 Empty Workspace | `phase8-workspace-empty.png` |
| 11 Selected source | `phase8-source-selected.png` |
| 12 Diagnosing | `phase8-diagnosing.png` |
| 13 Candidates | `final-candidates.png` |
| 14 Confirmation | `final-confirmation.png`, `final-confirmed-narrow.png` |
| 15 Evidence Library | `final-library.png` |
| 16 Evidence Detail | `final-source-detail.png` |
| 17 Narrow viewport | `final-library-narrow.png`, `final-source-detail-narrow.png`, `phase5-narrow-actions-fixed.png`, `phase5-narrow-editor-fixed.png` |

## Verified baseline

- Original chat checkout `/Users/fanyuhang/.codex/worktrees/0109/EduFlow` was detached at a0fc93e. Required branch was checked out cleanly at `/Users/fanyuhang/Documents/OpenUniflo/EduFlow`, 29 commits behind. Fetched origin and fast-forwarded that existing branch to `06fb55c44b76eafec8f21eeab84f71598dd12cf4`. All implementation continues there on `feature/project-capability-model`.
- Baseline READY Feature deployment from Vercel: https://edu-flow-jiippifnz-july-nanas-projects.vercel.app, same commit. No Production promotion.
- Hosted `uyljtdbvlivxniililay` inspected read-only: action templates/bindings lack explicit execution references; ActionRun has Micro path and legacy evidence source but no Assignment execution link.
- Active route snapshot prerequisite audit: 7 course/version groups, all reported zero edge identity/endpoint/relation mismatches. Course/version groups: agentic-ai-golden V1, ai-agents-in-depth V11/V15, cds525-deep-learning V1, enterprise-vietnam-supply-collaboration V1/V5/V7. This validates stored facts, not the old renderer's invented adjacency lines.
- Hosted has 3 Actions, 3 bindings, 4 runs. Two enterprise Practice Actions have no target AssignmentCoverage. They need explicit content configuration; guessing an Assignment is forbidden.
- Security Advisor baseline includes five service-only RLS/no-policy notices, can_read_course SECURITY DEFINER execute notices and disabled leaked-password protection. No policies were broadened and no unrelated security changes made.

## Frozen contracts

- `docs/architecture/CAPABILITY_ROUTE_ACTION_CONTRACT.md`
- `docs/design/FRONTEND_DESIGN_SYSTEM.md`
- Superseded old AGENTS Navigator learning-only requirement with the user's explicit Action recommendation contract. Existing Micro/Assignment evidence authority remains unchanged.

## Phase 1 acceptance

Requirements: only factual route relations; no adjacency inference; cross-chapter edges retained; hard/soft/enables distinguishable; presentation changes do not restart layout; actual Preview browser verification.

Implemented: shared `routeRelations` projection, formal RoutePlan input to Navigator, React Flow rendering using existing ELK engine/options, structural cache and accessible node/relation list. Ordered IDs affect layout only. Legacy sine-wave adjacency connectors removed. Current prerequisites remain distinct from support enables.

Reviewer 2 found and implementation corrected: pending/failed formal routes incorrectly showing an edgeless fallback; stale new bridge eligibility; enables cycle reversing the hard prerequisite backbone. Explicit loading/error handling, source-state hard-gate projection and ELK MODEL_ORDER cycle handling now cover those cases. MODEL_ORDER follows the existing topological route order and does not change factual edge direction; see https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html.

Initial verification: 28 targeted tests passed; 107 full-suite files / 763 tests passed; typecheck, lint and build passed before the last two added regression cases. Build has pre-existing H5P `*width` CSS warning. Latest checks and deployed browser validation are pending.

Baseline screenshots (Playwright, logged-in ordinary acceptance account):
- `output/playwright/route-action-unification/before-course-route.png`
- `output/playwright/route-action-unification/before-bridge-switch.png`

## Independent review baseline

Four separate read-only reviewers completed product, graph/interaction, UI/UX, and regression/data/security reviews. Important confirmed findings:

- Product: fake route edges, source +30 cost instead of gate, implicit Micro lookup, parallel Practice upload lifecycle, silent active-run cancellation, no repetition, lost history, Bridge presentation jump, Micro-only recommendation.
- Graph: no current/preview overlay input to Scene; global facts leak into project detail; missing action-count hover. Existing Scene structural identity and force/camera separation can be reused.
- UI: Library mixes diagnosis and history; null run ID combines proposals; light text leaks onto white background; Evidence/Project Assistant reuse hidden selections; typography and reduced motion need improvement.
- Data: retain old RPC signatures for shared Production; new explicit-resource/confirmed-switch boundaries should be additive. Assignment accepted state must not be reset for repetition. New attempts need exact ActionRun attribution. Existing Micro path history cannot be reported as fresh repeated execution.

## Remaining work (not PASS)

Finish Phase 1 latest Preview visual/runtime validation. Then implement Action resource binding, Assignment reuse and repetition with atomic lineage, confirmed switching, history, source gate and recommendation; unified KnowledgeNodeDetail including Bridge; Navigator Action integration; project overlays/diff/branch/relationship scope; presentation-aware Assistant; Evidence Library and staged run-scoped diagnosis with summary/detail APIs; unified tokens/reduced motion. Run each phase's review/fix loop. Complete final full tests/audits, migration consistency/advisors, latest READY Preview 5xx/fresh acceptance, all 17 requested screenshots and all 33 success criteria. No final completion or final commit claimed yet.

## Verified updates, 2026-10-04

Phase 1 Preview `78364753d6ac6ff3cdfdf55c09b1d99eda929b20` is READY at https://edu-flow-qkch8tfd7-july-nanas-projects.vercel.app. Ordinary-user browser console had zero errors. Independent UI review passed the final desktop title wrapping, narrow controls and actual Fit result screenshots:
- `output/playwright/route-action-unification/phase1-desktop-final.png`
- `output/playwright/route-action-unification/phase1-narrow-controls-fixed.png`
- `output/playwright/route-action-unification/phase1-narrow-fit.png`

Phase 2 implementation is local and uncommitted. The additive migration `20261004095510_action_execution_resources_v2.sql` introduces explicit nullable Micro/Assignment executor references and links existing attempts to ActionRun. It preserves old RPC signatures and v1 records; no new Practice lifecycle or client write policy was introduced. No Phase 2 migration has been applied to Hosted.

Practice reuses Assignment evaluation, results, review and evidence. Starting an Action does not write practicing state. Repetition preserves accepted Assignment aggregate status, owns a fresh attempt lineage, and exact-attempt review remains possible. Micro repetition evaluates through the existing Micro pipeline, observes only this run's accepted steps and does not replay historical completion evidence. Action resource availability, source gates, cost ranking and explicit switching confirmation are implemented.

Deliberate current boundary: workflow-mode Assignments are unavailable as Action executors until their existing WorkflowRun completion can carry ActionRun identity. Ordinary course workflow execution remains available. Unconfigured legacy bindings are honestly unavailable in the new UI; the two existing enterprise Practice bindings cannot be guessed because their target Knowledge lacks AssignmentCoverage.

Independent data review found and fixes cover: concurrent attempt ownership theft, advisory-lock inversion, replay moving the current attempt pointer backwards, pending manual review bypass, changed Micro snapshot/path, and historical Practice repeating through explicit route exclusion. Saved Assignment retries now recover the exact persisted result despite subsequent Action archival, while rejecting changed response/execution identity.

Verification before these last two regression additions: 108 test files / 778 tests passed; typecheck, lint, production build passed (existing bundle-size/H5P warnings). Latest local transactional suite passed 32 checks, including archived Action replay; legacy Action regression passed 25 assertions. Full migration transaction replay passed before the latest replay fix. Final Phase 2 full checks, migration consistency, Hosted application and fresh Preview acceptance remain pending.

The remaining phases and the 33 final criteria are still incomplete. This record is not a completion claim.

Phase 2 final local checkpoint: 108 files / 780 tests PASS; typecheck, lint, build, relation audit and client-secret audit PASS. Full current migration replay in a rolled-back transaction PASS; local Security Advisor at warning level reports no issues. Reviewer rechecked the last two fixes and found no blocker. Hosted still has the original 59 migrations immediately before deployment.

Deployment checkpoint: commit `9a1f1904d317eed5088945cf2ffd65fb214a04e0` pushed on the required branch. Exact migration applied to Hosted with Supabase CLI after dry-run showed only that file; all 60 local/Hosted history versions match. Post-migration Hosted Security Advisor matches the recorded baseline (five service-only RLS notices, can_read_course execute notices, disabled leaked-password protection), with no new finding. New Feature Preview `dpl_C88HKbNM8E2XpnoV5UrrztA7ukdJ` is building; fresh Phase 2 UX acceptance remains pending.

Phase 2 Preview is READY at https://edu-flow-2of9zqnsp-july-nanas-projects.vercel.app. Private labelled course `acceptance-route-action-v2` was created for the authorized normal acceptance account with `scripts/acceptance/route-action-v2-fixture.sql`. It references existing A02 / CTX01 and factual soft prerequisite `book-gold-v1-prerequisite-a02-ctx01`. No Knowledge facts or learner state were seeded. It copies CTX01 teaching content into an explicitly bound private Micro resource and defines one repeatable trace Assignment. These records remain acceptance evidence.

Browser adopted explicit inclusion of A02 through Preview → Adopt. Existing soft prerequisite did not silently force source into the route. Browser then selected Practice, launched the existing Assignment page with ActionRun `1c8d45f0-9c2d-4c86-bcb8-2fe1e9c6dc9f`, submitted a wrong trace answer, retried and passed. Hosted verified failed attempt `419f96e8-a162-4c2a-9d1f-3929587eaad8`, passed attempt `6bb3376c-1cc1-4785-a7bf-40c7e86596e3`, exact run ownership, completed run, one Assignment KnowledgeEvidence, and no CTX01 UserKnowledgeState.

Fresh UX found an availability cache defect after adopting a route: manual refresh was required. Fixed by reloading Action data on formal route/knowledge revision and aligning Micro source+target route visibility with Practice; pending new Preview confirmation. After fix: 780 tests, typecheck, lint and build PASS. Micro full browser execution, repetition/switching fresh checks, Node Detail entry and final UI polish remain pending.

Explicit Micro fresh browser execution completed all seven teaching steps (including playback, role classification and keyboard reorder) for ActionRun `3ae93c7e-d06d-4562-a6b0-01f3de637262`. Hosted confirmed `completed`, bound path `acceptance-route-action-v2-ctx01`, seven attempts and seven distinct accepted steps. Assignment-result console had zero errors; completing Micro then produced HTTP 422 from `/api/navigation` and a next-step retry warning. This completion-page defect remains under investigation. Screenshots `phase2-assignment-result.png` and `phase2-micro-result.png` were visually inspected; result-page next-step copy still reflects the old Navigator and is included in the upcoming unification scope.

Latest READY Feature Preview for availability refresh commit `10f8fbd11ef86b5931e2b85137e08a674defbec1`: https://edu-flow-hcwb7q67s-july-nanas-projects.vercel.app (`dpl_3nEELqjehLAX8BHtca2EsoPsspsF`). The above full execution was performed on preceding READY `9a1f190`; latest-refresh-specific browser check remains pending.

## Historical Phase 3/4 acceptance contract

One course-scoped Route controller and Action controller feed Path, Node Detail and Project. KnowledgeNodeDetail requires visible Knowledge plus explicit user state; course projection is optional. Bridge selection stays in Path, never fabricates curriculum or inherits all course materials. Skill Tree retains complete course relations/assets independent of personal exclusions; Path emphasizes outgoing current factual relations. Shared Action controls own selection, confirmation, start/repeat and snapshot history. Navigator prioritizes owned active execution, then available current-edge Actions by shared rank, and has an honest no-action state without automatic Micro fallback. Old navigation may supply learning progress only. Tests cover scope, source-oriented actions, Bridge absence of curriculum and active history after route changes; fresh desktop/narrow validation remains required.

## Historical Phase 5/6 acceptance contract

Force input is the active visible factual ancestor closure of Course targets, independent of acquired state, current route, draft and preview. Only prerequisite/enables facts participate; hidden structural context is neither selectable nor labelled and is excluded from explicit Fit. Current Route is visible on entry. Valid Preview shows kept/added/removed edges and node membership (including isolated nodes), preserving Current baseline. Every overlay edge must match a current factual edge ID, direction and relation. Preview is presentation-only; Adopt remains the existing version mutation. Search, relation details, downstream highlighting and Action branches use the displayed project scope. Hover, click and keyboard expose the same Action count/choices without changing engine graph identity or camera. Tests cover closure cycles, inactive and unrelated nodes, acquired pruning, stale snapshot edges, empty/singleton routes and diff identity. Browser screenshots and coordinate/camera assertions remain necessary before PASS.

Phase 2 follow-up commit `93667bc38142964a757157c692ee39c287c0c2bf` READY at https://edu-flow-bhyu4kufb-july-nanas-projects.vercel.app. Fresh normal-user Micro result reload asserted navigation HTTP 200 and console zero errors; inspected screenshot `phase2-micro-result-fixed.png` shows completion without retry warning. Explicit acquired factual ancestors now survive candidate pruning; unrelated/unacquired/removed identities and lost facts remain invalid. Contract and AGENTS were reconciled.

Phase 3/4 local checkpoint: KnowledgeNodeDetail with optional course fields and Bridge learning resource, shared Route/Action controllers, source-oriented relationships, common Action execution and independent ActionRunHistory. Navigator recommends server-confirmed continuable runs, then available Actions toward unacquired targets. Skill Tree summaries include full factual course relations without weakening execution gates. Product/data reviewers found scope leakage, blocked historical recommendations and missing Bridge learning entry; fixed with keyed course/user workspace, request unmount guards, server continuation checks and explicit existing Micro path. Full suite 110 files / 789 tests, typecheck/lint/build PASS; knowledge/client-secret audits PASS. A final small summary-availability scope alignment is being verified. Browser validation of this implementation remains pending; later phases and final criteria remain incomplete.

Final pre-Preview Phase3/4 checks remained 110 files / 789 tests PASS, typecheck/lint/build PASS; Assignment transactional suite 32 checks PASS. Graph review found no introduced force/ELK/camera blocker. UI code review required fresh screenshots and identified off-screen switch confirmation risk; confirmation now receives focus and cancellation restores the trigger. Fresh visual/interaction acceptance remains pending.

Phase3/4 fresh browser on READY `f85c3cf9599b856523727da12182e199b87ae157`, https://edu-flow-3riufe4ar-july-nanas-projects.vercel.app (`dpl_FZy3xfMWa9m4XEgGdqRUYYWwvjui`): Bridge A02 opens unified detail in Path and bounding-box assertion confirms no node movement. Outgoing factual relation shows both correctly ranked Actions. Repeat Practice created fresh `92388c60-ef81-4c35-b16d-6c7021e45981`, opened blank Assignment trace rather than the previous result, and became Navigator current execution. Switch confirmation received focus; request listener asserted no mutation before confirmation. Cancel retained that in-progress run. Explicit confirm cancelled only that run and selected repeat Micro `92dca8ed-017c-4591-bdc6-60448cfb24aa`; it launched the exact bound path at 0/7. Hosted read verified old two completed records, cancelled repeated Practice and in-progress repeated Micro with correct repeatedFromRunId. Formal route remains V2 with exactly two versions. Browser console zero errors.

Inspected desktop/narrow screenshots `phase3-route-default.png`, `phase3-bridge-detail.png`, `phase3-action-in-progress.png`, `phase3-switch-confirmation.png`, `phase3-narrow-detail.png`. UI review in progress. Found unstyled inline buttons/oversized inner heading; local fix applies shared button classes, confirmation spacing and scoped heading size. Micro repeat progress is now labelled as this execution rather than formal learning progress; Assignment return copy says Course. These presentation corrections await new Preview validation. Skill Tree comparison, Bridge with a published starting resource, history after route exclusion and later phases remain pending.

Latest `83571180755853850945ae972b6d63288dfced90` READY Preview https://edu-flow-kkhyilpvx-july-nanas-projects.vercel.app was freshly checked at 390×844. Switch confirmation is styled, visible and cancel retains the current Micro. `phase3-narrow-confirmation-styled.png` passed independent visual review. Bridge detail resolves its explicitly published private path `acceptance-route-action-v2-a02`; opening it renders the correct six-step content, recorded in `phase3-bridge-explicit-resource.png` and independently reviewed. The companion acceptance fixture adds only labelled teaching resources to the private test course, not Knowledge facts, curriculum coverage or user state.

Phase5/6 implementation checkpoint: structural ancestor closure is separate from candidate/current/preview visibility. Current and Preview node/edge overlays preserve factual relation styles; hidden context is removed from labels, interaction, branches, downstream emphasis and explicit Fit. Relation list provides a keyboard/touch alternative to hover. Project details use visible project facts. Action summaries include retained formal-route facts without widening execution authority. Review found and fixes address missed retained-edge summaries, removed-edge style ambiguity and overlapping narrow panels. An unacquired prerequisite context can remain visible but cannot be independently Included when the planner disallows it; acquired factual ancestors remain legal. Reduced motion freezes the project shader and removes camera animation. Hosted read-only closure measurement found at most 198 nodes / 260 edges among current course data (acceptance course 7 / 6); no artificial depth truncation was introduced.

Phase5 local verification: full suite 112 files / 794 tests PASS; typecheck, lint and production build PASS, followed by 14 focused tests after final edits. Existing chunk-size/H5P warnings remain. This graph implementation is not yet a visual PASS: fresh latest READY Preview Current/Diff/hover/branch/coordinate/camera checks and screenshots remain required. Assistant, Evidence, final design-system consolidation and all final acceptance criteria remain unfinished.

Phase5 fresh browser checkpoint on READY `b6dd2085e466baac0561f282b76d8ddb108fb0e8`, https://edu-flow-5sp8muwcz-july-nanas-projects.vercel.app (`dpl_2mQW2zA3YxaXy1ssqSLzBfLpFyJb`): Current V2 displays on entry. Clearing the explicit Bridge Include and requesting Preview shows the removed factual soft edge and removed A02 while keeping CTX01. DOM screen-coordinate comparison stayed within 1px. Hosted counted exactly two versions before and after Preview; clicking Adopt created V3, with retained target position unchanged. Route Navigator and four run-history records remain visible outside the new route. Restoring V2 constraints explicitly created V4. Hover over the real edge reports two Actions; real edge click opens exactly two branches, with screen coordinates still unchanged. Console has zero errors.

Screenshots: `phase5-current-route.png`, `phase5-preview-diff.png`, `phase5-edge-hover.png`, `phase5-multi-action.png`, `phase5-history-outside-route.png`. Independent UI review found one visual blocker: branch titles overlap on the short edge. Follow-up replaces them with numbered badges matched to full titles in the Action panel, and suppresses competing endpoint labels while branches are open. The relation-list entry now reserves space for Assistant; displayed capability counts include visible route context. These corrections await a new Preview check. Small remaining polish: Navigator history can display a Bridge ID when the new route snapshot has dropped its title.

The reduced-motion hook required an explicit mock in the existing recording-engine test harness; added a regression covering overlay, visibility and reduced-motion changes without reheat, camera reset or frozen-position mutation. Final follow-up suite: 112 files / 795 tests PASS, production build and lint PASS. Knowledge and client-secret audits PASS. Phase5 added-edge and narrow/reduced-motion fresh browser checks, Skill Tree comparison, later phases and final acceptance remain outstanding.

Phase5 follow-up on READY `85facdbc29564f67a32e19cfa36d252395158a8f`, https://edu-flow-8ihr08dh1-july-nanas-projects.vercel.app: keyboard relation entry opens two numbered branches; `phase5-numbered-actions.png` passed independent visual review. Narrow screenshot `phase5-narrow-actions.png` records defects, not a PASS: the old goal/legend overlays crowded the action view, and computed reduced-motion still retained the progress animation due to CSS specificity. Local fixes hide secondary overlays during detail, collapse the general legend, move narrow controls away from Assistant, and correct reduced-motion specificity. Actual desktop clicks also found expanded search intercepting route-tool buttons; editing search now shares the editor scroll container. Graph review passed explicit visible support-edge injection, retaining real enables between formal-route endpoints after acquired-node pruning; history titles now use visible Knowledge lookup. Full suite 112 files / 796 tests, lint and production build PASS before the final conditional legend refinement, whose build is being rechecked. Fresh deployed narrow/search/reduced-motion acceptance remains required.

Additional fresh 85facdb validation: explicit target exclusion adopted V5; complete Skill Tree still displays CTX01, its bound learning path, context-trace Assignment and four Action records (`phase3-skill-tree-excluded-target.png`). Removing that exclusion produces an added-node/real-edge Preview with retained node position within 1px (`phase5-preview-added.png`). Hosted version count stayed five during Preview; explicit Adopt created V6 and restored the initial two-node scope. No Action or Knowledge mutation was performed. The Preview screenshot revealed its legend beneath a long editor: the follow-up moves route explanation into the same editor flow rather than adding another floating offset. Final production build and scoped lint passed for that refinement.

## Historical Phase 7 acceptance contract

Assistant context is a complete projection of the foreground presentation, not a merge with a previously selected object. Today can carry its current Knowledge/Course; Evidence and History clear that Today context. Skill Tree uses its current anchor, Route supports visible Bridge identity, and Project uses its own selected node/edge/action without inheriting the Skill Tree anchor or design privileges. Evidence Workspace temporarily overrides the page context and closing restores the page registration. Route version, ActionRun, Evidence source and Diagnosis Run use distinct optional identities rather than overloading workflow runId. The server parser must preserve and validate supported context, without treating client context as authorization. Existing Course authoring proposal/apply behavior remains under the explicit design view. Small Assistant uses a compact context label, close/pin controls, one relevant primary operation, composer and secondary full-conversation link; opening/closing uses existing motion tokens and respects reduced motion. Acceptance requires tests for same-path presentation changes and stale-identity clearing, plus fresh desktop/mobile screenshots and no duplicate global surface.

Phase5/6 gate PASS: latest READY `18b676f5269847101e851608d806356d0707fa7c`, https://edu-flow-qz5mtrie9-july-nanas-projects.vercel.app (`dpl_6T9UMhhcZiDJ8pkPM8PfyTnzmocV`). At 390×844, expanded search and Include/Exclude controls receive actual clicks, Preview succeeds, and explanation is visible in the same scroll flow (`phase5-narrow-editor-fixed.png`). Action paths compute animationName=none under reduced motion; both branches remain operable. Prior e92cd33 screenshot `phase5-narrow-actions-fixed.png` independently passed UI review. Latest console zero errors. Product, graph, UI and data reviewers found no remaining stage blockers. Hosted acceptance course is V6, exactly six versions, restored original scope; four runs unchanged. These stage results do not constitute final all-phase acceptance.

Phase7 implementation checkpoint: presentation context replaces stale view selection; Today/Evidence/History, Project selected object, Route Bridge, Assignment and Micro ActionRun are distinct. Optional identity fields pass the existing server context parser without carrying client role authority. Evidence foreground includes Source/Diagnosis and overrides/restores the page context. One stable portal container moves inside the native modal so its Assistant remains operable without remounting the composer. The compact surface has secondary context, explicit pin/close, keyboard focus, semantic motion and reduced-motion handling. Review found and fixed normal Library source omission, Micro Run omission, native modal inert behavior, hover input dismissal and a material-list registration gap. Full suite 113 files / 804 tests, lint and production build PASS; after final registration/portal fixes, 34 focused checks plus production build and lint PASS. Fresh latest Preview validation of this phase is still required; Evidence redesign/loading/run-scoped confirmation and final all-criteria acceptance remain unfinished.

Phase7 fresh checkpoint on READY `6472d960c3b1f11be80a78fb078e6332d70666d3`, https://edu-flow-olml6hfp5-july-nanas-projects.vercel.app: keyboard Enter moves focus into Assistant; native modal contains exactly one operable Assistant; unsent text survives entry and exit through the stable portal; Today→Evidence replaces label/presentation; hover input remains open when the pointer leaves. Desktop/narrow screenshots `phase7-assistant-compact.png` and `phase7-assistant-narrow.png` inspected and sent for independent review. The latter intentionally still shows the pre-Phase8 Evidence page contrast defect; it is not an Evidence PASS. Actual Escape revealed native dialog default cancellation alongside Assistant close; follow-up prevents the default only when the Assistant is open, then restores trigger focus. This correction has production build/scoped lint PASS, but needs new Preview keyboard verification. No messages were sent and no Evidence/Knowledge state was changed in these checks.

Additional 6472d96 fresh checks: Path Bridge Assistant displays A02 title and personal-route presentation; switching to Project clears the old anchor, selecting CTX01 updates the title, and selecting the factual A02→CTX01 edge updates it to that relation. These checks found a pre-existing page-control collision: the open course drawer intercepted the Project tab click. The follow-up reserves header space above the learning drawer (desktop and narrow) rather than escalating z-index. Production build passes; fresh latest verification remains required. Assistant desktop/narrow visuals passed independent UI review.

## Historical Phase 8–10 acceptance contract

Evidence Library defaults to source summaries (title, creation time, parse/archive state, provenance, diagnosis use, unique associated capability count and confirmed count), with Upload primary and Update secondary. Source details load only when selected and trace original file, parsed lines, source-owned units, contributing proposals and diagnosis history. Diagnostic workspace exposes Select → Analyze → Review → Confirm with one stage-dependent primary action and an explicit unchanged-state notice. A selected Diagnosis Run is required for every new-UI decision; candidates are never merged across runs. Switching sources resets the active diagnostic selection. Failed/in-progress runs remain inspectable and retry does not silently create confirmation.

The new client uses explicit library/source/run/history GET views; unqualified legacy GET remains available to the old Production client. All reads use the authenticated user client and validate source/run ownership before details; unknown views fail rather than returning full data. History has bounded stable cursor pagination. New confirmation payloads contain runId and the server rejects mixed/mismatched IDs before invoking the existing transactional RPC. Legacy payloads retain their prior compatibility behavior; the RPC and formal evidence/UKS pipeline are not duplicated. No migration is planned. Tests must cover summary no-original-content, source contribution isolation, ownership 404, single-run decision atomic rejection, cursor ties and old API compatibility. Fresh desktop/narrow upload→analysis→candidate→explicit confirmation, history separation and state/route lineage checks are required before completion.

#### Phase 8–10 implementation and review checkpoint

Library now reads explicit source summaries; source content and actual contributed proposals load on demand. Diagnosis history uses a `(created_at,id)` cursor, and each workspace reads one explicit run. New confirmation requests include run identity and validate the complete RLS-visible batch before invoking the existing authority RPC. Legacy GET and confirmation payloads remain compatible with shared Production; no schema change is required.

Independent review found and resolved: Vercel's injected resource query must be removed before view validation; supported bulk selection must cap at the existing 50-item confirmation limit with an explicit batching message; archived sources must not trap the selection stage; failed run reads need a same-run retry; source/run loading and asynchronous responses must not overwrite another run. Workspace styles now exclude the stable Assistant portal host.

Verification checkpoint: 19 focused Evidence tests passed; full suite before the last archived-source regression addition passed 115 files / 822 tests; latest TypeScript + production build and lint passed. A fresh Preview flow and screenshots are still required before this phase is accepted. The prior Phase 7 drawer fix was freshly verified on `3ea98ae` at desktop and 390px: direct Course Path → Project Capability switching works with the Bridge drawer open; Escape closes the Assistant without cancelling the Evidence dialog on `f76c2e2`.

After fixes, all four independent reviewers cleared their code-review findings. Final pre-Preview full suite: **115 files / 823 tests PASS**. Browser/visual phase remains pending.

Fresh b590af4 Preview is READY at https://edu-flow-k5rh15eyt-july-nanas-projects.vercel.app. Desktop and 390px Library, empty Workspace, analyzing state and Source Detail screenshots passed independent visual review. Single failed detail GET was intentionally simulated in-browser; the retry button recovered the same real Run without starting another diagnosis.

The first real diagnosis `de0cee96-d705-41a8-991a-18f28440d76f` for labelled synthetic acceptance source `e3b940ea-c4dc-4be3-b275-c3de548880f4` failed at sufficiency judgment: DeepSeek returned a truncated response after successful extraction/retrieval. No proposals were stored; route remains V6 / six versions. This is not a successful end-to-end acceptance. The follow-up reduces judgment batches from 20 to 5 nodes while retaining full source context and aggregate per-node evidence, all existing validators, independent verification and confirmation authority. Pipeline prompt version increments to v16 for diagnosis lineage. This trades more bounded requests for smaller response size; total live duration and the same source must be reverified. Closing Workspace refreshes Library summaries so an in-flight Run is represented immediately.

Bounded-judgment follow-up local checks: **115 files / 824 tests PASS**, lint and production build PASS. Data review confirms no authority or evidence-grouping regression; live retry remains outstanding. Stable selected-source screenshots now show the actual ready checked source and active Analyze button at desktop and 390px, replacing the earlier premature loading capture.

Same-source v16 live Run `b8ae8e4f-5177-476f-b316-b7d9c0b911dd` completed in **262 seconds**, with seven proposals and no partial persistence. The historical v15 failure remains separate. This validates the bounded response repair for this input, not a universal latency guarantee; provider-dependent latency remains significant. Candidate and confirmation screenshots exposed excessive default reasoning text. UI review requested progressive disclosure, so full model judgments now live under explicit details while capability, proposed state, sufficiency, confidence and selection remain visible. Confirmation still requires a distinct explicit button; no proposal has yet been confirmed in this checkpoint.

Final read-only Hosted topology audit uses production planning and route projection over current data: **17 published courses / 11 active routes / 28 valid scenarios / 0 fact mismatches**, including enables completeness. `final-hosted-route-facts.json` records per-scenario IDs; visibility permissions are not claimed by this audit. All **60 migration versions match** Hosted; `final-database-audit.json` records unchanged Security Advisor baseline. Final latest-Preview smoke and confirmation lineage remain outstanding.

Fresh 2045433 Project → Assistant → Workspace revealed an actual pointer interception: the still-open Assistant covered the Analyze button. No new diagnosis was submitted by that failed click. The launcher now collapses the Assistant before opening Workspace. After first use, the panel stays mounted but inert/aria-hidden/non-interactive while closed, preserving its unsent composer draft; semantic open/close animation remains. UI code review passed, with keyboard reopen and direct Analyze fresh verification required on the next Preview. This replaces the earlier assumption that an open relocated panel could always coexist with Workspace controls.

Fresh db80fbf verified draft persistence and Escape retaining the workspace, but keyboard reopen focus failed because the prior animation retained visibility:hidden until after focus. The follow-up removes that redundant visibility mutation; opacity, inert, aria-hidden and pointer-events already fully suppress the closed surface. This requires a fresh keyboard check. An immediate aria-expanded assertion raced hover leave; it did not submit a diagnosis.

Fresh acc2a9a keyboard reopen now focuses inside Assistant; draft persists and the Workspace Analyze target passes native pointer hit testing. db80fbf also actually submitted Run `e38116f3-22d3-43d3-a2cd-2e550a1fb39f` directly from Assistant without manually closing the panel. That v16 run failed after 259.85s at the independent verification response (truncated), after extraction and all three sufficiency batches succeeded. No partial proposals/state were persisted. v17 keeps every semantic validator, full sources and independent verification, but verifies two nodes per request with two concurrent requests. Each pair fully settles before deterministic validation or failure; no partial persistence. Tests cover concurrency, response order and failed sibling settlement; data reviewer PASS. Live rerun remains required.

Fresh enterprise zero-supply-state UI shows inspectable alternatives and disabled selection with an explicit missing-source reason. An attempted authenticated POST was rejected 422, but with `action_outside_project`; this exposed a real candidate-vs-formal-route mismatch, not sufficient source-gate proof. Execution and GET availability now use the valid formal route's factual `routeRelations`. Acquired Bridge first selections are covered, along with missing source, other hard parents, exclusions, missing route, repeat and executor checks. Graph/data review PASS. Full suite **115 files / 830 tests**, lint and production build PASS. No schema mutation. Final fresh negative gate and Evidence confirmation remain outstanding.

Fresh af9a985 negative gate now returns **422 target_prerequisite_required**, with no selected run and no source UKS (Hosted read). Enterprise Path DOM resolves **15/15 factual edges: 11 prerequisite, 4 enables**, saved in `final-fresh-route-dom.json`. Narrow candidate/confirmation disclosure screenshots passed independent UI review and actual pointer hit testing. Assistant Skill Tree/Assignment labels and presentation match their foreground objects. No unrelated graph/code changes were needed.

v17 same-source Run `0517d634-c26a-4abb-9f9a-41fe20c8caf0` failed at the final independent-verification request after 272.63s; full earlier batches succeeded. Smaller requests alone did not resolve intermittent reasoning truncation. Official [DeepSeek effort documentation](https://api-docs.deepseek.com/guides/thinking_mode/) confirms enabled thinking defaults to high and accepts low/high/max. v18 explicitly requests low effort for Evidence only, retaining thinking, full source context, all semantic rules and independent verification. The adapter records **requestedReasoningEffort**, not an assertion that the provider honored it; callers omitting effort keep existing behavior. This can change model judgment quality and is not claimed as a pure performance optimization. Data review requires same-source repeats plus plan-only and wrong-calculation negative controls before acceptance. Fixtures are labelled synthetic; no negative proposal will be confirmed. Full suite **115 / 831 PASS**, lint/build PASS; metadata follow-up 11 focused checks/build PASS. Live quality and final confirmation remain pending.

## 新契约实施检查点 · 2026-10-05

此记录是阶段证据，不代表 45 项最终完成；新的 Hosted 浏览器验收尚待进行。

- 新版 `executionSteps` 只保存真实 Edge、Action、两端与顺序引用。Course 使用 Git 历史中的纵向执行路径；Project 负责完整选择与 Preview。节点修改与 Action-only 编辑通过显式 `scopeMode` 保持 Preview/Adopt 一致。
- 自动测试 117 文件 / 865 项通过；typecheck、lint、Knowledge audit、client secret audit 通过。真实本地数据库 47 项事务校验通过，包括并发采用/首次启动冲突、幂等重试、合法重复、criterion→route→run 锁顺序。
- 四位 Reviewer 已独立复审修复；未发现剩余代码层阻塞。实际 Hosted 动画、桌面与窄屏尚未标 PASS。
- Hosted migration 新增 `20261004162208_route_selected_action_execution.sql`，共 61 项。只新增服务端可调用的 invoker RPC 包装，原字段、旧 RPC、旧 snapshot 继续兼容。authenticated/anon 无新函数执行权限。Security Advisor 基线未变：5 项服务端表无客户端策略 INFO；既有 can_read_course 执行权限及密码保护 WARN，无新增高危项。
- 企业项目补充 13 Micro / 39 教学步骤、18 Assignment（16 trace、2旧记录类 answer），49 新 Action。现有 3 Action 定义和所有历史 Run 保留，仅对双 NULL 绑定补充对应 executor。23 条真实关系都有至少 2 Action；关键关系有 3/4/5 方案；合计 52 active Actions，24 Micro / 28 Practice，缺 Action / 无 executor 均 0。
- 已授权的普通/admin 账号分别注入现有 A/B 的 6/7 项受控 UKS，明确 acceptance-baseline 标记并保留冲突状态；它们不是测评结论。KnowledgeNode/KnowledgeEdge 全表哈希前后不变。实际资源与引用统计见 `ENTERPRISE_ROUTE_ACTION_V3_DATA.json`。两个新正式路线仍须通过真实 Preview/Adopt 验收。

### Hosted 运行检查与修复

- 首次新部署发现共享 ESM import 缺少 `.js`，Micro function 启动失败；修复后新部署 Micro GET 200。未把该失败部署计为 Fresh UX PASS。
- 实际浏览器随后发现旧 Course integrity 条件拒绝 Bridge AssignmentCoverage。校验已仅扩展到真实可见 active prerequisite/enables 上游支撑能力；related-only、无关、不可见中间路径及非 active 节点仍拒绝。课程节点与目标不扩展。产品与数据 Reviewer 复审通过。
- 最新自动回归为 117 文件 / 867 测试，typecheck、lint、build 通过。真实 API 两账号 Preview 不写版本、Adopt 追加版本且旧历史逐行不变：普通 A 为 V2/23 Steps/6 acquired，admin B 为 V2/17 Steps/7 acquired。两个账号均读取 52 个有效 Action 绑定，跨用户版本和 UKS 不可见，真实 CourseRuntimeData 通过校验。见 `SELECTED_ROUTE_V3_HOSTED.json`。
- 此记录仍不替代桌面、390×844 与 reduced-motion 的真实浏览器验收。
