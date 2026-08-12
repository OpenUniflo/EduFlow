import type { CourseCreationService } from "@/features/course/creation/CourseCreationService";
import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import { BackendCourseCreationService } from "@/features/course/creation/BackendCourseCreationService";
import { DomainGovernanceService } from "@/features/knowledge/domain/DomainGovernanceService";
import { ApiDomainGovernanceRepository } from "@/features/knowledge/domain/ApiDomainGovernanceRepository";
import type { DomainGovernanceRepository, DomainGovernanceState } from "@/features/knowledge/domain/DomainGovernanceRepository";
import { ApiKnowledgeRepository } from "@/features/knowledge/repository/ApiKnowledgeRepository";
import type { KnowledgeRepository } from "@/features/knowledge/repository/KnowledgeRepository";
import type { UserKnowledgeRepository } from "@/features/profile/UserKnowledgeRepository";
import { ApiUserKnowledgeRepository } from "@/features/profile/ApiUserKnowledgeRepository";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";
import { ApiLearningProgressRepository } from "@/features/learning/progress/ApiLearningProgressRepository";
import { ApiCourseRepository } from "@/features/course/repository/ApiCourseRepository";
import { apiRequest } from "@/shared/api/apiClient";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { UserCourseState } from "@/features/course/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";

export type ApplicationServices = {
  courseRepository: CourseRepository;
  knowledgeRepository: KnowledgeRepository;
  userKnowledgeRepository: UserKnowledgeRepository;
  learningProgressRepository: LearningProgressRepository;
  domainGovernanceRepository: DomainGovernanceRepository;
  domainGovernanceService: DomainGovernanceService;
  courseCreationService: CourseCreationService;
};

const knowledgeRepository = new ApiKnowledgeRepository();
const courseRepository = new ApiCourseRepository(knowledgeRepository);
const userKnowledgeRepository = new ApiUserKnowledgeRepository();
const learningProgressRepository = new ApiLearningProgressRepository();
const domainGovernanceRepository = new ApiDomainGovernanceRepository();
const domainGovernanceService = new DomainGovernanceService(knowledgeRepository, domainGovernanceRepository);

export const applicationServices: ApplicationServices = {
  courseRepository,
  knowledgeRepository,
  userKnowledgeRepository,
  learningProgressRepository,
  domainGovernanceRepository,
  domainGovernanceService,
  courseCreationService: new BackendCourseCreationService()
};

export async function hydrateApplicationServices(userId: string) {
  const knowledge = await apiRequest<{ graph: KnowledgeGraph; governance: DomainGovernanceState; profile: { displayName: string; role: "student"; capabilities: Array<"global-domain-admin"> } }>("/api/knowledge");
  knowledgeRepository.hydrate(knowledge.graph);
  domainGovernanceRepository.hydrate(knowledge.governance);
  domainGovernanceService.reloadFromRepository();
  await courseRepository.hydrate(userId);
  const progress = await apiRequest<{ userKnowledge: UserKnowledgeRecord[]; courseStates: UserCourseState[] }>("/api/progress");
  userKnowledgeRepository.hydrate(progress.userKnowledge);
  learningProgressRepository.hydrate(userId, courseRepository.listCourseRuntimes().map((runtime) => runtime.course.id), progress.courseStates);
  return knowledge.profile;
}
