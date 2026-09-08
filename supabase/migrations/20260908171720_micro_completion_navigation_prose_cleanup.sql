-- Generated Lesson 1 teaching content. No schema, Knowledge, curriculum order, Assignment or learner-state changes.

begin;

do $$ begin

if not exists(select 1 from courses where id='ai-agents-in-depth') then return; end if;

if (select array_agg(node_id order by display_order) from curriculum_coverages where course_id='ai-agents-in-depth' and lesson_id='aiad-lesson-01') is distinct from array['A02','AGC01','R10','AGC02','AGC03','H02','WF05','S01','S02','S03']::text[] then raise exception 'Lesson 1 identity/order changed; re-audit before rollout'; end if;

update micro_steps set content='沿刚才的图，用自己的话指出：哪一个是决策？哪一步真的访问环境？新结果放在哪里？

Agent 内：模型作决定；Harness 组织信息、工具与任务状态。
Agent 外：环境保存真实对象与变化。

下一项问：系统给了哪些信息和操作范围？
来源：教材 PDF15–16、27。' where id='aiad-l1-a02-s5' and unit_id='aiad-l1-a02-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-a02-unit' and p.id='aiad-l1-a02' and p.course_id='ai-agents-in-depth' and p.knowledge_id='A02');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='能获得的信息决定决策依据，允许的动作决定能怎样影响环境。二者通过接口连接模型与世界。

下一项把这些角色放进一次循环：为什么做完还要再看？
来源：教材 PDF16–17。' where id='aiad-l1-agc01-s5' and unit_id='aiad-l1-agc01-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-agc01-unit' and p.id='aiad-l1-agc01' and p.course_id='ai-agents-in-depth' and p.knowledge_id='AGC01');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='模型依据上下文决定 → 运行层执行工具 → 环境返回观察 → 新结果进入上下文 → 模型再决定。

反馈让下一步有新依据；没有结果回传，重复行动也不会补足这条信息链。下一项解释运行层怎样把这圈组织得更可靠。
来源：教材 PDF22–23、31。' where id='aiad-l1-r10-s5' and unit_id='aiad-l1-r10-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-r10-unit' and p.id='aiad-l1-r10' and p.course_id='ai-agents-in-depth' and p.knowledge_id='R10');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='Model 负责决策；Harness 用上下文与工具支撑行动，用约束、验证与纠正治理行动。任务状态帮助接续运行，环境保存外部事实。

下一项再讨论模型选型：先分清问题属于哪一层，才知道换模型是否有帮助。
来源：教材 PDF26–28。' where id='aiad-l1-agc02-s6' and unit_id='aiad-l1-agc02-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-agc02-unit' and p.id='aiad-l1-agc02' and p.course_id='ai-agents-in-depth' and p.knowledge_id='AGC02');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='先说清任务要求，再比较模型在该任务的能力、工具表现、成本、速度和可用边界。不要把缺接口归咎于模型。

接下来比较另一种选择：步骤由程序预设，还是由模型根据结果决定？
来源：教材 PDF29–30。' where id='aiad-l1-agc03-s5' and unit_id='aiad-l1-agc03-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-agc03-unit' and p.id='aiad-l1-agc03' and p.course_id='ai-agents-in-depth' and p.knowledge_id='AGC03');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='步骤可清楚预设、关键顺序必须守住时，工作流有价值；需要模型根据反馈决定未预先写定的下一步时，自主执行可能更合适。两者都需要处理错误。

下一项把两者放到一个任务中，看看怎样分工。
来源：教材 PDF30–32。' where id='aiad-l1-h02-s5' and unit_id='aiad-l1-h02-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-h02-unit' and p.id='aiad-l1-h02' and p.course_id='ai-agents-in-depth' and p.knowledge_id='H02');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='可预设的规则交给明确流程，需要灵活判断的部分交给 Agent。关键操作守住审批，完成声明要对照真实结果。

下一项把这些安全检查放回输入、执行和输出的边界。
来源：教材混合模式 PDF31–32、人工干预33–34、过程与结果173。' where id='aiad-l1-wf05-s5' and unit_id='aiad-l1-wf05-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-wf05-unit' and p.id='aiad-l1-wf05' and p.course_id='ai-agents-in-depth' and p.knowledge_id='WF05');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='输入、执行、输出分别检查；高风险或持续失败时交给人工。既要减少危险放行，也要发现合法请求被误拒绝。

下一项看执行侧的一种具体控制：把代码的影响限制在隔离环境里。
来源：教材 PDF33–34。' where id='aiad-l1-s01-s5' and unit_id='aiad-l1-s01-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-s01-unit' and p.id='aiad-l1-s01' and p.course_id='ai-agents-in-depth' and p.knowledge_id='S01');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='沙盒限制代码接触的环境与资源，降低副作用范围；结果是否正确仍要另行检查。

即使有沙盒，也要问给它哪些权限才够用。下一项用最小权限收束这一节。
来源：教材 PDF121的执行隔离、PDF27的边界、PDF19的受限代码工具。' where id='aiad-l1-s02-s5' and unit_id='aiad-l1-s02-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-s02-unit' and p.id='aiad-l1-s02' and p.course_id='ai-agents-in-depth' and p.knowledge_id='S02');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

update micro_steps set content='先不看前文，口述两个小任务：
1. 查询航班返回“没有直飞”后，谁接收结果，怎样决定下一步？为什么还不能说已预订？
2. 修改指定草稿需要什么权限？有沙盒后，为什么仍要检查修改结果？

可返回各项 Summary 核对：决策不等于执行，反馈提供新依据，权限与隔离降低影响范围，检查验证实际结果。

完成学习活动不等于已经能独立开发系统，也不是能力掌握证明。下一节再展开上下文、状态与 Agent Loop 的具体组织方式。
来源：教材 PDF115、152。' where id='aiad-l1-s03-s5' and unit_id='aiad-l1-s03-unit' and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id='aiad-l1-s03-unit' and p.id='aiad-l1-s03' and p.course_id='ai-agents-in-depth' and p.knowledge_id='S03');

if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;

end $$;

commit;
