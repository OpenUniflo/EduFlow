/** Presentation-only decision for selecting a run in the history drawer. */
export type HistoryRunSelection = {
  /** Keep the current node panel instead of replacing it with the run panel. */
  keepNodePanel: boolean;
  tab: "node" | "run";
  nodeTab?: "execution";
  clearSelection: boolean;
  resetGraph: boolean;
};

/** An already selected node keeps its panel and shows that run's data; no selection keeps the old run panel. */
export function historyRunSelection(hasSelectedNode: boolean): HistoryRunSelection {
  return hasSelectedNode
    ? { keepNodePanel: true, tab: "node", nodeTab: "execution", clearSelection: false, resetGraph: false }
    : { keepNodePanel: false, tab: "run", clearSelection: true, resetGraph: true };
}

/** Narrow banner copy for read-only history observation; the environment segment is omitted when absent. */
export function historyRunBannerText(run: { createdAt: string; variableEnvironment?: string | null } | null, status: string, formatTime: (value: string) => string = value => new Date(value).toLocaleString()): string {
  const parts = ["正在查看历史运行"];
  if (run) parts.push(formatTime(run.createdAt));
  if (status) parts.push(status);
  if (run?.variableEnvironment) parts.push(run.variableEnvironment);
  return parts.join(" · ");
}
