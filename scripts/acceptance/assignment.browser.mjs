// Run after cold-start Micro completion, with the same deliberately clean learner.
export default async function verifyAssignmentLoop(page, baseURL = 'http://localhost:5174', courseId = 'ai-agents-in-depth') {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const errors=[]; const onError=e=>errors.push(e.message); page.on('pageerror',onError);
  const readState = async () => page.evaluate(async () => {
    const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
    const session=JSON.parse(localStorage.getItem(key)); const headers={Authorization:`Bearer ${session.access_token}`};
    const progress=await fetch('/api/progress',{headers}).then(r=>r.json());
    const catalog=await fetch('/api/courses',{headers}).then(r=>r.json());
    return {progress,courses:catalog.courses};
  });
  try {
    await page.goto(`${baseURL}/courses/${courseId}`);
    await page.locator('.navigator-next-practice button').waitFor();
    await page.locator('.navigator-next-practice button').click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'开始实训',exact:true}).waitFor();
    const title=await dialog.getByRole('heading',{level:2}).innerText();
    const data=await readState();const runtime=data.courses.find(item=>item.course.id===courseId);
    const assignment=runtime.assignments.find(item=>item.title===title);assert(assignment,'Actual assignment missing');
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      const box=await dialog.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=901,'Task dialog clipped');
      assert(await dialog.locator(':focus').count()===1,'Modal focus not contained');
    }
    await page.keyboard.press('Escape');assert(!await page.getByRole('dialog').count(),'Escape did not close task');
    assert(await page.locator('.navigator-next-practice button').evaluate(el=>el===document.activeElement),'Task focus not restored');
    await page.locator('.navigator-next-practice button').click();
    await page.getByRole('dialog').getByRole('button',{name:'开始实训',exact:true}).click();
    await page.waitForURL(`**/assignments/${assignment.id}`);
    const experience=assignment.experience??{type:'answer'};
    if(experience.type==='answer') {
      await page.locator('.assignment-experience-body textarea').fill('LLM 负责生成候选行动；Context 提供当前输入和工具观察；Tool 执行受限动作；State 保存跨步骤状态；Runtime 负责调度、验证与终止。模型不能绕过权限直接执行工具，错误由运行层处理。');
      // Reload exercises persisted started state and the continue entry before submitting.
      await page.goto(`${baseURL}/courses/${courseId}`);await page.locator('.navigator-next-practice button').click();
      await page.getByRole('dialog').getByRole('button',{name:'继续实训',exact:true}).click();
      await page.locator('.assignment-experience-body textarea').fill('模型生成候选行动，运行层执行权限检查并调用工具；上下文携带输入与观察，状态保存跨步骤信息，错误和停止条件由运行层处理。');
      await page.getByRole('button',{name:'提交答案',exact:true}).click();
    } else if(experience.type==='trace') {
      const step=experience.traceSteps.find(item=>item.id===experience.faultyStepId);
      await page.locator('.assignment-trace').getByRole('button').filter({hasText:step.label}).click();
      await page.getByRole('button',{name:'提交故障判断',exact:true}).click();
    } else throw Error(`No acceptance driver for ${experience.type}`);
    await page.locator('.assignment-submitted').waitFor();
    assert(!await page.getByRole('button',{name:'继续修改',exact:true}).count(),'Submitted/passed result must not offer restart');
    await page.goto(`${baseURL}/courses/${courseId}`);
    const rows=page.locator('.navigator-backlog button').filter({hasText:assignment.title});
    if(await rows.count()) {
      await rows.first().click();await page.getByRole('dialog').getByRole('button',{name:'查看提交',exact:true}).click();
      await page.locator('.assignment-submitted').waitFor();
    } else {
      await page.goto(`${baseURL}/courses/${courseId}/assignments/${assignment.id}`);await page.locator('.assignment-submitted').waitFor();
    }
    const before=await readState();
    const learned=new Set(before.progress.userKnowledge.filter(k=>['learned','practicing','mastered'].includes(k.status)).map(k=>k.nodeId));
    const blocked=runtime.assignments.find(a=>runtime.assignmentCoverages.some(c=>c.assignmentId===a.id&&!learned.has(c.nodeId)));
    assert(blocked,'Expected actual blocked assignment');
    await page.goto(`${baseURL}/courses/${courseId}/assignments/${blocked.id}`);
    await page.getByRole('heading',{name:'暂时不能开始实训',exact:true}).waitFor();
    assert(await page.locator('.assignment-experience-body textarea').count()===0,'Blocked URL exposed editor');
    const after=await readState();assert(JSON.stringify(before.progress)===JSON.stringify(after.progress),'Blocked direct URL mutated learner progress');
    await page.goto(`${baseURL}/courses/${courseId}`);await page.locator('.navigator-path').waitFor();
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Course overflow');
    }
    assert(!errors.length,errors.join('\n'));
    return {assignmentId:assignment.id,execution:'submitted and viewed',blockedAssignmentId:blocked.id,blockedProgressUnchanged:true,viewports:[1440,390],pageErrors:errors};
  } finally {page.off('pageerror',onError);}
}
