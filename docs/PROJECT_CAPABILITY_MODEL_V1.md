# EduFlow｜项目能力模型 V1 开发规格

> 状态：历史 V1 规格。2026-10-02 起由 [V2 契约](PROJECT_CAPABILITY_MODEL_V2.md) 替代当前运行语义。
> 以下 V1 的 hard+soft 门槛、模型/路线同一计算、无持久化版本、Domain 主色与角色环，以及旧 Micro RPC 兼容行为均已废止。V2 只以 hard 为门槛，候选模型与必要路线分离，持久化不可变版本，使用蓝/绿/灰。历史章节和验收记录保留原貌，不作为当前实现要求。
> 目标分支：`prototype` 基础上开发  
> 前端名称：**项目能力模型**  
> 本文只定义 V1，不提前实现软偏好、最优路径、人工路线约束或新的知识本体语义。

---

## 1. 本次开发要解决什么

当前课程页已经存在：

- **课程路线**：面向学习者，展示当前学习路线、下一步行动、实训待办；
- **课程图**：展示课程自身的篇章、Knowledge、依赖和实训结构。

本次新增第三个一级视图：

> **项目能力模型**

它回答的问题不是“下一步学什么”，也不是“课程原本怎样编排”，而是：

> **基于当前用户已经具备的能力，这个课程/项目要求形成的能力，与当前状态之间存在怎样的能力依赖空间？**

项目能力模型用于把以下三类事实放进同一个视图：

1. 用户当前已经满足的能力；
2. 当前课程/项目要求形成的全部能力；
3. 两者之间在共享 Knowledge Graph 中真实存在的必要连接能力与 `prerequisite` 关系。

项目能力模型只负责展示和计算能力空间。  
真正按顺序执行的成长过程仍由 **课程路线 + Navigation** 负责。

---

## 2. V1 的核心分层

```text
Shared Knowledge Graph
        +
My Knowledge / UserKnowledgeState
        +
Course CurriculumCoverage
        ↓
【项目能力模型】
当前能力到项目能力之间的相关能力空间
        ↓
【个人课程路线投影】
课程原有能力 + 可连通的必要中间能力
生成合法、完整、确定性的学习顺序
        ↓
【课程路线】
呈现完整成长顺序与学习状态
        ↓
【Navigation Engine】
基于实时状态决定“现在具体做什么”
```

三个层次必须保持边界：

### 项目能力模型
回答：

> 当前状态与项目要求之间，存在怎样的能力结构和连接空间？

### 课程路线
回答：

> 这一次具体按什么顺序成长？

### Navigation
回答：

> 基于此刻真实状态，现在下一步具体做什么？

不得把三者合并成一个新的“大算法”或新的持久化知识模型。

---

## 3. 当前仓库必须保持的既有边界

### 3.1 Knowledge 是共享事实

EduFlow 只有一套共享 Knowledge Graph：

- `KnowledgeNode`
- `KnowledgeEdge`
- 用户自己的 `UserKnowledgeState`

Course、Chapter、Lesson、Project 都不是 KnowledgeNode。

项目能力模型必须是共享 Knowledge Graph 的**投影**，不能复制一套项目专属 Knowledge。

参考：

- [AGENTS.md](https://github.com/OpenUniflo/EduFlow/blob/prototype/AGENTS.md)
- [KNOWLEDGE_ARCHITECTURE_V1.md](https://github.com/OpenUniflo/EduFlow/blob/prototype/docs/KNOWLEDGE_ARCHITECTURE_V1.md)

### 3.2 Course 与个人状态分离

Course 是共享课程定义。  
My Knowledge / UserKnowledgeState 是用户自己的状态。

因此：

> 系统为某个用户补出的中间能力，**不能写回共享 Course 的 CurriculumCoverage**。

否则一个用户的当前能力会污染所有学习者看到的 Course。

新增能力应进入：

> **个人课程路线投影（Computed Personal Course Route）**

它是运行时计算结果，不是新的 Knowledge 事实，也不是共享课程内容。

### 3.3 V1 不新增持久化路线模型

本次优先实现为确定性运行时投影：

```text
Course
+ My Knowledge
+ Visible Knowledge Graph
→ Project Capability Model
→ Personal Course Route
```

V1 不因为本功能新增数据库表、迁移或独立路线事实。

只有发现现有运行边界完全无法安全承载时，才允许在计划阶段提出最小持久化方案；不得自行创建表后再解释原因。

---

## 4. 数据输入

### 4.1 基础图 G

使用：

> **当前用户可见的完整 Knowledge Graph**

不能直接把探索页的 Global Atlas 当成计算数据源。

原因：

- Global Atlas 只展示 Global scope；
- Course 可以引用用户当前可见的 Global / Tenant / User Knowledge；
- 项目能力模型必须与当前用户实际可见知识身份一致。

优先通过现有 `KnowledgeRepository` + `userKnowledgeAccess(userId)` 获取。

### 4.2 当前能力 C

来自当前用户的 `UserKnowledgeState / My Knowledge`。

V1 必须复用现有教学前置满足规则，不允许重新定义第二套“已学会”规则。

当前满足教学前置的状态：

```text
learned
practicing
mastered
```

不满足：

```text
learning
explore
undefined
```

必须复用现有 `satisfiesTeachingPrerequisite` 或同一共享规则。

### 4.3 项目/课程能力 T

V1 的项目能力集合：

> 当前 Course 通过 `CurriculumCoverage` 引用的全部 active Knowledge。

不是只取 `CourseTargetKnowledge`。

`CourseTargetKnowledge` 继续保持“结构化课程目的地”的原有语义；项目能力模型的范围仍覆盖当前课程全部能力。

---

## 5. 哪些 KnowledgeEdge 参与计算

Knowledge Graph 当前有：

```text
prerequisite
enables
related
```

V1 的学习路径和自动路线计算：

> **只使用 `prerequisite`。**

理由：

- 当前 Navigation Engine 的正式教学门槛就是 `prerequisiteEdges`；
- `enables` 表示支持应用/实现，但不一定是认知前置；
- `related` 只是显著相关；
- 项目能力模型与 Navigation 必须对“学习依赖”保持一致。

### hard / soft

当前 `prerequisite` 有 `hard` / `soft`。

V1 沿用现有运行行为：

> hard 与 soft 都作为顺序约束处理。

V1 不引入软偏好权重。

---

## 6. 项目能力模型的构造规则

定义：

```text
G = 当前用户可见图中 active Knowledge + prerequisite edges
C = 当前已满足教学前置的用户能力
T = 当前 Course 全部能力
```

### 6.1 可连通部分

不枚举所有路径。

计算：

```text
Forward(C)
= 从任一 C 沿 prerequisite 正向可达的节点

Backward(T)
= 能沿 prerequisite 最终到达任一 T 的节点

BridgeSpace
= Forward(C) ∩ Backward(T)
```

然后项目能力模型至少包含：

```text
ModelNodes = T ∪ BridgeSpace
```

边：

```text
ModelEdges
= 两端都在 ModelNodes 中、且 relation = prerequisite 的真实 KnowledgeEdge
```

其中：

- C 中进入 ModelNodes 的节点标记为“当前已具备”；
- T 中节点标记为“项目能力”；
- T 之外但位于 BridgeSpace 的节点标记为“中间能力”；
- 同一节点可以同时具有多个角色。

### 6.2 完全不连通

如果没有任何 C 能沿 prerequisite 到达任何 T：

> 项目能力模型只包含当前 Course 的能力 T，以及 T 之间真实存在的 prerequisite 关系。

不显示无关 My Knowledge。  
不制造桥梁。  
不自动补全 Course 外节点。

课程路线继续使用原课程默认路线。

### 6.3 部分不连通

如果部分 Course 能力可从 C 到达，部分不能：

- 可连通部分：显示 Current → Course Knowledge 的完整相关路径空间；
- 不可连通的 Course 能力：仍然作为项目能力保留；
- 不创造不存在的连接；
- 不可连通部分继续按 Course 原有路线处理。

### 6.4 禁止行为

不得：

- 创建展示用假 KnowledgeNode；
- 创建展示用假 KnowledgeEdge；
- 用 Domain、标签、语义相似度推断路径；
- 用 `related` 补视觉连接；
- 为了“图更完整”制造跨域关系；
- 枚举指数级全部简单路径。

---

## 7. 个人课程路线投影

项目能力模型不是最终执行路线。

V1 新增一个运行时：

> **Computed Personal Course Route / 个人课程路线投影**

### 7.1 路线节点

路线包含：

```text
原 Course Knowledge
+
项目能力模型中可连通的 Course 外中间能力
```

但：

> Course 外中间能力不能写入共享 `CurriculumCoverage`。

### 7.2 已掌握能力

已经满足教学前置的节点仍可出现在路线结构中，但不要求重新学习。

现有 Navigation 状态继续表达：

- skipped
- learned
- underway
- eligible
- blocked

不得因为重算路线而伪造新的完成记录。

### 7.3 路线目标

V1 目标不是寻找“全局最优路线”。

只要求：

> **合法、完整、确定性。**

不做：

- 最少节点全局优化；
- 最短总时间；
- 最大成功概率；
- 动态权重；
- 用户软偏好；
- Steiner 类优化；
- 强化学习 / bandit。

### 7.4 顺序生成

必须满足所有纳入个人路线的 prerequisite 拓扑约束。

使用确定性拓扑排序。

同一时刻多个节点都合法时，稳定排序：

1. Course 节点沿用现有 `lessonOrder`；
2. 再按 `coverageOrder`；
3. 再按稳定 Knowledge ID。

对于 Course 外中间节点：

- 先计算它能够到达的下游 Course 节点；
- 使用最早下游 Course 节点的课程顺序作为排序锚点；
- 再以 Knowledge ID 作为稳定 tie-break；
- prerequisite 拓扑约束始终高于课程显示顺序。

不得根据数组偶然顺序、数据库返回顺序或渲染位置决定业务顺序。

---

## 8. Course 外中间能力如何进入现有 Navigation

这是本次实现最重要的架构改造点。

当前代码存在两个限制：

### 8.1 Navigation 只接受 Course 内节点

当前 `navigationEngine.ts` 会构造：

```ts
const courseNodeIds = new Set(ordered.map(node => node.id))
```

并只使用两端都在 Course 路线节点集合里的 prerequisite。

参考：

- [api/_lib/navigationEngine.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/api/_lib/navigationEngine.ts)
- [src/shared/learning/navigation.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/shared/learning/navigation.ts)

V1 应扩展“Navigation 的运行时路线输入”，让个人课程路线投影中的中间节点能够参与计算。

不要通过修改共享 CurriculumCoverage 来骗过 Navigation。

### 8.2 Micro 准入当前要求节点属于 Course

当前：

```text
requireCourseKnowledge()
```

会检查 `curriculum_coverages`。

Course 外的个人路线中间节点不能天然通过这一检查。

参考：

- [api/_lib/courseMembership.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/api/_lib/courseMembership.ts)

实现时必须保持安全边界：

> **不得简单删除 Course membership 校验。**

需要在计划阶段设计一个最小、显式、可验证的“个人路线成员资格”边界，使：

- 原 Course Knowledge 仍按 Course coverage 验证；
- 个人路线中间 Knowledge 只能在它确实属于当前用户当前 Course 的计算路线时获得学习资格；
- 不能允许客户端伪造任意 Knowledge ID 绕过权限与前置条件；
- 服务端必须重新验证路线成员资格和 prerequisite。

---

## 9. 中间能力没有学习资产时的处理

自动补出的中间能力可能没有当前 Course 的：

- Micro
- Material
- Assignment

V1 不因此拒绝路线生成。

产品状态：

> **能力结构有效，但学习内容待补充。**

现有 Navigation 已有：

```text
learning_content_unavailable
```

可继续沿用或做最小扩展。

V1 不要求为每个新增中间能力自动生成课程内容。

不得为了让演示“可点”而制造假 Material / Micro / Assignment。

---

## 10. 前端视图

### 10.1 课程页一级视图

当前课程页已有：

```text
课程路线
课程图
```

增加：

```text
项目能力模型
```

最终一级切换应明确表达三个不同问题，而不是隐藏在一个“查看课程图”的二选一按钮中。

推荐：

```text
课程路线 | 课程图 | 项目能力模型
```

具体控件形式应继承现有视觉系统，避免另造一套顶部导航。

### 10.2 项目能力模型视觉

优先复用现有 `KnowledgeAtlasScene` / Atlas 视觉基础，不重新开发图渲染引擎。

需要表达至少以下角色：

- 当前已具备能力；
- 项目/课程能力；
- 中间能力；
- 当前已具备且也是项目能力。

必须遵守现有 Atlas 规则：

- Domain hue 继续表示 Domain；
- 学习状态通过 ring / marker / opacity 等非 Domain 色方式表达；
- 学习状态变化不得触发布局变化；
- 只有结构节点/边集合真正变化才允许重排；
- 不创建布局用假节点/假边。

参考：

- [AGENTS.md / Atlas Stability](https://github.com/OpenUniflo/EduFlow/blob/prototype/AGENTS.md)
- [KnowledgeAtlasScene](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/features/knowledge/components/KnowledgeAtlasScene.tsx)

---

## 11. 重新计算规则

### My Knowledge 更新

用户在任意课程、Micro、实训或其他来源形成新的真实 Knowledge 状态后：

```text
My Knowledge 更新
→ Project Capability Model 重算
→ Personal Course Route 重算
→ Navigation 读取最新路线和状态
```

不能维护一份与 My Knowledge 脱节的 ProjectCurrentState。

### 历史状态

- 已经存在的 UserKnowledgeState / Evidence / Course progress 不删除；
- 路线重算只改变当前和未来的路线投影；
- 已满足能力继续显示为已满足/跳过；
- V1 不新增“历史路线快照”持久化要求。

### Knowledge Graph 更新

V1 项目能力模型是实时投影：

> 下次加载或结构 revision 变化后，按最新可见 Knowledge Graph 重新计算。

V1 不实现专门的图版本锁定。

---

## 12. V1 明确不做

以下全部不属于本次范围：

- “优先经过”软偏好；
- 用户手动指定必须经过节点；
- 用户排除节点或边；
- 手动选择完整路线；
- 用户保存自定义路线约束；
- OR prerequisite / 二选一前置；
- 把 `enables` 当作学习门槛；
- 把 `related` 当作学习路径；
- 动态边权；
- 多目标效用优化；
- 最优路径搜索；
- 强化学习；
- contextual bandit；
- 自动生成所有缺失学习资产；
- Course → Project 的全量领域重构；
- 新建项目专属 Knowledge Store；
- 新建 ProjectCurrentState；
- 复制 KnowledgeEdge 到 Course；
- 为 UI 创建假关系。

---

## 13. 建议的纯计算边界

实现名称可以根据现有目录规范调整，但职责必须清楚。

### 13.1 `buildProjectCapabilityModel(...)`

建议输入：

```ts
{
  graph: KnowledgeGraph;
  courseKnowledgeIds: string[];
  userKnowledge: UserKnowledgeRecord[];
}
```

建议输出至少包含：

```ts
{
  nodes: ...;
  edges: ...;
  connectedCourseKnowledgeIds: string[];
  disconnectedCourseKnowledgeIds: string[];
  bridgeKnowledgeIds: string[];
  currentKnowledgeIds: string[];
}
```

要求：

- 纯函数；
- deterministic；
- cycle-safe；
- 不访问 React；
- 不直接访问 `applicationServices`；
- 不写数据库；
- 不改变输入 graph。

### 13.2 `buildPersonalCourseRoute(...)`

建议输入：

```ts
{
  projectModel: ...;
  courseGraphData: ...;
  userKnowledge: ...;
}
```

建议输出至少包含：

```ts
{
  orderedNodes: ...;
  prerequisiteEdges: ...;
  courseKnowledgeIds: ...;
  bridgeKnowledgeIds: ...;
}
```

要求：

- 纯函数；
- deterministic；
- prerequisite-safe；
- 不修改 Course；
- 输出可适配 `NavigationEngineInput`。

---

## 14. 必须覆盖的最小测试矩阵

### A. 完全连通

```text
Current A → B → C → Course D
```

期望：

- 模型包含 A/B/C/D；
- B/C 为中间能力；
- 路线满足 A<B<C<D；
- 已满足 A 不要求重学。

### B. 多分支依赖

```text
A → B → D
A → C → D
```

期望：

- 项目模型包含两支；
- 不把两支解释为 OR；
- 路线满足 B、C 都在 D 前；
- 同层顺序确定且稳定。

### C. 多个 Course 能力

```text
A → B → X
A → C → Y
Course = {X, Y}
```

期望：

- 两个目标都保留；
- 路线完整覆盖。

### D. 完全不连通

```text
Current: A → B

Course:
X → Y
```

期望：

- 项目模型只显示 Course 能力 X/Y 及其内部 prerequisite；
- 不显示 A/B；
- 不创建桥梁；
- 路线使用原 Course 默认顺序。

### E. 部分不连通

```text
A → B → X
Y 无 Current 路径
Course = {X, Y}
```

期望：

- A/B/X 可连通部分出现；
- Y 独立保留；
- 不制造 B→Y；
- Y 按原 Course 逻辑进入课程路线。

### F. Course 外中间能力

```text
A → B → C → Z
Course 原本只包含 Z
```

期望：

- B/C 出现在项目能力模型；
- B/C 进入个人课程路线投影；
- B/C 不写入共享 CurriculumCoverage；
- 另一个用户的 Course 定义不受影响。

### G. 已掌握中间能力

```text
A、B 已满足
A → B → C → Z
```

期望：

- A/B 作为当前状态显示；
- 路线不要求重新学习 A/B；
- C 为下一未满足结构节点。

### H. 缺学习资产

Bridge B 无 Micro / Material / Assignment。

期望：

- B 仍在模型和路线；
- Navigation 给出明确“学习内容待补充”状态；
- 不创建假资产。

### I. My Knowledge 跨课程更新

用户在其他 Course 学会中间能力 B。

期望：

- 当前项目模型重新计算；
- B 状态立即同步；
- 当前路线更新；
- 共享 Course 不变。

### J. 非 prerequisite 关系

只有：

```text
A related B
A enables C
```

期望：

- 不把它们作为 V1 学习路径；
- 不因此生成 bridge route。

---

## 15. 成功标准

本次开发只有同时满足以下条件才算完成：

1. 课程页出现明确的 **「项目能力模型」** 一级视图；
2. 视图使用当前用户可见的真实 Knowledge Graph；
3. 计算只把真实 `prerequisite` 当作学习依赖；
4. 能正确展示 Current / Course / Bridge 三类角色；
5. 完全不连通时只保留 Course 能力，不造桥；
6. 部分不连通时可连通与不可连通部分都正确表达；
7. Course 外中间能力进入**个人课程路线投影**，不写回共享 Course；
8. 课程路线形成合法、完整、确定性的顺序；
9. `learned / practicing / mastered` 的前置满足语义与现有系统一致；
10. 缺学习资产时路线仍存在，并给出明确降级状态；
11. Navigation 可以安全消费个人路线，而不能由客户端伪造任意 Knowledge 绕过资格检查；
12. 不破坏现有课程图、课程路线、Personal Atlas、Global Atlas；
13. Atlas 只在结构变化时重排，状态变化不重排；
14. 不新增假 Knowledge/Edge；
15. 不新增不必要数据库表；
16. 所有新增算法有单元测试覆盖上述最小矩阵；
17. 现有测试不回归。

---

## 16. 开发前基线与验证命令

仓库只支持 pnpm。

参考：

- [package.json](https://github.com/OpenUniflo/EduFlow/blob/prototype/package.json)

开发前先记录基线：

```bash
git status
git branch --show-current
git rev-parse HEAD

pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

完成后至少重新执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

如果仓库在修改前已有失败，必须记录“基线失败”和“本次新增失败”之间的区别，不得通过删除测试、跳过测试或放宽规则掩盖问题。

---

## 17. 实现优先级

推荐按以下顺序：

```text
P0 读仓库与基线检查
↓
P1 纯算法：Project Capability Model
↓
P2 纯算法：Personal Course Route
↓
P3 后端/服务端安全路线成员资格
↓
P4 Navigation 接入
↓
P5 项目能力模型前端视图
↓
P6 状态/交互/布局稳定性
↓
P7 完整回归与验收
```

不要先做漂亮 UI 再补业务规则。

---

## 18. 关键现有代码入口

开发时至少检查：

- [AGENTS.md](https://github.com/OpenUniflo/EduFlow/blob/prototype/AGENTS.md)
- [package.json](https://github.com/OpenUniflo/EduFlow/blob/prototype/package.json)
- [Knowledge Architecture V1](https://github.com/OpenUniflo/EduFlow/blob/prototype/docs/KNOWLEDGE_ARCHITECTURE_V1.md)
- [CourseGraphPage.tsx](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/features/course/pages/CourseGraphPage.tsx)
- [CourseNavigator.tsx](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/features/course/path/CourseNavigator.tsx)
- [courseGraphProjection.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/features/course/graph/courseGraphProjection.ts)
- [KnowledgeAtlasScene.tsx](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/features/knowledge/components/KnowledgeAtlasScene.tsx)
- [graphAlgorithms.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/features/knowledge/graphAlgorithms.ts)
- [shared navigation.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/src/shared/learning/navigation.ts)
- [navigationEngine.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/api/_lib/navigationEngine.ts)
- [courseMembership.ts](https://github.com/OpenUniflo/EduFlow/blob/prototype/api/_lib/courseMembership.ts)

---

## 19. 一句话冻结定义

> **项目能力模型是在当前用户可见的共享 Knowledge Graph 上，把用户已具备能力、当前课程要求的全部能力，以及两者之间真实存在的 prerequisite 连接投影为一个项目相关能力空间；系统再基于该空间生成不污染共享 Course 的个人课程路线，并由现有 Navigation 基于实时状态决定下一步行动。**


## 20. V1 实现契约与验收边界

共享计算核心为 `src/shared/learning/personalCourseRoute.ts`，只接收可见 active node IDs、真实 prerequisite DTO、满足共享教学条件的 current IDs、Course coverage 顺序。Feature adapter 与服务端使用同一个核心。可达性包含起点自身，因此 Current 与 Course/Bridge 角色可重叠；Bridge 是模型中全部 Course 外节点，包括当前能力起点。

教学门槛保持 route-local：只以个人路线内部的 prerequisite 作为 AND 前置；不额外补入交集之外的祖先，也不让它们成为不可见门槛。断连时保留课程集合与课程顺序优先级，真实 prerequisite 拓扑约束优先。重复 coverage 用最早 lesson/coverage 排序位置；这与详情的 introduce-first 主篇章选择是不同投影用途。

`NavigationEngineInput.personalRoute` 是服务端计算输入，保留全部节点及确定性拓扑顺序，避免旧 target closure 丢弃课程能力。Navigation policy 为 `course-rule-v5`。CourseNavigator 对服务端路径中的 Course 外节点使用“补充前置能力”展示，不制造 Chapter、Lesson 或 Coverage。

服务端 `requirePersonalCourseRouteKnowledge` 区分原 coverage 与重新计算的 bridge。Micro start/complete 均验证；迁移 `20261001162633_personal_course_route_micro.sql` 仅扩展 service-role-only RPC 完成边界，旧签名继续可用。该必要迁移是第 3.3 节的最小运行边界例外，不建立持久化路线模型。

项目模型沿用 KnowledgeAtlasScene，三种角色环槽只更新显隐，Domain hue 保持不变。相同 node/prerequisite edge 集合的状态更新不改变结构 key。用户 Knowledge repository 更新会重算模型并触发 Navigation refresh。

本地检查命令：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm verify:backend:local`、`node --env-file=.env.local --import tsx scripts/verify-personal-route.ts`。Hosted 验收必须另外核对 migration history、部署 commit、真实课程浏览器学习闭环、安全攻击与用户隔离。READY 不代表验收完成。
