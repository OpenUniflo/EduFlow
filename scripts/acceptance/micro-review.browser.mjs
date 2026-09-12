// Browser regression: run in a fresh anonymous Playwright page against real official course APIs.
// No fixtures, grading stubs or persistent learner resets; returns per-step evidence and rejects review writes.
export default async function verifyMicroReview(page, baseURL = "http://localhost:5173") {
 const report=[]; const writes=[];
 const listener=req=>{if(req.method()==='POST'&&req.url().includes('/api/micro'))writes.push(req.postDataJSON()?.action);};
 page.on('request',listener);
 const active=()=>page.locator('article:visible');
 const button=name=>active().getByRole('button',{name,exact:true});
 const run=async()=>{for(let i=0;i<45;i++){const b=button('单步 Step');if(!await b.count()||await b.isDisabled())break;await b.click();}};
 const submit=async()=>{const b=active().locator('footer').getByRole('button',{name:'检查答案',exact:true});if(await b.count())await b.click();else await active().locator('footer').getByRole('button',{name:'继续',exact:true}).click();await active().locator('.micro-feedback').waitFor();if(await active().locator('.micro-feedback.retry').count())throw Error('Unexpected retry: '+await active().innerText());await button('继续').click();};
 for(const [knowledge,course] of [['RT01','ai-agents-in-depth'],['CDS525-K012','cds525-deep-learning'],['CDS525-K021','cds525-deep-learning']]){
  await page.goto(`${baseURL}/learn/micro/${knowledge}?courseId=${course}`);
  await active().getByRole('heading',{level:1}).waitFor();
  if(!await button('上一步').isDisabled())throw Error('First step permits back');
  let steps=0;
  while(!await active().getByRole('heading',{name:'这条微学习路径已完成'}).count()){
   await page.waitForTimeout(350);
   await active().getByText("正在加载互动机制…",{exact:true}).waitFor({state:"hidden"});
   const title=await active().getByRole('heading',{level:1}).innerText();
   if(await button('单步 Step').count()){
    const slider=active().getByRole('slider');
    if(await slider.count()&&!await slider.isDisabled()) {await slider.focus();await slider.press('Home');for(let i=0;i<14;i++)await slider.press('ArrowRight');}
    if(await button('连接 tool 结果回传').count()){await button('断开 工具直接结束').click();await button('连接 tool 结果回传').click();}
    await button('单步 Step').click();
    const formal=await active().locator('.micro-timeline-controls span').innerText();
    if(!await button('上一步').isDisabled()){
     const before=writes.length;
     const progress=await page.locator(".micro-progress").getAttribute("aria-label");
     await button('上一步').click();
     if(await button('单步 Step').count()){await button('单步 Step').click();await button('重置 Reset').click();}
     await button('返回当前进度').click();
     if(await active().locator('.micro-timeline-controls span').innerText()!==formal)throw Error('Formal interaction lost');
     if(writes.length!==before)throw Error('Review wrote formal progress');
     if(await page.locator(".micro-progress").getAttribute("aria-label")!==progress)throw Error('Progress bar rolled back');
     for(let i=0;i<2;i++){if(await button('上一步').isDisabled())break;await button('上一步').click();}
     await button('返回当前进度').click();
     if(await active().locator('.micro-timeline-controls span').innerText()!==formal)throw Error('Multiple back lost formal interaction');
    }
    await run();
   } else if(await active().locator('.micro-count-matrix').count()) {
    for(let i=0;i<4;i++){await page.waitForTimeout(350);
   await active().getByText("正在加载互动机制…",{exact:true}).waitFor({state:"hidden"});
   const title=await active().locator('.micro-mechanism-cue strong').innerText();const event=title.replace('当前事件：','');await active().getByRole('button',{name:new RegExp('^'+event+':')}).click();}
   }
   await submit();steps++;if(steps>8)throw Error('Navigation loop');report.push({knowledge,title});
  }
  const before=writes.length;
  await button('重新复习').click();
  for(let i=0;i<5;i++)await button('下一步').click();
  if(!await active().getByText('SUMMARY',{exact:false}).count())throw Error('Missing final Summary review');
  await button('上一步').click();
  if(await button('单步 Step').count()){await button('重置 Reset').click();await run();await button('检查答案').click();await button('重置 Reset').click();}
  await button('返回当前进度').click();
  if(writes.length!==before)throw Error('Completed review wrote progress');
  report.push({knowledge,completed:true,reviewWrites:writes.length-before});
 }
 page.off('request',listener);return report;
}


// Checks every real first-chapter path through the existing completed-path review UI.
// Requires an ordinary learner who has completed these paths; never manufactures completion.
export async function verifyGoldenChapterReview(page, baseURL, courseId = 'ai-agents-in-depth') {
  await page.goto(`${baseURL}/courses/${courseId}`);
  await page.locator('.navigator-path').waitFor();
  const paths = await page.evaluate(async courseId => {
    const key = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    const session = key && JSON.parse(localStorage.getItem(key));
    if (!session?.access_token) throw Error('Authenticated review account required');
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [catalog, micro] = await Promise.all(['/api/courses', '/api/micro'].map(url => fetch(url, { headers }).then(response => { if (!response.ok) throw Error('Catalog unavailable'); return response.json(); })));
    const runtime = catalog.courses.find(item => item.course.id === courseId);
    const chapter = [...runtime.chapters].sort((a,b) => a.order-b.order)[0];
    const lessons = new Set(runtime.lessons.filter(item => item.chapterId === chapter.id).map(item => item.id));
    const ids = [...new Set(runtime.curriculumCoverages.filter(item => lessons.has(item.lessonId)).map(item => item.nodeId))];
    return ids.map(id => {
      const path = micro.paths.find(item => item.knowledgeId === id && item.courseId === courseId && item.mode === 'learn') ?? micro.paths.find(item => item.knowledgeId === id && item.scope === 'global' && item.mode === 'learn');
      if (!path || !micro.pathProgress.some(item => item.pathId === path.id && item.status === 'completed')) throw Error(`Real completed path missing for ${id}`);
      return { nodeId: id, steps: path.units.flatMap(unit => unit.steps).map(step => ({ title: step.title, interaction: step.interaction?.type })) };
    });
  }, courseId);
  const writes = []; const listener = request => { if (request.method() === 'POST' && /\/api\/(micro|learning|progress)/.test(request.url())) writes.push(request.url()); };
  page.on('request', listener);
  const report = [];
  try {
    for (const path of paths) {
      await page.goto(`${baseURL}/learn/micro/${encodeURIComponent(path.nodeId)}?courseId=${encodeURIComponent(courseId)}`);
      await page.getByRole('button', { name: '重新复习', exact: true }).click();
      for (let i=0; i<path.steps.length; i++) {
        const article = page.locator('article:visible');
        await article.getByRole('heading', { name: path.steps[i].title, exact: true }).waitFor();
        await article.getByText('正在加载互动机制…', { exact: true }).waitFor({ state: 'hidden' });
        if (await article.getByText('互动机制暂时无法加载', { exact: false }).count()) throw Error('Interaction failed to load');
        await article.getByRole('button', { name: '下一步', exact: true }).click();
      }
      await page.getByRole('button', { name: '返回课程', exact: true }).click();
      await page.locator('.navigator-next h2').waitFor();
      report.push({ nodeId: path.nodeId, reviewedSteps: path.steps.length, returnedToCourse: true });
    }
    if (writes.length) throw Error('Completed-path review wrote learner progress');
    return { paths: report, reviewWrites: writes.length };
  } finally { page.off('request', listener); }
}
