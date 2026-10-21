export function connectionDraftIssue({ kind, ref, url, credential, version }: { kind: string; ref: string; url: string; credential: string; version: number }): string {
  if (!ref.trim()) return "请填写连接标识。";
  if (!Number.isInteger(version) || version < 1) return "连接版本必须是大于 0 的整数。";
  if (kind !== "deepseek" && !url.trim()) return "请填写连接地址。";
  if (kind === "deepseek" && !credential.trim()) return "模型连接需要凭据，才能保存新版本。";
  return "";
}

export function connectionTestIssue({ sideEffect, confirm, disabled }: { sideEffect: unknown; confirm: boolean; disabled: boolean }): string {
  if (disabled) return "此连接已停用。";
  if (String(sideEffect) === "write" && !confirm) return "写入连接测试前，请先勾选“允许本次测试修改外部数据”。";
  return "";
}
