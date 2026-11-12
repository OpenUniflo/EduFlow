import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NativeInteraction } from "@/features/learning/micro/NativeInteraction";
import type { MicroStep } from "@/features/learning/micro/microLearning";

const css = readFileSync("src/features/learning/micro/microImmersive.css", "utf8");
const legacyCss = readFileSync("src/shared/styles/product.css", "utf8");

function rule(selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing selector ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}

function step(interaction: MicroStep["interaction"]): MicroStep {
  return { id: "step", kind: "interaction", title: "Agent 组件", body: "哪些陈述正确？", interaction };
}

describe("Micro choice option layout", () => {
  it("renders the option copy as the growing label and the marker as its tail", () => {
    const html = renderToStaticMarkup(<NativeInteraction
      step={step({ type: "choice", options: ["Model：模型提供推理能力", "Tool：工具负责执行动作", "State：状态保存上下文", "Agent：协调模型与工具"], correctIndex: 0 })}
      answer="Tool：工具负责执行动作"
      completed={false}
      revealed
      onAnswer={() => undefined}
    />);
    expect(html.match(/class="micro-choice-label"/g)).toHaveLength(4);
    expect(html).toContain("Model：模型提供推理能力");
    expect(html).toContain('class="micro-choice-state is-incorrect"');
    expect(html).toContain('class="micro-choice-state is-correct"');
  });

  it("keeps the labels flexible and the correctness markers non-shrinking in all three forms", () => {
    for (const shell of [".ef-micro-shell", ".ef-home-micro"]) {
      for (const kind of ["choice", "multiple-choice"]) {
        const label = rule(`${shell} .micro-interaction.${kind} button > .micro-choice-label`);
        expect(label).toContain("flex: 1 1 auto");
        expect(label).toContain("min-width: 0");
        expect(label).toContain("white-space: normal");
        expect(label).toContain("overflow-wrap: anywhere");
      }
    }
    const marker = rule(".ef-micro-shell .micro-choice-state");
    expect(marker).toContain("flex: 0 0 auto");
    expect(marker).toContain("white-space: nowrap");
    // The legacy 22px checkmark span must not target the new choice label.
    expect(legacyCss).toContain(".micro-interaction button span:not(.micro-choice-label):not(.micro-choice-state)");
  });
});
