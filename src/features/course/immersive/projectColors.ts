/**
 * Feature-facing names for the shared course colour encoding. The mapping
 * itself lives in `src/shared/scene/coursePalette.ts` so the Archive course
 * plane and the learner course page cannot drift apart (2026-11-01).
 */

import {
  courseColorVar,
  courseToneFor,
  courseToneLegend,
  type CourseTone,
  type CourseToneInput
} from "@/shared/scene/coursePalette";

export type ProjectTone = CourseTone;
export type ProjectToneInput = CourseToneInput;

export function projectToneFor(input: ProjectToneInput): ProjectTone {
  return courseToneFor(input);
}

/** CSS custom property for the tone; all colours come from tokens. */
export function projectColorVar(tone: ProjectTone) {
  return courseColorVar(tone);
}

export function projectColorValue(tone: ProjectTone) {
  return courseColorVar(tone);
}

export function projectToneLegend(): Array<{ tone: ProjectTone; label: string }> {
  return courseToneLegend();
}
