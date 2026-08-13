import { describe, expect, it } from "vitest";
import { parsingJobRetryPatch, toMaterialParsingJob } from "./material-parsing-jobs";

describe("toMaterialParsingJob", () => {
  it("maps database columns to the public camelCase contract", () => {
    const job = toMaterialParsingJob({
      id: "job-1",
      course_id: "course-1",
      material_id: "material-1",
      status: "failed",
      attempt: 2,
      parser_version: "docling-2.119.0",
      adapter_version: "course-material-v1",
      raw_artifact_path: "jobs/job-1/attempt-2/raw.json",
      normalized_artifact_path: null,
      error_code: "material_parse_failed",
      error_message: "adapter failed"
    });

    expect(job).toEqual({
      id: "job-1",
      courseId: "course-1",
      materialId: "material-1",
      status: "failed",
      attempt: 2,
      parserVersion: "docling-2.119.0",
      adapterVersion: "course-material-v1",
      rawArtifactPath: "jobs/job-1/attempt-2/raw.json",
      errorCode: "material_parse_failed",
      errorMessage: "adapter failed"
    });
    expect(JSON.stringify(job)).not.toContain("normalizedArtifactPath");
    expect(JSON.stringify(job)).not.toContain("course_id");
  });

  it("clears every previous-attempt result pointer when retrying", () => {
    expect(parsingJobRetryPatch("2026-08-13T00:00:00.000Z")).toEqual({
      status: "pending",
      source_sha256: null,
      raw_artifact_path: null,
      normalized_artifact_path: null,
      error_code: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      updated_at: "2026-08-13T00:00:00.000Z"
    });
  });
});
