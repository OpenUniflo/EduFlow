// Local browser fixtures use the real catalog and read-only repository hydration.
// No learner/course writes. Run with an authenticated local Playwright page.
export default async function verifyCourseNavigator(page, baseURL = 'http://localhost:5174', courseId = 'ai-agents-in-depth') {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(`${baseURL}/courses/${courseId}`);
  await page.locator('.navigator-next .atlas-primary').waitFor();
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
    report.push('A: Micro Next Action / current identity');
    setMicro(micro[1], [micro[0].nodeId]); await hydrate([micro[0].nodeId]);
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
    await page.getByRole('button', { name: '开始实训', exact: true }).waitFor();
    assert(await page.locator('.course-navigator .atlas-primary').count() === 1, 'E: exactly one practice primary');
    await page.locator('.navigator-next-practice button').click();
    assert(await page.getByRole('dialog').isVisible(), 'Practice details');
    await page.keyboard.press('Escape');
    assert(await page.locator('.navigator-next-practice button').evaluate(el => el === document.activeElement), 'Dialog restores keyboard focus');
    report.push('E: supported practice single CTA; detail keyboard focus');
    assert(await page.locator('.navigator-chapter').count() > 1, 'F: chapter sections');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.navigator-locate').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'output/playwright/navigator-fixture-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.navigator-node').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
    const bounds = await page.locator('.course-navigator').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
    assert(bounds.content === bounds.width, 'G: no horizontal overflow');
    await page.screenshot({ path: 'output/playwright/navigator-fixture-mobile.png' });
    report.push('F/G: chapter sections, 1440/390, reduced motion, no horizontal overflow');
    fail = true; await hydrate(decision.path.map(item => item.nodeId), states);
    await page.getByRole('alert').filter({ hasText: '暂时无法加载下一步' }).waitFor();
    fail = false; await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.getByRole('button', { name: '开始实训', exact: true }).waitFor();
    report.push('API error: visible failure and successful retry');
    return report;
  } finally {
    await page.unroute(pattern);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${baseURL}/courses/${courseId}`);
  }
}
