export type CourseCreationStage = { id: string; label: string; detail: string };
export type CourseCreationScenario = {
  id: string;
  courseId: string;
  title: string;
  prototypeLabel: string;
  sourceLabel: string;
  stages: CourseCreationStage[];
  insights: string[];
  reconstruction: Array<{ source: string; target: string }>;
  summary: Array<{ value: number; label: string }>;
};

export interface CourseCreationScenarioResolver {
  resolve(files: File[]): Promise<CourseCreationScenario | null>;
}
