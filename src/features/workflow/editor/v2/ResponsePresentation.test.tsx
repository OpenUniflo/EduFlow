import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { NodeInteraction } from "../../domain/v2/authoring";
import type { JsonValue } from "../../domain/v2/types";
import { ResponsePresentation, responsePresentation } from "./ResponsePresentation";

it("renders only current checkpoint choices and safely formats public evidence", () => {
  const interaction: NodeInteraction = {
    title: "选择", schema: { properties: { id: { type: "string" } } }, resumeWrites: { id: "selected" },
    presentation: { choices: {
      field: "id", label: "选择公告", source: "/candidates", value: "/id", title: "/title",
      facts: [{ label: "原文", path: "/source", link: true }],
    } },
  };
  const state: JsonValue = { candidates: [
    { id: "first", title: { eng: "First" }, source: "https://example.org/first" },
    { id: "second", title: "Second", source: "javascript:alert(1)" },
    { title: "Missing identifier" },
  ] };
  const model = responsePresentation(interaction, interaction.schema, state)!;
  expect([...model.hiddenFields]).toEqual(["id"]);
  expect(model.options.map(item => item.value)).toEqual(["first", "second"]);
  const html = renderToStaticMarkup(<ResponsePresentation model={model} value={{ id: "first" }} onChange={() => {}}/>);
  expect(html).toContain("选择公告");
  expect(html).toContain("https://example.org/first");
  expect(html).toContain("checked");
  expect(html).not.toContain("javascript:");
});

it("uses the response mapping to hide completed fields and label missing fields", () => {
  const interaction: NodeInteraction = {
    title: "补件",
    schema: { properties: {
      company: { type: "string", title: "机构" }, experience: { type: "string", title: "相关能力" },
    } },
    resumeWrites: { company: "submittedCompany", experience: "submittedExperience" },
    presentation: { checklist: { fields: ["company", "experience"], onlyMissing: true } },
  };
  const model = responsePresentation(interaction, interaction.schema, { submittedCompany: "Team", submittedExperience: " " });
  expect([...model!.hiddenFields]).toEqual(["company"]);
  expect(model?.missingLabels).toEqual(["相关能力"]);
  expect(responsePresentation(undefined, interaction.schema, {})).toBeUndefined();
});
