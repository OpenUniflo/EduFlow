import { describe, expect, it } from "vitest";
import { planReferenceHistoryBack, resolveReferencePopState } from "./referenceHistory";

const target = { url: "/works/target", parentPath: "/works/parent" };
const leaf = { url: "/works/leaf", parentPath: "/works/target" };
const clean = (entry: typeof target & { key?: string }) => ({ ...entry, key: entry.url, canHistoryClose: () => true });

describe("fixed-reference browser history", () => {
  it("keeps the overlay mounted when Forward returns to its own target URL", () => {
    expect(resolveReferencePopState("/works/target", [target])).toEqual({ closeFrom: 1, stopRouter: true });
  });

  it("closes the top overlay when Back reaches its caller and suppresses the router remount", () => {
    expect(resolveReferencePopState("/works/parent", [target])).toEqual({ closeFrom: 0, stopRouter: true });
    expect(resolveReferencePopState("/works/target", [target, leaf])).toEqual({ closeFrom: 1, stopRouter: true });
  });

  it("closes every level above a skipped ancestor", () => {
    expect(resolveReferencePopState("/works/parent", [target, leaf])).toEqual({ closeFrom: 0, stopRouter: true });
    expect(resolveReferencePopState("/works/target", [target, leaf])).toEqual({ closeFrom: 1, stopRouter: true });
  });

  it("lets the router leave when Back moves outside the overlay stack", () => {
    expect(resolveReferencePopState("/works", [target, leaf])).toEqual({ closeFrom: 0, stopRouter: false });
    expect(resolveReferencePopState("/works/target", [])).toEqual({ closeFrom: 0, stopRouter: false });
  });
});

describe("browser Back leave planning", () => {
  it("closes a clean level without a prompt", () => {
    expect(planReferenceHistoryBack("/works/parent", [clean(target)])).toEqual({ kind: "close", closeFrom: 0, stopRouter: true });
  });

  it("restores one native entry instead of silently rejecting a dirty Back", () => {
    expect(planReferenceHistoryBack("/works/parent", [{ ...target, key: "target", canHistoryClose: () => false }]))
      .toEqual({ kind: "restore", closeFrom: 0, restoreSteps: 1 });
  });

  it("protects every dirty level when one Back skips multiple overlays", () => {
    expect(planReferenceHistoryBack("/works/parent", [
      { ...target, key: "target", canHistoryClose: () => true },
      { ...leaf, key: "leaf", canHistoryClose: () => false },
    ])).toEqual({ kind: "restore", closeFrom: 0, restoreSteps: 2 });
    expect(planReferenceHistoryBack("/works/parent", [
      { ...target, key: "target", canHistoryClose: () => false },
      { ...leaf, key: "leaf", canHistoryClose: () => true },
    ])).toEqual({ kind: "restore", closeFrom: 0, restoreSteps: 2 });
  });

  it("walks forward to the top when Back left the overlay stack with a dirty draft", () => {
    expect(planReferenceHistoryBack("/works", [
      { ...target, key: "target", canHistoryClose: () => false },
      { ...leaf, key: "leaf", canHistoryClose: () => false },
    ])).toEqual({ kind: "restore", closeFrom: 0, restoreSteps: 2 });
  });

  it("still closes an explicitly forced level even if its draft is protected", () => {
    expect(planReferenceHistoryBack("/works/parent", [{ ...target, key: "target", canHistoryClose: () => false, forceClose: true }]))
      .toEqual({ kind: "close", closeFrom: 0, stopRouter: true });
  });

  it("keeps the overlay when Forward returns to its own URL", () => {
    expect(planReferenceHistoryBack("/works/leaf", [clean(target), clean(leaf)])).toEqual({ kind: "keep" });
  });
});
