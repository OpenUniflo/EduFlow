import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { JsonValue } from "../../domain/v2/types";
import { internalIdentifierValue, internalValueKey, runFieldRows, runValueView, type RunFieldRow } from "../../domain/v2/runSummary";

/**
 * Shared value rows for the node run-data tab and the data panel' latest-run
 * values. Text clamps to two lines; lists and objects stay collapsed until the
 * user opens them, and no raw JSON is rendered.
 */

function NestedValue({ value, depth = 0 }: { value: JsonValue | undefined; depth?: number }) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
  if (depth >= 2 && (object || Array.isArray(value))) {
    return <details><summary>展开详细数据</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
  }
  if (Array.isArray(value)) {
    return <ol className="wf-run-value-list">{value.map((item, index) => <li key={index}><NestedValue value={item} depth={depth + 1} /></li>)}</ol>;
  }
  if (object) {
    const entries = Object.entries(object).filter(([key, entry]) => !internalValueKey(key) && !internalIdentifierValue(entry));
    if (!entries.length) return <span className="wf-run-value-empty">无更多字段</span>;
    return <dl className="wf-run-value-object">{entries.map(([key, entry]) => <div key={key}><dt title={key}>{key}</dt><dd><NestedValue value={entry} depth={depth + 1} /></dd></div>)}</dl>;
  }
  const view = runValueView(value);
  return <span className={`wf-run-value-inline${view.kind === "text" ? " text" : ""}`}>{view.preview}</span>;
}

export function RunValuePreview({ value }: { value: JsonValue | undefined }) {
  const view = runValueView(value);
  if (view.kind === "empty") return <span className="wf-run-value-empty">{view.preview}</span>;
  if (view.kind === "text") return <span className="wf-run-value-text" title={view.preview}>{view.preview}</span>;
  if (view.kind === "list" || view.kind === "object") {
    const summary = view.kind === "list" ? `${view.count} 条` : `${view.fieldCount} 个字段`;
    const Icon = ChevronRight;
    return <details className="wf-run-value-details">
      <summary><span>{summary}</span><Icon size={11} aria-hidden="true" /></summary>
      <div className="wf-run-value-body"><NestedValue value={value} /></div>
    </details>;
  }
  return <span className="wf-run-value-inline">{view.preview}</span>;
}

function rowValue(row: RunFieldRow): ReactNode {
  return row.view.kind === "object" || row.view.kind === "list"
    ? <RunValuePreview value={row.value} />
    : <span className={`wf-run-value-inline${row.view.kind === "text" ? "" : " mono"}`}>{row.view.preview}</span>;
}

export function RunValueList({ value, layout = "stacked", scalarName = "值", emptyText = "本次运行没有记录", limit }: {
  value: JsonValue | undefined;
  layout?: "stacked" | "inline";
  scalarName?: string;
  emptyText?: string;
  /** Compact cards show only the first rows; the full list lives in the run-data tab. */
  limit?: number;
}) {
  const allRows = runFieldRows(value, scalarName);
  const rows = limit === undefined ? allRows : allRows.slice(0, limit);
  if (!rows.length) return <p className="wf-run-data-note">{emptyText}</p>;
  return <div className={`wf-run-value-list-root ${layout}`}>
    {rows.map(row => <div className="wf-run-value-row" key={row.name}>
      <div className="wf-run-value-name">
        <code>{row.name}</code>
        {layout === "stacked" ? <small>{row.view.label}</small> : <span className="wf-run-type-tag">{row.view.label}</span>}
      </div>
      <div className="wf-run-value-content">{rowValue(row)}</div>
    </div>)}
  </div>;
}

