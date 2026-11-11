import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantCardActions } from "@/features/assistant/cards/AssistantCardView";
import { HomeConversation } from "@/features/home/HomeConversation";
import type { MockSession } from "@/features/auth/types";

const read = (path: string) => readFileSync(path, "utf8");
const css = read("src/features/home/home.css");

function rule(selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing selector ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}

const session = { userId: "user", name: "测试", email: "test@example.test", role: "student" } as MockSession;
const actions: AssistantCardActions = { openObject: () => undefined };

function conversation(messages: AssistantUIMessage[], error = "") {
  return renderToStaticMarkup(<MemoryRouter>
    <HomeConversation
      messages={messages}
      session={session}
      cardActions={actions}
      loading={false}
      sending={false}
      error={error}
      contexts={[]}
      onRemoveContext={() => undefined}
      onSend={() => true}
      suggestions={[]}
      previewPerson={null}
      onRetry={() => undefined}
    />
  </MemoryRouter>);
}

describe("batch 1: answer integrity", () => {
  it("shows partial text, one failure prompt and retry for a persisted failed answer", () => {
    const html = conversation([{ id: "a1", role: "assistant", parts: [
      { type: "text", text: "已经生成的部分回答。" },
      { type: "data-failed", data: { reason: "length" } }
    ] }]);
    expect(html).toContain("已经生成的部分回答。");
    expect(html).toContain("回复没有完成，请重试。");
    expect(html).toContain("重试");
    expect(html).not.toContain("正在回复…");
  });

  it("treats a trailing user turn as unanswered, not as an in-flight reply", () => {
    const html = conversation([{ id: "u1", role: "user", parts: [{ type: "text", text: "带我从最简单的开始" }] }]);
    expect(html).toContain("没有回答，可重试。");
    expect(html).not.toContain("正在准备回答…");
    expect(html).not.toContain('class="ef-ui-textarea ef-ui-composer-input" disabled');
    expect(html).not.toContain('ef-ui-composer-input" disabled');
  });
});

describe("batch 1: one card action", () => {
  it("has no card-specific page navigation left in the card renderer", () => {
    const source = read("src/features/assistant/cards/AssistantCardView.tsx");
    for (const oldAction of ["openCourse", "openMaterial", "openRecords", "openBrief", "openArchive", "openPracticeAttempt", "openRoutePanel", "openKnowledgePanel"]) {
      expect(source).not.toContain(`actions.${oldAction}`);
    }
    expect(source).toContain("openObject");
  });

  it("retries a failed turn in place instead of appending a duplicate", () => {
    const runtime = read("src/features/assistant/AssistantRuntimeContext.tsx");
    const server = read("api/assistant.ts");
    expect(runtime).toContain("retryTargetRef");
    expect(runtime).toContain("assistantMessageId");
    expect(server).toContain("replaceFailedMessageId");
    expect(server).toContain("Assistant retry user lookup");
    expect(server).toContain("Assistant retry replacement");
  });

  it("maps the Home card action to the shared object target only", () => {
    const source = read("src/features/learning/pages/LearningPage.tsx");
    expect(source).toContain("openObject: (target, origin, trigger) => openObject(target, origin, trigger)");
    expect(source).not.toContain("openCourse: (courseId) => navigate");
    expect(source).not.toContain("openMaterial: (courseId, materialId");
  });

  it("has one panel kind for material, records and brief", () => {
    const source = read("src/features/home/rightPanel.ts");
    expect(source).toContain('kind: "material"');
    expect(source).toContain('kind: "records"');
    expect(source).toContain('kind: "brief"');
  });
});

describe("batch 1: layout roots", () => {
  it("gives the My current-course row an explicit grid, not first-span inheritance", () => {
    expect(rule(".ef-my-row {")).toContain("display: grid");
    expect(css).toContain(".ef-my-row > span:first-child:not(.ef-my-row-main)");
    expect(rule(".ef-my-row > .ef-my-row-main {")).toContain("grid-template-columns: auto minmax(0, 1fr)");
  });

  it("keeps the fresh start screen when My opens", () => {
    expect(css).not.toContain(".ef-home.has-panel .ef-home-fresh { display: none; }");
    expect(css).toContain(".ef-home.has-panel .ef-home-fresh { padding-right:");
  });

  it("fits the whole archive course plane in both axes", () => {
    const source = read("src/features/archive/components/ArchiveAtlasScene.tsx");
    expect(source).toContain("availableHeight / planeHeight");
    expect(source).not.toContain("Math.max(MIN_CARD_SCALE");
  });

  it("reserves constant space for jump-to-latest so it never covers text", () => {
    expect(css).toContain("padding: var(--sp-4) 0 calc(var(--ef-strip-h, 64px) + 44px);");
    expect(read("src/features/home/HomeConversation.tsx")).toContain("ef-home-jump-slot");
    expect(rule(".ef-home-jump {")).toContain("position: static");
  });

  it("uses one navigation placeholder for fixed page chrome", () => {
    const frame = read("src/shared/styles/page-frame.css");
    expect(frame).toContain("--ef-page-left");
    expect(frame).toContain("margin-left: var(--ef-page-left)");
    expect(frame).toContain("calc(var(--ef-page-left) + var(--material-shell-margin))");
  });
});

describe("batch 1: interactions", () => {
  it("mounts H5P in the document so its xAPI dispatcher is reachable", () => {
    const source = read("src/features/learning/micro/H5PInteraction.tsx");
    expect(source).toContain('embedType:"div"');
    expect(source).toContain("waitForContent");
  });

  it("sends the course page back to the archive course plane", () => {
    const source = read("src/features/course/pages/CourseLearnerRoutePage.tsx");
    expect(source).toContain("archiveHref({ focus: `course:${courseId}` })");
    expect(source).toContain("<span>档案</span>");
  });

  it("feeds the archive course count and list from one active projection", () => {
    const source = read("src/features/archive/components/ArchivePeoplePanels.tsx");
    expect(source).toContain("const activeCourses = useMemo");
    expect(source).toContain("const listedCourses = view === \"me\" ? activeCourses : courses");
    expect(source).toContain("<b>{activeCourses.length}</b>");
    expect(source).toContain("listedCourses.slice(0, 4)");
  });

  it("collapses the history column only after the panel morph window", () => {
    const source = read("src/features/learning/pages/LearningPage.tsx");
    expect(source).toContain("panelLayoutGraceUntil");
    expect(source).toContain("const wait = panelLayoutGraceUntil.current - performance.now()");
  });
});
