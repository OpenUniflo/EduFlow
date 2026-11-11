// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { hasOpenModalLayer, shouldHandleShellEscape } from "@/shared/ui/escapeLayer";

const read = (path: string) => readFileSync(path, "utf8");
const cleanups: Array<() => void> = [];

function onEscape(listener: (event: KeyboardEvent) => void) {
  window.addEventListener("keydown", listener);
  cleanups.push(() => window.removeEventListener("keydown", listener));
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

describe("Object Shell Escape ownership", () => {
  it("closes only the overlay on the first Escape and the panel on the next", () => {
    document.body.innerHTML = '<section id="panel"><div id="overlay" role="dialog" aria-modal="true"></div></section>';
    let panelOpen = true;
    let overlayOpen = true;
    // Deliberately register the panel first: the old bug closed it before the
    // overlay could consume the key.
    onEscape((event) => {
      if (!shouldHandleShellEscape(event)) return;
      panelOpen = false;
    });
    onEscape((event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      overlayOpen = false;
      document.getElementById("overlay")?.remove();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlayOpen).toBe(false);
    expect(panelOpen).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panelOpen).toBe(false);
  });

  it("recognizes native dialogs and aria-modal dialog layers, but not closed or non-modal panels", () => {
    document.body.innerHTML = '<dialog id="native"></dialog><aside id="panel" role="dialog" aria-modal="false"></aside>';
    expect(hasOpenModalLayer()).toBe(false);

    const native = document.getElementById("native")!;
    native.setAttribute("open", "");
    expect(hasOpenModalLayer()).toBe(true);
    native.removeAttribute("open");

    const panel = document.getElementById("panel")!;
    panel.setAttribute("aria-modal", "true");
    expect(hasOpenModalLayer()).toBe(true);
  });

  it("routes every Object Shell Escape path through the shared rule", () => {
    for (const file of [
      "src/features/learning/pages/LearningPage.tsx",
      "src/features/assistant/GlobalObjectHost.tsx",
      "src/features/course/practice/PracticeObject.tsx"
    ]) {
      const source = read(file);
      expect(source).toContain("shouldHandleShellEscape");
      expect(source).not.toContain('document.querySelector("dialog[open]")');
    }
  });
});
