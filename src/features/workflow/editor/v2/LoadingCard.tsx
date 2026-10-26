/**
 * Centered connection card used while a Workflow document is being restored.
 * Same copy, proportions and spinner as the loading design.
 */
export function LoadingCard({ title = "正在连接 EduFlow…", detail = "正在恢复你的工作流和数据，请稍候" }: { title?: string; detail?: string }) {
  return <section className="wf-loading-card" role="status" aria-label={title}>
    <div className="wf-loading-mark" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></svg>
      <span className="wf-loading-spin" />
    </div>
    <div className="wf-loading-copy"><h1>{title}</h1><p>{detail}</p></div>
    <div className="wf-loading-track"><span /></div>
    <small>通常只需要几秒</small>
  </section>;
}
