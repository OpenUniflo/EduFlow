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

