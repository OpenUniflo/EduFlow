/** One reversible address for a Course Assignment, even when its ID contains ':'. */
export type PracticeLink = { courseId: string; assignmentId: string };

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePracticeLink(courseId: string, assignmentId: string): string {
  return encodeBase64Url(JSON.stringify([courseId, assignmentId]));
}

export function decodePracticeLink(value: string | null | undefined): PracticeLink | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string" && parsed[0] && parsed[1]) {
      return { courseId: parsed[0], assignmentId: parsed[1] };
    }
  } catch {
    // Legacy links used "courseId:assignmentId"; split only at the first colon
    // so an Assignment ID that itself contains ':' survives.
  }
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  return { courseId: value.slice(0, separator), assignmentId: value.slice(separator + 1) };
}

export function practiceHref(courseId: string, assignmentId: string): string {
  return `/?practice=${encodeURIComponent(encodePracticeLink(courseId, assignmentId))}`;
}
