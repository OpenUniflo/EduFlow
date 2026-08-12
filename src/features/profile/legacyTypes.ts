export type AbilityTrend = "up" | "stable" | "down";
export type CourseProgressStatus = "learning" | "not_started" | "completed";
export type SkillStatus = "locked" | "unlocked" | "mastered";
export type AchievementStatus = "locked" | "unlocked";
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";
export type GrowthSourceType = "course" | "task" | "workflow" | "run";

export type ProfileAbility = {
  id: string;
  name: string;
  level: number;
  value: number;
  maxValue: number;
  exp: number;
  nextExp: number;
  description: string;
  trend: AbilityTrend;
  recentGain: string;
  sourceCourses: string[];
};

export type ProfileCourseProgress = {
  courseId: string;
  courseTitle: string;
  progress: number;
  status: CourseProgressStatus;
  completedChapters: number;
  chapterCount: number;
  completedTasks: number;
  taskCount: number;
  mainAbilities: string[];
};

export type ProfileSkill = {
  id: string;
  title: string;
  description: string;
  status: SkillStatus;
  requiredLevel: number;
  relatedAbility: string;
  progress: number;
  recommendation: string;
};

export type ProfileSkillModule = {
  id: string;
  title: string;
  skills: ProfileSkill[];
};

export type ProfileAchievement = {
  id: string;
  title: string;
  description: string;
  status: AchievementStatus;
  unlockedAt: string | null;
  icon: string;
  rarity: AchievementRarity;
  source: string;
};

export type ProfileGrowthLog = {
  id: string;
  date: string;
  title: string;
  description: string;
  ability: string;
  gain: number;
  sourceType: GrowthSourceType;
  sourceTitle: string;
};

export type ProfileRecommendation = {
  id: string;
  title: string;
  reason: string;
  targetAbility: string;
  actionLabel: string;
  targetUrl: string;
};

export type StudentProfile = {
  id: string;
  name: string;
  avatar: string;
  className: string;
  studentNo: string;
  title: string;
  level: number;
  currentExp: number;
  nextLevelExp: number;
  totalExp: number;
  learningDays: number;
  completedCourses: number;
  completedChapters: number;
  completedTasks: number;
  builtWorkflows: number;
  successfulRuns: number;
  averageScore: number;
  abilities: ProfileAbility[];
  courseProgress: ProfileCourseProgress[];
  skillTree: ProfileSkillModule[];
  achievements: ProfileAchievement[];
  recentGrowthLogs: ProfileGrowthLog[];
  recommendations: ProfileRecommendation[];
};
