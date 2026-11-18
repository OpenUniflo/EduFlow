import { useId } from "react";
import type { InteractionPresentation, NodeInteraction } from "../../domain/v2/authoring";
import type { JsonSchema, JsonValue } from "../../domain/v2/types";
import { valueAt } from "./SchemaForm";

type Fact = NonNullable<InteractionPresentation["summary"]>[number];

function display(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return [...new Set(value.map(display).filter(Boolean))].join("、");
  if (!value) return "";
  return [value.eng, value.ENG, ...Object.values(value)].map(display).find(Boolean) ?? "";
}

function httpsLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function Facts({ facts, data }: { facts: Fact[]; data: JsonValue }) {
  return <dl className="wf-response-facts">{facts.map(fact => {
    const value = display(valueAt(data, fact.path));
    const link = fact.link ? httpsLink(value) : undefined;
    return <div key={fact.label}><dt>{fact.label}</dt>
      <dd>{link ? <a href={link} target="_blank" rel="noopener noreferrer">查看原文</a> : fact.link ? "未提供" : value || "未提供"}</dd>
    </div>;
  })}</dl>;
}

export function responsePresentation(interaction: NodeInteraction | undefined, schema: JsonSchema, state: JsonValue) {
  const presentation = interaction?.presentation;
  if (!presentation || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) return undefined;
  const properties = schema.properties as Record<string, JsonSchema>;
  const checklist = (presentation.checklist?.fields ?? []).filter(field => properties[field] && interaction.resumeWrites[field]);
  const missing = checklist.filter(field => {
    const value = valueAt(state, "/" + interaction.resumeWrites[field].replace(/~/g, "~0").replace(/\//g, "~1"));
    return value === undefined || value === null || typeof value === "string" && !value.trim();
  });
  const choices = presentation.choices && properties[presentation.choices.field] ? presentation.choices : undefined;
  const choiceSource = choices ? valueAt(state, choices.source) : undefined;
  const options = choices && Array.isArray(choiceSource)
    ? Array.from(new Map(choiceSource.flatMap(item => {
      const value = valueAt(item, choices.value);
      return typeof value === "string" && value.trim() ? [[value, { value, title: display(valueAt(item, choices.title)) || value, item }] as const] : [];
    })).values())
    : [];
  const hiddenFields = new Set<string>();
  if (choices) hiddenFields.add(choices.field);
  if (presentation.checklist?.onlyMissing) {
    for (const field of checklist) if (!missing.includes(field)) hiddenFields.add(field);
  }
  return {
    choices, options, hiddenFields, summary: presentation.summary, state,
    missingLabels: missing.map(field => String(properties[field].title ?? field)),
  };
}

export type ResponsePresentationModel = NonNullable<ReturnType<typeof responsePresentation>>;

export function ResponsePresentation({ model, value, choiceInvalid = false, onChange }: {
  model: ResponsePresentationModel;
  value: Record<string, JsonValue>;
  choiceInvalid?: boolean;
  onChange: (value: Record<string, JsonValue>) => void;
}) {
  const { choices, options, summary, missingLabels, state } = model;
  const choiceErrorId = useId();
  return <>
    {summary?.length ? <section aria-label="审批与核对依据" className="wf-response-summary"><Facts facts={summary} data={state}/></section> : null}
    {missingLabels.length ? <p className="wf-response-missing"><strong>待补齐</strong> {missingLabels.join("、")}</p> : null}
    {choices ? <fieldset className="wf-response-choices" aria-describedby={choiceInvalid ? choiceErrorId : undefined}>
      <legend>{choices.label}{options.length ? '（必选一项）' : ''}</legend>
      {choiceInvalid ? <p id={choiceErrorId} className="wf-response-choice-error" role="alert">请点击一张候选卡片的标题或单选按钮。</p> : null}
      {options.length ? options.map(option => <div className="wf-response-option" key={option.value}>
        <label><input type="radio" name={choices.field} checked={value[choices.field] === option.value} value={option.value}
          onChange={() => onChange({ ...value, [choices.field]: option.value })}/><span><strong>{option.title}</strong><small>{option.value}</small></span></label>
        <Facts facts={choices.facts} data={option.item}/>
      </div>) : <p role="status">当前回应没有可选项。</p>}
    </fieldset> : null}
  </>;
}
