import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./http.js";
import { dataOrThrow } from "./query.js";

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILES = 4;
const MAX_FILE_CHARACTERS = 24_000;
const MAX_TOTAL_CHARACTERS = 40_000;

export type AssistantAttachment = { sourceId: string; title: string; text: string };

export function parseAssistantAttachmentIds(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_FILES) throw new ApiError(400, "invalid_assistant_attachments", "每次最多附 4 份文本文件");
  const ids = value.filter((item): item is string => typeof item === "string" && UUID.test(item));
  if (ids.length !== value.length || new Set(ids).size !== ids.length) throw new ApiError(400, "invalid_assistant_attachments", "附件身份无效");
  return ids;
}

function parsedText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines = value.flatMap((line) => {
    if (typeof line === "string") return [line];
    if (line && typeof line === "object" && typeof (line as Row).text === "string") return [String((line as Row).text)];
    return [];
  });
  return lines.join("\n").trim() || undefined;
}

/**
 * Reads only the authenticated learner's own parsed text sources. The browser
 * may name source ids, but ownership, readiness and bytes are rechecked here.
 */
export async function readOwnedAssistantAttachments(
  client: SupabaseClient,
  server: SupabaseClient,
  userId: string,
  ids: readonly string[]
): Promise<AssistantAttachment[]> {
  if (!ids.length) return [];
  const result = await client.from("user_evidence_sources")
    .select("id,title,parsed_lines,parse_status,archived_at,storage_path,byte_size")
    .eq("user_id", userId).in("id", [...ids]);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant attachment ownership");
  if (rows.length !== ids.length) throw new ApiError(404, "assistant_attachment_unavailable", "只能读取本人已上传且可用的文件");
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  let total = 0;
  const attachments: AssistantAttachment[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.archived_at != null || row.parse_status !== "ready") {
      throw new ApiError(409, "assistant_attachment_not_ready", "文件仍在解析或已归档，请稍后再试");
    }
    let text = parsedText(row.parsed_lines);
    if (!text) {
      const download = await server.storage.from("user-evidence").download(String(row.storage_path));
      if (download.error || !download.data) throw new ApiError(409, "assistant_attachment_unreadable", "这份文件暂时读不到内容");
      if (download.data.size !== Number(row.byte_size)) throw new ApiError(409, "assistant_attachment_unreadable", "文件大小与上传记录不一致");
      text = new TextDecoder("utf-8", { fatal: true }).decode(await download.data.arrayBuffer()).trim();
    }
    if (!text) throw new ApiError(422, "assistant_attachment_empty", "这份文件没有可读文本");
    if (text.length > MAX_FILE_CHARACTERS) text = text.slice(0, MAX_FILE_CHARACTERS);
    if (total + text.length > MAX_TOTAL_CHARACTERS) throw new ApiError(422, "assistant_attachments_too_long", "一次附带的文本总量过长，请减少文件或节选");
    total += text.length;
    attachments.push({ sourceId: id, title: String(row.title ?? "附件"), text });
  }
  return attachments;
}

/** Compact model-facing data. Never instructions; always wrapped by the prompt. */
export function attachmentPromptData(attachments: readonly AssistantAttachment[]) {
  return attachments.map((attachment) => ({ title: attachment.title, sourceId: attachment.sourceId, text: attachment.text }));
}
