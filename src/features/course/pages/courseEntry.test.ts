import { describe, expect, it } from "vitest";
import { archiveHref } from "@/features/archive/model/atlasParams";
import {
  COURSE_ENTRY_LABELS,
  courseEntryState,
  courseViewFromSearch,
  courseViewSearch,
  resolveCourseEntry
} from "./courseEntry";

describe("Course entry return target", () => {
  it("falls back to the Archive course plane and says 档案 when no source is known", () => {
    const entry = resolveCourseEntry(null, "course-a");
    expect(entry).toEqual({
      source: "archive",
      label: "档案",
      returnTo: archiveHref({ focus: "course:course-a" })
    });
  });

  it("uses the explicit source and return path carried by the route state", () => {
    const home = resolveCourseEntry(courseEntryState("home", "/?conversation=1"), "course-a");
    expect(home).toMatchObject({ source: "home", label: "首页", returnTo: "/?conversation=1" });
    const my = resolveCourseEntry(courseEntryState("my", "/?panel=1"), "course-a");
    expect(my).toMatchObject({ source: "my", label: "我的", returnTo: "/?panel=1" });
  });

  it("infers the source from the existing returnTo state for legacy entries", () => {
    expect(resolveCourseEntry({ returnTo: archiveHref({ focus: "course:course-a" }) }, "course-a")).toMatchObject({ source: "archive", label: "档案" });
    expect(resolveCourseEntry({ returnTo: "/works?filter=practice" }, "course-a")).toMatchObject({ source: "works", label: "作品", returnTo: "/works?filter=practice" });
    expect(resolveCourseEntry({ returnTo: "/records" }, "course-a")).toMatchObject({ source: "records", label: "记录" });
  });

  it("rejects foreign or unsafe return paths", () => {
    expect(resolveCourseEntry(courseEntryState("home", "https://example.com"), "course-a")).toMatchObject({
      source: "archive",
      label: "档案",
      returnTo: archiveHref({ focus: "course:course-a" })
    });
    expect(resolveCourseEntry({ returnTo: "//example.com" }, "course-a")).toMatchObject({ source: "archive", label: "档案" });
    expect(resolveCourseEntry({ returnTo: "/\\example.com" }, "course-a")).toMatchObject({ source: "archive", label: "档案" });
  });

  it("has one label for every source", () => {
    expect(Object.keys(COURSE_ENTRY_LABELS).sort()).toEqual(["archive", "home", "my", "records", "teaching", "works"]);
  });
});

describe("Course view URL", () => {
  it("reads and writes only the ?view=course representation", () => {
    expect(courseViewFromSearch("?view=course")).toBe("tree");
    expect(courseViewFromSearch("?view=project")).toBe("route");
    expect(courseViewSearch("?focus=knowledge:k1&view=course", "route").toString()).toBe("focus=knowledge%3Ak1");
    expect(courseViewSearch("?focus=knowledge:k1", "tree").toString()).toBe("focus=knowledge%3Ak1&view=course");
  });
});
