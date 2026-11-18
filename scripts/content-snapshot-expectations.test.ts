import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_SNAPSHOT_HEADER } from "./content-import";
import {
  deriveContentExpectations,
  loadContentExpectations,
  parseContentSnapshotSql,
  parseSnapshotValues
} from "./content-snapshot-expectations";

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const insert = (table: string, columns: string[], values: string) =>
  `insert into public.${table} (${columns.join(", ")}) values (${values}) on conflict (id) do update set id = excluded.id;`;

function fixtureSnapshot(overrides: { goldenAssignments?: string[]; extraAssignments?: string[]; courses?: string[] } = {}) {
  const courses = overrides.courses ?? ["agentic-ai-golden", "python-engineering"];
  const goldenAssignments = overrides.goldenAssignments ?? [
    insert("course_assignments", ["course_id", "id", "display_order", "mode", "expected_output", "experience"], `${sqlString("agentic-ai-golden")}, ${sqlString("golden-trace")}, 0, ${sqlString("instruction")}, ${sqlString("trace-artifact")}, ${sqlString(JSON.stringify({ type: "trace", faultyStepId: "cancel" }))}`),
    insert("course_assignments", ["course_id", "id", "display_order", "mode", "expected_output", "experience"], `${sqlString("agentic-ai-golden")}, ${sqlString("golden-code")}, 1, ${sqlString("instruction")}, ${sqlString("code-artifact")}, ${sqlString(JSON.stringify({ type: "code" }))}`)
  ];
  const extraAssignments = overrides.extraAssignments ?? [
    insert("course_assignments", ["course_id", "id", "display_order", "mode", "expected_output", "experience"], `${sqlString("python-engineering")}, ${sqlString("python-practice")}, 0, ${sqlString("instruction")}, ${sqlString("python-artifact")}, NULL`)
  ];
  return `${CONTENT_SNAPSHOT_HEADER}
${courses.map((courseId) => insert("courses", ["id", "title"], `${sqlString(courseId)}, ${sqlString(`Course ${courseId}`)}`)).join("\n")}
${insert("curriculum_chapters", ["course_id", "id", "display_order"], `${sqlString("agentic-ai-golden")}, ${sqlString("golden-chapter-1")}, 0`)}
${insert("curriculum_chapters", ["course_id", "id", "display_order"], `${sqlString("agentic-ai-golden")}, ${sqlString("golden-chapter-2")}, 1`)}
${insert("curriculum_lessons", ["course_id", "id", "display_order"], `${sqlString("python-engineering")}, ${sqlString("python-lesson-1")}, 0`)}
${[...goldenAssignments, ...extraAssignments].join("\n")}
`;
}

function writeFixture(body: string) {
  const directory = mkdtempSync(join(tmpdir(), "eduflow-content-expectations-"));
  const path = join(directory, "snapshot.sql");
  writeFileSync(path, body);
  return path;
}

describe("content snapshot expectations", () => {
  it("parses SQL literals, escaped quotes, JSON strings and NULL", () => {
    expect(parseSnapshotValues(`'a''b', 3, NULL, '{"type":"trace","label":"a,b"}', false`)).toEqual([
      "a'b",
      3,
      null,
      '{"type":"trace","label":"a,b"}',
      false
    ]);
  });

  it("parses E-strings emitted for multiline content", () => {
    expect(parseSnapshotValues("E'line one\\nline \\'two\\' \\\\ path', 'plain', 2")).toEqual([
      "line one\nline 'two' \\ path",
      "plain",
      2
    ]);
  });

  it("parses only product-content INSERTs and ignores unrelated SQL", () => {
    const rows = parseContentSnapshotSql(fixtureSnapshot());
    expect(rows.get("courses")?.map((row) => row.id)).toEqual(["agentic-ai-golden", "python-engineering"]);
    expect(rows.get("course_assignments")?.map((row) => row.id)).toEqual(["golden-trace", "golden-code", "python-practice"]);
  });

  it("derives counts, types and executable Practices from the snapshot", () => {
    const path = writeFixture(fixtureSnapshot());
    const content = deriveContentExpectations(path);
    expect(content.courseIds).toEqual(["agentic-ai-golden", "python-engineering"]);
    expect(content.goldenChapterCount).toBe(2);
    expect(content.goldenAssignmentIds).toEqual(["golden-code", "golden-trace"]);
    expect(content.goldenAssignmentTypes).toEqual(["code", "trace"]);
    expect(content.traceAssignment).toEqual({ id: "golden-trace", faultyStepId: "cancel" });
    expect(content.manualAssignmentId).toBe("golden-code");
    expect(content.otherCourseId).toBe("python-engineering");
    expect(content.progressCourseId).toBe("python-engineering");
    expect(content.progressLessonId).toBe("python-lesson-1");
    expect(content.progressAssignmentId).toBe("python-practice");
  });

  it("loads the latest snapshot from a directory", () => {
    const path = writeFixture(fixtureSnapshot());
    const content = loadContentExpectations(dirname(path));
    expect(content.snapshotPath).toBe(path);
  });

  it("rejects Practices without a submission contract", () => {
    const path = writeFixture(fixtureSnapshot({
      extraAssignments: [
        insert("course_assignments", ["course_id", "id", "display_order", "mode", "expected_output", "experience"], `${sqlString("python-engineering")}, ${sqlString("python-no-output")}, 0, ${sqlString("instruction")}, ${sqlString("")}, NULL`)
      ]
    }));
    expect(() => deriveContentExpectations(path)).toThrow(/without a submission contract: python-no-output/);
  });

  it("rejects snapshots that still contain answer Practices", () => {
    const path = writeFixture(fixtureSnapshot({
      extraAssignments: [
        insert("course_assignments", ["course_id", "id", "display_order", "mode", "expected_output", "experience"], `${sqlString("python-engineering")}, ${sqlString("python-answer")}, 0, ${sqlString("instruction")}, ${sqlString("answer-artifact")}, ${sqlString(JSON.stringify({ type: "answer" }))}`)
      ]
    }));
    expect(() => deriveContentExpectations(path)).toThrow(/answer Practices: python-answer/);
  });

  it("rejects a snapshot without the Golden Course or its trace/code Practices", () => {
    expect(() => deriveContentExpectations(writeFixture(fixtureSnapshot({ courses: ["python-engineering"] })))).toThrow(/missing the Golden Course/);
    const noTrace = writeFixture(fixtureSnapshot({
      goldenAssignments: [
        insert("course_assignments", ["course_id", "id", "display_order", "mode", "expected_output", "experience"], `${sqlString("agentic-ai-golden")}, ${sqlString("golden-code")}, 0, ${sqlString("instruction")}, ${sqlString("code-artifact")}, ${sqlString(JSON.stringify({ type: "code" }))}`)
      ]
    }));
    expect(() => deriveContentExpectations(noTrace)).toThrow(/trace Practice/);
  });
});
