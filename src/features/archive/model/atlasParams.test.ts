import { describe, expect, it } from "vitest";
import { archiveHref, parseArchiveSearch } from "./atlasParams";

describe("Archive presentation URL", () => {
  it("parses focus, panel, search and comparison as presentation-only state", () => {
    expect(parseArchiveSearch("?focus=me&panel=share&compare=a,b,c,d")).toEqual({ focus: { type: "me" }, panel: "share", search: "", comparePersonIds: ["a", "b", "c"] });
    expect(parseArchiveSearch("?focus=course:c1")).toEqual({ focus: { type: "course", id: "c1" }, panel: null, search: "", comparePersonIds: [] });
    expect(parseArchiveSearch("?focus=knowledge:k1&search=rag&panel=search")).toEqual({ focus: { type: "knowledge", id: "k1" }, panel: "search", search: "rag", comparePersonIds: [] });
    expect(parseArchiveSearch("?panel=unknown&focus=other")).toEqual({ focus: { type: "all" }, panel: null, search: "", comparePersonIds: [] });
  });

  it("builds stable Home/Account entry links", () => {
    expect(archiveHref({ focus: "me" })).toBe("/archive?focus=me");
    expect(archiveHref({ focus: "course:c1", panel: "courses" })).toBe("/archive?focus=course%3Ac1&panel=courses");
    expect(archiveHref({ focus: "knowledge:k1", search: " rag " })).toBe("/archive?focus=knowledge%3Ak1&search=rag");
    expect(archiveHref({ panel: "people", compare: ["a", "b"] })).toBe("/archive?panel=people&compare=a%2Cb");
  });
});
