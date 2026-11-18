import { apiRequest } from "@/shared/api/apiClient";
import type { RecordEventType, RecordRange, RecordsResponse } from "@/shared/learning/records";

export type RecordsRequest = {
  types: readonly RecordEventType[];
  courseId: string | null;
  range: RecordRange;
  timeZone: string;
  cursor?: string | null;
  limit?: number;
};

export function recordsPath(input: RecordsRequest): string {
  const params = new URLSearchParams({ resource: "records", range: input.range, tz: input.timeZone, limit: String(input.limit ?? 20) });
  if (input.types.length) params.set("types", input.types.join(","));
  if (input.courseId) params.set("courseId", input.courseId);
  if (input.cursor) params.set("cursor", input.cursor);
  return `/api/learner?${params.toString()}`;
}

export function fetchRecords(input: RecordsRequest): Promise<RecordsResponse> {
  return apiRequest<RecordsResponse>(recordsPath(input));
}

/** Reads every page of the current filter for browser-side CSV export. */
export async function fetchAllRecords(input: RecordsRequest): Promise<RecordsResponse["events"]> {
  const byId = new Map<string, RecordsResponse["events"][number]>();
  let cursor: string | null = null;
  for (let page = 0; page < 200; page += 1) {
    const result = await fetchRecords({ ...input, cursor, limit: 50 });
    for (const event of result.events) byId.set(event.id, event);
    if (!result.hasMore || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return [...byId.values()];
}
