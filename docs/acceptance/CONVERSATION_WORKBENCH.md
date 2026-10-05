# Conversation Workbench · final acceptance

2026-10-05 · **66/66 PASS** · branch `feature/project-capability-model`. No Production promotion. Migration: **无**. Implementation through `822f76ba29ab9799cf8a4bc6ebb8ce0c6d10b248`; the final documentation commit and matching immutable READY deployment are recorded in `.acceptance/conversation-workbench/release.json` and the delivery message. This report closes the requested work separately from historical admin/QQ acceptance.

## Incremental result and reliable A/B baseline

The starting clean local/remote HEAD was `104db1c93896ef99d7bb139f059f9e62f86ea5d4`. A had V7/13 nodes/**0 steps**. B had V7/12 nodes/14 steps, five Sources/nine Diagnoses/four ActionRuns. Original history was archived before controlled cleanup. Reset now accepts only the exact A/B owners. Old admin/QQ, all other users, shared Knowledge/Actions, and other courses remain protected.

A complete route was created through the existing **Preview → explicitly select existing Action → Adopt** API. B retained its own capability constraints; the planner's legitimate rejection of A's scope for B was not bypassed. Original V1–V7 route rows were preserved. Both now have immediately eligible real Trace actions over real KnowledgeEdges. No SQL snapshot patch, synthetic edge, fake executionStep, manual UKS inflation, or alternate Route authority.

| Baseline | Route Version | Selected nodes | executionSteps | UKS | Evidence | Diagnosis | ActionRun |
|---|---:|---:|---:|---:|---:|---:|---:|
| Acceptance A | 8 | 18 | 23 | 7 | 0 | 0 | 0 |
| Acceptance B | 8 | 14 | 17 | 7 | 0 | 0 | 0 |

A active version: `901f6524-8d9b-4383-9868-58c5f4298d35`; B: `bf9d5115-1600-47bc-9342-97b8f09ab7fa`. UKS membership differs between the accounts. The final two Reset→Verify reports compare complete captured scoped rows and are identical, including outsideHash `dd998207261f1896f0b877a9320ee0c3`. Both original retained session IDs survive. A legitimately created unrelated empty personal session also survives; actual retained sessions are three, not falsely forced to the original two.

- Reset: `scripts/acceptance/reset-conversation-evidence.ts`.
- Formal fixture adoption: `scripts/acceptance/adopt-workbench-baseline.ts`.
- Verifier: `scripts/acceptance/verify-workbench-reset.ts`.
- Scope probes: `scripts/acceptance/verify-conversation-reset-guards.ts`.
- Manifest: `.acceptance/conversation-workbench/acceptance-ab-baseline.json`.
- Exact final comparisons: `.acceptance/conversation-workbench/acceptance-ab-baseline.json.verify-final-1.json` and `.verify-final-2.json`.

Reset validates Micro path/unit ownership and private storage exact path/reference safety. Null-course workspace messages qualify only through validated v1 references to same-owner scoped Sources/Runs. Every message in a new session must qualify; mixed, other-course, malformed, and unrelated empty sessions survive. Baseline sessions retain identity and pre-capture history, deleting only later proved test messages. Actual Hosted rollback probes cover positive and negative scope cases, leaving zero probe rows.

## Presentation implementation and authority

`src/shared/components/ConversationWorkbenchShell.tsx` and `conversationWorkbench.css` define a thin presentation shell without Feature/services imports or business state. Header, independently scrolling Context rail, independently scrolling Timeline, and visible Composer dock share constrained viewport geometry. Practice, inline Capability and standalone Capability Dialog use that shell. Full-size Timeline no longer competes with page/Dialog scroll; compact Assistant retains its own 220px cap and 44px input. Cards, spacing, typography, primary/secondary actions and reduced-motion behavior share a consistent language.

Practice changes are in `src/features/course/pages/AssignmentExperiencePage.tsx`; its existing explicit `submitAssignment(..., actionRunId, true)` payload remains authoritative. Capability changes are in `src/features/evidence/CapabilityConversation.tsx`, `EvidenceWorkspace.tsx`, and `evidence.css`. Source/history/technical disclosures start collapsed. Persisted failure has one error and one primary Reanalyze action, no meaningless Refresh, and no ordinary UUID. A new analysis creates a new immutable Run; only explicit confirmation writes UKS. Route Impact opens Preview; only explicit Adopt changes the formal route.

`src/features/assistant/conversation/ConversationWorkspace.tsx`/`conversationWorkspace.css` own Timeline scrolling instead of ancestor `scrollIntoView`. Project Overview changes are scoped to `src/features/course/capability/projectCapability.css` plus shared header hit-testing in `src/shared/styles/product.css`. Desktop Overview moved from148px to the80px control band, centered between existing controls. Native disclosure overlays without pushing the graph. Narrow Overview starts172px; toolbar224px. While narrow Overview is open, complete absolute toolbar/editor containers hide with `display:none`; close restores the same draft. No graph input/layout/cache/camera lifecycle changed.

Independent native clicks at1366×768,1440×900,390×844 preserve rendered endpoints, canvas and camera presentation. World-coordinate stability is supported by unchanged graph inputs/native-disclosure code review; it is not misreported as direct engine-state introspection. Current/Preview relation highlights persist; normal motion uses existing `route-forward-flow`, reduced motion computes `animation:none`.

## Fresh behavior and independent review

Three independent reviewers completed their assigned scopes:

- [Reviewer 1 · data and authority](reviews/conversation-workbench/REVIEWER_1_DATA_AUTHORITY.md): protected complete-row hashes, reset safety, stored UKS/Route authority, migrations/security, final repeated reset.
- [Reviewer 2 · layout and motion](reviews/conversation-workbench/REVIEWER_2_LAYOUT.md): actual native Overview clicks, compact Assistant, reduced motion and independent inspection of real workbench screenshots.
- [Reviewer 3 · Fresh E2E](reviews/conversation-workbench/REVIEWER_3_FRESH_E2E.md): A/B normal UI Route→Practice→Capability→Confirm→Route Impact Preview without Adopt, real Trace/Text/File and private byte checks, positive/negative analysis and failed/new-Run retry.

All final classifications: BLOCKER none; REAL DEFECT none remaining in scope; PASS. Reports retain the actual initial failures and fixes. Fresh browsers are closed and writer window released before final Reset×2.

Trace preserves stored UKS and formal Route. B's accepted Trace adds legitimate derived assignment evidence to GETprogress, so whole projected JSON is not claimed identical; independent SQL proved all seven stored UKS rows exact before Confirm. Explicit supported Confirm changes UKS7→8 while exact V8 remains unchanged for both A/B. Subsequent Route Impact Preview does not Adopt. Text/File submissions remain pending teacher review; they are not falsely represented as completed mastery or completed ActionRuns. Ordinary chat does not become Evidence automatically. Real owned private file downloads match2948 bytes and SHA256 `301779764c565348ac0bba713a2a73d42f60289837d039d66d29b8617bbf70e6`.

Normal provider requests succeeded. A disposable same-code Preview with deployment-only unavailable transport exercised the existing real failure handler; no project environment, SQL status, provider fallback or Production was changed. Actual failed Run was restored in the normal UI; Reanalyze produced a distinct completed Run/five proposals, retaining the old full failure detail unchanged. The exact disposable deployment was removed afterward. Its deliberate503 is separated from normal Preview runtime review.

## Protection and engineering checks

Independent Reviewer1 compared26 protected tables by count and complete-row MD5, including non-A/B learner authorities and shared Knowledge nodes/revisions/edges, Actions/bindings, Course/curriculum definitions. Protected messages remain194 / `c6c5af271df458a43b81aed2265e5e48`; protected private objects33 / `535d1b1f3b62b26e8bc4e561d20df501`. Original old admin route remainsV4/17 steps/UKS14, and QQ remainsV4/23 steps/UKS15. No old-account login/write used. Final post-Fresh proof is in Reviewer1 and its protected-final artifacts.

| Check | Result |
|---|---|
| Automated tests | PASS ·124 files /900 tests; independent Reviewer1 eight suites /75 tests |
| Typecheck / lint | PASS / PASS |
| Production build | PASS · pre-existing chunk-size warning only |
| Knowledge and client-secret audits | PASS / PASS |
| Hosted rollback reset guards | PASS · zero probe rows |
| Final Reset→Verify twice | PASS · identical complete reports |
| Migration consistency | PASS ·63 local/Hosted version+name pairs, latest20261005023013; no migration |
| Security Advisor | PASS · unchanged5 INFO/3 WARN; no ERROR or new high-risk issue |
| Feature deployment | READY · immutable Git Preview matches release SHA; target=null |
| Runtime | Normal Feature Preview: no new systemic5xx; isolated B console/errors/API5xx all0 |
| Production | Original deployment/commit/aliases unchanged; no promotion |

Logs/proofs live in `.acceptance/conversation-workbench/`: `tests-final.log`, `build-final.log`, `knowledge-audit-final.log`, `secret-audit-final.log`, `reset-guards-final.log`, final verify JSON, Reviewer1 migration/advisor/protected artifacts, and `release.json`. Dependencies and pnpm lockfile are unchanged. No new migration, backend authority, business ontology, or alternate state system.

## Screenshot evidence

Screenshots and matching quantitative JSON are local artifacts under `.acceptance/conversation-workbench/fresh-review/`. All required browser sizes use actual viewports and scale=1. [Screenshot index](CONVERSATION_WORKBENCH_SCREENSHOTS.md) links every required category, including desktop and narrow variants, Source/candidate/failure/success, Overview collapsed/expanded and Reduced Motion. `geometry-summary.json` has18/18 actual measured states PASS. Valid independent scrolling records Context400, Timeline596, documentY0, visible Composer bottom747. Offscreen candidate/source captures, initial unloaded route image, and scrollTop0 probes are explicitly excluded; replacement visible proofs are used.

## Known limitations

- Occasional external embedding timeout remains a known provider limitation. This work adds no fake fallback or provider tuning; deliberate LLM transport failure is a separate acceptance test.
- Text/File await existing teacher review; completion and Knowledge mastery remain separate.
- A deliberately incorrect arithmetic example received partial model confidence and was left unconfirmed. Clear negative evidence produced no candidate; insufficient proposal was disabled. Presentation work does not claim to solve model evaluation quality.
- Pre-existing Security Advisor INFO/WARN, performance advice and build chunk-size warning remain outside this work. No new high-risk finding.
- Fresh A legally adopted V9→V10→V11 to execute additional action kinds; final Reset restored exact V8 baseline. These explicit adoptions are excluded from automatic-route-mutation claims.

## 66 success criteria

Every item below is assessed individually; no NOT APPLICABLE or FAIL items remain. Evidence keys: **Data** = Reviewer1/final complete-row reset/protection proof; **Fresh** = Reviewer3 actual UI+API snapshots; **Layout** = Reviewer2 native clicks/visual review; **Geometry** = Fresh18-state measurements; **Engineering** = checks/logs above; **Release** = matching immutable READY metadata/runtime/unchanged Production.

| # | Success criterion | Result | Evidence |
|---|---|---|---|
| 1 | 当前分支仍是 feature/project-capability-model。 | PASS | Data; final Reset1/2 |
| 2 | Reset 只操作 Acceptance A/B。 | PASS | Data; final Reset1/2 |
| 3 | admin@eduflow.test 数据不变。 | PASS | Data; final Reset1/2 |
| 4 | 2967618185@qq.com 数据不变。 | PASS | Data; final Reset1/2 |
| 5 | 其他用户数据不变。 | PASS | Data; final Reset1/2 |
| 6 | Global Knowledge Graph 不变。 | PASS | Data; final Reset1/2 |
| 7 | Acceptance A reset 后 executionSteps > 0。 | PASS | Data; final Reset1/2 |
| 8 | Acceptance B reset 后 executionSteps > 0。 | PASS | Data; final Reset1/2 |
| 9 | A/B 都可以直接打开 Course Route 执行。 | PASS | Data; Fresh Course Route |
| 10 | Reset 连续两次结果一致。 | PASS | Data; final Reset1/2 |
| 11 | Practice / Capability Update 共享 Workbench Shell。 | PASS | Data authority review; shell/source boundary |
| 12 | 没有新建额外业务状态体系。 | PASS | Data authority review; shell/source boundary |
| 13 | Practice authority 不变。 | PASS | Data authority review; shell/source boundary |
| 14 | Evidence / Diagnosis / UKS authority 不变。 | PASS | Data authority review; shell/source boundary |
| 15 | Route authority 不变。 | PASS | Data authority review; shell/source boundary |
| 16 | 1366×768 @100% Practice Composer 始终可见。 | PASS | Geometry; Layout; Fresh |
| 17 | 1440×900 @100% Practice Composer 始终可见。 | PASS | Geometry; Layout; Fresh |
| 18 | 1366×768 @100% Capability Composer 始终可见。 | PASS | Geometry; Layout; Fresh |
| 19 | 1440×900 @100% Capability Composer 始终可见。 | PASS | Geometry; Layout; Fresh |
| 20 | 不需要缩放浏览器才能完成操作。 | PASS | Geometry; Layout; Fresh |
| 21 | Timeline 独立滚动。 | PASS | Geometry; Layout; Fresh |
| 22 | Context 独立滚动。 | PASS | Geometry; Layout; Fresh |
| 23 | 不存在页面 + Dialog + Timeline 三层滚动竞争。 | PASS | Geometry; Layout; Fresh |
| 24 | 上传按钮始终可达。 | PASS | Geometry; Layout; Fresh |
| 25 | 发送按钮始终可达。 | PASS | Geometry; Layout; Fresh |
| 26 | 正式提交始终可达。 | PASS | Geometry; Layout; Fresh |
| 27 | Practice 与 Capability Update Header 视觉统一。 | PASS | Geometry; Layout; Fresh |
| 28 | 卡片视觉统一。 | PASS | Geometry; Layout; Fresh |
| 29 | Button hierarchy 统一。 | PASS | Geometry; Layout; Fresh |
| 30 | spacing / typography 统一。 | PASS | Geometry; Layout; Fresh |
| 31 | Source picker 默认渐进展开。 | PASS | Fresh actual source/failure; Layout |
| 32 | 历史分析默认折叠。 | PASS | Fresh actual source/failure; Layout |
| 33 | Failed Run 不重复报错。 | PASS | Fresh actual source/failure; Layout |
| 34 | Failed Run 不再显示无意义的刷新。 | PASS | Fresh actual source/failure; Layout |
| 35 | Failed Run 有明确“重新分析”。 | PASS | Fresh actual source/failure; Layout |
| 36 | Run UUID 默认不暴露给普通用户。 | PASS | Fresh actual source/failure; Layout |
| 37 | Trace 正常。 | PASS | Fresh actual flow; Data stored authority |
| 38 | Text Practice 正常。 | PASS | Fresh actual flow; Data stored authority |
| 39 | File Practice 正常。 | PASS | Fresh actual flow; Data stored authority |
| 40 | Capability 正例正常。 | PASS | Fresh actual flow; Data stored authority |
| 41 | Capability 负例正常。 | PASS | Fresh actual flow; Data stored authority |
| 42 | Capability Confirm 不自动改 Route。 | PASS | Fresh actual flow; Data stored authority |
| 43 | Route Impact 正常。 | PASS | Fresh actual flow; Data stored authority |
| 44 | Preview 不 Adopt 不改变正式路线。 | PASS | Fresh actual flow; Data stored authority |
| 45 | Project Overview 明显上移。 | PASS | Layout native disclosure; Fresh Preview stability |
| 46 | Project Overview 与左右顶部控制处于同一视觉带。 | PASS | Layout native disclosure; Fresh Preview stability |
| 47 | Overview 展开不 push graph。 | PASS | Layout native disclosure; Fresh Preview stability |
| 48 | Overview 展开不改节点坐标。 | PASS | Layout native disclosure; Fresh Preview stability |
| 49 | Overview 展开不重置 camera。 | PASS | Layout native disclosure; Fresh Preview stability |
| 50 | Current / Preview Pulse 不回归。 | PASS | Layout native disclosure; Fresh Preview stability |
| 51 | 390×844 Practice PASS。 | PASS | Geometry; Layout; Fresh narrow/reduced |
| 52 | 390×844 Capability Update PASS。 | PASS | Geometry; Layout; Fresh narrow/reduced |
| 53 | 390×844 Project Capability PASS。 | PASS | Geometry; Layout; Fresh narrow/reduced |
| 54 | Reduced Motion PASS。 | PASS | Geometry; Layout; Fresh narrow/reduced |
| 55 | Global Assistant 没有布局回归。 | PASS | Geometry; Layout; Fresh narrow/reduced |
| 56 | 自动测试 PASS。 | PASS | Engineering; Data final proof |
| 57 | typecheck PASS。 | PASS | Engineering; Data final proof |
| 58 | lint PASS。 | PASS | Engineering; Data final proof |
| 59 | build PASS。 | PASS | Engineering; Data final proof |
| 60 | reset verification PASS。 | PASS | Engineering; Data final proof |
| 61 | migration consistency PASS。 | PASS | Engineering; Data final proof |
| 62 | 无新增高危 Security Advisor 问题。 | PASS | Engineering; Data final proof |
| 63 | Latest Feature Preview READY。 | PASS | Release |
| 64 | 无本轮新增系统性 Runtime 5xx。 | PASS | Release |
| 65 | Embedding 偶发 timeout 仅记录已知限制，不通过伪造 fallback 绕过。 | PASS | Release; known limitations |
| 66 | 不 Promote Production。 | PASS | Release |
