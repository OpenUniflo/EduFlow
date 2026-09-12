// Local browser fixtures use the real catalog and read-only repository hydration.
// No learner/course writes. Run with an authenticated local Playwright page.
export default async function verifyCourseNavigator(page, baseURL = 'http://localhost:5174', courseId = 'ai-agents-in-depth') {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(`${baseURL}/courses/${courseId}`);
  await page.locator('.navigator-path').waitFor();
  const data = await page.evaluate(async courseId => {
    const { applicationServices: services } = await import('/src/app/services/applicationServices.ts');
    const { apiRequest } = await import('/src/shared/api/apiClient.ts');
    const runtime = services.courseRepository.getCourse(courseId);
    const decision = await services.learnerStateService.getNavigation(courseId);
    const progress = await apiRequest('/api/progress');
    const micro = decision.path.map(item => ({ nodeId: item.nodeId, path: services.microLearningRepository.getPath(item.nodeId, { courseId, mode: 'learn' }) })).filter(item => item.path);
    return { runtime, decision, progress, micro };
  }, courseId);
  assert(data.micro.length >= 2, 'Real course needs two published Micro paths');
  const { runtime, micro } = data;
  let decision = JSON.parse(JSON.stringify(data.decision));
  let fail = false;
  const pattern = '**/api/navigation?**';
  await page.route(pattern, route => route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: { message: 'Fixture unavailable' } } : decision) }));
  const hydrate = async (learned, assignmentStates = {}) => page.evaluate(async ({ courseId, learned, assignmentStates }) => {
    const { applicationServices: services } = await import('/src/app/services/applicationServices.ts');
    const { supabaseClient } = await import('/src/shared/api/supabaseClient.ts');
    const { data } = await supabaseClient.auth.getSession();
    services.userKnowledgeRepository.hydrate(learned.map(nodeId => ({ nodeId, status: 'learned' })));
    services.learningProgressRepository.hydrate(data.session.user.id, [courseId], [{ userId: data.session.user.id, courseId, isActive: true, materialStates: {}, assignmentStates }]);
  }, { courseId, learned, assignmentStates });
  const setMicro = (entry, completed = []) => {
    decision = { ...data.decision, path: data.decision.path.map(item => ({ ...item, state: completed.includes(item.nodeId) ? 'learned' : item.nodeId === entry.nodeId ? 'underway' : 'blocked' })), nextAction: { kind: 'next', resourceKind: 'micro', resourceId: entry.path.id, nodeId: entry.nodeId, reasonCode: 'begin_required_micro', reason: 'Fixture Micro' } };
  };
  const report = [];
  try {
    setMicro(micro[0]); await hydrate([]);
    await page.getByRole('button', { name: '开始学习', exact: true }).waitFor();
    assert(await page.locator('[aria-current="step"]').count() === 1, 'A: one current node');
    assert(await page.locator('.navigator-next .atlas-primary').count() === 1, 'A: one primary');
    assert(!/微学习|学习材料|Review|Remediation|AI Generated|reasonCode/.test(await page.locator('.navigator-next').innerText()), 'A: no internal type labels');
    assert((await page.locator('.navigator-next').innerText()).includes(String(micro[0].path.estimatedMinutes)), 'A: real duration');
    report.push('A: unified existing learning card, duration and current identity');
    setMicro(micro[1], [micro[0].nodeId]); decision.nextAction.reasonCode = 'resume_required_micro'; decision.nextAction.kind = 'review'; await hydrate([micro[0].nodeId]);
    await page.getByText('继续上次未完成的学习。', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.navigator-stop.completed'));
    assert(await page.locator('.navigator-stop.completed').count() === 1, 'B: completion progression');
    report.push('B: fresh state advances completion and current');
    const chosen = [...runtime.assignments].sort((a,b) => a.order-b.order).slice(0,4);
    const chosenIds = new Set(chosen.map(item => item.id));
    const states = Object.fromEntries(runtime.assignments.filter(item => !chosenIds.has(item.id)).map(item => [item.id, { assignmentId: item.id, status: 'accepted' }]));
    await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByRole('heading', { name: '实训待办 · 4', exact: true }).waitFor();
    assert(await page.locator('.navigator-next-practice').count() === 1, 'C: a single nextPractice');
    assert(await page.locator('.navigator-backlog .atlas-primary').count() === 0, 'D: no competing primary');
    report.push('C/D: four debts; Micro and nextPractice separate');
    states[chosen[0].id] = { assignmentId: chosen[0].id, status: 'submitted' };
    await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByText('已提交 · 等待审核 · 查看任务', { exact: true }).waitFor();
    report.push('submitted: visible, not nextPractice');
    delete states[chosen[0].id];
    decision = { ...decision, nextAction: { kind: 'practice', resourceKind: 'assignment', resourceId: chosen[0].id, nodeId: runtime.assignmentCoverages.find(item => item.assignmentId === chosen[0].id).nodeId, reasonCode: 'fixture_practice', reason: 'Fixture supported answer practice' } };
    await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByRole('heading', { name: '当前没有可继续的学习内容', exact: true }).waitFor();
    assert(await page.locator('.navigator-next .atlas-primary').count() === 0, 'Practice never primary');
    await page.locator('.navigator-next-practice button').click();
    assert(await page.getByRole('dialog').isVisible(), 'Practice details');
    await page.keyboard.press('Escape');
    assert(await page.locator('.navigator-next-practice button').evaluate(el => el === document.activeElement), 'Dialog restores keyboard focus');
    report.push('G: Practice never primary; debt and detail focus preserved');
    decision.nextAction = { ...decision.nextAction, resourceKind: 'material', resourceId: runtime.materials[0]?.id, reasonCode: 'material_learning_available' };
    await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByRole('heading', { name: '当前没有可继续的学习内容', exact: true }).waitFor();
    assert(await page.locator('.navigator-next .atlas-primary').count() === 0, 'Material never primary');
    assert(!/学习材料|阅读材料|创建专属学习/.test(await page.locator('.navigator-next').innerText()), 'No resource label or fake generator');
    report.push('C/D: missing learning content, supporting Material never primary; generation deferred');
    decision = { ...decision, path: decision.path.map(item => ({ ...item, state: 'learned' })), nextAction: { kind: 'next', resourceKind: 'course', reasonCode: 'course_route_complete', reason: 'Done' } };
    await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByRole('heading', { name: '当前学习内容已完成', exact: true }).waitFor();
    assert((await page.locator('.navigator-next').innerText()).includes('4 项实训'), 'E: learning done with four debts');
    const allAccepted = Object.fromEntries(runtime.assignments.map(item => [item.id, { assignmentId: item.id, status: 'accepted' }]));
    await hydrate(decision.path.map(item => item.nodeId), allAccepted);
    await page.getByRole('heading', { name: '课程已完成', exact: true }).waitFor();
    assert(await page.getByText('实训全部完成 ✓', { exact: true }).count() === 1, 'F: all learning and practice complete');
    report.push('E/F: truthful completed-learning and fully-complete states');
    setMicro(micro[0]); await hydrate([]);
    await page.getByRole('button', { name: '开始学习', exact: true }).waitFor();
    const locked = page.locator('.navigator-stop.locked .navigator-node').first();
    assert(await locked.getAttribute('aria-disabled') === null, 'Locked nodes are inspectable, not aria-disabled');
    assert((await locked.getAttribute('aria-label')).includes('尚未解锁'), 'Locked label');
    await locked.click();
    await page.locator('.atlas-detail-drawer.open').waitFor();
    const quick = page.locator('.atlas-detail-drawer').getByRole('button', { name: '快速学习', exact: true });
    if (await quick.count()) assert(await quick.isDisabled(), 'Locked detail cannot start learning');
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    report.push('I: locked details inspectable, launch blocked');
    assert(await page.locator('.navigator-chapter').count() > 1, 'F: chapter sections');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.navigator-locate').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'output/playwright/navigator-fixture-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await hydrate(decision.path.map(item => item.nodeId), states);
    await page.locator('.navigator-next-practice button').click();
    const dialogBounds = await page.getByRole('dialog').boundingBox();
    assert(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= 390 && dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= 844, 'Mobile task dialog fits viewport');
    await page.keyboard.press('Escape');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.navigator-node').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
    const bounds = await page.locator('.course-navigator').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
    assert(bounds.content === bounds.width, 'G: no horizontal overflow');
    await page.screenshot({ path: 'output/playwright/navigator-fixture-mobile.png' });
    report.push('F/G: chapter sections, 1440/390, reduced motion, no horizontal overflow');
    fail = true; await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByRole('alert').filter({ hasText: '暂时无法加载下一步' }).waitFor();
    fail = false; await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('button', { name: '开始学习', exact: true }).waitFor();
    report.push('API error: visible failure and successful retry');
    const guestContext = await page.context().browser().newContext();
    const guest = await guestContext.newPage();
    try {
      await guest.goto(`${baseURL}/courses/${courseId}`);
      await guest.locator('.navigator-node').first().click();
      await guest.getByRole('button', { name: '查看课件详情', exact: true }).click();
      await guest.waitForURL('**/materials/**');
      await guest.locator('canvas').first().waitFor();
      report.push('H: real supporting Material opens from Knowledge detail without login or state writes');
    } finally { await guestContext.close(); }

    return report;
  } finally {
    await page.unroute(pattern);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${baseURL}/courses/${courseId}`);
  }
}

// Run against a fresh LOCAL acceptance learner; drives real UI submissions and return.
export async function verifyNavigatorCompletion(page, baseURL = 'http://localhost:5174', courseId = 'ai-agents-in-depth') {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(baseURL)) throw Error('Completion write acceptance is local-only');
  await page.goto(`${baseURL}/courses/${courseId}`);
  await page.getByRole('button', { name: '开始学习', exact: true }).waitFor();
  const path = await page.evaluate(async courseId => {
    const { applicationServices: services } = await import('/src/app/services/applicationServices.ts');
    const decision = await services.learnerStateService.getNavigation(courseId);
    return services.microLearningRepository.getPath(decision.nextAction.nodeId, { courseId, mode: 'learn' });
  }, courseId);
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  for (const step of path.units.flatMap(unit => unit.steps)) {
    const article = page.locator('article:visible');
    await article.getByRole('heading', { name: step.title, exact: true }).waitFor();
    await article.getByText('正在加载互动机制…', { exact: true }).waitFor({ state: 'hidden' });
    if (step.interaction?.type === 'flow-execution') {
      for (let i=0; i<45; i++) {
        const run = article.getByRole('button', { name: '单步 Step', exact: true });
        if (!await run.count() || await run.isDisabled()) break;
        await run.click();
      }
    } else if (step.interaction?.type === 'categorize') {
      for (const [i,item] of step.interaction.items.entries()) {
        await article.getByRole('button', { name: item.label, exact: true }).click();
        await article.getByRole('button', { name: step.interaction.correctCategories[i], exact: true }).click();
      }
    } else if (step.interaction) throw Error(`Extend real UI driver for ${step.interaction.type}`);
    const footer = article.locator('footer');
    const check = footer.getByRole('button', { name: '检查答案', exact: true });
    await (await check.count() ? check : footer.getByRole('button', { name: '继续', exact: true })).click();
    await article.locator('.micro-feedback.success').waitFor();
    await footer.getByRole('button', { name: '继续', exact: true }).click();
  }
  await page.getByRole('button', { name: '返回课程', exact: true }).click();
  await page.getByRole('button', { name: '开始学习', exact: true }).waitFor();
  const result = await page.evaluate(async ({ courseId, nodeId }) => {
    const { applicationServices: services } = await import('/src/app/services/applicationServices.ts');
    const { apiRequest } = await import('/src/shared/api/apiClient.ts');
    const decision = await services.learnerStateService.getNavigation(courseId);
    const progress = await apiRequest('/api/progress');
    return { status: progress.userKnowledge.find(item => item.nodeId === nodeId)?.status, nextNodeId: decision.nextAction.nodeId, completedNodeId: nodeId, policy: decision.policyVersion };
  }, { courseId, nodeId: path.knowledgeId });
  if (result.status !== 'learned' || result.nextNodeId === result.completedNodeId) throw Error('Completion did not advance durable learning and Navigation');
  if (!await page.locator('.navigator-stop.completed').count()) throw Error('Course did not refresh completed presentation');
  return result;
}
