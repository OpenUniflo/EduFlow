-- Generated Lesson 1 teaching content. No schema, Knowledge, curriculum order, Assignment or learner-state changes.

begin;

do $$ begin

if not exists(select 1 from courses where id='ai-agents-in-depth') then return; end if;

if (select array_agg(node_id order by display_order) from curriculum_coverages where course_id='ai-agents-in-depth' and lesson_id='aiad-lesson-01') is distinct from array['A02','AGC01','R10','AGC02','AGC03','H02','WF05','S01','S02','S03']::text[] then raise exception 'Lesson 1 identity/order changed; re-audit before rollout'; end if;

if not exists(select 1 from micro_learning_paths where id='aiad-l1-r10' and course_id='ai-agents-in-depth' and knowledge_id='R10' and revision in (2,3)) then raise exception 'Path identity/revision mismatch; re-audit before rollout'; end if;

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
      "title": "4 · 整理结果，准备交回",
      "message": "运行层整理“周三没有直飞”的查询结果，准备交回模型。",
      "explanation": "结果已取得并整理；还要沿回传边送入模型的下一次请求，才会成为模型的判断依据。"
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
      "title": "8 · 整理第二次结果",
      "message": "运行层整理周四方案，准备交回模型。",
      "explanation": "沿回传边把新方案交给模型，模型才能结合前后两次观察。"
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
      "title": "4 · 整理结果，准备交回",
      "message": "运行层整理“周三没有直飞”的查询结果，准备交回模型。",
      "explanation": "结果已取得并整理；还要沿回传边送入模型的下一次请求，才会成为模型的判断依据。"
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
      "title": "8 · 整理第二次结果",
      "message": "运行层整理周四方案，准备交回模型。",
      "explanation": "沿回传边把新方案交给模型，模型才能结合前后两次观察。"
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

update micro_learning_paths set revision=3 where id='aiad-l1-r10' and revision=2;

end $$;

commit;
