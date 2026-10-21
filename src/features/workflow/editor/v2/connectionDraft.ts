export function connectionDraftIssue({ kind, ref, url, credential, version }: { kind: string; ref: string; url: string; credential: string; version: number }): string {
  if (!ref.trim()) return "请填写连接标识。";
  if (!Number.isInteger(version) || version < 1) return "连接版本必须是大于 0 的整数。";
  if (kind !== "deepseek" && !url.trim()) return "请填写连接地址。";
  if (kind === "deepseek" && !credential.trim()) return "模型连接需要凭据，才能保存新版本。";
  return "";
}
