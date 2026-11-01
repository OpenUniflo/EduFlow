import { describe, expect, it } from "vitest";
import {
  activityLevel,
  buildHeatmapWindow,
  chapterNumbersByAssignment,
  chapterNumbersByKnowledge,
  compareRecordEventsDesc,
  countEventsByType,
  dateKeyInTimeZone,
  decodeRecordCursor,
  encodeRecordCursor,
  filterRecordEvents,
  formatTimeInTimeZone,
  groupRecordEventsByDay,
  mapRecordEvents,
  monthLabelsForDays,
  paginateRecordEvents,
  parseRecordFeedback,
  summarizeEvents,
  type RecordEvent
} from "./records";

function event(overrides: Partial<RecordEvent> & Pick<RecordEvent, "id" | "type" | "occurredAt" | "title">): RecordEvent {
  return {
    status: "learned",
    meta: {},
    links: [],
    ...overrides
  };
}

const NOW = "2026-11-02T12:00:00.000Z"; // 20:00 Asia/Shanghai
const TZ = "Asia/Shanghai";

describe("records time-zone buckets", () => {
  it("buckets the same UTC instant into different local calendar days", () => {
    expect(dateKeyInTimeZone("2026-01-01T16:30:00.000Z", "Asia/Shanghai")).toBe("2026-01-02");
    expect(dateKeyInTimeZone("2026-01-01T16:30:00.000Z", "UTC")).toBe("2026-01-01");
    expect(dateKeyInTimeZone("2026-01-01T16:30:00.000Z", "America/New_York")).toBe("2026-01-01");
  });

  it("formats timeline times in the effective zone", () => {
    expect(formatTimeInTimeZone("2026-11-02T01:05:00.000Z", TZ)).toBe("09:05");
  });

  it("uses a 53-week Monday-to-Sunday window with 371 cells", () => {
    const days = buildHeatmapWindow("2026-11-02");
    expect(days).toHaveLength(53 * 7);
    expect(days[0]?.date).toBe("2025-11-03");
    expect(days[days.length - 1]?.date).toBe("2026-11-08");
    expect(new Date(`${days[0]?.date}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${days[days.length - 1]?.date}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(monthLabelsForDays(days)[0]).toEqual({ label: "11 月", column: 1 });
    expect(monthLabelsForDays(days).length).toBeLessThanOrEqual(7);
    expect(monthLabelsForDays(days).map((month) => month.label)).toEqual(["11 月", "1 月", "3 月", "5 月", "7 月", "9 月"]);
  });

  it("maps counts to the five legend levels", () => {
    expect([0, 1, 2, 3, 4, 9].map(activityLevel)).toEqual([0, 1, 2, 3, 3, 4]);
  });
});

describe("records summary", () => {
  const events = [
    event({ id: "a", type: "micro", occurredAt: "2026-11-02T01:00:00.000Z", title: "A" }),
    event({ id: "b", type: "practice", occurredAt: "2026-11-02T02:00:00.000Z", title: "B" }),
    event({ id: "c", type: "evaluation", occurredAt: "2026-11-01T01:00:00.000Z", title: "C" }),
    event({ id: "d", type: "route", occurredAt: "2026-10-30T01:00:00.000Z", title: "D" }),
    event({ id: "e", type: "micro", occurredAt: "2026-09-01T01:00:00.000Z", title: "E" })
  ];

  it("computes totals, learning days, streak, month and last-seven-day counts", () => {
    const summary = summarizeEvents(events, NOW, TZ);
    expect(summary.totalActivities).toBe(5);
    expect(summary.windowActivities).toBe(5);
    expect(summary.learningDays).toBe(4);
    expect(summary.currentStreak).toBe(2); // today + yesterday
    expect(summary.monthActivities).toBe(3); // Nov 1 (1) + Nov 2 (2)
    expect(summary.last7Days).toBe(3); // Oct 30, Nov 1, Nov 2
    expect(summary.days.filter((day) => day.count > 0)).toHaveLength(4);
  });

  it("keeps yesterday's streak alive while today is still open, then resets after a gap", () => {
    const yesterdayOnly = [event({ id: "y1", type: "micro", occurredAt: "2026-11-01T01:00:00.000Z", title: "Y1" }), event({ id: "y2", type: "micro", occurredAt: "2026-10-31T01:00:00.000Z", title: "Y2" })];
    expect(summarizeEvents(yesterdayOnly, NOW, TZ).currentStreak).toBe(2);
    const gap = [event({ id: "old", type: "micro", occurredAt: "2026-10-30T01:00:00.000Z", title: "Old" })];
    expect(summarizeEvents(gap, NOW, TZ).currentStreak).toBe(0);
  });
});

describe("records filters and counts", () => {
  const events = [
    event({ id: "m1", type: "micro", occurredAt: "2026-11-02T01:00:00.000Z", title: "M1", courseId: "c1" }),
    event({ id: "p1", type: "practice", occurredAt: "2026-11-01T01:00:00.000Z", title: "P1", courseId: "c2" }),
    event({ id: "e1", type: "evaluation", occurredAt: "2026-10-20T01:00:00.000Z", title: "E1", courseId: "c1" }),
    event({ id: "r1", type: "route", occurredAt: "2026-08-01T01:00:00.000Z", title: "R1", courseId: "c2" })
  ];

  it("supports multi-type, course and range filters together", () => {
    const result = filterRecordEvents(events, { types: ["micro", "evaluation"], courseId: "c1", range: "last30" }, NOW, TZ);
    expect(result.map((item) => item.id)).toEqual(["m1", "e1"]);
    expect(filterRecordEvents(events, { types: [], courseId: null, range: "today" }, NOW, TZ).map((item) => item.id)).toEqual(["m1"]);
    expect(filterRecordEvents(events, { types: [], courseId: null, range: "week" }, NOW, TZ).map((item) => item.id)).toEqual(["m1"]);
    expect(filterRecordEvents(events, { types: [], courseId: null, range: "all" }, NOW, TZ)).toHaveLength(4);
  });

  it("counts each type before applying the type filter", () => {
    const scoped = filterRecordEvents(events, { types: [], courseId: "c1", range: "all" }, NOW, TZ);
    expect(countEventsByType(scoped)).toEqual({ total: 2, byType: { micro: 1, practice: 0, evaluation: 1, route: 0 } });
  });
});

describe("records cursor pagination", () => {
  const events = [5, 4, 3, 2, 1].map((value) => event({
    id: `e${value}`,
    type: "micro",
    occurredAt: `2026-11-0${value}T01:00:00.000Z`,
    title: `E${value}`
  })).sort(compareRecordEventsDesc);

  it("returns stable pages without duplicates or gaps", () => {
    const first = paginateRecordEvents(events, null, 2);
    expect(first.events.map((item) => item.id)).toEqual(["e5", "e4"]);
    expect(first.hasMore).toBe(true);
    const cursor = decodeRecordCursor(first.nextCursor);
    expect(cursor).not.toBeNull();
    const second = paginateRecordEvents(events, cursor, 2);
    expect(second.events.map((item) => item.id)).toEqual(["e3", "e2"]);
    const third = paginateRecordEvents(events, decodeRecordCursor(second.nextCursor), 2);
    expect(third.events.map((item) => item.id)).toEqual(["e1"]);
    expect(third.hasMore).toBe(false);
    expect(decodeRecordCursor(encodeRecordCursor(first.events[0]))).toEqual({ occurredAt: first.events[0].occurredAt, id: first.events[0].id });
  });

  it("rejects malformed cursors", () => {
    expect(decodeRecordCursor("")).toBeNull();
    expect(decodeRecordCursor("missing-separator")).toBeNull();
    expect(decodeRecordCursor("not-a-date|id")).toBeNull();
    expect(decodeRecordCursor(`${encodeURIComponent("2026-11-02T01:00:00.000Z")}|id|extra`)).toBeNull();
  });

  it("groups events by local day", () => {
    const groups = groupRecordEventsByDay([
      event({ id: "a", type: "micro", occurredAt: "2026-11-02T01:00:00.000Z", title: "A" }),
      event({ id: "b", type: "route", occurredAt: "2026-11-02T02:00:00.000Z", title: "B" }),
      event({ id: "c", type: "practice", occurredAt: "2026-11-01T16:00:00.000Z", title: "C" })
    ], TZ);
    expect(groups.map((group) => [group.date, group.count])).toEqual([["2026-11-02", 3]]);
  });
});

describe("records row mapping", () => {
  const base = {
    courses: [{ id: "c1", title: "Course One" }],
    knowledge: [{ id: "k1", title: "Knowledge One" }],
    assignments: [{ course_id: "c1", id: "a1", title: "Practice One" }],
    curriculumCoverages: [{ id: "cov", course_id: "c1", node_id: "k1", lesson_id: "l1", role: "introduce", display_order: 0 }],
    assignmentCoverages: [{ course_id: "c1", assignment_id: "a1", node_id: "k1" }],
    lessons: [{ course_id: "c1", id: "l1", chapter_id: "ch1", display_order: 0 }],
    chapters: [{ course_id: "c1", id: "ch1", display_order: 1 }],
    microPaths: [{ id: "p1", knowledge_id: "k1", course_id: "c1", scope: "course", mode: "learn", status: "published", title: "Path One", estimated_minutes: 6 }],
    microEvidence: [{ id: "me1", event_type: "micro_path_completed", node_id: "k1", source_entity_id: "p1", context: { pathId: "p1", courseId: "c1" }, occurred_at: "2026-11-02T01:00:00.000Z" }],
    attempts: [{ id: "at1", course_id: "c1", assignment_id: "a1", attempt_number: 2, response: { kind: "workflow", runId: "run1", submissionMode: "conversation" }, submitted_at: "2026-11-01T02:00:00.000Z" }],
    results: [
      { id: "r0", attempt_id: "at1", course_id: "c1", assignment_id: "a1", version: 1, outcome: "pending", score: null, feedback: { code: "manual_review_required", message: "The response is recorded and requires teacher review." }, evaluated_at: "2026-11-01T02:00:00.000Z" },
      { id: "r1", attempt_id: "at1", course_id: "c1", assignment_id: "a1", version: 2, outcome: "passed", score: 1, feedback: { code: "teacher_accepted", message: "完成得很好", items: [{ label: "Function", score: 20, max: 40 }] }, evaluated_at: "2026-11-01T03:00:00.000Z" }
    ],
    routeVersions: [{ id: "rv1", course_id: "c1", version_number: 3, source: "adjustment", include_node_ids: ["a", "b"], exclude_node_ids: ["c"], created_at: "2026-10-31T01:00:00.000Z" }],
    liveWorkflows: [{ runId: "run1", workflowId: "w1" }]
  };

  it("maps four real event types, skips pending evaluations and keeps only available links", () => {
    const events = mapRecordEvents(base);
    expect(events.map((item) => item.type).sort()).toEqual(["evaluation", "micro", "practice", "route"]);
    const micro = events.find((item) => item.type === "micro")!;
    expect(micro).toMatchObject({ status: "learned", title: "Knowledge One", courseTitle: "Course One", meta: { chapterNumber: 2, estimatedMinutes: 6 } });
    expect(micro.links.map((link) => link.kind)).toEqual(["micro", "course", "knowledge"]);
    const practice = events.find((item) => item.type === "practice")!;
    expect(practice).toMatchObject({ status: "passed", title: "Practice One", meta: { chapterNumber: 2, attemptNumber: 2 } });
    expect(practice.links.map((link) => link.kind)).toEqual(["practice", "course", "knowledge", "workflow", "conversation"]);
    const evaluation = events.find((item) => item.type === "evaluation")!;
    expect(evaluation).toMatchObject({ status: "passed", meta: { chapterNumber: 2, attemptNumber: 2, score: 100, scoreMax: 100, scoreConverted: true, basisCount: 2 } });
    expect(evaluation.feedback).toEqual({ summary: "老师验收通过", comment: "完成得很好", items: [{ label: "功能", value: "20 / 40" }] });
    const route = events.find((item) => item.type === "route")!;
    expect(route).toMatchObject({ status: "version", versionNumber: 3, meta: { addedSteps: 2, removedSteps: 1, source: "adjustment" } });
    expect(route.title).toBe("我的 Course One 路线");
  });

  it("omits links whose target does not exist", () => {
    const events = mapRecordEvents({
      ...base,
      assignments: [],
      courses: [],
      knowledge: [],
      microPaths: [],
      liveWorkflows: []
    });
    const practice = events.find((item) => item.type === "practice")!;
    expect(practice.links).toEqual([]);
    expect(events.find((item) => item.type === "micro")!.links).toEqual([]);
    expect(events.find((item) => item.type === "route")!.links).toEqual([]);
  });

  it("derives chapter numbers from the primary coverage and keeps real feedback fields only", () => {
    expect(chapterNumbersByKnowledge(base.curriculumCoverages, base.lessons, base.chapters).get("c1:k1")).toBe(2);
    expect(chapterNumbersByAssignment(base.assignmentCoverages, base.curriculumCoverages, base.lessons, base.chapters).get("c1:a1")).toBe(2);
    expect(parseRecordFeedback({ code: "x" })).toEqual({ summary: "评价已返回，请打开实践查看完整结果", items: [] });
    expect(parseRecordFeedback({ message: "", items: [] })).toBeUndefined();
    expect(parseRecordFeedback({ criteria: { Clarity: 8, Depth: "good" } })).toBeUndefined();
    expect(parseRecordFeedback({ code: "teacher_accepted", message: "Teacher accepted the submitted evidence." })).toEqual({
      summary: "老师验收通过",
      items: []
    });
    expect(parseRecordFeedback({ code: "unknown_code", message: "raw english reason" }, "failed")).toEqual({
      summary: "评价已返回，请打开实践查看完整结果",
      items: []
    });
    expect(parseRecordFeedback({ code: "unknown_code", message: "老师说明原因" }, "failed")).toEqual({
      summary: "评价已返回，请打开实践查看完整结果",
      comment: "老师说明原因",
      items: []
    });
    expect(parseRecordFeedback({ code: "unknown_code", message: "raw english reason" }, "failed", "manual")).toEqual({
      summary: "评价已返回，请打开实践查看完整结果",
      comment: "raw english reason",
      items: []
    });
    expect(parseRecordFeedback({
      code: "needs_revision",
      items: [
        { label: "Function", score: 0.8 },
        { label: "Depth", score: 20 },
        { label: "Clarity", score: 20, max: 40 },
        { label: "Correctness", value: 18, max: 20 }
      ]
    })).toEqual({
      summary: "需修改，请根据评语调整后重新提交",
      items: [
        { label: "功能", value: "80 / 100（按比例换算）" },
        { label: "清晰度", value: "20 / 40" },
        { label: "正确性", value: "18 / 20" }
      ]
    });
  });
});
