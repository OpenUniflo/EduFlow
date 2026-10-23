import type { ConnectionTestResult } from "../domain/v2/types";

/** Human-readable elapsed time; returns an empty string when the server did not report a duration. */
export function formatElapsed(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  return ms < 1000 ? `${Math.round(ms)} 毫秒` : `${(ms / 1000).toFixed(2)} 秒`;
}

/** Shared result panel for model, API and MCP connection tests. */
export function ResourceTestPanel({ result, hint = "尚未测试连接。" }: { result?: ConnectionTestResult | null; hint?: string }) {
  if (!result) return <p className="wf-resource-test-empty">{hint}</p>;
  const elapsed = formatElapsed(result.elapsedMs);
  const models = result.models ?? [];
  const tools = result.tools ?? [];
  return <section className="wf-resource-test" data-state={result.ok ? "ok" : "error"} aria-label="连接测试结果">
    <header>
      <strong>{result.ok ? "测试成功" : "测试失败"}</strong>
      {typeof result.status === "number" ? <span>HTTP {result.status}</span> : null}
      {elapsed ? <span>耗时 {elapsed}</span> : null}
    </header>
    {result.error ? <p role="alert">{[result.error.code, result.error.message].filter(Boolean).join(" · ")}</p> : null}
    {models.length ? <div className="wf-resource-test-models"><h4>可用模型（{models.length}）</h4><ul>{models.map(model => <li key={model}>{model}</li>)}</ul></div> : null}
    {tools.length ? <div className="wf-resource-test-tools"><h4>可发现的工具（{tools.length}）</h4><ul>{tools.map(tool => <li key={tool.name}><strong>{tool.name}</strong>{tool.description ? <small>{tool.description}</small> : null}</li>)}</ul></div> : null}
    {result.preview ? <details className="wf-resource-test-preview"><summary>响应预览（已脱敏，最多 4KB）</summary><pre>{result.preview}</pre></details> : null}
    {result.ok && !models.length && !tools.length && !result.preview ? <p className="wf-field-note">连接可用，但没有返回可展示的详细信息。</p> : null}
  </section>;
}
