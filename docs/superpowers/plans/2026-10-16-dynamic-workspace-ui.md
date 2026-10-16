# Dynamic Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the borderless dynamic-workspace shell (知识世界 / 能力路线 / 课程泳道) on a new branch of `prototype`, served by this app instead of `127.0.0.1:8765`.

**Architecture:** Vendor the existing canvas graph under `public/dynamic-workspace/graph/` so Vite serves it same-origin. Add an authenticated React page at `/workspace` that embeds that graph in a white, borderless frame and switches the three views. Do not add a second learner LLM runtime and do not replace `LearningPage`.

**Tech Stack:** React 19, React Router 7, Vite 7, Vitest, TypeScript. No new dependencies.

## Global Constraints

- pnpm is the only package manager. This change adds no dependencies and must not add a lockfile of another package manager.
- Learner-facing Assistant/chat surfaces MUST use the one Global Assistant runtime. This page MUST NOT start a model call or a page-specific conversation runtime.
- The graph MUST NOT reference `127.0.0.1:8765` or any other dev server.
- `/` stays `LearningPage`. The new surface is `/workspace`.
- Embedded graph background is white (`#ffffff`) and the page frame has no card border.
- Authenticated only: unsigned visitors are redirected to `/login`.

---

### Task 1: Vendor the graph

**Files:**
- Create: `public/dynamic-workspace/graph/index.html`
- Create: `public/dynamic-workspace/graph/app.js`
- Create: `public/dynamic-workspace/graph/styles.css`
- Test: `src/features/workspace/graphAsset.test.ts`

**Interfaces:**
- Consumes: the local demo files `demo/index.html`, `demo/app.js`, `demo/styles.css` from the parent EduFlow workspace (not this git repo).
- Produces: `GET /dynamic-workspace/graph/index.html?embed=1&bare=1&view=ability|world|lane` renders the canvas. `bare=1` hides the in-graph tab row.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("serves a same-origin embeddable graph", () => {
  const html = readFileSync("public/dynamic-workspace/graph/index.html", "utf8");
  expect(html).toContain('src="app.js');
  expect(html).toContain('href="styles.css');
  expect(html).toContain('get("bare")');
  expect(html).not.toContain("127.0.0.1:8765");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/workspace/graphAsset.test.ts`
Expected: FAIL because `public/dynamic-workspace/graph/index.html` does not exist.

- [ ] **Step 3: Copy the demo graph and add bare mode**

Copy `demo/index.html`, `demo/app.js`, and `demo/styles.css` into `public/dynamic-workspace/graph/` with those filenames.

In the copied `index.html` head script, also add the bare class:

```html
<script>const q=new URLSearchParams(location.search);if(q.get("embed")==="1")document.documentElement.classList.add("embed");if(q.get("bare")==="1")document.documentElement.classList.add("bare");</script>
```

In the copied `styles.css`, hide the in-frame tabs when bare:

```css
html.embed.bare #lenses { display: none; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/workspace/graphAsset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/dynamic-workspace/graph src/features/workspace/graphAsset.test.ts
git commit -m "feat: vendor the dynamic workspace graph"
```

### Task 2: Workspace page

**Files:**
- Create: `src/features/workspace/graphFrame.ts`
- Create: `src/features/workspace/DynamicWorkspacePage.tsx`
- Create: `src/features/workspace/dynamicWorkspace.css`
- Test: `src/features/workspace/DynamicWorkspacePage.test.tsx`

**Interfaces:**
- Consumes: `graphFrameSrc(view)` returns the public graph URL.
- Produces: `DynamicWorkspacePage({ session, onLogout })` and `GraphView = "ability" | "world" | "lane"`.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DynamicWorkspacePage } from "./DynamicWorkspacePage";
import { graphFrameSrc } from "./graphFrame";
import type { MockSession } from "@/features/auth/types";

const session: MockSession = { userId: "student", name: "student", email: "student@example.com", role: "student", capabilities: [], createdAt: "2026-01-01" };

it("maps the three workspace entries onto one white graph", () => {
  expect(graphFrameSrc("ability")).toBe("/dynamic-workspace/graph/index.html?embed=1&bare=1&view=ability");
  expect(graphFrameSrc("world")).toContain("view=world");
  expect(graphFrameSrc("lane")).toContain("view=lane");
  const html = renderToStaticMarkup(<MemoryRouter><DynamicWorkspacePage session={session} onLogout={() => undefined} /></MemoryRouter>);
  expect(html).toContain("/dynamic-workspace/graph/index.html?embed=1&amp;bare=1&amp;view=ability");
  expect(html).toContain("课程技能树");
  expect(html).toContain("能力模型");
  expect(html).toContain("课程路线");
  expect(html).toContain("不会另起一个模型");
  expect(html).not.toContain("127.0.0.1:8765");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/workspace/DynamicWorkspacePage.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Write the page**

`src/features/workspace/graphFrame.ts`

```ts
export type GraphView = "ability" | "world" | "lane";
export function graphFrameSrc(view: GraphView) {
  return `/dynamic-workspace/graph/index.html?embed=1&bare=1&view=${view}`;
}
```

`src/features/workspace/DynamicWorkspacePage.tsx` renders `GlobalNav active="workspace"`, three buttons, and an iframe whose `src` is `graphFrameSrc(view)`. Default view is `ability`. Include the sentence `布局演示。对话仍使用全局助手，这里不会另起一个模型。` No fetch, no assistant client.

`src/features/workspace/dynamicWorkspace.css` sets a white page, transparent stage, borderless iframe (`border: 0; background: #fff`), and a selected pill (`background: #1c1915; color: #fff`) with `aria-pressed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/workspace/DynamicWorkspacePage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace
git commit -m "feat: add the borderless dynamic workspace page"
```

### Task 3: Route and navigation

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/GlobalNav.tsx`
- Modify: `src/app/components/GlobalNav.test.ts`

**Interfaces:**
- Consumes: `DynamicWorkspacePage` from Task 2.
- Produces: authenticated route `/workspace` and nav id `"workspace"` immediately after `"learning"`.

- [ ] **Step 1: Write the failing test**

Update `GlobalNav.test.ts` expectations to:

```ts
["learning","workspace","explore","courses","canvas"]
["learning","workspace","explore","courses","canvas","teaching"]
["learning","workspace","explore","courses","canvas","teaching","system"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/GlobalNav.test.ts`
Expected: FAIL because `"workspace"` is missing.

- [ ] **Step 3: Add the nav item and route**

In `GlobalNav.tsx`, extend `GlobalNavActive` with `"workspace"`, insert `{id:"workspace",to:"/workspace",label:"工作台"}` after learning, and map `workspace` to the `MessagesSquare` icon.

In `App.tsx`, import `DynamicWorkspacePage` and add:

```tsx
<RouterRoute path="/workspace" element={protectedElement(session ? <DynamicWorkspacePage session={session} onLogout={logout} /> : null)} />
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/app/components/GlobalNav.test.ts src/features/workspace/DynamicWorkspacePage.test.tsx src/features/workspace/graphAsset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/app/components/GlobalNav.tsx src/app/components/GlobalNav.test.ts
git commit -m "feat: open the dynamic workspace from primary navigation"
```
