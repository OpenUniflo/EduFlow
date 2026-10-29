# 新版 UI：AGENTS.md 规则修改稿（待审）

日期：2026-10-29 · 状态：**已于 2026-10-30 合入** `AGENTS.md` 与 `docs/rules/*.md`（本文件保留为决策记录）

依据：第 58 版设计稿「EduFlow 新版设计」与 2026-10-29 的产品决定。下面每一条给出**原规则**、**修改后规则（拟合入 AGENTS.md 的英文条文）**和**理由**。未列出的规则保持不变。

---

## 1. 档案：全局与个人合并为一张图

**涉及章节**：Atlas Views、Layout and Validation（第 6 条）、Atlas Camera Invariants

**原规则**：Global Atlas 只渲染 Global 节点；Personal Atlas 由核心节点（已学/在学）+ 一跳探索节点组成；两者是两个视图，共用 `KnowledgeAtlasScene`。

**修改后**：

- The learner Archive (档案) is one Knowledge Atlas over active visible Knowledge and factual edges. Zoom distance is presentation only: close range emphasizes the learner's own subset, far range reveals the whole visible graph. There is no Personal/Global mode switch.
- The learner's own subset (nodes with UserKnowledgeState) MUST be marked by a presentation overlay (outline, opacity, label) and MUST NOT be a separate graph, layout or fact set.
- One deterministic relation-driven force layout serves all zoom levels; zooming, locating "me", selecting people for comparison and search MUST NOT relayout.
- Other learners' subsets are rendered as presentation overlays (person-colored segmented rings) over the same layout and only from data the server authorizes for the viewer.
- Global-scope-only rendering remains the rule for anonymous viewers and for the Global governance view in Admin.

**理由**：设计稿的档案是一张图，拉近看自己、拉远看全局；人物对比和定位都只是镜头与叠加层。

## 2. 学习者课程视图用 three.js；React Flow 只用于编辑类画布

**涉及章节**：Layout and Validation（"Course graph production rendering uses React Flow + ELK"）、Course Presentation Stability

**修改后**：

- ELK (layered DAG) is the single layout authority for course structure. Every renderer consumes the same ELK coordinates for the same structural revision.
- The learner course immersive view (skill tree, practice shadow layer, capability model 3D, flattened route editor) is rendered by one three.js scene. The front pose uses a near-orthographic camera so the course tree reads as 2D; rotation, flattening and layer swaps are camera/node animations inside the same scene. Node capsules, labels and object-shell cards are DOM overlays anchored to scene coordinates.
- React Flow remains the renderer for editing canvases: Course Creator structure editing and the Workflow editor.
- The learner view MUST NOT switch between React Flow and three.js at runtime.
- Presentation changes (skill/practice layer swap, rotation, flatten, selection, pulses) MUST NOT trigger ELK recomputation; only structural changes may.

**理由**：在同一页面里来回切换两个渲染器，会出现节点跳动、选中状态丢失、外观不一致。按页面划分渲染器后，学习者页面没有切换，编辑页面保留 React Flow 成熟的拖拽能力；两边坐标都来自 ELK，保持一致。

## 3. 能力模型：3D 场景 + 压平后的分列 2D 路线编辑

**涉及章节**：Project Capability and Personal Route V3（"MUST NOT reheat or relayout the force graph"）、Route Execution Presentation

**修改后**：

- The Project Capability Model is presented inside the course 3D scene: course Knowledge sits on the front plane; non-course ancestor Knowledge in the model sits on deeper planes directly behind the course Knowledge it supports, hidden in the front pose and revealed by rotation. No container plate or frame is drawn around a layer.
- Route editing flattens the model into a deterministic layered 2D layout (columns by factual dependency depth: acquired → intermediate → targets). Flattening is a camera/position animation of the same node set; it MUST NOT change the model node/edge set.
- Layered positions are a pure function of the model structure; same structure → same positions. The "MUST NOT relayout the force graph" clauses are replaced by "MUST NOT recompute layered positions unless the model's structural set changes".
- Current route = directional pulse beam; Preview = distinct color dashed beam; ordinary edges keep one solid style. Include/Exclude, Preview and Adopt remain editing-mode-only and keep all existing server revalidation and immutable versioning rules.

## 4. 公开分享：允许未登录用户通过链接查看学习者主动分享的状态

**涉及章节**：Anonymous Viewing and Progressive Auth

**修改后（新增例外条款）**：

- A learner MAY create a revocable share link for an explicit subset of their own learner state (progress summary, route; works optionally). Anyone with the link, including anonymous viewers, MAY read exactly that subset.
- Shared reads go through a dedicated server endpoint that resolves the link token; `anon` RLS on learner tables stays closed. Scores, failed attempts, conversations, drafts and unsubmitted work are never shareable.
- Links are revocable at any time, default expiry 30 days, and served `noindex`. Revocation takes effect immediately.
- The Global Assistant stays authenticated-only on shared pages.

## 5. 统一评估者：教师与 AI 一致对待

**涉及章节**：Learner State, Evidence, and Assignment Lifecycle

**修改后**：

- An Assignment submission is addressed to an evaluator chosen by the learner at submit time (e.g. a teacher or the AI evaluator). Teacher and AI evaluations are the same kind of formal evaluation and produce the same PerformanceResult semantics (`accepted` / `needs_revision`) under the same mastery rules. No evaluator-type distinction is introduced in the domain model.
- Evaluation still runs server-side; clients MUST NOT provide an authoritative pass/fail flag.
- A teacher may use AI assistance while reviewing; the teacher remains the evaluator of that result.
- Whether a Course restricts which evaluators learners may submit to (e.g. a published Course opening a teacher submission entry) is deferred to organization/course-publishing design.

**现状说明**：数据库 `reviewer_user_id` 目前只允许教师/管理员，后端调整属于后续工作；第一批界面先实现「提交给」选择，AI 评估结果以「功能预览」方式展示。

## 6. 功能预览（后端未就绪的界面）

**涉及章节**：Anonymous Viewing（"MUST NOT invent … placeholder learner state"）、Frontend Project Structure、Core / Demo Boundary

**新增条款**：

- A feature whose backend is not available MAY ship as a Feature Preview: the real UI and interactions, fed by a fixed sample dataset.
- Sample datasets live under `src/demo` and are injected by the `src/app` composition root through the same contracts as real repositories; Feature code MUST NOT import `src/demo`.
- Preview regions MUST carry a visible "预览 · 示例数据" marker, use obviously sample identities, never mix with the user's real data, and never write durable state. Interaction state is page-ephemeral.
- Replacing a preview with the real backend MUST only swap the injected source.

## 7. 导航与产品外壳

**涉及章节**：Product Chrome

**修改后**：

- The primary chrome is a left vertical navigation rail: 首页 / 档案 / 作品 / 记录 (+ 教学 / 管理 by role) with the account avatar at the bottom. It is the single primary chrome; pages MUST NOT add a second full-width fixed header.
- The avatar opens the account menu (first row: 打开我的面板). The 我的 panel opens from the Home top-right toggle.
- Objects open through one Object Shell with four sizes (card S, card L, side panel, immersive). Expanding never slides a new drawer in from the screen edge.
- Retired surfaces: Course Center, Explore page and the Assistant Messages page. Their routes redirect to Archive / Home.

## 8. FRONTEND_DESIGN_SYSTEM.md 需要同步改的地方

- "Avoid … excessive glass"：改为两种受控玻璃材质（regular / clear），以 `docs/design/new-ui/system/tokens.css` 为准，并保留 Safari 与减少透明度时的回退。
- 动效时长：采用 4 档（160 / 240 / 400 / 600ms）与 3 种缓动；600ms 只允许用于场景级转场（档案 → 课程沉浸、3D → 2D 压平）。
- 唯一规格源：`docs/design/new-ui/system/tokens.css`；字号只有 12/13/14/16/20/28 六档。

## 9. 下线

- 助手消息页 `/messages`：下线，重定向到首页工作台。
