# 新版 UI：桌面端第一批迁移方案（待审）

日期：2026-10-29 · 状态：草稿 · 范围：桌面端（≥ 1280 宽）；1024 与手机端放到下一批

依据：设计稿最新版（见 §0）、[`AGENTS_RULE_CHANGES.md`](AGENTS_RULE_CHANGES.md)、2026-10-29 的产品决定：
- 只迁移后端已有的能力；后端缺的界面做成「功能预览」（真实界面 + 示例数据 + 「预览 · 示例数据」标识，不写入）。
- 学习者课程视图只用 three.js；React Flow 只留给课程创建和工作流编辑。
- 新旧样式不长期并存：每迁移完一页，删掉那一页对应的旧样式。

## 0. 设计源文件（已放入仓库）

| 路径 | 内容 |
|---|---|
| `docs/design/new-ui/DESIGN_SPEC.md` | 早期设计规格（历史记录；与规则或设计稿冲突时以后者为准） |
| `docs/design/new-ui/system/tokens.css` | 唯一规格源：字号 6 档、语义色、圆角、间距、阴影、玻璃、动效、基础组件 |
| `docs/design/new-ui/system/glass-defs.html` | 玻璃透镜 SVG 滤镜 |
| `docs/design/new-ui/system/lint.py` | 设计稿规格检查脚本（字号/颜色/圆角/阴影/缩放/导航） |
| `docs/design/new-ui/data/` | 星图坐标、示例课程树数据 |
| `docs/design/new-ui/board-notes.json` | 各画板的设计说明 |
| 设计稿 | claude.ai 上的「EduFlow 新版设计」：https://claude.ai/artifact/Mij9dvvnL2Cp6Tte2H5zmT ，始终以最新版为准（2026-10-30 为第 64 版，74 张画板）。画板不下载进仓库；实施某页时临时读取该页画板对照，用完即弃。 |

## 1. 路由与信息架构

| 新入口 | 新路由 | 现有页面 / 路由 | 处理 |
|---|---|---|---|
| 首页 | `/` | `LearningPage` | 改造为对话工作台 + 我的面板 |
| 档案 | `/archive` | `ExplorePage` `/explore`、`CourseCenterPage` `/courses` | 合并；旧路由重定向到 `/archive`（课程列表进入档案的课程浮层） |
| 课程沉浸 | `/courses/:courseId` | `CourseGraphPage`（含 `/chapters/:id`） | 保留路由，渲染改为 three.js |
| 微学习沉浸 | `/learn/micro/:knowledgeId` | `MicroLearningExperience` | 保留，外观改为对象外壳「沉浸」尺寸 |
| 实践 | `/courses/:cid/assignments/:aid` | `AssignmentExperiencePage` | 保留；首页侧面板与沉浸共用同一实践对象 |
| 资料阅读器 | `/courses/:cid/materials/:mid` | `LessonPage` | 按 N45a/N45b 改造（目录 · 原版 PDF · 本页知识 / 钉住知识） |
| 作品 | `/works`、`/works/:id` | `WorkflowLibraryPage` `/workflows`、编辑器 | 改名；旧路由重定向 |
| 记录 | `/records` | 无 | 新页面 |
| 教学 | `/teaching`、`/teaching/create` | `CourseManagementPage`、`CourseCreationWorkspacePage` | 改造；`/courses/create` 同一创建工作区 |
| 管理 | `/admin` | `DomainManagementPage` `/system` | 用户与角色按 N17；知识领域按 N46a/N46b |
| 设置 | `/settings` | 无（当前重定向首页） | 新页面 |
| 登录 / 注册 | `/login`、`/register` | `AuthPage` | 按 N48a/N48b 改造 |
| 未登录首页 | `/`（未登录） | `PublicHomePage` | 按 N48c 改造 |
| 找不到页面 | `*` | 当前重定向首页 | 按 N50 新增 404 |
| — | `/messages` | `AssistantMessagesPage` | 下线，重定向 `/` |

## 2. 真实数据 vs 功能预览

| 功能 | 第一批 | 依据 |
|---|---|---|
| 首页对话、上下文胶囊、卡片 | 真实 | Global Assistant 已有 |
| 我的面板：课程、最近学习、实践、档案缩略 | 真实 | UserCourseState、学习进度、Assignment 状态已有 |
| 我的面板：关注的人 | 预览 | 无关注关系 |
| 实践：草稿 → 确认 → 结果，提交给教师 | 真实 | Attempt / PerformanceResult、教师验收已有 |
| 实践：提交给 AI、AI 评估结果 | 预览 | 评估者目前只能是教师账户 |
| 实践：从作品选择版本 | 预览（列出真实作品，版本冻结为预览） | 工作流无版本 |
| 档案星图、搜索、课程聚焦、助手寻找、锁定成形简报 | 真实 | Atlas、Goal 规划、课程创建简报已有 |
| 档案：人物胶囊、多人对比、人与分享浮窗、公开分享链接 | 预览 | 无社交与分享后端 |
| 课程沉浸：技能树、实训影子层、竖向路线 | 真实 | 课程图、AssignmentCoverage、个人路线版本已有 |
| 能力模型 3D、2D 路线编辑（必须经过 / 不经过、预览、采用） | 真实 | Project Capability V3、路线版本 API 已有 |
| 课程沉浸：「3 位关注的人也在这一节」 | 预览 | 无社交 |
| 作品总览、工作流编辑（试运行、保存） | 真实 | Workflow V2 已有 |
| 作品版本列表 | 预览 | 无版本 |
| 记录：热力图与时间线 | 预览（之后在 learner 接口加只读汇总，不新增函数） | 数据分散在 learning_events、micro_step_attempts、knowledge_evidence、路线版本，无汇总接口 |
| 教学：课程管理、实践审核（教师验收） | 真实 | 已有 |
| 教学：审核里的 AI 建议分 | 预览 | 无 AI 评估后端 |
| 课程创建 7 阶段 + 常驻助手 | 真实 | 创建流水线与提议/预览/校验/应用已有 |
| 管理：用户与角色 | 预览 | 没有用户管理接口 |
| 设置、⌘K 搜索 | 设置预览（外观可真实）；⌘K 真实（页面/课程/知识导航） | — |

## 3. 迁移顺序（每一步都可独立验收与回滚）

**P0 · 基础设施**
1. `src/shared/styles/tokens.css`（由设计规格源同步）与玻璃滤镜组件；减少透明度与 Safari 回退。
2. 基础组件：按钮、输入框、胶囊/上下文胶囊、头像与人物色环、对象外壳四种尺寸、对话气泡与卡片（事件行 / S 480 / L 满宽）、首页输入框、账户菜单。
3. 功能预览机制：预览数据源契约（与真实仓储同接口）、`src/demo/preview/` 示例数据、`src/app` 注入、统一的「预览 · 示例数据」标识组件。
4. 规格检查：把 `lint.py` 的规则移植为前端检查（新样式文件不得出现规格外的字号/颜色/圆角/阴影）。

**P1 · 外壳与导航**：左侧导航栏、账户菜单、路由表与旧路由重定向、`/messages` 下线。

**P2 · 首页**：对话工作台、卡片类型、我的面板、复杂微学习侧面板、实践三态（草稿/确认/结果）与「提交给」选择、长文本/加载中边界态。

**P3 · 档案**：单一星图 + 我的范围标记 + 缩放、课程浮层与搜索、课程聚焦、助手寻找与课程创建简报、未登录态；社交部分以预览接入（社交入口图标、人与分享浮窗、对比）。

**P4 · 课程沉浸（three.js）**：ELK 坐标 → three.js 场景 + DOM 叠加；技能树、实训影子层换层、竖向路线、语义缩放、能力模型 3D 旋转、路线光带、压平为 2D 路线编辑；原位放大进入/退出转场。three.js 按需加载。

**P5 · 教学**：课程管理、实践审核、课程创建 7 阶段（左工作区 + 右常驻助手）。

**P6 · 作品**：作品总览、工作流编辑器换外观（去掉提交，保留试运行/保存），版本以预览展示。

**P7 · 记录、设置、管理（用户与角色）、⌘K。**

补充设计（第 60–64 版）：资料阅读器 N45a/b、知识领域管理 N46a/b、登录/注册/未登录首页 N48a–c、微学习沉浸三种互动 N49a–c、404 N50、实践关联作品 N51、未登录课程视图 N52、2D 路线编辑 N19c。资料阅读器排在 P3 之后，知识领域管理并入 P7，登录与未登录首页并入 P1，微学习沉浸与实践关联作品并入 P2，未登录课程视图与路线编辑并入 P4。

## 4. 每页验收标准

- 与对应画板在 1440×960 下逐屏对照（结构、字号、间距、状态）。
- 新样式只用 tokens；该页不再引用 `legacy.css` / `product.css` 中的旧规则，并删除只服务于该页的旧规则。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过；页面无运行时错误。
- 预览区域有标识、不写入、不混入真实数据。
- 键盘可达、焦点可见、减少动态效果时有替代。
- Vercel Function 数量不增加（当前 11 / 12）。

## 5. 风险

- **three.js 场景里的 DOM 叠加**：节点多时的同步开销需要先做原型测量（目标：课程 35 节点 + 能力 11 节点旋转时 60fps）。
- **玻璃材质**：大面积 backdrop-filter 的性能与 Safari 回退需要在 P0 先验证。
- **旧样式体量**：`legacy.css` + `product.css` 约 12,200 行，逐页删除时要注意被多页共用的规则。
- **规则**：新版 UI 的规则已合入 `AGENTS.md` 与 `docs/rules/`（2026-10-30）。
- **档案星图规模**：现有 `KnowledgeAtlasScene` 每个节点单独绘制、力导在主线程计算；全局知识到上千节点时需改为批量绘制、后台或缓存布局、远景简化为点。

## 6. 实践简化（2026-10-30 决定）

- 实践只有一种形态：任务描述 + 提交。提交方式两种：从「作品」选择工作流（系统支持的格式，提交时冻结），或上传文件 / 链接。
- 问答类检查属于微学习，不再作为实践。
- 实践可以「新建工作流并关联」或关联已有作品；提交时冻结所关联作品的某个版本，另可附文件 / 链接与备注。实践只由评估者（教师或 AI）评估，不再有规则判分。
- 现有数据：`answer` 类实践直接删除；`code`、`trace` 改为文件上传实践；黄金课程种子（`src/demo/scenarios/agenticAiBook/goldenCourse.seed.ts`）与 `AssignmentAuthoringEditor`、`AssignmentExperiencePage` 需要随 P2 一起调整。

## 7. 其他已定事项（2026-10-30）

- 首页对所有角色都是学习工作台；教师从导航进入「教学」，教学提醒出现在「我的」面板。
- 黄金课程：内容源目前在 `src/demo/scenarios/agenticAiBook/`，由 `scripts/generate-supabase-seed.ts` 生成 `supabase/seed.sql` 写入数据库；其中 2 个问答实践删除。

## 8. 产品内容移出仓库（2026-10-30 决定，P0 完成）

产品内容（课程、知识、领域、资料、微学习、工作流起始模板、演示账号）只存在数据库里；仓库只留 `tests/fixtures/` 的最小合成测试数据，和 `src/demo/preview/` 的功能预览示例数据。

1. **导出**：用现有 `generate-supabase-seed.ts` 生成一份完整内容快照（删除 2 个问答实践后），放到仓库内被 Git 忽略的 `content-snapshots/` 目录（已加入 `.gitignore`，不会被提交）；再从本地数据库导出一份核对。
2. **本地导入**：新增 `pnpm content:import`（默认读取 `content-snapshots/` 下的最新快照），只允许指向本地 Supabase（沿用现有「拒绝非本地 URL」的保护）；`supabase/seed.sql` 只保留无产品内容的必要初始化。
3. **测试**：把测试依赖的数据改为 `tests/fixtures/` 下的最小合成数据（只为测试规则而造，不复用黄金课程内容）。
4. **删除**：移除 `src/demo` 下除 `preview/` 以外的全部内容、`scripts/generate-supabase-seed.ts` 与相关 `db:seed:*`、`h5p:build-golden` 脚本，以及 `src/app` 里对它们的装配。
5. **备份与共享**：`content-snapshots/` 只在本机，需要另外备份；其他开发者需要时单独传给对方。CI 不依赖快照，只用 `tests/fixtures/`。
6. **托管环境**：Hosted 上已有的黄金课程数据保持不动，以后通过管理端导入 / 导出维护；唯一例外是 2 个问答实践：P2 去掉 `answer` 类型后它们无法打开，因此在 P2 部署时用一条可审查的数据变更同步删除，执行前单独确认。
7. **验收**：`rg -l "agenticAiBook|goldenCourse" src scripts supabase` 无结果；typecheck / lint / test / build 通过；本地用快照导入后课程能完整走通。
