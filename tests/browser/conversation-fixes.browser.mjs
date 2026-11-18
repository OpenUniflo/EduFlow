// Phase F follow-up regression: completion return, completed-card projection,
// and the no-message conversation state. The caller supplies an authenticated
// Page; this module never starts a browser, adds no dependency and never alters
// persisted assistant content.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CATEGORY = [
  ["决定询问用户选哪个日期", "Model 决策"],
  ["维护“已查询，等待选日期”的任务记录", "Harness 运行与管理"],
  ["把查询结果与待选日期组织给模型", "Harness 运行与管理"],
  ["航空公司的数据库实际保存了订单", "Environment 外部事实"]
];

function createChecks() {
  const checks = [];
  const failures = [];
  const metrics = {};
  const notes = [];
  const check = (id, ok, detail) => {
    const entry = { id, ok: Boolean(ok), detail: detail ?? null };
    checks.push(entry);
    if (!ok) failures.push(entry);
    return Boolean(ok);
  };
  const note = (text) => notes.push(text);
  return { checks, failures, metrics, notes, check, note };
}

async function waitForHome(page) {
  await page.locator("main.ef-home").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function waitClosed(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("main.ef-home");
    const dialog = document.querySelector("dialog.ef-micro-focus");
    return main?.dataset.microForm === "closed" && !dialog?.open;
  }, undefined, { timeout: 15000 });
  await page.waitForTimeout(600);
}

function rootFor(page, kind) {
  if (kind === "focus") return page.locator("dialog.ef-micro-focus .ef-micro-instance");
  if (kind === "side") return page.locator(".ef-micro-side .ef-micro-instance");
  return page.locator(".ef-home-micro");
}

async function completeMicro(page, root, options = {}) {
  for (let step = 0; step < 30; step += 1) {
    if (!(await root.count()) || !(await root.first().isVisible().catch(() => false))) return { completed: true, steps: step };
    const card = root.first();
    if (options.stopTitle) {
      const title = await card.locator("h1").first().innerText().catch(() => "");
      if (title.trim() === options.stopTitle) return { completed: false, stopped: true, steps: step };
    }
    await page.getByText("正在加载互动机制…", { exact: true }).waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);

    const single = card.getByRole("button", { name: "单步", exact: true });
    let ran = 0;
    while (ran < 50 && await single.count() && await single.first().isEnabled().catch(() => false)) {
      await single.first().click();
      ran += 1;
      await sleep(60);
    }
    if (ran) await sleep(250);

    if (await card.locator(".micro-spatial-zone").count()) {
      for (const [item, zone] of CATEGORY) {
        const itemButton = card.locator(".micro-spatial-card").getByRole("button", { name: item, exact: true });
        if (!(await itemButton.count())) continue;
        await itemButton.first().click();
        await sleep(60);
        const zoneButton = card.locator(".micro-spatial-zone").getByRole("button", { name: zone, exact: true });
        if (await zoneButton.count()) await zoneButton.first().click();
        await sleep(60);
      }
    }

    const footer = card.locator(".ef-micro-foot, .micro-card footer").last();
    if (!(await footer.count())) return { completed: false, reason: "no-footer", step };
    let last = footer.getByRole("button").last();
    if (!(await last.count())) return { completed: false, reason: "no-action", step };
    let text = (await last.innerText().catch(() => "")).trim();

    if (text.startsWith("检查答案")) {
      const choice = card.locator(".micro-interaction.choice button");
      if (await choice.count()) {
        for (let index = 0; index < 8; index += 1) {
          const options = card.locator(".micro-interaction.choice button");
          if (index >= await options.count()) break;
          await options.nth(index).click();
          await sleep(80);
          last = footer.getByRole("button").last();
          if ((await last.innerText().catch(() => "")).startsWith("检查答案")) {
            await last.click();
            await sleep(700);
          }
          if (await card.locator(".micro-feedback.success").count()) break;
          if (!(await card.locator(".micro-feedback.retry").count())) break;
        }
      } else {
        await last.click();
        await sleep(700);
      }
      last = footer.getByRole("button").last();
      text = (await last.innerText().catch(() => "")).trim();
      if (text.startsWith("检查答案")) return { completed: false, reason: "check-stuck", step, text };
    }

    last = footer.getByRole("button").last();
    text = (await last.innerText().catch(() => "")).trim();
    if (await last.isEnabled().catch(() => false)) {
      await last.click();
      await sleep(800);
    } else {
      await sleep(300);
    }
  }
  return { completed: false, reason: "loop" };
}

async function openStarterRoute(page) {
  const starter = page.getByRole("button", { name: "带我从最简单的开始", exact: true });
  if (await starter.count()) await starter.first().click();
  const route = page.locator(".ef-assistant-micro-frame[data-card-type='route']").first();
  await route.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  return route;
}

async function openRouteStep(page, route, kind = "inline") {
  const primary = route.getByRole("button", { name: /^(开始|继续)当前这一步$/ }).first();
  await primary.click();
  if (kind === "focus") {
    await page.locator('[data-micro-form="focus"]:visible').first().click();
    await page.locator("dialog.ef-micro-focus[open]").waitFor({ timeout: 10000 });
  } else if (kind === "side") {
    await page.locator('[data-micro-form="side"]:visible').first().click();
    await page.locator(".ef-micro-side .ef-micro-instance").waitFor({ timeout: 10000 });
  } else {
    await page.locator(".ef-home-micro").waitFor({ timeout: 10000 });
  }
  await page.waitForTimeout(1000);
}

async function frameFor(page, pathId) {
  // The route card also carries the current step's path id. Prefer the
  // concrete Micro/Knowledge card, which owns the per-path primary controls.
  const specific = page.locator(`.ef-assistant-micro-frame[data-path-id="${pathId}"]:not([data-card-type='route'])`).first();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await specific.count()) return specific;
    await sleep(200);
  }
  return page.locator(`.ef-assistant-micro-frame[data-path-id="${pathId}"]`).first();
}

async function recordCounts(page) {
  const counts = new Map();
  const listener = (request) => {
    if (request.method() !== "POST" || !/\/api\/assistant(?:\?|$)/.test(request.url())) return;
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (body?.kind === "micro-completed" && typeof body.pathId === "string") {
      counts.set(body.pathId, (counts.get(body.pathId) ?? 0) + 1);
    }
  };
  page.on("request", listener);
  return { counts, stop: () => page.off("request", listener) };
}

function compactCount(page, text) {
  return page.locator(".ef-card-compact").filter({ hasText: text }).count();
}


async function readFollowGeometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom) };
    };
    const title = document.querySelector(".ef-home-titlebar");
    const composer = document.querySelector(".ef-home-composer");
    const strip = document.querySelector(".ef-home-next-strip");
    const stripVisible = Boolean(strip && strip.getClientRects().length);
    const turns = [...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")];
    const cards = [...document.querySelectorAll(".ef-ui-conversation-card")];
    const turn = turns.length ? turns[turns.length - 1] : null;
    const card = cards.length ? cards[cards.length - 1] : null;
    const route = [...document.querySelectorAll(".ef-assistant-micro-frame[data-card-type='route']")].find((frame) => frame.querySelector(".ef-card-compact"));
    return {
      titleBottom: rect(title)?.bottom ?? 0,
      composerTop: rect(composer)?.top ?? innerHeight,
      stripVisible,
      stripTop: stripVisible ? rect(strip).top : null,
      limit: stripVisible ? rect(strip).top : (rect(composer)?.top ?? innerHeight),
      turn: rect(turn),
      card: rect(card),
      jumpVisible: Boolean(document.querySelector(".ef-home-jump") && !document.querySelector(".ef-home-jump").hidden),
      routeText: route?.querySelector(".ef-card-compact")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      routeHeight: route ? Math.round((route.querySelector(".ef-card-compact") ?? route).getBoundingClientRect().height) : null,
      routeFormButtons: route ? [...route.querySelectorAll("button")].map((button) => button.textContent.trim()).filter((text) => text === "沉浸" || text === "侧边") : [],
      stripText: strip?.textContent?.replace(/\s+/g, " ").trim() ?? ""
    };
  });
}

function followIsVisible(geometry) {
  if (!geometry.turn || !geometry.card) return false;
  const available = geometry.limit - geometry.titleBottom - 8;
  const total = geometry.card.bottom - geometry.turn.top;
  if (total <= available) {
    return geometry.turn.top >= geometry.titleBottom + 4 && geometry.card.bottom <= geometry.limit + 1;
  }
  return geometry.turn.top >= geometry.titleBottom + 4 && geometry.turn.top <= geometry.titleBottom + 20;
}

async function waitForFollow(page) {
  await page.waitForFunction(() => {
    const title = document.querySelector(".ef-home-titlebar");
    const composer = document.querySelector(".ef-home-composer");
    const strip = document.querySelector(".ef-home-next-strip");
    const turns = [...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")];
    const turn = turns[turns.length - 1];
    const cards = [...document.querySelectorAll(".ef-ui-conversation-card")];
    const card = cards[cards.length - 1];
    if (!title || !composer || !turn || !card) return false;
    const stripVisible = Boolean(strip && strip.getClientRects().length);
    const limit = stripVisible ? strip.getBoundingClientRect().top : composer.getBoundingClientRect().top;
    const available = limit - title.getBoundingClientRect().bottom - 8;
    const total = card.getBoundingClientRect().bottom - turn.getBoundingClientRect().top;
    const turnTop = turn.getBoundingClientRect().top;
    return turnTop >= title.getBoundingClientRect().bottom + 4
      && (total <= available ? card.getBoundingClientRect().bottom <= limit + 1 : turnTop <= title.getBoundingClientRect().bottom + 20);
  }, undefined, { timeout: 12000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

async function assertEmptyState(page) {
  const detail = await page.evaluate(() => {
    const empty = document.querySelector(".ef-home-empty");
    const starter = document.querySelector(".ef-home-starter-slot button");
    const nextStrip = document.querySelector(".ef-home-next-strip");
    const suggestions = [...document.querySelectorAll(".ef-home-suggestions button")].map((button) => button.textContent.trim());
    const composer = (document.querySelector(".ef-home-composer .ef-ui-composer") ?? document.querySelector(".ef-ui-composer"))?.getBoundingClientRect();
    const starterBox = starter?.getBoundingClientRect();
    return {
      emptyText: empty?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      starter: starter?.textContent?.trim() ?? "",
      starterAboveComposer: Boolean(starterBox && composer && starterBox.bottom <= composer.top + 1),
      nextStrip: nextStrip?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      suggestions,
      greeting: Boolean(document.body.textContent?.includes("你好，我是 EduFlow"))
    };
  });
  return detail;
}

export async function verifyCompletionReturn(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const tracking = await recordCounts(page);
  const counts = tracking.counts;
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);

    const fresh = await page.evaluate(() => {
      const root = document.querySelector(".ef-home-fresh");
      if (!root) return null;
      const starter = [...root.querySelectorAll("button")].find((button) => button.textContent.includes("带我从最简单的开始"));
      const starterBox = starter?.getBoundingClientRect();
      const composer = root.querySelector(".ef-ui-composer")?.getBoundingClientRect();
      return {
        question: root.querySelector("h1")?.textContent?.trim() ?? "",
        starter: starter?.textContent?.trim() ?? "",
        starterAboveComposer: Boolean(starterBox && composer && starterBox.bottom <= composer.top + 1),
        examples: [...root.querySelectorAll("button")].filter((button) => button !== starter).map((button) => button.textContent.trim())
      };
    });
    if (fresh) {
      check("empty.fresh-question", fresh.question === "想聊点什么？", fresh);
      check("empty.fresh-examples", fresh.examples.length > 0, fresh);
      check("empty.fresh-starter-above-composer", fresh.starterAboveComposer, fresh);
      check("empty.no-hardcoded-greeting", !(await page.locator("body").innerText()).includes("你好，我是 EduFlow"), null);
    }

    // A prepared empty conversation represents "已有对话但第一段未开始".
    const inserted = await page.evaluate(async () => {
      const { supabaseClient } = await import("/src/shared/api/supabaseClient.ts");
      const { data } = await supabaseClient.auth.getSession();
      if (!data.session?.user?.id) return { ok: false, error: "no-session" };
      const { data: row, error } = await supabaseClient.from("assistant_sessions").insert({ user_id: data.session.user.id, title: "空对话测试" }).select("id").single();
      return error ? { ok: false, error: error.message } : { ok: true, id: row.id };
    });
    if (inserted.ok) {
      await page.reload({ waitUntil: "networkidle" });
      await waitForHome(page);
      const pick = page.locator(".ef-history-pick").filter({ hasText: "空对话测试" }).first();
      if (await pick.count()) await pick.click();
      await page.waitForTimeout(1200);
      const prestart = await assertEmptyState(page);
      check("empty.prestart-question", prestart.emptyText.includes("想聊点什么？"), prestart);
      check("empty.prestart-examples", prestart.suggestions.length > 0, prestart);
      check("empty.prestart-starter-above-composer", prestart.starterAboveComposer && prestart.starter.includes("带我从最简单的开始"), prestart);
      check("empty.prestart-no-hardcoded-greeting", !prestart.greeting, prestart);
      await page.getByRole("button", { name: "带我从最简单的开始", exact: true }).first().click();
      await page.locator(".ef-assistant-micro-frame[data-card-type='route']").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(1200);
      const afterStarter = await page.evaluate(() => ({
        starter: Boolean(document.querySelector(".ef-home-starter-slot button")),
        nextStrip: document.querySelector(".ef-home-next-strip")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        route: Boolean(document.querySelector(".ef-assistant-micro-frame[data-card-type='route']"))
      }));
      check("empty.starter-opens-route", afterStarter.route && !afterStarter.starter, afterStarter);
      check("empty.starter-disappears-after-start", !afterStarter.starter, afterStarter);
    } else {
      note(`空对话预置失败，改用首次入口：${inserted.error}`);
      await openStarterRoute(page);
    }

    // A02 inline: never-started card -> normal completion returns to the card line.
    const route = page.locator(".ef-assistant-micro-frame[data-card-type='route']").first();
    await openRouteStep(page, route, "inline");
    const a02 = await completeMicro(page, rootFor(page, "inline"));
    check("complete.a02-walk", a02.completed, a02);
    await waitClosed(page);
    check("complete.a02-closed", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    check("complete.a02-recorded-once", (counts.get("aiad-l1-a02") ?? 0) === 1, { count: counts.get("aiad-l1-a02") ?? 0 });
    check("complete.a02-one-line", (await compactCount(page, "Agent：从回答到行动")) === 1, { count: await compactCount(page, "Agent：从回答到行动") });
    await waitForFollow(page);
    const a02Follow = await readFollowGeometry(page);
    check("complete.a02-follow-visible", followIsVisible(a02Follow) && !a02Follow.jumpVisible, a02Follow);
    check("route-card.collapsed-one-line", a02Follow.routeHeight != null && a02Follow.routeHeight <= 58 && a02Follow.routeText.includes("查看完整路线") && a02Follow.routeText.includes("1 / 4 步") && a02Follow.routeFormButtons.length === 0, a02Follow);
    check("route-label.first-segment", a02Follow.stripText.includes("第一段 1/4"), a02Follow.stripText);
    // The next card can mount only after the action reply round-trip; wait for
    // the deterministic focus projection instead of sampling too early.
    await page.waitForFunction(() => {
      const element = document.activeElement;
      const button = element?.closest("button");
      return Boolean(button && button.closest(".ef-ui-conversation-card") && !button.closest(".ef-card-compact"));
    }, undefined, { timeout: 5000 }).catch(() => undefined);
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      const button = element?.closest("button");
      return {
        tag: element?.tagName ?? null,
        text: (button?.innerText ?? "").trim(),
        aria: button?.getAttribute("aria-label"),
        inCard: Boolean(button?.closest(".ef-ui-conversation-card")),
        completed: Boolean(button?.closest(".ef-card-compact"))
      };
    });
    check("complete.focus-next-primary", active.tag === "BUTTON" && active.inCard && !active.completed && /开始|继续|打开/.test(active.text), active);

    // AGC01 side: completion closes the side workspace and keeps one line.
    const agc = await frameFor(page, "aiad-l1-agc01");
    await agc.getByRole("button", { name: "侧边", exact: true }).first().click();
    await page.locator(".ef-micro-side .ef-micro-instance").waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);
    const agcResult = await completeMicro(page, rootFor(page, "side"));
    check("complete.agc-walk", agcResult.completed, agcResult);
    await waitClosed(page);
    check("complete.agc-side-closed", (await page.locator(".ef-micro-side").count()) === 0, { side: await page.locator(".ef-micro-side").count() });
    check("complete.agc-recorded-once", (counts.get("aiad-l1-agc01") ?? 0) === 1, { count: counts.get("aiad-l1-agc01") ?? 0 });
    check("complete.agc-one-line", (await compactCount(page, "观察与动作")) === 1, { count: await compactCount(page, "观察与动作") });
    await waitForFollow(page);
    const agcFollow = await readFollowGeometry(page);
    check("complete.agc-follow-visible", followIsVisible(agcFollow) && !agcFollow.jumpVisible, agcFollow);
    check("route-label.second-step", agcFollow.stripText.includes("第一段 2/4"), agcFollow.stripText);

    // R10 focus: never-started card -> dialog closes, card compact, related
    // content remains reachable from "再看一遍".
    const r10 = await frameFor(page, "aiad-l1-r10");
    await r10.getByRole("button", { name: "沉浸", exact: true }).first().click();
    await page.locator("dialog.ef-micro-focus[open]").waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);
    const r10Result = await completeMicro(page, rootFor(page, "focus"));
    check("complete.r10-walk", r10Result.completed, r10Result);
    await waitClosed(page);
    check("complete.r10-dialog-closed", !(await page.locator("dialog.ef-micro-focus").evaluate((element) => element.open)), null);
    check("complete.r10-recorded-once", (counts.get("aiad-l1-r10") ?? 0) === 1, { count: counts.get("aiad-l1-r10") ?? 0 });
    check("complete.r10-one-line", (await compactCount(page, "ReAct")) === 1, { count: await compactCount(page, "ReAct") });
    await waitForFollow(page);
    const r10Follow = await readFollowGeometry(page);
    check("complete.r10-follow-visible", followIsVisible(r10Follow) && !r10Follow.jumpVisible, r10Follow);
    check("route-label.third-step", r10Follow.stripText.includes("第一段 3/4"), r10Follow.stripText);
    check("complete.three-records", [...counts.values()].reduce((sum, value) => sum + value, 0) === 3, { counts: Object.fromEntries(counts) });

    await page.reload({ waitUntil: "networkidle" });
    await waitForHome(page);
    check("complete.refresh-keeps-lines", (await compactCount(page, "Agent：从回答到行动")) === 1 && (await compactCount(page, "观察与动作")) === 1 && (await compactCount(page, "ReAct")) === 1, { a02: await compactCount(page, "Agent：从回答到行动"), agc: await compactCount(page, "观察与动作"), r10: await compactCount(page, "ReAct") });
    check("complete.refresh-no-dialog", !(await page.locator("dialog.ef-micro-focus").evaluate((element) => element.open)), null);

    const review = page.locator(".ef-card-compact").filter({ hasText: "ReAct" }).first();
    await review.getByRole("button", { name: "再看一遍", exact: true }).click();
    await page.locator(".ef-home-micro-completion-context").waitFor({ timeout: 10000 });
    await page.waitForTimeout(700);
    const reviewText = await page.locator(".ef-home-micro-completion-context").innerText();
    check("complete.review-keeps-related", reviewText.includes("相关资料") && reviewText.includes("相关练习"), { text: reviewText });
    const collapse = page.getByRole("button", { name: "收起小练习", exact: true });
    if (await collapse.count()) await collapse.first().click();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: "新对话", exact: true }).click();
    await page.waitForTimeout(1200);
    const startedEmpty = await assertEmptyState(page);
    check("empty.started-question", startedEmpty.emptyText.includes("想聊点什么？"), startedEmpty);
    check("empty.started-examples", startedEmpty.suggestions.length > 0, startedEmpty);
    check("empty.started-no-starter", !startedEmpty.starter, startedEmpty);
    check("empty.started-next-strip", startedEmpty.nextStrip.length > 0, startedEmpty);

    metrics.completion = Object.fromEntries(counts);
    metrics.active = active;
    metrics.review = reviewText;
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    tracking.stop();
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}

export async function verifyCompletionVariants(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const tracking = await recordCounts(page);
  const counts = tracking.counts;
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const route = await openStarterRoute(page);

    await page.evaluate(() => localStorage.setItem("eduflow:micro:form", "side"));
    await openRouteStep(page, route, "side");
    check("variant.side-preference-form", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "side", null);
    const sideResult = await completeMicro(page, rootFor(page, "side"));
    check("variant.side-walk", sideResult.completed, sideResult);
    await waitClosed(page);
    check("variant.side-closed", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    check("variant.side-recorded-once", (counts.get("aiad-l1-a02") ?? 0) === 1, { count: counts.get("aiad-l1-a02") ?? 0 });

    await page.evaluate(() => localStorage.setItem("eduflow:micro:form", "inline"));
    const agc = await frameFor(page, "aiad-l1-agc01");
    await agc.getByRole("button", { name: /开始这道小练习|继续这道小练习|开始当前这一步|继续当前这一步/ }).first().click();
    await page.locator(".ef-home-micro").waitFor({ timeout: 10000 });
    check("variant.inline-preference-form", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "inline", null);
    const inlineResult = await completeMicro(page, rootFor(page, "inline"));
    check("variant.inline-walk", inlineResult.completed, inlineResult);
    await waitClosed(page);
    check("variant.inline-closed", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    check("variant.inline-recorded-once", (counts.get("aiad-l1-agc01") ?? 0) === 1, { count: counts.get("aiad-l1-agc01") ?? 0 });

    const r10 = await frameFor(page, "aiad-l1-r10");
    await r10.getByRole("button", { name: /开始这道小练习|继续这道小练习|开始当前这一步|继续当前这一步/ }).first().click();
    await page.locator(".ef-home-micro").waitFor({ timeout: 10000 });
    await page.waitForTimeout(700);
    // Make the path in progress before entering immersive.
    const next = page.locator(".ef-home-micro .ef-micro-foot button, .ef-home-micro footer button").last();
    if (await next.count() && await next.isEnabled()) await next.click();
    await page.waitForTimeout(900);
    await page.locator('[data-micro-form="focus"]:visible').first().click();
    await page.locator("dialog.ef-micro-focus[open]").waitFor({ timeout: 10000 });
    check("variant.in-progress-focus-form", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "focus", null);
    const focusResult = await completeMicro(page, rootFor(page, "focus"));
    check("variant.in-progress-walk", focusResult.completed, focusResult);
    await waitClosed(page);
    check("variant.in-progress-closed", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    check("variant.in-progress-dialog-closed", !(await page.locator("dialog.ef-micro-focus").evaluate((element) => element.open)), null);
    check("variant.in-progress-recorded-once", (counts.get("aiad-l1-r10") ?? 0) === 1, { count: counts.get("aiad-l1-r10") ?? 0 });

    await page.reload({ waitUntil: "networkidle" });
    await waitForHome(page);
    check("variant.refresh-lines", (await compactCount(page, "Agent：从回答到行动")) === 1 && (await compactCount(page, "观察与动作")) === 1 && (await compactCount(page, "ReAct")) === 1, null);
    metrics.completion = Object.fromEntries(counts);
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    tracking.stop();
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}

export async function verifyCompletedDedupe(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const pick = page.locator(".ef-history-pick").filter({ hasText: "Agent 和普通聊天" }).first();
    if (await pick.count()) {
      await pick.click();
      await page.waitForTimeout(1500);
    }
    await waitForHome(page);

    const sessionId = await page.evaluate(() => new URLSearchParams(location.search).get("session"));
    const persisted = sessionId ? await page.evaluate(async (id) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("sb-") && candidate.endsWith("-auth-token"));
      const session = JSON.parse(localStorage.getItem(key));
      const response = await fetch(`/api/assistant?sessionId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) return { ok: false, status: response.status };
      const data = await response.json();
      const cards = [];
      for (const message of data.messages ?? []) {
        for (const part of message.parts ?? []) {
          if (part.type === "tool-displayCard") cards.push(part.output?.card);
        }
      }
      return { ok: true, count: cards.filter((card) => (card?.pathId ?? card?.nodeId) === "aiad-l1-a02").length, cards };
    }, sessionId) : { ok: false, count: 0 };
    check("dedupe.persisted-history-unchanged", persisted.ok && persisted.count >= 2, { count: persisted.count, ok: persisted.ok });

    const dom = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".ef-ui-conversation-card")];
      const a02 = cards.find((card) => card.textContent.includes("Agent：从回答到行动") && card.querySelector(".ef-card-compact"));
      const agc = cards.find((card) => card.textContent.includes("观察与动作"));
      return {
        a02: Boolean(a02),
        agc: Boolean(agc),
        after: Boolean(a02 && agc && (a02.compareDocumentPosition(agc) & Node.DOCUMENT_POSITION_FOLLOWING)),
        a02Compacts: [...document.querySelectorAll(".ef-card-compact")].filter((card) => card.textContent.includes("Agent：从回答到行动")).length,
        a02Frames: document.querySelectorAll(".ef-assistant-micro-frame[data-path-id='aiad-l1-a02']").length
      };
    });
    check("dedupe.one-completed-row", dom.a02Compacts === 1, dom);
    check("dedupe.earliest-row-kept-before-next", dom.after, dom);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload({ waitUntil: "networkidle" });
    await waitForHome(page);
    check("dedupe.refresh-1280-one-row", (await compactCount(page, "Agent：从回答到行动")) === 1, { count: await compactCount(page, "Agent：从回答到行动") });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    await waitForHome(page);
    check("dedupe.refresh-1440-one-row", (await compactCount(page, "Agent：从回答到行动")) === 1, { count: await compactCount(page, "Agent：从回答到行动") });

    await page.getByRole("button", { name: "新对话", exact: true }).click();
    await page.waitForTimeout(1200);
    const empty = await page.evaluate(() => ({
      starter: Boolean(document.querySelector(".ef-home-starter-slot button")),
      nextStrip: document.querySelector(".ef-home-next-strip")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      suggestions: document.querySelectorAll(".ef-home-suggestions button").length
    }));
    check("dedupe.started-empty-no-starter", !empty.starter, empty);
    check("dedupe.started-empty-next-strip", empty.nextStrip.length > 0, empty);
    metrics.dedupe = { persisted: persisted.count, dom, empty };
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}


export async function verifyRelatedContentForm(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const tracking = await recordCounts(page);
  const counts = tracking.counts;
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  const form = typeof options === "object" && options.form === "inline" ? "inline" : "side";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const route = await openStarterRoute(page);

    await openRouteStep(page, route, "inline");
    const a02 = await completeMicro(page, rootFor(page, "inline"));
    check("related.a02-walk", a02.completed, a02);
    await waitClosed(page);

    const agc = await frameFor(page, "aiad-l1-agc01");
    await agc.getByRole("button", { name: "侧边", exact: true }).first().click();
    await page.locator(".ef-micro-side .ef-micro-instance").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const agcResult = await completeMicro(page, rootFor(page, "side"));
    check("related.agc-walk", agcResult.completed, agcResult);
    await waitClosed(page);

    const r10 = await frameFor(page, "aiad-l1-r10");
    if (form === "side") {
      await r10.getByRole("button", { name: "侧边", exact: true }).first().click();
      await page.locator(".ef-micro-side .ef-micro-instance").waitFor({ timeout: 10000 });
    } else {
      await page.evaluate(() => localStorage.setItem("eduflow:micro:form", "inline"));
      await r10.getByRole("button", { name: /开始这道小练习|继续这道小练习/ }).first().click();
      await page.locator(".ef-home-micro").waitFor({ timeout: 10000 });
    }
    await page.waitForTimeout(900);
    check(`related.${form}-form`, (await page.locator("main.ef-home").getAttribute("data-micro-form")) === form, { form });
    const r10Result = await completeMicro(page, rootFor(page, form));
    check(`related.${form}-walk`, r10Result.completed, r10Result);
    await waitClosed(page);
    check(`related.${form}-closed`, (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    check(`related.${form}-dialog-closed`, !(await page.locator("dialog.ef-micro-focus").evaluate((element) => element.open)), null);
    check(`related.${form}-recorded-once`, (counts.get("aiad-l1-r10") ?? 0) === 1, { count: counts.get("aiad-l1-r10") ?? 0 });
    check(`related.${form}-one-line`, (await compactCount(page, "ReAct")) === 1, { count: await compactCount(page, "ReAct") });
    check(`related.${form}-all-records`, [...counts.values()].reduce((sum, value) => sum + value, 0) === 3, { counts: Object.fromEntries(counts) });

    await page.waitForTimeout(1800);
    await page.locator(".ef-card-compact").filter({ hasText: "ReAct" }).first().getByRole("button", { name: "再看一遍", exact: true }).click();
    await page.locator(".ef-home-micro-completion-context").waitFor({ timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const contextCount = await page.locator(".ef-home-micro-completion-context").count();
    const related = contextCount ? await page.locator(".ef-home-micro-completion-context").innerText() : "";
    check(`related.${form}-review-keeps-related`, contextCount > 0 && related.includes("相关资料") && related.includes("相关练习"), { contextCount, related });
    metrics.completion = Object.fromEntries(counts);
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    tracking.stop();
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}


export async function verifyRelatedReview(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const pick = page.locator(".ef-history-pick").first();
    if (await pick.count()) {
      await pick.click();
      await page.waitForTimeout(1800);
    }
    check("related-review.one-line", (await compactCount(page, "ReAct")) === 1, { count: await compactCount(page, "ReAct") });
    await page.locator(".ef-card-compact").filter({ hasText: "ReAct" }).first().getByRole("button", { name: "再看一遍", exact: true }).click();
    await page.locator(".ef-home-micro-completion-context").waitFor({ timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    const count = await page.locator(".ef-home-micro-completion-context").count();
    const related = count ? await page.locator(".ef-home-micro-completion-context").innerText() : "";
    check("related-review.context", count > 0 && related.includes("相关资料") && related.includes("相关练习"), { count, related });
    metrics.related = related;
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}


export async function verifyStripSurface(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const pick = page.locator(".ef-history-pick").first();
    if (await pick.count()) { await pick.click(); await page.waitForTimeout(1500); }
    const scroller = page.locator(".ef-home-scroller");
    let geometry = null;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      await scroller.evaluate((element, value) => {
        const max = Math.max(0, element.scrollHeight - element.clientHeight);
        element.scrollTop = max * value;
      }, fraction);
      await page.waitForTimeout(450);
      geometry = await page.evaluate(() => {
        const strip = document.querySelector(".ef-home-next-strip");
        if (!strip || !strip.getClientRects().length) return null;
        const composer = document.querySelector(".ef-home-composer");
        const anchor = document.querySelector(".ef-home-strip-anchor");
        const pseudo = composer ? getComputedStyle(composer, "::before") : null;
        const stripBox = strip.getBoundingClientRect();
        const composerBox = composer.getBoundingClientRect();
        const gapY = (stripBox.bottom + composerBox.top) / 2;
        const gapHit = document.elementFromPoint((stripBox.left + stripBox.right) / 2, gapY);
        const stripHit = document.elementFromPoint((stripBox.left + stripBox.right) / 2, (stripBox.top + stripBox.bottom) / 2);
        const probe = document.createElement("canvas").getContext("2d");
        probe.fillStyle = getComputedStyle(strip).backgroundColor;
        return {
          background: getComputedStyle(strip).backgroundColor,
          normalized: probe.fillStyle,
          dataStrip: composer.dataset.strip ?? null,
          backdrop: pseudo?.backdropFilter ?? pseudo?.webkitBackdropFilter ?? "",
          insetTop: pseudo?.top ?? null,
          mask: pseudo?.maskImage ?? pseudo?.webkitMaskImage ?? "",
          anchorHidden: anchor?.hidden ?? null,
          strip: { top: stripBox.top, bottom: stripBox.bottom, height: stripBox.height },
          composerTop: composerBox.top,
          gap: composerBox.top - stripBox.bottom,
          gapHit: gapHit ? { tag: gapHit.tagName, timeline: Boolean(gapHit.closest(".ef-home-timeline")), composer: Boolean(gapHit.closest(".ef-home-composer")), anchor: Boolean(gapHit.closest(".ef-home-strip-anchor")) } : null,
          stripHit: stripHit ? { tag: stripHit.tagName, inside: strip.contains(stripHit) } : null,
          scrollHeight: document.querySelector(".ef-home-scroller").scrollHeight,
          scrollTop: Math.round(document.querySelector(".ef-home-scroller").scrollTop),
          stripText: strip.textContent.replace(/\s+/g, " ").trim()
        };
      });
      if (geometry) break;
    }
    if (!geometry) {
      note("当前会话没有可见的下一步提示条，跳过表面断言。");
    } else {
      check("strip.surface-visible", true, geometry);
      const alpha = geometry.normalized;
      const opaque = !/^rgba\(.*,\s*(0?\.\d+|0)\)$/.test(alpha) && alpha !== "transparent";
      check("strip.surface-opaque", opaque && geometry.background !== "transparent", geometry);
      check("strip.surface-above-composer", geometry.gap >= 0 && geometry.gap <= 24, geometry);
      check("strip.surface-composer-fade", geometry.dataStrip === "1" && /blur\(/.test(geometry.backdrop) && /linear-gradient/.test(geometry.mask) && geometry.insetTop != null && parseFloat(geometry.insetTop) < 0, geometry);
      check("strip.surface-gap-covered", Boolean(geometry.gapHit && !geometry.gapHit.timeline && (geometry.gapHit.anchor || geometry.gapHit.composer)), geometry);
      check("strip.surface-hit", Boolean(geometry.stripHit?.inside), geometry);
      if (geometry.stripText.includes("路线")) {
        check("route-label.after-first-segment", /路线 \d+\/\d+/.test(geometry.stripText), geometry.stripText);
      } else {
        note("当前会话第一段未完成，路线后缀断言由完成用例覆盖。");
      }
      const composerTop = geometry.composerTop;
      await page.evaluate(() => {
        const anchor = document.querySelector(".ef-home-strip-anchor");
        if (anchor) anchor.hidden = true;
      });
      await page.waitForTimeout(250);
      const hiddenRange = await page.evaluate(() => ({
        scrollHeight: document.querySelector(".ef-home-scroller").scrollHeight,
        composerTop: document.querySelector(".ef-home-composer").getBoundingClientRect().top,
        scrollTop: Math.round(document.querySelector(".ef-home-scroller").scrollTop)
      }));
      await page.evaluate(() => {
        const anchor = document.querySelector(".ef-home-strip-anchor");
        if (anchor) anchor.hidden = false;
      });
      await page.waitForTimeout(250);
      const shownRange = await page.evaluate(() => ({
        scrollHeight: document.querySelector(".ef-home-scroller").scrollHeight,
        composerTop: document.querySelector(".ef-home-composer").getBoundingClientRect().top,
        scrollTop: Math.round(document.querySelector(".ef-home-scroller").scrollTop)
      }));
      check("strip.surface-no-layout-shift", hiddenRange.scrollHeight === shownRange.scrollHeight && Math.abs(hiddenRange.composerTop - composerTop) < 1 && Math.abs(hiddenRange.composerTop - shownRange.composerTop) < 1 && hiddenRange.scrollTop === shownRange.scrollTop, { geometry, hiddenRange, shownRange });
      metrics.strip = { geometry, hiddenRange, shownRange };
    }
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}

export async function verifyManualScrollKeepsPosition(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const route = await openStarterRoute(page);
    await openRouteStep(page, route, "inline");
    const finalTitle = await page.evaluate(async () => {
      const { applicationServices } = await import("/src/app/services/applicationServices.ts");
      const path = applicationServices.microLearningRepository.getPath("A02", { courseId: "ai-agents-in-depth", mode: "learn", pathId: "aiad-l1-a02" });
      const steps = path?.units.flatMap((unit) => unit.steps) ?? [];
      return steps.length ? steps[steps.length - 1].title : "";
    });
    const advance = await completeMicro(page, rootFor(page, "inline"), { stopTitle: finalTitle });
    check("manual.stopped-before-final", advance.stopped === true, { advance, finalTitle });
    const scroller = page.locator(".ef-home-scroller");
    // A test-only spacer makes the conversation tall enough to distinguish a
    // suppressed follow from a conversation that simply fits the viewport. It
    // sits before the tail spacer so the jump control's geometry still holds.
    await scroller.evaluate((element) => {
      const timeline = element.querySelector(".ef-home-timeline");
      const tail = element.querySelector(".ef-home-tail-space");
      if (!timeline || document.getElementById("manual-scroll-spacer")) return;
      const spacer = document.createElement("div");
      spacer.id = "manual-scroll-spacer";
      spacer.style.height = "1400px";
      timeline.insertBefore(spacer, tail);
    });
    await page.waitForTimeout(300);
    const box = await page.locator(".ef-home-scroller").boundingBox();
    const footer = page.locator(".ef-home-micro footer").getByRole("button").last();
    await footer.scrollIntoViewIfNeeded().catch(() => undefined);
    // Mark manual control first (a real upward wheel, even at the top), then
    // move down only to give the completion reply room below. The move is test
    // setup, not a learner gesture.
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.wheel(0, -90);
    await page.waitForTimeout(200);
    await scroller.evaluate((element) => { element.scrollTop += 240; });
    await page.waitForTimeout(250);
    const footerBox = await footer.boundingBox();
    const before = await page.evaluate(() => {
      const element = document.querySelector(".ef-home-scroller");
      return { scrollTop: Math.round(element.scrollTop), max: Math.round(element.scrollHeight - element.clientHeight) };
    });
    await page.mouse.move(footerBox.x + footerBox.width / 2, footerBox.y + footerBox.height / 2, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await waitClosed(page);
    check("manual.completed", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    await page.waitForTimeout(2200);
    const after = await page.evaluate(() => {
      const scrollerElement = document.querySelector(".ef-home-scroller");
      const composer = document.querySelector(".ef-home-composer").getBoundingClientRect();
      const turns = [...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")];
      const turn = turns[turns.length - 1]?.getBoundingClientRect();
      return {
        scrollTop: Math.round(scrollerElement.scrollTop),
        composerTop: Math.round(composer.top),
        turnTop: turn ? Math.round(turn.top) : null,
        jumpVisible: Boolean(document.querySelector(".ef-home-jump") && !document.querySelector(".ef-home-jump").hidden)
      };
    });
    check("manual.no-auto-follow", before.scrollTop > 0 && after.scrollTop <= before.scrollTop + 40, { before, after });
    check("manual.keeps-scroll-position", Math.abs(after.scrollTop - before.scrollTop) <= 40, { before, after });
    check("manual.jump-visible", after.jumpVisible, { before, after });
    metrics.manual = { before, after };
    await page.evaluate(() => document.getElementById("manual-scroll-spacer")?.remove());
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}


export async function verifyLongConversationFollow(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  const modelRequests = [];
  const listener = (request) => {
    if (request.method() !== "POST" || !/\/api\/assistant(?:\?|$)/.test(request.url())) return;
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (body && !body.action && Array.isArray(body.messages)) modelRequests.push(Date.now());
  };
  page.on("request", listener);
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const composer = page.getByRole("textbox", { name: "给助手发消息" });
    await composer.fill("Agent 和普通聊天有什么不同？简单说说。");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page.waitForFunction(() => {
      const timeline = document.querySelector(".ef-assistant-timeline");
      return timeline?.dataset.sending === "false" && !document.querySelector(".ef-ui-send.is-stop");
    }, undefined, { timeout: 180000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const answer = await page.evaluate(() => ([...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")].pop()?.textContent ?? "").trim().length);
    check("long.assistant-streamed", answer > 200, { length: answer, requests: modelRequests.length });
    check("long.assistant-single-request", modelRequests.length === 1, { requests: modelRequests.length });
    const cardCount = await page.locator(".ef-ui-conversation-card").count();
    check("long.assistant-card", cardCount > 0, { cards: cardCount });
    metrics.long = { answer, modelRequests: modelRequests.length, cards: cardCount };

    const route = await openStarterRoute(page);
    await openRouteStep(page, route, "inline");
    const a02 = await completeMicro(page, rootFor(page, "inline"));
    check("long.a02-walk", a02.completed, a02);
    await waitClosed(page);
    await waitForFollow(page);
    const a02Follow = await readFollowGeometry(page);
    check("long.a02-follow-visible", followIsVisible(a02Follow), a02Follow);

    const scroller = page.locator(".ef-home-scroller");
    let surface = null;
    for (const fraction of [0, 0.2, 1]) {
      await scroller.evaluate((element, value) => {
        const max = Math.max(0, element.scrollHeight - element.clientHeight);
        element.scrollTop = max * value;
      }, fraction);
      await page.waitForTimeout(500);
      surface = await page.evaluate(() => {
        const strip = document.querySelector(".ef-home-next-strip");
        if (!strip || !strip.getClientRects().length) return null;
        const composer = document.querySelector(".ef-home-composer");
        const anchor = document.querySelector(".ef-home-strip-anchor");
        const pseudo = composer ? getComputedStyle(composer, "::before") : null;
        const stripBox = strip.getBoundingClientRect();
        const composerBox = composer.getBoundingClientRect();
        const gapY = (stripBox.bottom + composerBox.top) / 2;
        const gapHit = document.elementFromPoint((stripBox.left + stripBox.right) / 2, gapY);
        const probe = document.createElement("canvas").getContext("2d");
        probe.fillStyle = getComputedStyle(strip).backgroundColor;
        return {
          normalized: probe.fillStyle,
          dataStrip: composer.dataset.strip ?? null,
          backdrop: pseudo?.backdropFilter ?? "",
          mask: pseudo?.maskImage ?? "",
          insetTop: pseudo?.top ?? null,
          gap: composerBox.top - stripBox.bottom,
          gapTimeline: Boolean(gapHit?.closest(".ef-home-timeline")),
          gapAnchorOrComposer: Boolean(gapHit?.closest(".ef-home-strip-anchor") || gapHit?.closest(".ef-home-composer")),
          anchorHidden: anchor?.hidden ?? null,
          scrollHeight: document.querySelector(".ef-home-scroller").scrollHeight,
          composerTop: composerBox.top,
          scrollTop: Math.round(document.querySelector(".ef-home-scroller").scrollTop)
        };
      });
      if (surface) break;
    }
    check("long.strip-visible", Boolean(surface), surface);
    if (surface) {
      const opaque = surface.normalized !== "transparent" && !/^rgba\(.*,\s*(0?\.\d+|0)\)$/.test(surface.normalized);
      check("long.strip-opaque", opaque, surface);
      check("long.strip-gap-covered", surface.gap >= 0 && surface.gap <= 24 && !surface.gapTimeline && surface.gapAnchorOrComposer, surface);
      check("long.strip-composer-fade", surface.dataStrip === "1" && /blur\(/.test(surface.backdrop) && /linear-gradient/.test(surface.mask) && parseFloat(surface.insetTop) < 0, surface);
    }

    // Manual upward scroll during the action must suppress the follow.
    const agc = await frameFor(page, "aiad-l1-agc01");
    await agc.getByRole("button", { name: "侧边", exact: true }).first().click();
    await page.locator(".ef-micro-side .ef-micro-instance").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const box = await scroller.boundingBox();
    await scroller.evaluate((element) => {
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.max(0, max - 120);
    });
    await page.waitForTimeout(300);
    for (let index = 0; index < 3; index += 1) {
      await page.mouse.move(box.x + 12, box.y + box.height / 2);
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => {
      const element = document.querySelector(".ef-home-scroller");
      return { scrollTop: Math.round(element.scrollTop), max: element.scrollHeight - element.clientHeight };
    });
    const agcResult = await completeMicro(page, rootFor(page, "side"));
    check("long.agc-walk", agcResult.completed, agcResult);
    await waitClosed(page);
    check("manual.completed", (await page.locator("main.ef-home").getAttribute("data-micro-form")) === "closed", null);
    await page.waitForTimeout(2200);
    const after = await page.evaluate(() => {
      const element = document.querySelector(".ef-home-scroller");
      const composerBox = document.querySelector(".ef-home-composer").getBoundingClientRect();
      const strip = document.querySelector(".ef-home-next-strip");
      const limit = strip && strip.getClientRects().length ? strip.getBoundingClientRect().top : composerBox.top;
      const turns = [...document.querySelectorAll(".ef-assistant-turn[data-role='assistant']")];
      const turn = turns[turns.length - 1]?.getBoundingClientRect();
      return {
        scrollTop: Math.round(element.scrollTop),
        max: Math.round(element.scrollHeight - element.clientHeight),
        limit: Math.round(limit),
        turnTop: turn ? Math.round(turn.top) : null,
        jumpVisible: Boolean(document.querySelector(".ef-home-jump") && !document.querySelector(".ef-home-jump").hidden)
      };
    });
    check("long.manual-no-auto-follow", after.scrollTop <= before.scrollTop + 40, { before, after });
    check("long.manual-turn-not-revealed", after.turnTop == null || after.turnTop >= after.limit - 24, { before, after });
    metrics.manual = { before, after };
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    page.off("request", listener);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}


export async function verifyEvaluationAttemptCards(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const pick = page.locator(".ef-history-pick").first();
    if (await pick.count()) { await pick.click(); await page.waitForTimeout(1800); }
    const cards = await page.evaluate(() => [...document.querySelectorAll("[data-card-type='evaluation']")].map((frame) => ({
      attemptId: frame.dataset.attemptId ?? "",
      courseId: frame.dataset.courseId ?? "",
      assignmentId: frame.dataset.assignmentId ?? "",
      text: frame.textContent.replace(/\s+/g, " ").trim()
    })));
    const withAttempt = cards.filter((card) => card.attemptId);
    if (withAttempt.length < 2) {
      note(`只有 ${withAttempt.length} 张带 Attempt 的评价卡，跳过历史多提交断言。`);
    } else {
      check("evaluation.distinct-attempts", new Set(withAttempt.map((card) => card.attemptId)).size === withAttempt.length, { cards: withAttempt.map((card) => card.attemptId) });
      const server = await page.evaluate(async (items) => {
        const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("sb-") && candidate.endsWith("-auth-token"));
        const session = JSON.parse(localStorage.getItem(key));
        const out = [];
        for (const item of items) {
          const response = await fetch(`/api/learning?courseId=${encodeURIComponent(item.courseId)}&assignmentId=${encodeURIComponent(item.assignmentId)}&attemptId=${encodeURIComponent(item.attemptId)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
          out.push(response.ok ? await response.json() : { error: response.status });
        }
        return out;
      }, withAttempt.map(({ courseId, assignmentId, attemptId }) => ({ courseId, assignmentId, attemptId })));
      let serverMatches = true;
      for (const [index, card] of withAttempt.entries()) {
        const result = server[index]?.result;
        const expectedNumber = `第 ${result?.attemptNumber} 次提交`;
        const expectedLabel = result?.outcome === "passed" ? "已通过" : result?.outcome === "failed" ? "需要修改" : "评价中";
        if (!card.text.includes(expectedNumber) || !card.text.includes(expectedLabel)) serverMatches = false;
      }
      check("evaluation.card-reads-own-attempt", serverMatches, { cards: withAttempt.map((card) => card.text.slice(0, 120)), server: server.map((item) => item?.result ? { attemptNumber: item.result.attemptNumber, outcome: item.result.outcome } : item) });
      check("evaluation.not-all-latest", new Set(server.map((item) => item?.result?.attemptNumber)).size === withAttempt.length, { attempts: server.map((item) => item?.result?.attemptNumber) });

      const first = page.locator("[data-card-type='evaluation']").first();
      await first.getByRole("button", { name: "查看评价", exact: true }).click();
      await page.waitForURL("**/assignments/**", { timeout: 15000 });
      check("evaluation.view-opens-own-attempt", new URL(page.url()).searchParams.get("attemptId") === withAttempt[0].attemptId, { url: page.url(), expected: withAttempt[0].attemptId });
      const firstAttemptNumber = server[0]?.result?.attemptNumber;
      await page.waitForTimeout(2500);
      const attemptPage = await page.locator("body").innerText();
      check("evaluation.view-shows-own-attempt", attemptPage.includes(`第 ${firstAttemptNumber} 次尝试`), { expected: firstAttemptNumber, page: attemptPage.slice(0, 240) });
      await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
      await waitForHome(page);
      await page.locator(".ef-history-pick").first().click();
      await page.waitForTimeout(1800);
      const last = page.locator("[data-card-type='evaluation']").last();
      await last.getByRole("button", { name: "查看评价", exact: true }).click();
      await page.waitForURL("**/assignments/**", { timeout: 15000 });
      check("evaluation.view-opens-last-attempt", new URL(page.url()).searchParams.get("attemptId") === withAttempt[withAttempt.length - 1].attemptId, { url: page.url(), expected: withAttempt[withAttempt.length - 1].attemptId });
      metrics.evaluation = { cards: withAttempt.map((card) => card.text.slice(0, 80)), attempts: server.map((item) => item?.result?.attemptNumber) };
    }
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}


export async function verifyActionStartResetsFollow(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const route = await openStarterRoute(page);
    await openRouteStep(page, route, "inline");
    const a02 = await completeMicro(page, rootFor(page, "inline"));
    check("action-start.a02-walk", a02.completed, a02);
    await waitClosed(page);
    await page.waitForTimeout(800);

    const agc = await frameFor(page, "aiad-l1-agc01");
    await agc.getByRole("button", { name: "侧边", exact: true }).first().click();
    await page.locator(".ef-micro-side .ef-micro-instance").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const scroller = page.locator(".ef-home-scroller");
    // Keep enough content below the action so "did not follow" is observable
    // at both widths (test-only, removed before the next action).
    await scroller.evaluate((element) => {
      const timeline = element.querySelector(".ef-home-timeline");
      const tail = element.querySelector(".ef-home-tail-space");
      if (!timeline || document.getElementById("action-scroll-spacer")) return;
      const spacer = document.createElement("div");
      spacer.id = "action-scroll-spacer";
      spacer.style.height = "1400px";
      timeline.insertBefore(spacer, tail);
    });
    await page.waitForTimeout(300);
    const box = await scroller.boundingBox();
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => Math.round(document.querySelector(".ef-home-scroller").scrollTop));
    const agcResult = await completeMicro(page, rootFor(page, "side"));
    check("action-start.agc-walk", agcResult.completed, agcResult);
    await waitClosed(page);
    await page.waitForTimeout(2200);
    const agcGeometry = await readFollowGeometry(page);
    const agcDidNotFollow = Boolean(agcGeometry.card && agcGeometry.card.bottom > agcGeometry.limit - 2) || agcGeometry.jumpVisible;
    check("action-start.manual-scroll-not-followed", agcDidNotFollow, { before, agcGeometry });
    await page.evaluate(() => document.getElementById("action-scroll-spacer")?.remove());

    const r10 = await frameFor(page, "aiad-l1-r10");
    await r10.getByRole("button", { name: "沉浸", exact: true }).first().click();
    await page.locator("dialog.ef-micro-focus[open]").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const r10Result = await completeMicro(page, rootFor(page, "focus"));
    check("action-start.r10-walk", r10Result.completed, r10Result);
    await waitClosed(page);
    await waitForFollow(page);
    const r10Geometry = await readFollowGeometry(page);
    check("action-start.new-action-resets-window", followIsVisible(r10Geometry) && !r10Geometry.jumpVisible, r10Geometry);
    metrics.actionStart = { before, agcGeometry, r10Geometry };
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}

export async function verifyTaskResultReview(page, options = {}) {
  const { checks, failures, metrics, notes, check, note } = createChecks();
  const baseURL = typeof options === "string" ? options : options.baseURL ?? "http://localhost:5173";
  try {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await waitForHome(page);
    const pick = page.locator(".ef-history-pick").first();
    if (await pick.count()) { await pick.click(); await page.waitForTimeout(2000); }
    const state = await page.evaluate(() => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) };
      };
      const strip = document.querySelector(".ef-home-next-strip");
      const composer = document.querySelector(".ef-home-composer");
      const stripVisible = Boolean(strip && strip.getClientRects().length);
      const summary = [...document.querySelectorAll(".ef-ui-conversation-card")].find((card) => card.textContent.includes("第一段"));
      const evaluations = [...document.querySelectorAll("[data-card-type='evaluation']")];
      return {
        limit: stripVisible ? rect(strip).top : rect(composer).top,
        stripVisible,
        summary: rect(summary),
        jumpVisible: Boolean(document.querySelector(".ef-home-jump") && !document.querySelector(".ef-home-jump").hidden),
        evaluations: evaluations.map((frame) => ({ attemptId: frame.dataset.attemptId ?? "", text: frame.textContent.replace(/\s+/g, " ").trim() })),
        scrollTop: Math.round(document.querySelector(".ef-home-scroller").scrollTop)
      };
    });
    const attempts = state.evaluations.map((item) => item.attemptId).filter(Boolean);
    check("task-result.three-attempts", attempts.length >= 3 && new Set(attempts).size === attempts.length, { attempts });
    check("task-result.revision-history", state.evaluations.some((item) => item.text.includes("需要修改")) && state.evaluations.some((item) => item.text.includes("已通过")), { statuses: state.evaluations.map((item) => item.text.slice(0, 60)) });
    check("task-result.summary-present", Boolean(state.summary), state);
    check("task-result.latest-card-above-limit", Boolean(state.summary && state.summary.bottom <= state.limit + 1), state);
    check("task-result.no-jump", !state.jumpVisible, state);
    metrics.taskResult = state;
  } catch (error) {
    note(`运行中止：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: failures.length === 0, checks, failures, metrics, notes };
}

export default verifyCompletionReturn;
