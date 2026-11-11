#!/usr/bin/env node
/**
 * Repeatable bottom-chrome overlap check.
 *
 * Requires Playwright from the environment; this repository intentionally does
 * not add it as a dependency. Example:
 *   NODE_PATH=/Users/fanyuhang/Documents/OpenUniflo/playwright/node_modules \
 *     node scripts/check-bottom-overlap.mjs
 *
 * The primary graph/canvas/reading workspace is excluded: its 3D cards and
 * canvas labels intentionally overlap. Every bottom bar, legend, toolbar,
 * panel, composer and floating Assistant control is checked.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is required. Run with NODE_PATH pointing at a playwright/node_modules directory.");
  process.exit(2);
}

const BASE = process.env.EDUFLOW_BASE_URL ?? "http://localhost:5173";
const ACCOUNT_DIR = process.env.EDUFLOW_ACCOUNT_DIR
  ?? "/private/tmp/claude-501/-Users-fanyuhang-Documents-OpenUniflo-EduFlow/9f4374c6-ac1f-468f-a0ea-e3aafba16fea/scratchpad/conv-f/my4";
const SHOTS_DIR = process.env.EDUFLOW_SHOTS_DIR ?? path.resolve("artifacts/bottom-overlap");
const REPORT = process.env.EDUFLOW_REPORT ?? path.join(SHOTS_DIR, "overlap-report.json");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const WIDTHS = [1280, 1440, 1728];
const PAGES = [
  { id: "home", path: "/", open: (page) => page.getByRole("button", { name: "我的", exact: true }).click() },
  { id: "course", path: "/courses/agentic-ai-golden?view=course", open: (page) => page.locator(".ef-imm-node--knowledge").first().click({ force: true }) },
  { id: "archive", path: "/archive", open: async (page) => { await page.goto(BASE + "/archive?focus=knowledge%3AA02", { waitUntil: "networkidle" }); await page.waitForTimeout(1800); } },
  { id: "material", path: "/courses/agentic-ai-golden/materials/golden-parallel-lesson", closed: (page) => page.locator(".atlas-lesson-collapse").first().click() },
  { id: "records", path: "/records", open: (page) => page.locator(".course-design-assistant-trigger").click() },
  { id: "works", path: "/works", open: (page) => page.locator(".course-design-assistant-trigger").click() }
];

async function login(page, width) {
  const account = JSON.parse(fs.readFileSync(path.join(ACCOUNT_DIR, `.acct${width}.json`), "utf8"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(account.email);
  await page.getByRole("textbox", { name: "密码" }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForTimeout(3500);
}

async function overlaps(page) {
  return page.evaluate(() => {
    const bottom = window.innerHeight - 160;
    const primary = ".ef-imm-stage, .ef-archive-atlas, .atlas-lesson-scroll";
    const selectors = "button,a,input,textarea,select,summary,[role=\"button\"],[role=\"tab\"],p,span,small,strong,em,b,label,h1,h2,h3,h4,h5,h6,li,time";
    const clippedRect = (element) => {
      const rect = element.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      let right = rect.right;
      let bottomEdge = rect.bottom;
      for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (/(hidden|auto|scroll|clip)/.test(style.overflowX + style.overflowY)) {
          const box = parent.getBoundingClientRect();
          left = Math.max(left, box.left);
          top = Math.max(top, box.top);
          right = Math.min(right, box.right);
          bottomEdge = Math.min(bottomEdge, box.bottom);
        }
      }
      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, window.innerWidth);
      bottomEdge = Math.min(bottomEdge, window.innerHeight);
      return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottomEdge - top) };
    };
    const items = [];
    for (const element of document.querySelectorAll(selectors)) {
      if (element.closest(primary) || element.matches("canvas,svg")) continue;
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (element.closest("[aria-hidden=\"true\"],[inert]")) continue;
      const rect = clippedRect(element);
      if (rect.w < 1 || rect.h < 1) continue;
      if (rect.y + rect.h < bottom || rect.y > window.innerHeight) continue;
      const interactive = element.matches("button,a,input,textarea,select,summary,[role=\"button\"],[role=\"tab\"]");
      const directText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      if (!interactive && !directText) continue;
      const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
      if (!interactive && !text) continue;
      items.push({ element, tag: element.tagName, className: String(element.className).slice(0, 80), text, interactive, rect });
    }
    const found = [];
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const x = Math.max(0, Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - Math.max(a.rect.x, b.rect.x));
        const y = Math.max(0, Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - Math.max(a.rect.y, b.rect.y));
        if (x * y > 2) found.push({ a: `${a.tag}.${a.className} ${a.text}`, b: `${b.tag}.${b.className} ${b.text}`, area: Math.round(x * y) });
      }
    }
    return { items: items.length, overlaps: found };
  });
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const report = { generatedAt: new Date().toISOString(), base: BASE, widths: WIDTHS, groups: [], failures: 0 };
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const authPage = await context.newPage();
  await login(authPage, width);
  await authPage.close();
  for (const definition of PAGES) {
    for (const state of ["open", "closed"]) {
      const page = await context.newPage();
      await page.goto(BASE + definition.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(2200);
      const action = state === "open" ? definition.open : definition.closed;
      if (action) await action(page);
      await page.waitForTimeout(1200);
      const result = await overlaps(page);
      const screenshot = path.join(SHOTS_DIR, `${definition.id}-${width}-panel-${state}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      const group = { page: definition.id, width, panel: state, items: result.items, overlaps: result.overlaps, screenshot };
      report.groups.push(group);
      if (result.overlaps.length) report.failures += 1;
      console.log(`${definition.id} ${width} panel=${state}: items=${result.items} overlaps=${result.overlaps.length}`);
      await page.close();
    }
  }
  await context.close();
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
await browser.close();
console.log(`groups=${report.groups.length} failures=${report.failures} report=${REPORT}`);
process.exit(report.failures ? 1 : 0);
