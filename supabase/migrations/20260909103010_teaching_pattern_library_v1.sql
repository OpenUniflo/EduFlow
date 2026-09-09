-- Generated Lesson 1 teaching content. No schema, Knowledge, curriculum order, Assignment or learner-state changes.

begin;

do $$ begin

if not exists(select 1 from courses where id='ai-agents-in-depth') then return; end if;

if (select array_agg(node_id order by display_order) from curriculum_coverages where course_id='ai-agents-in-depth' and lesson_id='aiad-lesson-01') is distinct from array['A02','AGC01','R10','AGC02','AGC03','H02','WF05','S01','S02','S03']::text[] then raise exception 'Lesson 1 identity/order changed; re-audit before rollout'; end if;

if not exists(select 1 from micro_learning_paths where id='aiad-l1-a02' and course_id='ai-agents-in-depth' and knowledge_id='A02' and revision in (1,2)) then raise exception 'Path identity/revision mismatch; re-audit before rollout'; end if;

update micro_steps set kind='explanation',title='先从你用过的聊天开始',content='你可能让 ChatGPT 给过建议。这里比较的是两种任务方式：只生成一段“怎么做”的建议；或实际查资料、执行操作，并根据结果继续。ChatGPT 产品也可能提供后者，区别不在产品名字。

本节带你认识 Agent 的组成、反馈循环、工作流取舍与安全边界。你不需要先会编程；学完要能解释它如何做事，不代表已经能独立开发系统。',interaction=null,success_feedback='本节要区分的是提供建议与实际行动；名称相同的产品也可能支持不同任务方式。',retry_feedback=null where id='aiad-l1-a02-s1' and unit_id='aiad-l1-a02-unit' and position=0 and exists(select 1 from micro_units where id='aiad-l1-a02-unit' and path_id='aiad-l1-a02' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='explanation',title='Agent 先看，再决定，再行动',content='Agent（智能体）会依据收到的信息决定下一步行动，再看行动带来的结果。以找航班为例：看到出行需求 → 决定查航班 → 得到查询结果 → 再决定是否换条件。

环境（Environment）是它交互的外部世界，例如航班数据库或用户。Agent 得到的只是观察，例如查询返回的几个航班，并非整个环境。以上为教材场景的教学改编。',interaction=null,success_feedback='观察是从环境取得的信息，不是整个环境。决定查询也不等于已经查完。',retry_feedback=null where id='aiad-l1-a02-s2' and unit_id='aiad-l1-a02-unit' and position=1 and exists(select 1 from micro_units where id='aiad-l1-a02-unit' and path_id='aiad-l1-a02' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='explanation',title='先认识三个协作角色',content='模型（Model；这里是能理解和生成语言的大语言模型 LLM）负责理解需求、决定下一步。
上下文（Context）是这次决策实际交给模型的信息，例如出行需求和刚查到的航班。
工具（Tool）是读取或改变外部世界的接口，例如查询航班的接口。航班数据库本身仍属于环境。

模型说“我要查询”，不等于查询已经执行。

下面单步观察同一航班任务：节点标出 Agent 内外；下方每一步说明决定、执行与信息回传。向下滚动可看到“单步 Step”和事件说明。',interaction='{
  "type": "flow-execution",
  "mode": "explore",
  "teaching": {
    "explanation": "图把Agent内部的模型、上下文与工具接口，同外部环境分开标注。箭头表示信息和执行交接；不是把数据库装进模型。单步观察每个角色在同一查询任务中的作用。"
  },
  "nodes": [
    {
      "id": "context",
      "label": "Agent内：上下文",
      "x": 0,
      "y": 0
    },
    {
      "id": "model",
      "label": "Agent内：模型",
      "x": 190,
      "y": 0
    },
    {
      "id": "tool",
      "label": "Agent内：工具接口",
      "x": 0,
      "y": 120
    },
    {
      "id": "env",
      "label": "Agent外：环境",
      "x": 190,
      "y": 120
    }
  ],
  "edges": [
    {
      "id": "read",
      "from": "context",
      "to": "model",
      "label": "本次决策信息"
    },
    {
      "id": "decide",
      "from": "model",
      "to": "tool",
      "label": "选择查询操作"
    },
    {
      "id": "query",
      "from": "tool",
      "to": "env",
      "label": "系统实际执行查询"
    },
    {
      "id": "result",
      "from": "env",
      "to": "context",
      "label": "系统把结果纳入上下文"
    }
  ],
  "initialEdgeIds": [
    "read",
    "decide",
    "query",
    "result"
  ],
  "correctEdgeIds": [
    "read",
    "decide",
    "query",
    "result"
  ],
  "events": [
    {
      "nodeId": "context",
      "title": "1 · 当前信息",
      "message": "用户需要周三去上海的航班。",
      "explanation": "这是模型现在能读到的任务信息。"
    },
    {
      "nodeId": "model",
      "edgeId": "read",
      "title": "2 · 作决定",
      "message": "模型决定查询周三航班。",
      "explanation": "模型产生下一步决定，还没有查询结果。"
    },
    {
      "nodeId": "tool",
      "edgeId": "decide",
      "title": "3 · 接上操作",
      "message": "系统通过查询接口访问航班数据。",
      "explanation": "工具是接口，系统要实际执行查询。"
    },
    {
      "nodeId": "env",
      "edgeId": "query",
      "title": "4 · 外部事实",
      "message": "航班系统返回可选航班列表。",
      "explanation": "真实航班记录仍在Agent之外。"
    },
    {
      "nodeId": "context",
      "edgeId": "result",
      "title": "5 · 新信息回来",
      "message": "返回的列表被组织进上下文，供下一次决定使用。",
      "explanation": "模型没有读取整个数据库；它收到的是这次查询带回的信息。"
    }
  ]
}'::jsonb,success_feedback='Model 作决定，工具是接口；外部事实通过查询结果回到上下文。',retry_feedback=null where id='aiad-l1-a02-s3' and unit_id='aiad-l1-a02-unit' and position=2 and exists(select 1 from micro_units where id='aiad-l1-a02-unit' and path_id='aiad-l1-a02' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='explanation',title='谁把这些角色连起来？',content='是谁把“查过什么”变成下一次决策能用的信息？运行层（Runtime）负责支撑任务运行。教材用 Harness 指 Agent 内环绕模型的运行与治理层；它还负责权限、验证和纠正。“治理”在这里只是控制和检查操作。

任务状态（State）记录进行到哪了，例如“已查询，等待用户选日期”。下面只展开 Harness 的信息组织职责：单步看任务记录怎样成为本次上下文，再交给模型。Harness 不是第二个决策模型。',interaction='{
  "type": "flow-execution",
  "mode": "explore",
  "teaching": {
    "explanation": "任务状态由运行层维护；Harness 挑出决策需要的信息组织成上下文，模型据此决定。图展示一次信息交接，不表示所有 State 都必须原样发给模型，也没有把外部航班数据库放进 Agent。"
  },
  "nodes": [
    {
      "id": "state",
      "label": "任务状态 State",
      "x": 0,
      "y": 0
    },
    {
      "id": "harness",
      "label": "Harness：组织信息",
      "x": 190,
      "y": 0
    },
    {
      "id": "context",
      "label": "本次上下文 Context",
      "x": 0,
      "y": 120
    },
    {
      "id": "model",
      "label": "Model：决定下一步",
      "x": 190,
      "y": 120
    }
  ],
  "edges": [
    {
      "id": "read",
      "from": "state",
      "to": "harness",
      "label": "读取任务进展"
    },
    {
      "id": "compose",
      "from": "harness",
      "to": "context",
      "label": "选取决策所需信息"
    },
    {
      "id": "decide",
      "from": "context",
      "to": "model",
      "label": "交给模型"
    }
  ],
  "initialEdgeIds": [
    "read",
    "compose",
    "decide"
  ],
  "correctEdgeIds": [
    "read",
    "compose",
    "decide"
  ],
  "events": [
    {
      "nodeId": "state",
      "title": "1 · 任务记录",
      "message": "已查询航班，等待用户选日期。",
      "explanation": "State 记录任务进展；它不是外部数据库中的订单。"
    },
    {
      "nodeId": "harness",
      "edgeId": "read",
      "title": "2 · 运行层读取进展",
      "message": "Harness 取出仍需用户选择的日期信息。",
      "explanation": "运行与信息组织由这一层承担，不是模型凭空知道进度。"
    },
    {
      "nodeId": "context",
      "edgeId": "compose",
      "title": "3 · 组织本次信息",
      "message": "上下文包含出行需求、查询结果和“日期待选”。",
      "explanation": "这里只送入这次决定需要的内容，不等于整个任务记录或整个数据库。"
    },
    {
      "nodeId": "model",
      "edgeId": "decide",
      "title": "4 · 模型作决定",
      "message": "根据收到的信息，决定请用户选择日期。",
      "explanation": "Harness 组织信息；Model 决策。角色不同，共同支持同一个任务。"
    }
  ]
}'::jsonb,success_feedback='State 记录进展；Harness 准备信息；Model 根据本次上下文决定。',retry_feedback=null where id='aiad-l1-a02-s4' and unit_id='aiad-l1-a02-unit' and position=3 and exists(select 1 from micro_units where id='aiad-l1-a02-unit' and path_id='aiad-l1-a02' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='interaction',title='把关系放回同一个任务',content='把同一航班任务中的四条描述归类。任务记录写着“已预订”，不代表环境真的有订单；实际订单要在外部系统验证。

Model 决策；Harness 管理上下文、工具接口和任务状态；Environment 保存外部事实。先点卡片，再点类别，也可以拖动。',interaction='{
  "type": "categorize",
  "items": [
    {
      "id": "decision",
      "label": "决定询问用户选哪个日期"
    },
    {
      "id": "record",
      "label": "维护“已查询，等待选日期”的任务记录"
    },
    {
      "id": "context",
      "label": "把查询结果与待选日期组织给模型"
    },
    {
      "id": "fact",
      "label": "航空公司的数据库实际保存了订单"
    }
  ],
  "categories": [
    "Model 决策",
    "Harness 运行与管理",
    "Environment 外部事实"
  ],
  "correctCategories": [
    "Model 决策",
    "Harness 运行与管理",
    "Harness 运行与管理",
    "Environment 外部事实"
  ]
}'::jsonb,success_feedback='模型决定要问什么；Harness 维护进展并准备上下文；外部订单属于环境。内部记录与外部事实需要区分。',retry_feedback='按职责判断：作决定的是 Model；维护任务记录、组织上下文的是 Harness；航空公司的真实订单在 Environment 中。' where id='aiad-l1-a02-s4-bridge' and unit_id='aiad-l1-a02-unit' and position=4 and exists(select 1 from micro_units where id='aiad-l1-a02-unit' and path_id='aiad-l1-a02' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='summary',title='合上页面，你能画出什么？',content='沿刚才的图，用自己的话指出：哪一个是决策？哪一步真的访问环境？新结果放在哪里？

Agent 内：模型作决定；Harness 组织信息、工具与任务状态。
Agent 外：环境保存真实对象与变化。

下一项问：系统给了哪些信息和操作范围？
来源：教材 PDF15–16、27。',interaction=null,success_feedback='保留这条边界：Agent 内组织信息与行动，环境中才有需要验证的真实对象。',retry_feedback=null where id='aiad-l1-a02-s5' and unit_id='aiad-l1-a02-unit' and position=5 and exists(select 1 from micro_units where id='aiad-l1-a02-unit' and path_id='aiad-l1-a02' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_learning_paths set revision=2 where id='aiad-l1-a02' and revision=1;

if not exists(select 1 from micro_learning_paths where id='aiad-l1-r10' and course_id='ai-agents-in-depth' and knowledge_id='R10' and revision in (1,2)) then raise exception 'Path identity/revision mismatch; re-audit before rollout'; end if;

update micro_steps set kind='explanation',title='有了工具，为什么还要循环？',content='你已知道观察与动作。若查询返回“没有直飞”，最初的计划就需要调整。一次决定无法提前知道所有结果，因此要把新观察交回模型。

ReAct 指思考（Reason）、行动（Act）、观察（Observation）交替进行。Loop 就是循环：看结果，再决定下一步。',interaction=null,success_feedback='新观察必须进入上下文，才可能成为下一次决定的依据。',retry_feedback=null where id='aiad-l1-r10-s1' and unit_id='aiad-l1-r10-unit' and position=0 and exists(select 1 from micro_units where id='aiad-l1-r10-unit' and path_id='aiad-l1-r10' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='explanation',title='看两轮：结果怎样改变查询',content='问题：第一轮没有直飞，第二轮为什么会换查询条件？
教学改编：用户想找周三直飞，并已允许没有时查看周四。单步到第 4 步，先预测：模型看到“周三无直飞”后，会原样重查，还是结合许可改查周四？再点一步，核对决定的依据。

这里播放的是预设轨迹，不调用真实服务。观察重点是“结果进入上下文 → 下一次决定改变”。',interaction='{
  "type": "flow-execution",
  "mode": "explore",
  "teaching": {
    "explanation": "看模型怎样利用新结果改变下一步。连线表示信息或执行交接；播放是预设教学轨迹，不调用真实工具。断开结果回传后，演示会停在缺信息的位置。",
    "feedback": {
      "missing-required-edge": "结果没有交回，模型就不能依据这次真实观察继续判断。重新连接回传边，再执行。"
    }
  },
  "nodes": [
    {
      "id": "model",
      "label": "模型：思考",
      "x": 0,
      "y": 110
    },
    {
      "id": "execute",
      "label": "运行层：执行工具",
      "x": 190,
      "y": 110
    },
    {
      "id": "world",
      "label": "环境：航班数据",
      "x": 0,
      "y": 230
    },
    {
      "id": "collect",
      "label": "运行层：组织结果",
      "x": 190,
      "y": 230
    },
    {
      "id": "answer",
      "label": "回复用户",
      "x": 190,
      "y": 0
    }
  ],
  "edges": [
    {
      "id": "act",
      "from": "model",
      "to": "execute",
      "label": "决定查询"
    },
    {
      "id": "observe",
      "from": "execute",
      "to": "world",
      "label": "实际查询"
    },
    {
      "id": "collect",
      "from": "world",
      "to": "collect",
      "label": "取得查询结果"
    },
    {
      "id": "return",
      "from": "collect",
      "to": "model",
      "label": "结果进入上下文"
    },
    {
      "id": "finish",
      "from": "model",
      "to": "answer",
      "label": "信息足够，回复"
    }
  ],
  "initialEdgeIds": [
    "act",
    "observe",
    "collect",
    "return",
    "finish"
  ],
  "correctEdgeIds": [
    "act",
    "observe",
    "collect",
    "return",
    "finish"
  ],
  "events": [
    {
      "nodeId": "model",
      "title": "1 · 想：先查周三",
      "message": "任务：找周三直飞；若没有，允许查周四。模型决定先查周三。",
      "explanation": "用户已经允许日期调整。这里的文字只是教学中的决策说明。"
    },
    {
      "nodeId": "execute",
      "edgeId": "act",
      "title": "2 · 做：查询周三",
      "message": "运行层通过工具发起查询。",
      "explanation": "模型选择操作，运行层实际执行。"
    },
    {
      "nodeId": "world",
      "edgeId": "observe",
      "title": "3 · 看：没有直飞",
      "message": "示意结果：周三没有直飞。",
      "explanation": "本次环境观察否定了第一种方案。"
    },
    {
      "nodeId": "collect",
      "edgeId": "collect",
      "title": "4 · 把结果带回",
      "message": "运行层把“周三没有直飞”加入上下文。",
      "explanation": "工具查到了什么，必须组织给模型，才会成为下次判断依据。"
    },
    {
      "nodeId": "model",
      "edgeId": "return",
      "title": "5 · 再想：查询周四",
      "message": "模型看到结果，结合用户许可决定改查周四。",
      "explanation": "新观察改变下一步；不是盲目重复周三查询。"
    },
    {
      "nodeId": "execute",
      "edgeId": "act",
      "title": "6 · 再做：查询周四",
      "message": "运行层执行第二次查询。",
      "explanation": "循环复用相同职责，但这次查询条件变了。"
    },
    {
      "nodeId": "world",
      "edgeId": "observe",
      "title": "7 · 再看：有一个方案",
      "message": "示意结果：周四有一个直飞航班。",
      "explanation": "这是第二次查询的观察。"
    },
    {
      "nodeId": "collect",
      "edgeId": "collect",
      "title": "8 · 第二次结果回传",
      "message": "运行层把周四方案加入上下文。",
      "explanation": "模型能把前后两次观察连起来。"
    },
    {
      "nodeId": "model",
      "edgeId": "return",
      "title": "9 · 决定：已有可选方案",
      "message": "模型准备向用户介绍周四方案。",
      "explanation": "本任务是找方案，尚未请求付款或预订。"
    },
    {
      "nodeId": "answer",
      "edgeId": "finish",
      "title": "10 · 停止查询，返回方案",
      "message": "周三无直飞；周四有一个直飞方案，供你选择。",
      "explanation": "查找任务得到当前结果，停止查询不等于已经订票。"
    }
  ]
}'::jsonb,success_feedback='两轮复用同一组职责，但新观察改变了查询条件；找到方案还不是完成预订。',retry_feedback=null where id='aiad-l1-r10-s2' and unit_id='aiad-l1-r10-unit' and position=1 and exists(select 1 from micro_units where id='aiad-l1-r10-unit' and path_id='aiad-l1-r10' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='interaction',title='自己走一遍反馈链',content='先预测：如果查询结果没有进入上下文，下一次决定还会有“周三无直飞”这个新依据吗？

只改变一条连接：点“断开 结果进入上下文”，从头单步到停止位置。比较：工具已经查到了什么，模型却还没收到什么？再点“连接 结果进入上下文”，重新执行两轮。也可用图上的端点连接。

对照完整轨迹：缺少的是新信息，不是工具本身。这个演示在卡点停止；真实系统也可能盲目重复，不能据此推断所有系统的报错方式。',interaction='{
  "type": "flow-execution",
  "mode": "explore",
  "teaching": {
    "explanation": "看模型怎样利用新结果改变下一步。连线表示信息或执行交接；播放是预设教学轨迹，不调用真实工具。断开结果回传后，演示会停在缺信息的位置。",
    "feedback": {
      "missing-required-edge": "结果没有交回，模型就不能依据这次真实观察继续判断。重新连接回传边，再执行。"
    }
  },
  "nodes": [
    {
      "id": "model",
      "label": "模型：思考",
      "x": 0,
      "y": 110
    },
    {
      "id": "execute",
      "label": "运行层：执行工具",
      "x": 190,
      "y": 110
    },
    {
      "id": "world",
      "label": "环境：航班数据",
      "x": 0,
      "y": 230
    },
    {
      "id": "collect",
      "label": "运行层：组织结果",
      "x": 190,
      "y": 230
    },
    {
      "id": "answer",
      "label": "回复用户",
      "x": 190,
      "y": 0
    }
  ],
  "edges": [
    {
      "id": "act",
      "from": "model",
      "to": "execute",
      "label": "决定查询"
    },
    {
      "id": "observe",
      "from": "execute",
      "to": "world",
      "label": "实际查询"
    },
    {
      "id": "collect",
      "from": "world",
      "to": "collect",
      "label": "取得查询结果"
    },
    {
      "id": "return",
      "from": "collect",
      "to": "model",
      "label": "结果进入上下文"
    },
    {
      "id": "finish",
      "from": "model",
      "to": "answer",
      "label": "信息足够，回复"
    }
  ],
  "initialEdgeIds": [
    "act",
    "observe",
    "collect",
    "return",
    "finish"
  ],
  "correctEdgeIds": [
    "act",
    "observe",
    "collect",
    "return",
    "finish"
  ],
  "events": [
    {
      "nodeId": "model",
      "title": "1 · 想：先查周三",
      "message": "任务：找周三直飞；若没有，允许查周四。模型决定先查周三。",
      "explanation": "用户已经允许日期调整。这里的文字只是教学中的决策说明。"
    },
    {
      "nodeId": "execute",
      "edgeId": "act",
      "title": "2 · 做：查询周三",
      "message": "运行层通过工具发起查询。",
      "explanation": "模型选择操作，运行层实际执行。"
    },
    {
      "nodeId": "world",
      "edgeId": "observe",
      "title": "3 · 看：没有直飞",
      "message": "示意结果：周三没有直飞。",
      "explanation": "本次环境观察否定了第一种方案。"
    },
    {
      "nodeId": "collect",
      "edgeId": "collect",
      "title": "4 · 把结果带回",
      "message": "运行层把“周三没有直飞”加入上下文。",
      "explanation": "工具查到了什么，必须组织给模型，才会成为下次判断依据。"
    },
    {
      "nodeId": "model",
      "edgeId": "return",
      "title": "5 · 再想：查询周四",
      "message": "模型看到结果，结合用户许可决定改查周四。",
      "explanation": "新观察改变下一步；不是盲目重复周三查询。"
    },
    {
      "nodeId": "execute",
      "edgeId": "act",
      "title": "6 · 再做：查询周四",
      "message": "运行层执行第二次查询。",
      "explanation": "循环复用相同职责，但这次查询条件变了。"
    },
    {
      "nodeId": "world",
      "edgeId": "observe",
      "title": "7 · 再看：有一个方案",
      "message": "示意结果：周四有一个直飞航班。",
      "explanation": "这是第二次查询的观察。"
    },
    {
      "nodeId": "collect",
      "edgeId": "collect",
      "title": "8 · 第二次结果回传",
      "message": "运行层把周四方案加入上下文。",
      "explanation": "模型能把前后两次观察连起来。"
    },
    {
      "nodeId": "model",
      "edgeId": "return",
      "title": "9 · 决定：已有可选方案",
      "message": "模型准备向用户介绍周四方案。",
      "explanation": "本任务是找方案，尚未请求付款或预订。"
    },
    {
      "nodeId": "answer",
      "edgeId": "finish",
      "title": "10 · 停止查询，返回方案",
      "message": "周三无直飞；周四有一个直飞方案，供你选择。",
      "explanation": "查找任务得到当前结果，停止查询不等于已经订票。"
    }
  ]
}'::jsonb,success_feedback='移除回传就失去新依据；恢复后模型才能沿示意轨迹继续判断。',retry_feedback='检查观察是否交回模型，并执行到回复。想到了要查询，不代表已得到结果。' where id='aiad-l1-r10-s3' and unit_id='aiad-l1-r10-unit' and position=2 and exists(select 1 from micro_units where id='aiad-l1-r10-unit' and path_id='aiad-l1-r10' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='feedback',title='循环不是永远调用工具',content='信息足够时可以回复；需要用户选择时可以暂停。任务完成、不可恢复的错误或预设轮数上限，都可能使系统停止。停止不一定是成功。

换一个条件：用户只允许查周三，结果是“没有直飞”，也没有授权预订。哪种解释最合理？',interaction='{
  "type": "choice",
  "options": [
    "停止说明已经订票成功，可以报告已完成预订",
    "应如实报告无直飞并请用户选择；当前结果没有证明预订完成",
    "只要不断重复同一个查询，就能补足用户的授权"
  ],
  "correctIndex": 1
}'::jsonb,success_feedback='无直飞是新观察，未授权改日期或订票是行动边界。回复并交还选择可以结束本轮查询，但不等于预订成功。',retry_feedback='区分停止原因与任务结果：没有航班不是有订单；重复查询也不会产生用户授权。应基于观察如实回复。' where id='aiad-l1-r10-s4' and unit_id='aiad-l1-r10-unit' and position=3 and exists(select 1 from micro_units where id='aiad-l1-r10-unit' and path_id='aiad-l1-r10' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='summary',title='能复述这一圈吗？',content='模型依据上下文决定 → 运行层执行工具 → 环境返回观察 → 新结果进入上下文 → 模型再决定。

反馈让下一步有新依据；没有结果回传，重复行动也不会补足这条信息链。下一项解释运行层怎样把这圈组织得更可靠。
来源：教材 PDF22–23、31。',interaction=null,success_feedback='反馈提供下一次判断的依据，停止原因仍须与成功结果分开判断。',retry_feedback=null where id='aiad-l1-r10-s5' and unit_id='aiad-l1-r10-unit' and position=4 and exists(select 1 from micro_units where id='aiad-l1-r10-unit' and path_id='aiad-l1-r10' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_learning_paths set revision=2 where id='aiad-l1-r10' and revision=1;

if not exists(select 1 from micro_learning_paths where id='aiad-l1-s03' and course_id='ai-agents-in-depth' and knowledge_id='S03' and revision in (1,2)) then raise exception 'Path identity/revision mismatch; re-audit before rollout'; end if;

update micro_steps set kind='explanation',title='隔离好了，还要给多少权限？',content='上一项用沙盒缩小影响范围。但如果把全部私有文件和网络访问都开放进去，很多风险仍然存在。Least Privilege（最小权限）要求只授予当前任务真正需要的最小范围。',interaction=null,success_feedback='隔离与权限都需要围绕任务检查；隔离并不消除已开放能力带来的风险。',retry_feedback=null where id='aiad-l1-s03-s1' and unit_id='aiad-l1-s03-unit' and position=0 and exists(select 1 from micro_units where id='aiad-l1-s03-unit' and path_id='aiad-l1-s03' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='interaction',title='先列任务，再列权限',content='教学改编：任务是“读取指定报告并在页面内总结”。需要读那份报告；删除原报告、读取无关私有文件或发邮件都不是当前任务要求。

按这个任务把权限分为“任务所需”和“额外权限”，直观看到权限边界。若任务改成保存草稿，就需要重新判断写入能力；最小权限不是永远只读。',interaction='{
  "type": "categorize",
  "items": [
    {
      "id": "read",
      "label": "读取指定报告"
    },
    {
      "id": "delete",
      "label": "删除原报告"
    },
    {
      "id": "private",
      "label": "读取无关私有文件"
    },
    {
      "id": "email",
      "label": "把报告发送到外部邮箱"
    }
  ],
  "categories": [
    "任务所需",
    "额外权限"
  ],
  "correctCategories": [
    "任务所需",
    "额外权限",
    "额外权限",
    "额外权限"
  ]
}'::jsonb,success_feedback='读取指定报告支撑当前总结任务；删除、无关文件和邮件权限扩大了可影响范围，却没有帮助完成已授权任务。',retry_feedback='先固定任务：只读指定报告并在页面总结。逐张问“没有这项权限，还能完成任务吗？”删除、无关文件和外发邮件都不必要。' where id='aiad-l1-s03-s2' and unit_id='aiad-l1-s03-unit' and position=1 and exists(select 1 from micro_units where id='aiad-l1-s03-unit' and path_id='aiad-l1-s03' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='interaction',title='选一份够用的权限',content='新任务变为“修改指定草稿并保留修改结果”，不需要发送邮件。哪份授权最符合任务？',interaction='{
  "type": "choice",
  "options": [
    "只读指定草稿；权限越少越好，即使不能保存修改",
    "读写指定草稿与必要的工作区，不开放无关删除与邮件能力",
    "开放所有文档读写，方便它自行决定处理范围"
  ],
  "correctIndex": 1
}'::jsonb,success_feedback='修改任务需要必要的写入能力；只读不够，全目录权限又过量。够用的范围取决于具体任务。',retry_feedback='先看新任务要保存修改，因此需要写入；再看操作对象只有指定草稿，不能据此扩大到所有文件。' where id='aiad-l1-s03-s3' and unit_id='aiad-l1-s03-unit' and position=2 and exists(select 1 from micro_units where id='aiad-l1-s03-unit' and path_id='aiad-l1-s03' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='feedback',title='三种控制互相配合',content='最小权限问“任务需要哪些能力”；沙盒问“执行能影响哪些环境与资源”；护栏在输入、执行和输出边界做检查。它们互相配合。

情境：总结工具已经在沙盒中运行，却仍能读取全部私有文件并向任意地址发送邮件。哪种判断正确？

教材也要求凭证范围与有效期受限；凭证可理解为有范围和有效期的电子通行证，不应直接复用高权限的个人凭证。',interaction='{
  "type": "choice",
  "options": [
    "有沙盒就可以保留全部文件和邮件权限",
    "沙盒没有替代权限边界，应缩到指定报告并关闭任务不需要的外发能力",
    "把所有读取能力都关掉，仍可以完成报告总结"
  ],
  "correctIndex": 1
}'::jsonb,success_feedback='隔离限制执行影响范围，最小权限限制可用能力。开放进去的数据和出口仍有风险；两层需要同时检查。',retry_feedback='沙盒不自动决定任务需要哪些文件和出口；完全不给读取又无法总结。保留所需的报告读取，去掉无关访问与外发。' where id='aiad-l1-s03-s4' and unit_id='aiad-l1-s03-unit' and position=3 and exists(select 1 from micro_units where id='aiad-l1-s03-unit' and path_id='aiad-l1-s03' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_steps set kind='summary',title='从一个简单任务复述整节',content='先不看前文，口述两个小任务：
1. 查询航班返回“没有直飞”后，谁接收结果，怎样决定下一步？为什么还不能说已预订？
2. 修改指定草稿需要什么权限？有沙盒后，为什么仍要检查修改结果？

可返回各项 Summary 核对：决策不等于执行，反馈提供新依据，权限与隔离降低影响范围，检查验证实际结果。

完成学习活动不等于已经能独立开发系统，也不是能力掌握证明。下一节再展开上下文、状态与 Agent Loop 的具体组织方式。
来源：教材 PDF115、152。',interaction=null,success_feedback='你复习了反馈、权限与隔离的边界；学习活动完成仍不是独立能力证明。',retry_feedback=null where id='aiad-l1-s03-s5' and unit_id='aiad-l1-s03-unit' and position=4 and exists(select 1 from micro_units where id='aiad-l1-s03-unit' and path_id='aiad-l1-s03' and position=0);

if not found then raise exception 'Step identity/ownership/order mismatch'; end if;

update micro_learning_paths set revision=2 where id='aiad-l1-s03' and revision=1;

end $$;

-- Source-audit supplement: Lecture 3 p26 contains the original three-sentence corpus.
-- Authoritative mapping DML; intentionally separate from generated Agent teaching Steps.
do $$ begin
if not exists(select 1 from courses where id='cds525-deep-learning') then return; end if;
if not exists(select 1 from material_segments where course_id='cds525-deep-learning' and material_id='cds525-mat-l03' and id='cds525-mat-l03-p026' and page=26) then raise exception 'Verified co-occurrence source page missing'; end if;
if exists(select 1 from material_knowledge_coverages where course_id='cds525-deep-learning' and id='teaching-k021-source-p026' and (material_id<>'cds525-mat-l03' or segment_id<>'cds525-mat-l03-p026' or node_id<>'CDS525-K021' or role<>'explain')) then raise exception 'Supporting source identity conflict'; end if;
insert into material_knowledge_coverages(course_id,id,material_id,segment_id,node_id,role)
values('cds525-deep-learning','teaching-k021-source-p026','cds525-mat-l03','cds525-mat-l03-p026','CDS525-K021','explain')
on conflict(course_id,id) do nothing;
end $$;

commit;
