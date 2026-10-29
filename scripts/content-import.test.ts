import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CONTENT_SNAPSHOT_HEADER, importContentSnapshot, latestContentSnapshot, readContentSnapshot } from "./content-import";
import { LOCAL_ONLY_SUPABASE_ERROR } from "./local-supabase";

const snapshot = (body = "insert into public.courses (id) values ('fixture-course');") => `${CONTENT_SNAPSHOT_HEADER}\n${body}\n`;

function fixtureDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "eduflow-content-import-"));
  writeFileSync(join(directory, "older.sql"), snapshot());
  writeFileSync(join(directory, "notes.txt"), "ignore me");
  writeFileSync(join(directory, "newer.sql"), snapshot("insert into public.knowledge_nodes (id) values ('fixture-node');"));
  return directory;
}

describe("content snapshot import", () => {
  it("selects the newest SQL snapshot and ignores other files", () => {
    const directory = fixtureDirectory();
    expect(latestContentSnapshot(directory)).toBe(join(directory, "newer.sql"));
  });

  it("fails clearly when no snapshot exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "eduflow-content-import-empty-"));
    expect(() => latestContentSnapshot(directory)).toThrow(/No \.sql content snapshot/);
  });

  it("refuses unrecognized or content-free SQL files", () => {
    const directory = fixtureDirectory();
    writeFileSync(join(directory, "unknown.sql"), "insert into public.courses (id) values ('fixture-course');");
    expect(() => readContentSnapshot(join(directory, "unknown.sql"))).toThrow(/unrecognized SQL file/);
    writeFileSync(join(directory, "empty.sql"), `${CONTENT_SNAPSHOT_HEADER}\n-- no content here\n`);
    expect(() => readContentSnapshot(join(directory, "empty.sql"))).toThrow(/no product content inserts/);
  });

  it("rejects a non-Local Supabase URL before reading or executing a snapshot", () => {
    const run = vi.fn();
    expect(() => importContentSnapshot({ supabaseUrl: "https://example.supabase.co", file: "missing.sql", run })).toThrow(LOCAL_ONLY_SUPABASE_ERROR);
    expect(run).not.toHaveBeenCalled();
  });

  it("executes an explicit snapshot against Local Supabase through the injected runner", () => {
    const directory = fixtureDirectory();
    const run = vi.fn();
    const result = importContentSnapshot({ supabaseUrl: "http://127.0.0.1:54321", file: join(directory, "newer.sql"), run });
    expect(result.url).toBe("http://127.0.0.1:54321");
    expect(result.container).toBe("supabase_db_EduFlow");
    expect(result.snapshot.path).toBe(join(directory, "newer.sql"));
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toContain("insert into public.knowledge_nodes");
  });
});
