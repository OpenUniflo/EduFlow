// Conversation-interaction regression module (Phase F).
//
// The caller owns the browser, account and login state. This module only drives
// the already-prepared page against the real local application. It never adds
// @playwright/test, never resets learner state and never edits product data.
//
// Covered: six-way wheel scrolling, next-step strip layout, sent-message
// positioning and reply stability, the one running Micro across all six form
// changes, Esc/backdrop return, FLIP end-frame stability, the jump vs action
// bar, conversation-history search/rename/delete and the right-panel width,
// plus the continuous Course route (no folded chapters, stable node
// coordinates, non-overlapping action card, no horizontal overflow, no canvas).

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export default async function verifyConversationRegression(page, options = {}) {
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  const sendPrompt = typeof options === "object" && typeof options.sendPrompt === "string"
    ? options.sendPrompt
    : "请用 8 个要点详细说明什么是 Agent，每个要点写两句。";
  const skipReply = Boolean(typeof options === "object" && options.skipReply);
  const checks = [];
  const failures = [];
  const notes = [];
  const metrics = {};
  const requests = { assistant: 0 };
  let setupError = null;

  function check(id, ok, detail) {
    const entry = { id, ok: Boolean(ok), detail: detail ?? null };
    checks.push(entry);
    if (!ok) failures.push(entry);
    return Boolean(ok);
  }

  function note(text) {
    notes.push(text);
  }

  function onRequest(request) {
    if (request.method() !== "POST" || !/\/api\/assistant(?:\?|$)/.test(request.url())) return;
    // Button actions are server-owned template replies; only a body without
    // an `action` reaches the real model.
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (body && !body.action && Array.isArray(body.messages)) requests.assistant += 1;
  }
  page.on("request", onRequest);

  const readMicroState = () => page.evaluate(() => {
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).display !== "none");
    const zones = [...document.querySelectorAll(".micro-spatial-zone")].map((zone) => ({
      title: zone.querySelector(".micro-zone-title")?.textContent?.trim() ?? "",
      cards: [...zone.querySelectorAll(".micro-spatial-card")].map((card) => card.textContent.trim())
    }));
    const instances = [...document.querySelectorAll(".ef-micro-instance")];
    const shells = [...document.querySelectorAll(".ef-home-micro-shell")];
    return {
      form: [...document.querySelectorAll("[data-micro-form][aria-pressed='true']")].filter(visible).map((button) => button.dataset.microForm)[0] ?? null,
      visibleForms: [...document.querySelectorAll("[data-micro-form][aria-pressed='true']")].filter(visible).map((button) => button.dataset.microForm),
      instances: instances.length,
      visibleInstances: instances.filter(visible).length,
      shells: shells.length,
      visibleShells: shells.filter(visible).length,
      visibleSpatial: [...document.querySelectorAll(".micro-spatial")].filter(visible).length,
      dialogOpen: Boolean(document.querySelector("dialog.ef-micro-focus")?.open),
      zones
    };
  });

  const answerInZone = (state, label, zoneTitle = "Model 决策") => state.zones.some((zone) => zone.title === zoneTitle && zone.cards.some((card) => card.includes(label)));

  const readStepGap = () => page.evaluate(() => {
    const title = document.querySelector(".ef-home-titlebar")?.getBoundingClientRect();
    const frame = document.querySelector(".ef-assistant-micro-frame")?.getBoundingClientRect();
    return title && frame ? { gap: frame.top - title.bottom, frameTop: frame.top, titleBottom: title.bottom } : null;
  });

  async function waitForStepTitleChange(previous, timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const current = await page.locator(".ef-home-micro h1").first().innerText().catch(() => "");
      if (current && current !== previous) return current;
      await sleep(120);
    }
    return page.locator(".ef-home-micro h1").first().innerText().catch(() => "");
  }

  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await page.locator("main.ef-home").waitFor({ timeout: 20000 });

    // A fresh account starts on the welcome surface. "带我从最简单的开始"
    // creates the real starter conversation and its route card (no model call).
    const starter = page.getByRole("button", { name: "带我从最简单的开始", exact: true });
    const routeFrame = page.locator(".ef-assistant-micro-frame[data-card-type='route']").first();
    // Home config is loaded asynchronously; wait for either the starter entry
    // or an already-restored conversation before deciding the surface is empty.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await starter.count() || await routeFrame.count()) break;
      await sleep(250);
    }
    if (await starter.count()) {
      await starter.first().click();
      await routeFrame.waitFor({ timeout: 30000 });
    }
    check("setup.route-card", await routeFrame.count() > 0, { found: await routeFrame.count() });
    if (!(await routeFrame.count())) {
      setupError = "Starter route card did not appear";
      throw new Error(setupError);
    }
    await page.waitForTimeout(1500);

    // ---------------------------------------------------------------------
    // Inline Micro: step-to-step card placement.
    // ---------------------------------------------------------------------
    const openMicro = page.getByRole("button", { name: /^(开始|继续)当前这一步$/ }).first();
    check("setup.micro-entry", await openMicro.count() > 0, { found: await openMicro.count() });
    if (!(await openMicro.count())) {
      setupError = "Starter route card has no current-step entry";
      throw new Error(setupError);
    }
    await openMicro.click();
    await page.locator(".ef-home-micro h1").first().waitFor({ timeout: 20000 });
    await page.locator(".ef-micro-instance").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1200);

    const stepGaps = [];
    let reachedCategorize = false;
    for (let index = 0; index < 24; index += 1) {
      await page.waitForTimeout(250);
      const spatial = page.locator(".micro-spatial:visible");
      if (await spatial.count()) { reachedCategorize = true; break; }
      await page.getByText("正在加载互动机制…", { exact: true }).waitFor({ state: "hidden", timeout: 6000 }).catch(() => undefined);

      const single = page.locator(".ef-home-micro button:visible").filter({ hasText: /^单步$/ });
      if (await single.count() && !(await single.first().isDisabled())) {
        for (let run = 0; run < 60; run += 1) {
          if (!(await single.count()) || await single.first().isDisabled()) break;
          await single.first().click();
          await page.waitForTimeout(70);
        }
        await page.waitForTimeout(350);
        continue;
      }

      const next = page.locator(".ef-home-micro footer button:visible").filter({ hasText: /^继续$/ });
      if (await next.count() && !(await next.first().isDisabled())) {
        const previousTitle = await page.locator(".ef-home-micro h1").first().innerText().catch(() => "");
        await next.first().click();
        const title = await waitForStepTitleChange(previousTitle);
        await page.waitForTimeout(350);
        // A Continue click can first reveal feedback while staying on the same
        // step; only an actual step switch is in scope for the 8px rule.
        if (title && title !== previousTitle) {
          const gap = await readStepGap();
          if (gap) stepGaps.push({ title, ...gap });
        }
        continue;
      }
      await page.waitForTimeout(500);
    }
    check("micro.categorize-reached", reachedCategorize, { stepGaps: stepGaps.length });
    for (const [index, gap] of stepGaps.entries()) {
      check(`micro.step-gap.${index}`, gap.gap >= 7.5, { title: gap.title, ...gap });
    }

    // Keep one real answer: place one categorization card into one zone. Every
    // form change below must preserve exactly this DOM answer.
    const answerLabel = "决定询问用户选哪个日期";
    const availableAnswer = page.getByRole("button", { name: answerLabel, exact: true });
    check("micro.answer-available", await availableAnswer.count() > 0, { label: answerLabel });
    if (await availableAnswer.count()) {
      await availableAnswer.click();
      await page.getByRole("button", { name: "Model 决策", exact: true }).click();
      await page.waitForTimeout(350);
    }
    let microState = await readMicroState();
    check("micro.answer-placed", answerInZone(microState, answerLabel), { zones: microState.zones });
    check("micro.single-instance.initial", microState.instances === 1 && microState.visibleInstances === 1 && microState.visibleShells === 1, microState);

    // ---------------------------------------------------------------------
    // Six directed form changes: answer retained, one instance, FLIP final
    // frame equals the settled frame.
    // ---------------------------------------------------------------------
    const directions = [
      ["inline", "side"],
      ["side", "focus"],
      ["focus", "inline"],
      ["inline", "focus"],
      ["focus", "side"],
      ["side", "inline"]
    ];
    const morphResults = [];
    for (const [from, to] of directions) {
      const before = await readMicroState();
      check(`micro.form-before.${from}-${to}`, before.form === from, { expected: from, got: before.form });
      await page.evaluate(() => {
        const element = document.querySelector(".ef-micro-instance");
        window.__morphSamples = [];
        const started = performance.now();
        const tick = () => {
          if (!element || !element.isConnected) return;
          const box = element.getBoundingClientRect();
          window.__morphSamples.push({
            t: performance.now() - started,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            morphing: element.classList.contains("ef-micro-morphing")
          });
          if (performance.now() - started < 1500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const target = page.locator(`[data-micro-form="${to}"]:visible`).first();
      check(`micro.form-control.${from}-${to}`, await target.count() > 0, { target: to });
      if (await target.count()) await target.click();
      await page.waitForTimeout(950);

      const after = await readMicroState();
      const samples = await page.evaluate(() => window.__morphSamples ?? []);
      const lastMorphing = [...samples].reverse().find((sample) => sample.morphing) ?? null;
      const lastSample = samples.length ? samples[samples.length - 1] : null;
      const delta = lastMorphing && lastSample
        ? Math.max(
            Math.abs(lastMorphing.x - lastSample.x),
            Math.abs(lastMorphing.y - lastSample.y),
            Math.abs(lastMorphing.width - lastSample.width),
            Math.abs(lastMorphing.height - lastSample.height)
          )
        : null;
      morphResults.push({ from, to, delta: delta == null ? null : round(delta, 2), lastMorphing, lastSample });

      check(`micro.form-after.${from}-${to}`, after.form === to, { expected: to, got: after.form });
      check(`micro.answer-retained.${from}-${to}`, answerInZone(after, answerLabel), { zones: after.zones });
      check(`micro.single-instance.${from}-${to}`, after.instances === 1 && after.visibleInstances === 1 && after.visibleShells === 1 && after.visibleSpatial === 1, after);
      check(`micro.flip-end.${from}-${to}`, delta != null && delta <= 1.5, { delta: delta == null ? null : round(delta, 2), lastMorphing, lastSample });
    }
    metrics.morph = morphResults;

    // ---------------------------------------------------------------------
    // Esc and backdrop return to the form that was open before immersive.
    // ---------------------------------------------------------------------
    await page.locator('[data-micro-form="side"]:visible').first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-micro-form="focus"]:visible').first().click();
    await page.waitForTimeout(800);
    let state = await readMicroState();
    check("micro.esc-setup", state.form === "focus" && state.dialogOpen, state);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    state = await readMicroState();
    check("micro.esc-returns-side", state.form === "side" && !state.dialogOpen, state);
    check("micro.esc-answer-retained", answerInZone(state, answerLabel), { zones: state.zones });

    await page.locator('[data-micro-form="inline"]:visible').first().click();
    await page.waitForTimeout(900);
    await page.locator('[data-micro-form="focus"]:visible').first().click();
    await page.waitForTimeout(800);
    state = await readMicroState();
    check("micro.backdrop-setup", state.form === "focus" && state.dialogOpen, state);
    await page.mouse.click(5, 5);
    await page.waitForTimeout(900);
    state = await readMicroState();
    check("micro.backdrop-returns-inline", state.form === "inline" && !state.dialogOpen, state);
    check("micro.backdrop-answer-retained", answerInZone(state, answerLabel), { zones: state.zones });

    // ---------------------------------------------------------------------
    // "回到最新" must never paint over the Micro action bar. Scan the card,
    // then hit-test every visible action button.
    // ---------------------------------------------------------------------
    const scan = [];
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      await page.locator(".ef-home-scroller").evaluate((element, value) => {
        const max = Math.max(0, element.scrollHeight - element.clientHeight);
        element.scrollTop = max * value;
      }, fraction);
      await page.waitForTimeout(350);
      scan.push(await page.evaluate(() => {
        const box = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const scroller = document.querySelector(".ef-home-scroller");
        const footer = document.querySelector(".ef-home-micro footer");
        const jump = document.querySelector(".ef-home-jump");
        const jumpStyle = jump ? getComputedStyle(jump) : null;
        const jumpVisible = Boolean(jump && !jump.hidden && jumpStyle?.display !== "none" && jump.getClientRects().length);
        const footerBox = box(footer);
        const jumpBox = box(jump);
        const viewport = { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
        const footerVisible = Boolean(footerBox && footerBox.bottom > viewport.top && footerBox.top < viewport.bottom);
        const buttons = footer ? [...footer.querySelectorAll("button")].filter((button) => button.getClientRects().length).map((button) => {
          const rect = button.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y)?.closest("button");
          return { label: button.textContent.trim() || button.getAttribute("aria-label") || "", hit: hit === button, x, y };
        }) : [];
        return {
          scrollTop: scroller?.scrollTop ?? 0,
          maxScroll: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
          footerVisible,
          jumpVisible,
          jumpHiddenByState: scroller?.dataset.microJumpHidden ?? null,
          overlap: footerVisible && jumpVisible ? Math.min(footerBox.right, jumpBox.right) - Math.max(footerBox.left, jumpBox.left) : 0,
          overlapHeight: footerVisible && jumpVisible ? Math.min(footerBox.bottom, jumpBox.bottom) - Math.max(footerBox.top, jumpBox.top) : 0,
          buttons
        };
      }));
    }
    const visibleActionButtons = scan.flatMap((entry) => entry.buttons);
    const jumpOverlap = scan.filter((entry) => entry.footerVisible && entry.jumpVisible && entry.overlap > 0.5 && entry.overlapHeight > 0.5);
    check("micro.jump-no-overlap", jumpOverlap.length === 0, { samples: scan.length, overlaps: jumpOverlap });
    check("micro.jump-hidden-with-bar", scan.every((entry) => !entry.footerVisible || !entry.jumpVisible || entry.jumpHiddenByState === "1"), scan.map((entry) => ({ footerVisible: entry.footerVisible, jumpVisible: entry.jumpVisible, hidden: entry.jumpHiddenByState })));
    check("micro.action-buttons-hit", visibleActionButtons.length > 0 && visibleActionButtons.every((button) => button.hit), { samples: visibleActionButtons });
    metrics.microJump = scan;

    // Close the inline Micro before the route and conversation checks.
    const collapse = page.getByRole("button", { name: "收起小练习", exact: true });
    check("setup.micro-collapse", await collapse.count() > 0, { found: await collapse.count() });
    if (await collapse.count()) await collapse.first().click();
    await page.waitForTimeout(1200);
    check("micro.closed", !(await page.locator(".ef-home-micro:visible").count()), { visible: await page.locator(".ef-home-micro:visible").count() });

    // ---------------------------------------------------------------------
    // Course route: every chapter on one road, stable nodes, safe action card.
    // ---------------------------------------------------------------------
    const routeOpen = routeFrame.getByRole("button", { name: "查看完整路线", exact: true }).first();
    check("setup.route-open-control", await routeOpen.count() > 0, { found: await routeOpen.count() });
    if (await routeOpen.count()) {
      await routeOpen.click();
      await page.locator(".ef-home-route-panel").waitFor({ timeout: 15000 });
      await page.locator(".ef-imm-route-step").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(1000);
    }
    const panel = page.locator(".ef-home-route-panel");
    const routeReady = await panel.count() > 0;
    check("route.open", routeReady, { found: await panel.count() });

    if (routeReady) {
      const summary = await panel.locator(".ef-home-route-panel-subtitle").innerText();
      const chapterCount = Number(summary.match(/共\s*(\d+)\s*章/)?.[1] ?? NaN);
      const routeShape = await page.evaluate(() => {
        const view = document.querySelector(".ef-imm-route-view");
        const panelElement = document.querySelector(".ef-home-route-panel");
        return {
          chapters: document.querySelectorAll(".ef-imm-route-chapter").length,
          sections: document.querySelectorAll(".ef-imm-route-chapter-section").length,
          steps: document.querySelectorAll(".ef-imm-route-step").length,
          labels: document.querySelectorAll(".ef-imm-route-label").length,
          folded: panelElement?.querySelectorAll(".ef-imm-route-chapter-toggle, .ef-imm-route-fold, details, [data-folded='true'], [aria-expanded]").length ?? 0,
          view: view ? { clientWidth: view.clientWidth, scrollWidth: view.scrollWidth, clientHeight: view.clientHeight, scrollHeight: view.scrollHeight } : null,
          document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, innerWidth },
          canvas: panelElement?.querySelectorAll("canvas").length ?? 0,
          pageCanvas: document.querySelectorAll("canvas").length,
          history: document.querySelector("main.ef-home")?.dataset.history
        };
      });
      check("route.chapters-all-expanded", Number.isFinite(chapterCount) && routeShape.chapters === chapterCount && routeShape.sections === chapterCount, { chapterCount, ...routeShape });
      check("route.steps-complete", routeShape.steps > 0 && routeShape.steps === routeShape.labels && routeShape.folded === 0, routeShape);
      check("route.no-horizontal-overflow", routeShape.view && routeShape.view.scrollWidth <= routeShape.view.clientWidth + 1 && routeShape.document.scrollWidth <= routeShape.document.innerWidth + 1, routeShape);
      check("route.no-canvas", routeShape.canvas === 0 && routeShape.pageCanvas === 0, routeShape);
      check("route.history-auto-collapsed", routeShape.history === "closed", { history: routeShape.history });

      const positions = () => page.evaluate(() => [...document.querySelectorAll(".ef-imm-route-step")].map((element) => ({
        left: element.style.left,
        top: element.style.top,
        offsetLeft: element.offsetLeft,
        offsetTop: element.offsetTop
      })));
      const routeOverlap = () => page.evaluate(() => {
        const card = document.querySelector(".ef-imm-route-action");
        if (!card) return { visible: false, overlaps: [] };
        const cardRect = card.getBoundingClientRect();
        const overlaps = [];
        for (const element of document.querySelectorAll(".ef-imm-route-step, .ef-imm-route-label, .ef-imm-route-chapter")) {
          const rect = element.getBoundingClientRect();
          const width = Math.min(cardRect.right, rect.right) - Math.max(cardRect.left, rect.left);
          const height = Math.min(cardRect.bottom, rect.bottom) - Math.max(cardRect.top, rect.top);
          if (width > 1 && height > 1) overlaps.push({ className: element.className, text: (element.textContent ?? "").trim().slice(0, 32), width: Math.round(width), height: Math.round(height) });
        }
        return { visible: card.getClientRects().length > 0, card: { left: Math.round(cardRect.left), top: Math.round(cardRect.top), width: Math.round(cardRect.width), height: Math.round(cardRect.height) }, overlaps };
      });

      const beforePositions = await positions();
      const candidates = await page.evaluate(() => {
        const current = document.querySelector(".ef-imm-route-step[aria-current='step']");
        return [...document.querySelectorAll(".ef-imm-route-step")].map((element, index) => {
          const rect = element.getBoundingClientRect();
          return { index, current: element === current, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top, bottom: rect.bottom };
        });
      });
      const viewportHeight = page.viewportSize()?.height ?? 900;
      const target = candidates.find((candidate) => !candidate.current && candidate.top > 80 && candidate.bottom < viewportHeight - 120)
        ?? candidates.find((candidate) => candidate.top > 80 && candidate.bottom < viewportHeight)
        ?? candidates[0];
      if (target) await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(600);
      const afterPositions = await positions();
      check("route.selection-keeps-node-coordinates", JSON.stringify(beforePositions) === JSON.stringify(afterPositions), { before: beforePositions.length, after: afterPositions.length, changed: beforePositions.findIndex((value, index) => JSON.stringify(value) !== JSON.stringify(afterPositions[index])) });
      const selectedIndex = await panel.locator(".ef-imm-route-action").getAttribute("data-route-action-index").catch(() => null);
      check("route.action-card-follows-selection", target != null && selectedIndex === String(target.index), { target: target?.index ?? null, selectedIndex });
      let routeCard = await routeOverlap();
      check("route.action-card-no-intersection", routeCard.visible && routeCard.overlaps.length === 0, routeCard);

      // Page form: same nodes, no reflow into horizontal overflow, still SVG-only.
      const pageButton = panel.getByRole("button", { name: "整页", exact: true });
      if (await pageButton.count()) {
        await pageButton.click();
        await page.waitForTimeout(1000);
        const mode = await panel.getAttribute("data-at");
        const pageShape = await page.evaluate(() => {
          const view = document.querySelector(".ef-imm-route-view");
          return {
            mode: document.querySelector(".ef-home-route-panel")?.dataset.at,
            steps: document.querySelectorAll(".ef-imm-route-step").length,
            chapters: document.querySelectorAll(".ef-imm-route-chapter").length,
            canvas: document.querySelectorAll(".canvas, canvas").length,
            view: view ? { clientWidth: view.clientWidth, scrollWidth: view.scrollWidth } : null,
            document: { scrollWidth: document.documentElement.scrollWidth, innerWidth }
          };
        });
        const pagePositions = await positions();
        check("route.page-mode", mode === "page" && pageShape.mode === "page", { mode });
        check("route.page-no-horizontal-overflow", pageShape.view && pageShape.view.scrollWidth <= pageShape.view.clientWidth + 1 && pageShape.document.scrollWidth <= pageShape.document.innerWidth + 1, pageShape);
        check("route.page-no-canvas", pageShape.canvas === 0, pageShape);
        check("route.page-same-coordinates", JSON.stringify(pagePositions) === JSON.stringify(afterPositions), { before: afterPositions.length, after: pagePositions.length });
        routeCard = await routeOverlap();
        check("route.page-action-card-no-intersection", routeCard.visible && routeCard.overlaps.length === 0, routeCard);
        const sideButton = panel.getByRole("button", { name: "侧边", exact: true });
        if (await sideButton.count()) await sideButton.click();
        await page.waitForTimeout(700);
      }
      const closeRoute = panel.getByRole("button", { name: "关闭路线面板", exact: true });
      if (await closeRoute.count()) await closeRoute.click();
      await page.locator(".ef-home-route-panel").waitFor({ state: "detached", timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(900);
    }

    // ---------------------------------------------------------------------
    // Send one real message. The user turn is pinned under the title bar and
    // the pinned scroll position survives the whole streamed reply.
    // ---------------------------------------------------------------------
    const scroller = page.locator(".ef-home-scroller");
    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(900);
    if (skipReply) {
      note("skipReply=true：本次运行只验证非回复路径，不发送真实消息。");
    } else {
      const userRowsBefore = await page.locator(".ef-home-message-row[data-role='user']").count();
      const requestBefore = requests.assistant;
      await page.evaluate(() => {
        const element = document.querySelector(".ef-home-scroller");
        window.__replyTrace = [];
        window.__replyTraceTimer = window.setInterval(() => {
          const users = [...document.querySelectorAll(".ef-home-message-row[data-role='user']")];
          const user = users[users.length - 1];
          const assistants = [...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")];
          const assistant = assistants[assistants.length - 1];
          window.__replyTrace.push({
            t: performance.now(),
            scrollTop: element ? element.scrollTop : 0,
            scrollHeight: element ? element.scrollHeight : 0,
            sending: document.querySelector(".ef-assistant-timeline")?.dataset.sending ?? null,
            userTop: user ? user.getBoundingClientRect().top : null,
            assistantText: assistant?.textContent?.length ?? 0
          });
        }, 80);
      });
      const composer = page.getByRole("textbox", { name: "给助手发消息" });
      await composer.fill(sendPrompt);
      const send = page.getByRole("button", { name: "发送", exact: true });
      check("reply.send-control", await send.count() > 0, { found: await send.count() });
      if (await send.count()) await send.click();

      const userDeadline = Date.now() + 20000;
      while (Date.now() < userDeadline) {
        if (await page.locator(".ef-home-message-row[data-role='user']").count() > userRowsBefore) break;
        await sleep(150);
      }
      await page.waitForTimeout(350);
      const sentMetrics = await page.evaluate(() => {
        const users = [...document.querySelectorAll(".ef-home-message-row[data-role='user']")];
        const user = users[users.length - 1];
        const title = document.querySelector(".ef-home-titlebar")?.getBoundingClientRect();
        const element = document.querySelector(".ef-home-scroller");
        return {
          userTop: user ? user.getBoundingClientRect().top : null,
          titleBottom: title ? title.bottom : null,
          scrollTop: element ? element.scrollTop : null,
          maxScroll: element ? element.scrollHeight - element.clientHeight : null,
          sending: document.querySelector(".ef-assistant-timeline")?.dataset.sending ?? null
        };
      });
      check("reply.user-pinned-below-title", sentMetrics.userTop != null && sentMetrics.titleBottom != null && sentMetrics.userTop >= sentMetrics.titleBottom + 7 && sentMetrics.userTop <= sentMetrics.titleBottom + 48, sentMetrics);
      metrics.reply = { sentMetrics };

      await page.waitForFunction(() => {
        const timeline = document.querySelector(".ef-assistant-timeline");
        return timeline?.dataset.sending === "false" && !document.querySelector(".ef-ui-send.is-stop");
      }, undefined, { timeout: 180000 }).catch(() => undefined);
      await page.waitForTimeout(1300);
      const trace = await page.evaluate(() => {
        window.clearInterval(window.__replyTraceTimer);
        return window.__replyTrace ?? [];
      });
      const sendingEntries = trace.filter((entry) => entry.sending === "true");
      const stableEntries = sendingEntries.slice(3);
      const scrollValues = stableEntries.map((entry) => entry.scrollTop).filter((value) => Number.isFinite(value));
      const userValues = stableEntries.map((entry) => entry.userTop).filter((value) => Number.isFinite(value));
      const finalMetrics = await page.evaluate(() => {
        const users = [...document.querySelectorAll(".ef-home-message-row[data-role='user']")];
        const user = users[users.length - 1];
        const element = document.querySelector(".ef-home-scroller");
        const assistant = document.querySelector(".ef-assistant-timeline")?.dataset.sending ?? null;
        return {
          userTop: user ? user.getBoundingClientRect().top : null,
          scrollTop: element ? element.scrollTop : null,
          sending: assistant,
          assistantTurns: document.querySelectorAll(".ef-assistant-turn[data-role='assistant']").length,
          stopVisible: Boolean(document.querySelector(".ef-ui-send.is-stop")),
          lastAssistantText: ([...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")].pop()?.textContent ?? "").trim().length
        };
      });
      const scrollRange = scrollValues.length ? Math.max(...scrollValues) - Math.min(...scrollValues) : null;
      const userRange = userValues.length ? Math.max(...userValues) - Math.min(...userValues) : null;
      const replyError = await page.locator(".ef-home-error").allInnerTexts();
      check("reply.completed", finalMetrics.sending === "false" && !finalMetrics.stopVisible && finalMetrics.assistantTurns > 0 && finalMetrics.lastAssistantText > 20, finalMetrics);
      check("reply.no-error", replyError.length === 0, { error: replyError });
      check("reply.no-scroll-jump", scrollRange != null && scrollRange <= 2, { samples: sendingEntries.length, range: scrollRange, first: scrollValues[0] ?? null, last: scrollValues[scrollValues.length - 1] ?? null });
      check("reply.user-does-not-move", userRange != null && userRange <= 2, { samples: userValues.length, range: userRange });
      check("reply.one-real-request", requests.assistant - requestBefore === 1, { before: requestBefore, after: requests.assistant });
      metrics.reply.trace = { samples: trace.length, sending: sendingEntries.length, scrollRange, userRange, finalMetrics };
    }

    // ---------------------------------------------------------------------
    // Six wheel positions all scroll the one conversation scroller.
    // ---------------------------------------------------------------------
    await page.waitForTimeout(800);
    if (skipReply) {
      note("skipReply=true：没有回复内容，跳过六处滚轮滚动检查。");
    } else {
      const points = await page.evaluate(() => {
        const scroller = document.querySelector(".ef-home-scroller").getBoundingClientRect();
        const timeline = document.querySelector(".ef-home-timeline").getBoundingClientRect();
        const title = document.querySelector(".ef-home-titlebar").getBoundingClientRect();
        const composer = document.querySelector(".ef-home-composer").getBoundingClientRect();
        const center = (timeline.left + timeline.right) / 2;
        return [
          { name: "left-margin", x: scroller.left + 12, y: (scroller.top + scroller.bottom) / 2 },
          { name: "right-margin", x: scroller.right - 12, y: (scroller.top + scroller.bottom) / 2 },
          { name: "title-bar", x: center, y: title.top + 20 },
          { name: "content", x: center, y: Math.min(scroller.bottom - 100, title.bottom + 140) },
          { name: "composer", x: center, y: composer.top + 25 },
          { name: "bottom", x: center, y: composer.bottom - 5 }
        ];
      });
      const wheelResults = [];
      for (const point of points) {
        await scroller.evaluate((element) => {
          const max = Math.max(0, element.scrollHeight - element.clientHeight);
          element.scrollTop = Math.min(300, Math.max(0, max - 100));
        });
        await page.waitForTimeout(250);
        const before = await page.evaluate(() => ({
          scrollTop: document.querySelector(".ef-home-scroller").scrollTop,
          windowY: window.scrollY,
          documentY: document.documentElement.scrollTop
        }));
        await page.mouse.move(point.x, point.y);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({
          scrollTop: document.querySelector(".ef-home-scroller").scrollTop,
          windowY: window.scrollY,
          documentY: document.documentElement.scrollTop
        }));
        const hit = await page.evaluate(([x, y]) => {
          const target = document.elementFromPoint(x, y);
          const scrollerElement = document.querySelector(".ef-home-scroller");
          return { tag: target?.tagName ?? null, className: String(target?.className ?? "").slice(0, 80), inside: Boolean(target && scrollerElement?.contains(target)) };
        }, [point.x, point.y]);
        wheelResults.push({ ...point, before, after, hit });
      }
      const wheelMoved = wheelResults.filter((entry) => entry.after.scrollTop < entry.before.scrollTop - 30);
      const wheelStableWindow = wheelResults.every((entry) => entry.after.windowY === entry.before.windowY && entry.after.documentY === entry.before.documentY);
      const wheelInside = wheelResults.every((entry) => entry.hit.inside);
      check("scroll.six-wheel-points", wheelMoved.length === 6, { moved: wheelMoved.length, results: wheelResults });
      check("scroll.same-scroller", wheelStableWindow && wheelInside, { wheelStableWindow, wheelInside, results: wheelResults });
      metrics.wheel = wheelResults;
    }

    // ---------------------------------------------------------------------
    // Next-step strip visibility must not change scroll range or composer.
    // The actual strip may stay suppressed while the next-step card is in
    // view, so the layout invariant is also measured by toggling its hidden
    // attribute at a fixed scroll position.
    // ---------------------------------------------------------------------
    const strip = page.locator(".ef-home-strip-anchor");
    const stripPresentation = await page.evaluate(() => {
      const anchor = document.querySelector(".ef-home-strip-anchor");
      const scrollerElement = document.querySelector(".ef-home-scroller");
      const composerElement = document.querySelector(".ef-home-composer");
      return anchor ? {
        present: true,
        hidden: anchor.hidden,
        scrollHeight: scrollerElement.scrollHeight,
        composerTop: composerElement.getBoundingClientRect().top,
        scrollTop: scrollerElement.scrollTop,
        text: anchor.textContent.trim().slice(0, 80)
      } : { present: false };
    });
    check("strip.present", stripPresentation.present, stripPresentation);
    if (stripPresentation.present) {
      await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await page.waitForTimeout(600);
      const beforeToggle = await page.evaluate(() => {
        const anchor = document.querySelector(".ef-home-strip-anchor");
        const scrollerElement = document.querySelector(".ef-home-scroller");
        const composerElement = document.querySelector(".ef-home-composer");
        return { hidden: anchor.hidden, scrollHeight: scrollerElement.scrollHeight, composerTop: composerElement.getBoundingClientRect().top, scrollTop: scrollerElement.scrollTop };
      });
      await strip.evaluate((element) => { element.hidden = false; });
      await page.waitForTimeout(350);
      const shown = await page.evaluate(() => {
        const anchor = document.querySelector(".ef-home-strip-anchor");
        const scrollerElement = document.querySelector(".ef-home-scroller");
        const composerElement = document.querySelector(".ef-home-composer");
        return { hidden: anchor.hidden, scrollHeight: scrollerElement.scrollHeight, composerTop: composerElement.getBoundingClientRect().top, scrollTop: scrollerElement.scrollTop };
      });
      await strip.evaluate((element) => { element.hidden = true; });
      await page.waitForTimeout(350);
      const hidden = await page.evaluate(() => {
        const anchor = document.querySelector(".ef-home-strip-anchor");
        const scrollerElement = document.querySelector(".ef-home-scroller");
        const composerElement = document.querySelector(".ef-home-composer");
        return { hidden: anchor.hidden, scrollHeight: scrollerElement.scrollHeight, composerTop: composerElement.getBoundingClientRect().top, scrollTop: scrollerElement.scrollTop };
      });
      check("strip.visibility-keeps-range", beforeToggle.scrollHeight === shown.scrollHeight && shown.scrollHeight === hidden.scrollHeight, { beforeToggle, shown, hidden });
      check("strip.visibility-keeps-composer", Math.abs(beforeToggle.composerTop - shown.composerTop) < 1 && Math.abs(beforeToggle.composerTop - hidden.composerTop) < 1, { beforeToggle, shown, hidden });
      check("strip.visibility-keeps-scroll-top", beforeToggle.scrollTop === shown.scrollTop && shown.scrollTop === hidden.scrollTop, { beforeToggle, shown, hidden });
      metrics.strip = { beforeToggle, shown, hidden, actualHidden: stripPresentation.hidden };
      await strip.evaluate((element, originalHidden) => { element.hidden = originalHidden; }, stripPresentation.hidden);
      await page.waitForTimeout(200);
    }

    // ---------------------------------------------------------------------
    // Conversation history: literal LIKE escaping, rename, delete confirmation,
    // and the right panel collapsing the column without narrowing below 640.
    // ---------------------------------------------------------------------
    if ((await page.locator("main.ef-home").getAttribute("data-history")) === "closed") {
      const expand = page.getByRole("button", { name: "展开对话记录", exact: true });
      if (await expand.count()) await expand.first().click();
      await page.waitForTimeout(600);
    }
    const search = page.getByRole("searchbox", { name: "搜索对话" });
    check("history.search-present", await search.count() > 0, { found: await search.count() });
    const titleBefore = (await page.locator(".ef-history-pick").first().innerText().catch(() => "")).trim();
    const searchCase = async (query) => {
      await search.fill(query);
      await page.waitForTimeout(800);
      return {
        query,
        rows: await page.locator(".ef-history-row").count(),
        picks: await page.locator(".ef-history-pick").allInnerTexts(),
        empty: await page.locator(".ef-history-empty").allInnerTexts()
      };
    };
    const percentSearch = await searchCase("%");
    const underscoreSearch = await searchCase("_");
    check("history.search-percent-literal", percentSearch.rows === 0, percentSearch);
    check("history.search-underscore-literal", underscoreSearch.rows === 0, underscoreSearch);
    const titleSearch = await searchCase(titleBefore.slice(0, Math.min(4, titleBefore.length)));
    check("history.search-title", titleSearch.rows >= 1 && titleSearch.picks.some((title) => title.includes(titleBefore.slice(0, 4))), titleSearch);
    await search.fill("");
    await page.waitForTimeout(800);

    const currentTitle = `ConvF ${Date.now().toString(36).slice(-5)} 100%_literal`;
    const more = page.locator(".ef-history-more").first();
    check("history.rename-control", await more.count() > 0, { found: await more.count() });
    if (await more.count()) {
      await more.click();
      await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
      await page.locator(".ef-history-rename").waitFor({ timeout: 5000 });
      await page.locator(".ef-history-rename").fill(currentTitle);
      await page.getByRole("button", { name: "保存名称", exact: true }).click();
      await page.waitForTimeout(1000);
    }
    const renamed = (await page.locator(".ef-history-pick").allInnerTexts()).map((title) => title.trim());
    check("history.rename", renamed.includes(currentTitle), { currentTitle, renamed });

    // Opening the right panel must auto-collapse history, keeping the
    // conversation column at least 640px at both required widths.
    const my = page.getByRole("button", { name: "我的", exact: true });
    check("history.panel-control", await my.count() > 0, { found: await my.count() });
    if (await my.count()) {
      await my.first().click();
      await page.locator("#ef-my-panel").waitFor({ timeout: 10000 });
      await page.waitForTimeout(900);
      const panelState = await page.evaluate(() => {
        const main = document.querySelector("main.ef-home");
        const timeline = document.querySelector(".ef-home-timeline")?.getBoundingClientRect();
        const panel = document.querySelector("#ef-my-panel")?.getBoundingClientRect();
        return { history: main?.dataset.history, timelineWidth: timeline?.width ?? null, panelWidth: panel?.width ?? null };
      });
      check("history.panel-auto-collapses", panelState.history === "closed", panelState);
      check("history.panel-conversation-width", panelState.timelineWidth != null && panelState.timelineWidth >= 640, panelState);
      await page.keyboard.press("Escape");
      await page.locator("#ef-my-panel").waitFor({ state: "detached", timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(900);
      const restored = await page.evaluate(() => ({
        history: document.querySelector("main.ef-home")?.dataset.history,
        timelineWidth: document.querySelector(".ef-home-timeline")?.getBoundingClientRect().width ?? null
      }));
      check("history.panel-restores-history", restored.history === "open", restored);
    }

    // Delete is destructive: first cancel the confirmation, then delete the
    // only disposable conversation and assert a truthful empty state.
    const deleteFlow = async (confirm) => {
      await page.locator(".ef-history-more").first().click();
      await page.getByRole("menuitem", { name: "删除", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 5000 });
      const title = await dialog.innerText();
      if (confirm) {
        await dialog.getByRole("button", { name: "删除对话", exact: true }).click();
      } else {
        await dialog.getByRole("button", { name: "取消", exact: true }).click();
      }
      await page.waitForTimeout(900);
      return { title, rows: await page.locator(".ef-history-row").count(), dialog: await dialog.count() };
    };
    const cancelDelete = await deleteFlow(false);
    check("history.delete-confirmation", cancelDelete.title.includes("删除这个对话？") && cancelDelete.dialog === 0 && cancelDelete.rows === 1, cancelDelete);
    const confirmDelete = await deleteFlow(true);
    check("history.delete-confirmed", confirmDelete.dialog === 0 && confirmDelete.rows === 0, confirmDelete);
    const emptyState = await page.evaluate(() => ({
      empty: document.querySelector(".ef-history-empty")?.textContent?.trim() ?? "",
      view: document.querySelector("main.ef-home")?.dataset.view ?? null,
      fresh: Boolean(document.querySelector(".ef-home-fresh")),
      hasText: Boolean((document.querySelector("main.ef-home")?.textContent ?? "").trim().length)
    }));
    check("history.delete-leaves-usable-state", confirmDelete.rows === 0 && (emptyState.fresh || emptyState.hasText), emptyState);

    metrics.history = { percentSearch, underscoreSearch, titleSearch, renamed, cancelDelete, confirmDelete, emptyState };
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
    note(`运行中止：${setupError}`);
  } finally {
    page.off("request", onRequest);
  }

  return {
    ok: failures.length === 0 && !setupError,
    setupError,
    baseURL,
    checks,
    failures,
    notes,
    metrics,
    requests
  };
}
