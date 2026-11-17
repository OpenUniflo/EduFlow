import { CheckCircle2, CircleAlert } from "lucide-react";
import type { McpOAuthWindowResult } from "@/features/workflow/resources/mcpOAuthWindow";
import { Button } from "@/shared/ui/Button";

/**
 * Lightweight page rendered in the authorization window after the provider
 * redirects back. It never renders product chrome or claims the connection is
 * ready: the original EduFlow page re-reads the server catalog and verifies it.
 */
export function McpOAuthWindowResult({ result, onClose, onReturn }: {
  result: McpOAuthWindowResult;
  onClose: () => void;
  onReturn: () => void;
}) {
  const pending = result.status === "pending";
  return <main className="ef-connection ef-shell-bg" data-oauth-window-result={result.status}>
    <section className="ef-connection-card ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" aria-live="polite">
      {pending ? <CheckCircle2 size={28} aria-hidden /> : <CircleAlert size={28} aria-hidden />}
      <h1>{pending ? "服务方授权已完成" : "授权未完成"}</h1>
      <p>{pending
        ? "授权结果会通知给打开授权的 EduFlow 页面。请回到原页面继续；原页面会从服务端重新读取真实连接。"
        : result.message || "服务方没有完成授权。"}</p>
      {pending ? null : <p>可以回到 EduFlow 重试，或改用 API Key。</p>}
      <p className="wf-field-note">工具权限不会自动授予；请回到原页面确认连接并明确勾选允许的工具。</p>
      <div className="ef-notfound-actions">
        <Button variant="primary" onClick={onClose}>关闭此窗口</Button>
        <Button onClick={onReturn}>返回 EduFlow</Button>
      </div>
    </section>
  </main>;
}
