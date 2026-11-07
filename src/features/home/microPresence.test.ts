import { describe, expect, it } from "vitest";
import {
  MICRO_FORM_STORAGE_KEY,
  defaultMicroForm,
  formatMicroParam,
  parseMicroParam,
  parseMicroView,
  preferredMicroForm,
  readMicroFormPreference,
  reduceMicroPresence,
  writeMicroFormPreference,
  type MicroOpenInput,
  type MicroPresenceState
} from "./microPresence";

const path: MicroOpenInput = { pathId: "p1", knowledgeId: "k1", courseId: "c1" };
const otherPath: MicroOpenInput = { pathId: "p2", knowledgeId: "k2" };
const empty: MicroPresenceState = { presence: null };

function open(state: MicroPresenceState, form: "inline" | "side" | "focus" | "closed" = "inline", input = path) {
  return reduceMicroPresence(state, { type: "open", input, form, defaultForm: "inline" });
}

describe("micro presence reducer", () => {
  it("opens a path in the requested form and remembers a non-focus return form", () => {
    const side = open(empty, "side");
    expect(side.presence).toMatchObject({ ...path, form: "side", returnForm: "side" });
    const focus = reduceMicroPresence(side, { type: "set-form", form: "focus" });
    expect(focus.presence).toMatchObject({ ...path, form: "focus", returnForm: "side" });
  });

  it("returns from focus to the form it came from", () => {
    const inline = open(empty, "inline");
    const focus = reduceMicroPresence(inline, { type: "set-form", form: "focus" });
    expect(focus.presence?.returnForm).toBe("inline");
    const back = reduceMicroPresence(focus, { type: "set-form", form: focus.presence!.returnForm });
    expect(back.presence).toMatchObject({ form: "inline", returnForm: "inline" });
  });

  it("never uses focus as the return form when opening directly in focus", () => {
    const focus = open(empty, "focus");
    expect(focus.presence).toMatchObject({ form: "focus", returnForm: "inline" });
    expect(open(empty, "focus", otherPath).presence?.returnForm).toBe("inline");
  });

  it("keeps the running path mounted and its answers alive when closed", () => {
    const inline = open(empty, "inline");
    const closed = reduceMicroPresence(inline, { type: "set-form", form: "closed" });
    expect(closed.presence).toMatchObject({ ...path, form: "closed", returnForm: "inline" });
    const reopened = open(closed, "inline");
    expect(reopened.presence).toMatchObject({ ...path, form: "inline", returnForm: "inline" });
  });

  it("remembers a side form after dismissal so the next open returns there", () => {
    const side = open(empty, "side");
    const dismissed = reduceMicroPresence(side, { type: "dismiss-side" });
    expect(dismissed.presence).toMatchObject({ form: "closed", returnForm: "side" });
    expect(open(dismissed, dismissed.presence!.returnForm).presence?.form).toBe("side");
  });

  it("dismisses only the side form", () => {
    for (const form of ["inline", "focus", "closed"] as const) {
      const state = open(empty, form);
      expect(reduceMicroPresence(state, { type: "dismiss-side" })).toBe(state);
    }
  });

  it("moving between inline and side updates the remembered form", () => {
    const inline = open(empty, "inline");
    const side = reduceMicroPresence(inline, { type: "set-form", form: "side" });
    expect(side.presence).toMatchObject({ form: "side", returnForm: "side" });
    const back = reduceMicroPresence(side, { type: "set-form", form: "inline" });
    expect(back.presence).toMatchObject({ form: "inline", returnForm: "inline" });
  });

  it("opens another path with one presence only and clears it without losing the path first", () => {
    const first = open(empty, "inline");
    const second = open(first, "side", otherPath);
    expect(second.presence).toMatchObject({ ...otherPath, form: "side", returnForm: "side" });
    expect(reduceMicroPresence(second, { type: "clear" })).toEqual(empty);
  });

  it("does not allocate a new state for idempotent actions", () => {
    const inline = open(empty, "inline");
    expect(open(inline, "inline")).toBe(inline);
    expect(reduceMicroPresence(inline, { type: "set-form", form: "inline" })).toBe(inline);
    expect(reduceMicroPresence(empty, { type: "dismiss-side" })).toBe(empty);
    expect(reduceMicroPresence(empty, { type: "clear" })).toBe(empty);
  });

  it("defaults multi-unit paths to the side and single-unit paths to the conversation", () => {
    expect(defaultMicroForm(1)).toBe("inline");
    expect(defaultMicroForm(2)).toBe("side");
    expect(preferredMicroForm("inline", "side")).toBe("side");
    expect(preferredMicroForm("side", "inline")).toBe("inline");
    expect(preferredMicroForm("inline", "focus")).toBe("inline");
    expect(preferredMicroForm("side", null)).toBe("side");
  });

  it("round-trips the address value including course ids with colons", () => {
    expect(parseMicroParam("k1:p1:c1")).toEqual(path);
    expect(parseMicroParam("k1:p1:course:with:colons")).toEqual({ pathId: "p1", knowledgeId: "k1", courseId: "course:with:colons" });
    expect(parseMicroParam("k1")).toBeNull();
    expect(parseMicroParam("")).toBeNull();
    expect(formatMicroParam(path)).toBe("k1:p1:c1");
    expect(formatMicroParam(otherPath)).toBe("k2:p2:");
  });

  it("accepts only the three addressable forms", () => {
    expect(parseMicroView("focus")).toBe("focus");
    expect(parseMicroView("side")).toBe("side");
    expect(parseMicroView("inline")).toBeNull();
    expect(parseMicroView("closed")).toBeNull();
    expect(parseMicroView(null)).toBeNull();
  });

  it("guards preference storage with try/catch", () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); }
    };
    expect(readMicroFormPreference(fake)).toBeNull();
    for (const form of ["inline", "side", "focus", "closed"] as const) {
      writeMicroFormPreference(form, fake);
      expect(storage.get(MICRO_FORM_STORAGE_KEY)).toBe(form);
      expect(readMicroFormPreference(fake)).toBe(form);
    }
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readMicroFormPreference(throwing)).toBeNull();
    expect(() => writeMicroFormPreference("inline", throwing)).not.toThrow();
  });
});
