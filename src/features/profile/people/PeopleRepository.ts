/**
 * People/follow contract shared by the real backend adapter and Feature Preview.
 *
 * There is no social backend yet, so the only implementation in P0 is
 * `src/demo/preview/people/PreviewPeopleRepository`. UI receives the repository
 * through `applicationServices.preview.peopleRepository`; Feature code never
 * imports `src/demo` directly.
 */

export type PersonAccent = "me" | "orange" | "cyan" | "rose";
export type PersonVisibility = "public" | "private";

export type FollowedPerson = {
  id: string;
  displayName: string;
  handle: string;
  accent: PersonAccent;
  visibility: PersonVisibility;
  sharedKnowledgeCount: number;
  activityLabel: string;
  /** Preview identities are visibly sample data and never real users. */
  sample: boolean;
};

export interface PeopleRepository {
  readonly kind: "real" | "preview";
  listFollowed(ownerId: string): Promise<readonly FollowedPerson[]>;
  getPerson(ownerId: string, personId: string): Promise<FollowedPerson | null>;
  follow(ownerId: string, personId: string): Promise<void>;
  unfollow(ownerId: string, personId: string): Promise<void>;
  setVisibility(ownerId: string, personId: string, visibility: PersonVisibility): Promise<void>;
}

export class PreviewReadOnlyError extends Error {
  readonly code = "preview_read_only";
  constructor(readonly operation: string) {
    super(`预览数据源只读：${operation} 不会写入持久状态`);
    this.name = "PreviewReadOnlyError";
  }
}

export function isPreviewReadOnlyError(error: unknown): error is PreviewReadOnlyError {
  return error instanceof PreviewReadOnlyError;
}
