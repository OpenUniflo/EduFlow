/** Read-only practice submission row used by the Works overview. */
export type PracticeSubmissionStatus = "draft" | "submitted" | "needs_revision" | "accepted";

/** Compact summary built only from the persisted Attempt payload. */
export type PracticeSubmissionContent = {
  kind: string;
  fileName?: string;
  linkDomain?: string;
  attachmentCount: number;
  text?: string;
};

export type MyPracticeSubmission = {
  courseId: string;
  assignmentId: string;
  courseTitle: string;
  assignmentTitle: string;
  status: PracticeSubmissionStatus;
  attemptNumber: number | null;
  updatedAt: string;
  submittedAt?: string;
  acceptedAt?: string;
  /** One-based chapter display ordinal when the Assignment coverage resolves to one. */
  chapterNumber?: number;
  /** Latest persisted score; omitted when the PerformanceResult has none. */
  score?: number;
  content?: PracticeSubmissionContent;
};
