/** One attachment policy for the composer, the API and task submissions. */
export const ATTACHMENT_LIMIT = 4;
export const ATTACHMENT_MAX_BYTES = 1_048_576;
export const ATTACHMENT_EXTENSIONS = [".txt", ".md", ".csv"] as const;

export function attachmentLimitMessage(): string {
  return `每次最多附 ${ATTACHMENT_LIMIT} 份文本文件`;
}

export function attachmentCountMessage(): string {
  return `每次最多附 ${ATTACHMENT_LIMIT} 份文件。`;
}

export function attachmentTypeMessage(): string {
  return `当前只支持 ${ATTACHMENT_EXTENSIONS.join("、")} 文本文件；图片和 PDF 暂时无法读取。`;
}

export function attachmentSizeMessage(name: string): string {
  return `${name} 超过 1 MB。`;
}

/** Returns the learner-facing error for one file, or null when it is accepted. */
export function attachmentFileError(file: { name: string; size: number }): string | null {
  if (!ATTACHMENT_EXTENSIONS.some((extension) => file.name.toLocaleLowerCase().endsWith(extension))) return attachmentTypeMessage();
  if (file.size > ATTACHMENT_MAX_BYTES) return attachmentSizeMessage(file.name);
  return null;
}

export function attachmentRoom(currentCount: number): number {
  return Math.max(0, ATTACHMENT_LIMIT - currentCount);
}
