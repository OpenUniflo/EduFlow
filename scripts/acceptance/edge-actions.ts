/** Configure explicit acceptance templates through administrator API; verify ordinary-user denial. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { evaluateAction, type EdgeAction, type CourseActionBinding } from '../../src/features/actions/model.js';
import { createClient } from '@supabase/supabase-js';
const preview = process.env.ACCEPTANCE_PREVIEW_URL!;
assert.match(new URL(preview).hostname, /^edu-flow-.*\.vercel\.app$/);
const clients = await Promise.all(['ADMIN', 'A', 'B'].map(async actor => {
  const client = createClient(process.env.ACCEPTANCE_SUPABASE_URL!, process.env.ACCEPTANCE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInWithPassword({ email: process.env[`ACCEPTANCE_${actor}_EMAIL`]!, password: process.env[`ACCEPTANCE_${actor}_PASSWORD`]! }); assert.ifError(auth.error);
  return { client, token: auth.data.session!.access_token };
}));
async function call(actor: number, body?: unknown, expected = 200) {
  const response = await fetch(`${preview}/api/edge-actions?courseId=enterprise-vietnam-supply-collaboration`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${clients[actor].token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
}
const continuation = process.argv[2] === 'continuation';
const sourceId = continuation ? 'supply-shortage-exposure' : 'supply-net-material-requirement';
const edgeId = continuation ? 'knowledge-prerequisite-supply-shortage-exposure-supply-shortage-impact-assessment' : 'knowledge-prerequisite-supply-net-material-requirement-supply-shortage-exposure';
const path = `.acceptance/capability-evidence-action-loop/${continuation ? 'continuation-action-fixture' : 'edge-action-fixture'}.json`;
const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { actions: [] };
const definitions = continuation ? [
  { type: 'practice_task', title: '推导订单停线与恢复窗口', description: '把已量化物料缺口映射到具体工单，使用单位消耗量、产线速率与到货时点计算停线区间和完工影响，再整理恢复优先级输入。', estimated_minutes: 40, difficulty: 3, resource_requirements: ['work-order-schedule'], required_capability_ids: ['supply-shortage-exposure'], expected_evidence: '上传包含输入来源、各工单用料耗尽时点、停线起止、恢复后完工时间、交付影响和优先级依据的 UTF-8 txt/md/csv。区分计算演练与真实企业执行；完成任务后仍需证据判断与确认。' },
] : [
  { type: 'micro_learning', title: '学习缺料暴露分析', description: '用逐期需求与预计到货识别缺料起点、持续时间和影响范围。', estimated_minutes: 20, difficulty: 2, resource_requirements: [], required_capability_ids: [], expected_evidence: '完成既有 Micro 的理解与应用检查；能力状态由既有学习规则判断。' },
  { type: 'practice_task', title: '核算缺料暴露窗口', description: '根据可用库存、逐期需求与确认到货，计算每期净需求、缺口和持续时间，并说明所影响的订单。', estimated_minutes: 45, difficulty: 3, resource_requirements: ['planning-records'], required_capability_ids: ['supply-net-material-requirement'], expected_evidence: '提交包含原始输入、逐期计算、缺料起止和订单影响的 UTF-8 txt/md/csv 工作记录。完成任务不等于已具备能力。' },
];
const actions: EdgeAction[] = [];
for (const definition of definitions) {
  const template = { ...definition, edge_id: edgeId, status: 'active', ...(previous.actions.find((item: { type: string }) => item.type === definition.type)?.id ? { id: previous.actions.find((item: { type: string }) => item.type === definition.type).id } : {}) };
  await call(1, { action: 'save-template', template }, 403);
  const saved = await call(0, { action: 'save-template', template }); actions.push(saved.action);
  // Persist each successful identity immediately, so interruption never silently creates duplicates.
  writeFileSync(path, JSON.stringify({ preview, actions: [...actions, ...previous.actions.filter((item: { type: string }) => !actions.some(action => action.type === item.type))] }, null, 2) + '\n');
  const binding = { course_id: 'enterprise-vietnam-supply-collaboration', action_id: saved.action.id, context: '海外工厂供应链协同项目。以下为验收用虚构项目资料，不代表已完成真实企业作业。', contact: '验收场景：计划负责人（无真实个人联系方式）', instructions: '使用自己的工作记录或明确标注的验收资料。逐期列出库存、需求、到货、缺口与受影响订单，再上传包含计算过程的结果。', resources: definition.type === 'practice_task' ? [{ key: 'planning-records', label: '逐期计划输入', reference: '验收数据：初始可用库存70；第1/2/3期需求150/100/80；各期确认到货0/120/100。请解释积欠是否跨期及缺口解除时间。', available: true }] : [], available: true };
  if (continuation) {
    binding.instructions = '按提供的工单时点逐项计算，不以日末总量替代停线时段。每条产线独立、物料已指定到工单，禁止跨单重复使用。列出优先级输入而非声称已完成调度；有假设或资料不足必须注明。';
    binding.resources = [{ key: 'work-order-schedule', label: '工单、消耗与到货计划（模拟输入）', reference: '教学演练，非真实工厂承诺。2026-10-09，两条独立产线均08:00启动，连续生产无班次限制，每件产品消耗1件关键物料。O1：40件，产线A每小时10件，已分配可用料10件，交付截止12:00，延期成本200元/小时。O2：20件，产线B每小时5件，已分配可用料5件，截止15:00，延期成本50元/小时。确认11:00同时收到并验收可用的物料O1专用30件、O2专用15件，不能跨工单挪用；无其他在途或库存。缺料即停线，到货即可恢复，忽略切换和运输延迟。请计算各自停线、完成时间、交期影响，并整理恢复优先级输入；如建议真实调度，说明仍需核验的数据。', available: true }];
  }
  await call(2, { action: 'save-binding', binding }, 403);
  await call(0, { action: 'save-binding', binding });
}
const a = await call(1), b = await call(2);
for (const actor of [a, b]) for (const action of actions) assert.ok(actor.actions.some((row: { id: string }) => row.id === action.id));
assert.equal(a.bindings.filter((row: { action_id: string }) => actions.some(action => action.id === row.action_id)).length, actions.length);
const weights = await Promise.all([1, 2].map(async actor => {
  const states = await clients[actor].client.from('user_knowledge_states').select('node_id,status'); assert.ifError(states.error);
  const acquiredIds = new Set(states.data!.filter(row => ['learned', 'mastered'].includes(row.status)).map(row => row.node_id));
  return actions.map((action: EdgeAction) => ({ actionId: action.id, ...evaluateAction(action, { sourceId, acquiredIds, binding: a.bindings.find((row: CourseActionBinding) => row.action_id === action.id) }) }));
}));
const practiceId = actions.find(action => action.type === 'practice_task')!.id;
assert.equal(weights[0].find(row => row.actionId === practiceId)?.available, true);
assert.equal(weights[1].find(row => row.actionId === practiceId)?.available, false);
assert.notDeepEqual(weights[0], weights[1]);
writeFileSync(path, JSON.stringify({ preview, actions, weights, bindings: a.bindings.filter((row: { action_id: string }) => actions.some(action => action.id === row.action_id)), apiGovernance: 'PASS: ordinary A/B writes denied, admin template and binding writes accepted', syntheticContext: true }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', actionIds: actions.map(action => action.id), scope: 'Hosted ordinary A/B read and admin/learner API authorization; not execution or capability proof' }));
