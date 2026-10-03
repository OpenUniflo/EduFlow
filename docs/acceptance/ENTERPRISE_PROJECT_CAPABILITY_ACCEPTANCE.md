# Enterprise Project Capability Acceptance V1

Status: **PASS for the bounded P2/P3 enterprise scenario acceptance**, after two documented visual repair cycles. First blind review failed; the same initially fresh independent reviewer passed the final repair recheck. This is not a second fresh-user study or an end-to-end learning/action acceptance.

## Observed baseline (2026-10-03)

- Chat worktree `fc7f` was clean detached `a0fc93e`; reused clean main checkout `/Users/fanyuhang/Documents/OpenUniflo/EduFlow`, already on `feature/project-capability-model`, local and remote `57807f14d1d12068fb1665e3b2f88c9a3c083476`. No reset or discarded changes.
- Hosted KnowledgeAtlas `uyljtdbvlivxniililay`, Postgres 17.6, ACTIVE_HEALTHY. Migration history through `20261002061940_personal_course_route_versions_v2`; live column/constraint inspection confirmed existing normalized tables suffice.
- Initial latest READY Preview: https://edu-flow-cg7a8yztz-july-nanas-projects.vercel.app (`dpl_FMm1TrLbCNbZwD4itco2H4upvGgm`), exact branch/commit above. Production remains prototype and is not the acceptance target.
- Independent read-only domain reviewer checked 332 Global nodes. Supplier/manufacturing/inventory title+description searches found no equivalent; broader risk/cost/quality results described AI/software. No semantic reuse available.
- Seven governed Domains inspected; Business Analysis explicitly covers business decision analysis. Reused through pinned admin assignments. No geometry or edge derives from Domain.

## Scope and decisions

Anonymous consumer-electronics manufacturing scenario, not a named customer or actual enterprise assessment. Four Course targets reference the same shared Global Knowledge graph; 14 support abilities are not CurriculumCoverage targets. No new Project table, target store, ontology, schema, engine, dependency, or action model.
All rubric definitions and edge classifications below are **[Modeling]**. Sources support the underlying business dimensions, not an exact capability graph or measured company state. The 2021 Vietnam context is historical background, not a 2026 operational claim.

|Decision|Choice and reason|
|---|---|
|Reuse/new nodes|18 new atomic calculation/interpretation/judgment abilities after live dedup review; Agent Failure Recovery is not supply recovery.|
|Relation strength|12 hard input dependencies for independently assessable judgments; 11 directional enables. Parallel supplier dimensions are not forced into a serial prerequisite chain.|
|Domain|Reuse Business Analysis; no new color-driven classification.|
|Accounts|Two new student profiles, empty capabilities, identical active membership. Existing learner has seven states and is untouched.|
|T1 mechanism|Controlled server-authority learned update with acceptance provenance. Avoid building Micro content solely to simulate evidence. Does not prove Evidence→State inference.|
|Persistence|One scoped, rerunnable setup/verify tool with transactional catalog conflict guards. No reseed/reset; Auth creation/profile initialization is safely resumable.|
|UI/code|Algorithms remain unchanged. Only demonstrated cognitive barriers may justify small presentation fixes.|

## Sources

- [Fact: Vietnam industrial context (2021)](https://moit.gov.vn/en/news/industry-and-trade/ministry-to-focus-on-supplying-goods-for-export.html)
- [Fact: ASQ supplier evaluation dimensions](https://asq.org/quality-resources/supplier-quality)
- [Fact: ASCM MRP demand/inventory/lead-time framework](https://www.ascm.org/globalassets/ascm_website_assets/docs/ecm/ecm-cpim8.pdf)
- [Fact: ETH inventory/lead-time variability](https://opess.ethz.ch/course/section-11-3/11-3-3-safety-stock-calculation-with-continuous-demand/)

## Reviewed model

|Stable ID|Atomic ability and mastery criterion|Basis|
|---|---|---|
|`supply-critical-material-identification`|关键物料识别：给定 BOM、替代性及停线影响，按明确准则识别关键物料并说明排除理由。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-net-material-requirement`|物料净需求计算：根据订单需求、可用库存及确认到货计算分时段净需求，正确排除不可用库存。|[Modeling; source](https://www.ascm.org/globalassets/ascm_website_assets/docs/ecm/ecm-cpim8.pdf)|
|`supply-cross-border-lead-time`|跨境补货交期估计：分解生产、运输、通关和收货环节，给出有依据的交期区间及不确定性，避免重复计时。|[Modeling; source](https://www.ascm.org/globalassets/ascm_website_assets/docs/ecm/ecm-cpim8.pdf)|
|`supply-shortage-exposure`|交期窗口缺料暴露评估：独立使用净需求和补货交期窗口，计算最早缺料日、缺口量及交期敏感性。|[Modeling; source](https://www.ascm.org/globalassets/ascm_website_assets/docs/ecm/ecm-cpim8.pdf)|
|`supply-landed-cost-calculation`|到岸总成本计算：依据给定费率汇总采购、运输、税费和检验等可比总成本，识别漏项和重复项。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-cost-lead-time-tradeoff`|供给备选方案成本交期权衡：独立比较备选方案的总成本和交期，在给定质量及合规约束下说明取舍和敏感参数。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-supplier-screening-criteria`|供应商筛选准则定义：将物料规格与交付要求转成可验证筛选准则，区别必须满足的门槛和评分项。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-supplier-qualification-review`|供应商资质证据审查：核验资质证据的主体、范围、有效性和缺项，给出通过或补证判断。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-sample-quality-interpretation`|供应商样品质量证据判读：按给定验收方案判读试验及样品结果，区分不合格与证据不足。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-supplier-delivery-capacity`|供应商交付产能核验：依据瓶颈、良率和已承诺负荷计算期间可交付量，识别名义产能误用。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-supplier-admission-decision`|供应商准入证据判定：独立审查资质、样品质量及交付产能证据，按明确规则作通过、条件通过或拒绝判断。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-shortage-impact-assessment`|缺料中断影响评估：独立将已量化缺口映射到受影响订单、停线时段及恢复优先级输入。|[Modeling; source](https://www.ascm.org/globalassets/ascm_website_assets/docs/ecm/ecm-cpim8.pdf)|
|`supply-alternate-site-capacity`|替代基地可用产能评估：根据给定基地负荷、产品兼容性和转换损失估算可释放产能并指出不确定性。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-site-switch-feasibility`|跨基地供给切换可行性判断：独立用替代基地可用产能和到达时间检验候选切换是否满足订单约束，区分不可行和缺失证据。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-recovery-option-ranking`|供应恢复备选方案排序：对给定可执行候选方案，独立按中断影响、恢复时间与风险排序并解释；不执行资源调配。|[Modeling; source](https://www.ascm.org/globalassets/ascm_website_assets/docs/ecm/ecm-cpim8.pdf)|
|`supply-incoming-quality-anomaly`|来料质量异常判定：依据给定检验标准区分批次异常、测量误差及证据不足。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-corrective-action-verification`|供应商纠正措施有效性验证：根据已判定异常基线、复验及复发数据判断纠正措施是否有效。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|
|`supply-material-risk-identification`|关键物料供应风险识别：识别集中供应、交期波动和替代限制等暴露，区别事实、假设及待核验证据。|[Modeling; source](https://asq.org/quality-resources/supplier-quality)|

|Source → target|Relation|Modeling reason|
|---|---|---|
|物料净需求计算 → 交期窗口缺料暴露评估|hard|独立量化交期窗口缺口需要正确计算分时段净需求。|
|跨境补货交期估计 → 交期窗口缺料暴露评估|hard|缺料暴露计算必须正确界定补货到达窗口。|
|到岸总成本计算 → 供给备选方案成本交期权衡|hard|独立成本交期权衡必须计算可比较的到岸总成本。|
|跨境补货交期估计 → 供给备选方案成本交期权衡|hard|独立成本交期权衡必须估计可比较的补货交期。|
|供应商资质证据审查 → 供应商准入证据判定|hard|定义中的独立准入判断必须识别资质证据有效性。|
|供应商样品质量证据判读 → 供应商准入证据判定|hard|定义中的独立准入判断必须正确理解样品质量验证结论。|
|供应商交付产能核验 → 供应商准入证据判定|hard|定义中的独立准入判断必须核验可交付产能满足要求。|
|交期窗口缺料暴露评估 → 缺料中断影响评估|hard|该中断影响评估从已量化的缺料暴露推导订单影响。|
|替代基地可用产能评估 → 跨基地供给切换可行性判断|hard|独立切换可行性判断必须核验替代基地真正可释放产能。|
|跨境补货交期估计 → 跨基地供给切换可行性判断|hard|独立切换可行性判断必须估计供给能否及时到达。|
|缺料中断影响评估 → 供应恢复备选方案排序|hard|恢复方案排序必须正确判断中断影响及优先级。|
|来料质量异常判定 → 供应商纠正措施有效性验证|hard|纠正措施有效性验证必须使用正确的质量异常基线。|
|关键物料识别 → 关键物料供应风险识别|enables|关键性判断帮助风险识别聚焦于重要物料，但不是识别所有风险的硬门槛。|
|关键物料供应风险识别 → 缺料中断影响评估|enables|风险机制识别支撑中断影响情景选择，但不代替缺口计算。|
|供应商筛选准则定义 → 供应商资质证据审查|enables|明确筛选证据要求为资质审查提供执行基础。|
|供应商筛选准则定义 → 供应商样品质量证据判读|enables|筛选准则明确样品质量判读边界，执行者也可使用别人给定的验收方案。|
|供应商筛选准则定义 → 供应商交付产能核验|enables|筛选准则明确数量与期间要求，为交付产能核验提供依据。|
|供应商交付产能核验 → 替代基地可用产能评估|enables|供应商产能核验方法可迁移到基地负荷分析，但不是基地评估硬前置。|
|交期窗口缺料暴露评估 → 供给备选方案成本交期权衡|enables|缺口紧迫性为成本与交期权衡提供直接决策依据。|
|供应商准入证据判定 → 供给备选方案成本交期权衡|enables|准入判断帮助过滤不合格供给候选，但权衡者也可使用已审核名单。|
|跨基地供给切换可行性判断 → 供应恢复备选方案排序|enables|切换可行性判断为恢复排序提供有效备选，恢复也可能不涉及切换。|
|供应商纠正措施有效性验证 → 供应恢复备选方案排序|enables|措施有效性决定质量异常供应能否恢复，其他供应异常不必经过该能力。|
|供应商样品质量证据判读 → 来料质量异常判定|enables|样品质量证据判读方法支撑来料批次异常识别，但不是其硬门槛。|

Targets in explicit coverage order: 供应商准入证据判定 → 供给备选方案成本交期权衡 → 跨基地供给切换可行性判断 → 供应恢复备选方案排序.

## Controlled state baseline

|Actor|Acquired input|Expected visible blue/gray/green|Default route members / pending|
|---|---|---|
|A|物料净需求计算, 跨境补货交期估计, 到岸总成本计算, 供应商筛选准则定义, 来料质量异常判定, 关键物料识别|6 / 8 / 4|13 / 10|
|B|交期窗口缺料暴露评估, 供应商资质证据审查, 供应商样品质量证据判读, 供应商交付产能核验, 跨境补货交期估计, 到岸总成本计算, 来料质量异常判定|7 / 3 / 4|12 / 6|

A T1 adds `supply-shortage-exposure` as learned. It changes gray→blue; its already acquired net-demand parent exits the current reverse-boundary projection. Expected 6/7/4, route 12/pending 9. Blue count need not increase. Enables-supported gray candidates need not belong to the necessary hard-closure route.

Navigation is expected to recompute the complete path. A’s first pending supplier-quality requirement remains first after the later shortage branch changes; an unchanged first action is legitimate. There are no authored Micro assets, so `learning_content_unavailable` is an honest boundary.

## Reproduce

Use private runtime environment (never committed): `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (setup/transition only), `ACCEPTANCE_PUBLISHABLE_KEY`, `ACCEPTANCE_A_PASSWORD`, `ACCEPTANCE_B_PASSWORD`, `ACCEPTANCE_PREVIEW_URL`. Passwords must be at least 24 characters on creation. Ensure Supabase CLI is linked to the exact ref above.

```sh
node --env-file=/private/runtime.env --import tsx scripts/acceptance/enterprise-project.ts setup
node --env-file=/private/runtime.env --import tsx scripts/acceptance/enterprise-project.ts reset-t0
ACCEPTANCE_PHASE=t0 node --env-file=/private/runtime.env --import tsx scripts/acceptance/enterprise-project.ts verify
node --env-file=/private/runtime.env --import tsx scripts/acceptance/enterprise-project.ts transition
ACCEPTANCE_PHASE=t1 node --env-file=/private/runtime.env --import tsx scripts/acceptance/enterprise-project.ts verify
node --import tsx scripts/acceptance/enterprise-project.ts compare
node --env-file=/private/runtime.env --import tsx scripts/acceptance/enterprise-project.ts security
```

`setup` preserves existing states/history and refuses conflicting reviewed catalog rows. `reset-t0` removes only A’s exact acceptance-marked transition, refuses real evidence, and never deletes route versions. Use it before a new T0 capture. `security` deliberately appends an explicit Include version and restore version; invalid/stale/cross-user requests must not append. Do not run it between T0/T1 history comparison. No automatic cleanup of canonical Knowledge. Stop if governance changed instead of overwriting it.

## Gates and evidence

- Domain review: independent, read-only, completed; 18-node input executed against actual core algorithm.
- Focused model tests: 4 initial tests passed.
- Initial Hosted A/B API: matches independent pure projection, shared graph membership, Course integrity and different Navigation frontiers.
- Security: 19 authenticated HTTP/REST assertions passed initially; own-user headers rather than service-role for conclusions.
- UX independently found initial unlabeled points and absent business outcome: P1 cognitive barrier. Minimal fix marks actual project targets for existing map-label priority and shows runtime target_outcome plus derived role counts. No coordinate/camera changes. Regression failed before and passed after.
- Initial controlled T0→T1 passed: gray 8→7, necessary route members 13→12, Navigation path changed; no route version added, complete historical row SHA-256 hashes unchanged, B states unchanged. Next Action remains supplier-quality because the changed shortage branch is later in curriculum order.
- Engineering: 101 test files / 710 tests, typecheck, lint, production build, client secret audit and knowledge audit passed. Existing H5P CSS and chunk-size warnings remain. Local/Hosted migration versions match fully.
- Independent Functional gate PASS: ordinary A/B HTTP+REST and browser, exact states/targets, own-read isolation, restore404, stale409, complete immutable histories. Main 19-assertion Hosted suite additionally exercised successful explicit Include and Restore; final A V7 / B V1. See `independent-functional.json` and `security.json`.
- Existing Hosted capability verification PASS for both historical learner/admin accounts (116 original targets); read/preview/rejected writes only. Existing local `verify-personal-route.ts` persistence verification PASS, cleaning its own temporary fixtures. Hosted migration list matches local. Existing `verify-route-hosted-api.ts` would mutate unrelated admin history, so this scenario's ordinary-user security mode covers the same API protocol instead.
- First implementation Preview `https://edu-flow-rcpwclt8s-july-nanas-projects.vercel.app`, `dpl_67qasVjMApQysJN27Q7faNNeZ7s7`, SHA `38eb59e665e185ff580ca14ab1c9b036eade71f4`.
- First fresh Final Blind verdict: **未通过完整体验验收**. Exact independent summary: “EduFlow 把项目需要达到的能力、个人已有能力和欠缺能力连接起来，再据此前置关系组织个人学习路线，并尝试连接学习与实训。” It correctly identified A/B roles, differences, downstream support and T1, but found course-first default entry, conflicting green completed states and unclear missing-content next step. `blind-round1.json` preserves failure rather than replacing it with a PASS.
- Minimal follow-up: route heading uses persisted targetOutcome and live route counts; links to existing capability view; completed route checks use acquired blue; missing-content card identifies the real next capability without inventing execution; model copy explains reverse-boundary pruning. No algorithm, layout engine, schema, dependency or evidence-inference changes. Final recheck results are recorded below.
- Final evidence in `.acceptance/enterprise-project-v1/`; no secrets/session payloads.

## Product boundary

This acceptance can establish P2 and P3 Current State→Gap/Route/Recompute only. It does not establish real-world capability assessment accuracy, enterprise evidence inference, action/resource execution or business performance improvement.


## Second review and bounded repair

The same initially fresh blind reviewer rechecked `0cff1da` on `nv6oh1byk`: first-screen purpose, color consistency and A/B attribution passed, but overall experience still failed. Exact summary: “EduFlow 把项目目标拆成相互关联的能力，对照个人已有能力找出缺口，生成需要补齐的学习路线，并准备连接学习与实训。” The independent record is `blind-round2.json`; original failing focus screenshot is retained. A request for a fifth fresh agent was rejected by the environment's total agent-thread limit; subsequent rounds are explicitly repair rechecks, not fresh first-impression studies.

Remaining concrete fixes: the next-capability CTA passes its real ID to the existing selected anchor; search selection no longer auto-zooms using a stale previous selection's neighborhood; explicit project focus/fit delegates to ForceGraph zoomToFit with room for overlays, and selecting hides the goal card. None changes node/edge coordinates or force lifecycle. The route shows the latest dated acquired state records already present in user data; it does not fabricate an acquisition event, evidence or durable difference history. Full action/content completion remains outside this acceptance.


## Final acceptance (2026-10-03)

Validated code deployment: [READY Preview](https://edu-flow-b4jcw7u4v-july-nanas-projects.vercel.app/courses/enterprise-vietnam-supply-collaboration), deployment `dpl_AeMqJaVQwDv2d4nQCEmTTHpdPicj`, commit `840ffbd15c45254164f7621efb8d01ea0c84ab90`, branch `feature/project-capability-model`. Subsequent evidence-only packaging does not change the application sources. No Production promotion occurred.

|Gate|Result and evidence|
|---|---|
|Domain/shared graph|PASS: live 332-node dedup review, 18 atomic Global additions and 23 justified relations, same existing repository/API. Seven Domains preserved; Business Analysis assignments explicit. No new graph, synthetic visual edge, Action node or schema.|
|Project|PASS: one Course, one Chapter/Lesson, four active target coverages and four minimally valid Assignment coverages; 14 other abilities remain shared support knowledge.|
|A/B|PASS: same student role, empty capability permissions, active membership, graph and four targets. Precise baseline state guards reject contamination. `t0.json` and independent functional report.|
|T0→T1|PASS: exposure becomes acquired; model 6/8/4→6/7/4, necessary route13→12/pending10→9; navigation path changes. Same first next capability is correct because a later branch changed. B unchanged. `transition.json`.|
|Versions/isolation|PASS: no implicit version on state updates, entire historical row hashes unchanged. A V7/B V1. Every prior A V2/V4/V6 was explicit Include; V3/V5/V7 explicit Restore to empty constraints. Cross-user reads hidden, restore404, stale409, client writes403, forged payload400, hard-exclude conflict422. `security.json`.|
|Laser/stability|PASS on final code Preview: blue/gray/green, 13-edge multibranch, 5-edge branch, 1-edge target, 0-edge leaf and clear; shader time advances; all checks preserve graphData identity, frozen coordinates and camera. Actual callbacks measured in browser; independent review additionally uses real search/pointer interaction. `browser-laser.json`.|
|Independent function|PASS: original T0/T1 capture plus latest read-only API deep comparison and real-browser previous-UI recheck; no reviewer writes. Latest main browser checks cover final selection CTA and renderer. `independent-functional.json`.|
|Final visual/recognition|PASS with limits on final repair recheck; original isolated review and first recheck failures retained in `blind-round1.json`/`blind-round2.json`. `blind-final.json` and four final screenshots.|
|Engineering|PASS: 101 test files / 710 tests, typecheck, lint, production build, client-secret and Knowledge audits; focused model/route/navigation tests included. Existing local personal-route persistence verification passed and removed its own temporary rows. `engineering.json`.|
|Hosted regression/runtime|PASS: original 116-target course verification for existing learner/admin, latest Preview API verification, no sampled5xx or browser errors. Known DEP0169 remains. `existing-course-regression.json`, `runtime-health.json`.|

The 19 security assertions were executed on `0cff1da`/`nv6oh1byk`; the final `840ffbd` API Git tree is exactly the same (`a83524a89e99a646f60373de507e5d0457e53ea3`). Latest ordinary-user API captures, immutable-history comparisons, original-course regression and browser checks were repeated on `b4jcw7u4v`. This evidence distinction is intentional; security mutations were not repeated solely for UI text/focus changes.

Final state left available to inspect:

|Actor|Actual stored acquired states|Visible blue / gray / green|Route members / pending|Next capability|Version|
|---|---:|---|---|---|---:|
|A T1|7|6 / 7 / 4|12 / 9|供应商样品质量证据判读|7|
|B T0|7|7 / 3 / 4|12 / 6|供应商准入证据判定|1|

Blue counts describe the current goal projection, not lifetime acquired totals. A's already acquired net-demand prerequisite exits the reverse boundary when exposure becomes acquired. Gray candidates supported by enables are not all necessary hard-closure route members.

Final independent wording, preserved verbatim:

> 本轮视觉与认知验收：通过，保留限制。
>
> EduFlow 将企业项目目标与个人能力连接起来，展示已具备能力、缺口和能力之间的支撑关系，据此组织个人学习路线，并随能力状态调整路线。

The reviewer observed the exact changed capability in the new recent-state text, A pending10→9, impact unlocked, net removed and B unchanged. The observed support chain remained visible; the next-capability button selected the matching detail. Last round had no login redirect.

## Unverified or limited

- **No fresh-person study after fixes:** platform refused a fifth agent because its total thread limit was reached. The final reviewer was initially fresh and isolated, then performed two independent repair rechecks. Do not call the final pass an unseen-first-exposure experiment.
- **No full learning/action pipeline:** no authored Micro learning content for these abilities; UI honestly reports content pending. Minimal Assignment definitions are not a complete enterprise training program. No claim of Evidence→State inference, real employee capability accuracy, Action Space, enterprise outcomes, P4/P5/P6 or completed real learning.
- Desktop and selected-node visual checks only; initial graph/labels remain small. Hard versus non-gating support is explained by detail text, not animation alone. State records identify recent facts, not a persisted historical delta feed.
- Earlier concurrent acceptance sessions saw transient login redirects; independent sequential checks did not reproduce, and the final exclusive browser round had none. Cause was not proved; no auth behavior was changed to hide it.
- Runtime log checks are bounded observed windows. Existing H5P CSS/chunk-size and DEP0169 warnings remain, without unrelated fixes.

Accounts are `project-capability-a@eduflow.test` and `project-capability-b@eduflow.test`. Passwords and server keys are excluded from this document and every evidence file. A local mode-0600 login-only handoff is supplied separately. Reproduction requires privately supplied runtime credentials, and the guarded `reset-t0` command above restores only the acceptance transition while preserving all immutable route history.
