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
import { ApiMicroLearningRepository } from "@/features/learning/micro/ApiMicroLearningRepository";
import type { MicroLearningRepository } from "@/features/learning/micro/microLearning";
import { ApiLearnerStateService } from "@/features/learning/state/ApiLearnerStateService";
import { ApiCourseRepository } from "@/features/course/repository/ApiCourseRepository";
import { ApiCourseAuthoringDraftRepository } from "@/features/course/authoring/ApiCourseAuthoringDraftRepository";
import type { CourseAuthoringDraftRepository } from "@/features/course/authoring/CourseAuthoringDraftRepository";
import { apiRequest } from "@/shared/api/apiClient";
import type { KnowledgeGraph } from "@/features/knowledge/types";
import type { UserCourseState } from "@/features/course/types";
import type { UserCapability, UserRole } from "@/features/auth/types";
import type { UserKnowledgeRecord } from "@/features/profile/types";

export type ApplicationServices = {
  courseRepository: CourseRepository;
  knowledgeRepository: KnowledgeRepository;
  userKnowledgeRepository: UserKnowledgeRepository;
  learningProgressRepository: LearningProgressRepository;
  microLearningRepository: MicroLearningRepository;
  learnerStateService: ApiLearnerStateService;
  domainGovernanceRepository: DomainGovernanceRepository;
  domainGovernanceService: DomainGovernanceService;
  courseCreationService: CourseCreationService;
  courseAuthoringDraftRepository: CourseAuthoringDraftRepository;
};

const knowledgeRepository = new ApiKnowledgeRepository();
const courseRepository = new ApiCourseRepository(knowledgeRepository);
const userKnowledgeRepository = new ApiUserKnowledgeRepository();
const learningProgressRepository = new ApiLearningProgressRepository();
const microLearningRepository = new ApiMicroLearningRepository();
const learnerStateService = new ApiLearnerStateService();
const courseAuthoringDraftRepository = new ApiCourseAuthoringDraftRepository();
const domainGovernanceRepository = new ApiDomainGovernanceRepository();
const domainGovernanceService = new DomainGovernanceService(knowledgeRepository, domainGovernanceRepository);

export const applicationServices: ApplicationServices = {
  courseRepository,
  knowledgeRepository,
  userKnowledgeRepository,
  learningProgressRepository,
  microLearningRepository,
  learnerStateService,
  domainGovernanceRepository,
  domainGovernanceService,
  courseAuthoringDraftRepository,
  courseCreationService: new BackendCourseCreationService()
};

export async function hydrateApplicationServices(userId: string) {
  const knowledge = await apiRequest<{ graph: KnowledgeGraph; governance: DomainGovernanceState; profile: { displayName: string; role: UserRole; capabilities: UserCapability[] } }>("/api/knowledge");
  knowledgeRepository.hydrate(knowledge.graph);
  domainGovernanceRepository.hydrate(knowledge.governance);
  domainGovernanceService.reloadFromRepository();
  await Promise.all([courseRepository.hydrate(userId), microLearningRepository.hydrate(userId)]);
  const progress = await apiRequest<{ userKnowledge: UserKnowledgeRecord[]; courseStates: UserCourseState[] }>("/api/progress");
  userKnowledgeRepository.hydrate(progress.userKnowledge);
  learningProgressRepository.hydrate(userId, courseRepository.listCourseRuntimes().map((runtime) => runtime.course.id), progress.courseStates);
  return knowledge.profile;
}

/** Refreshes durable learner projections after a state-machine action. */
export async function refreshLearnerState(userId: string) {
  const progress = await apiRequest<{ userKnowledge: UserKnowledgeRecord[]; courseStates: UserCourseState[] }>("/api/progress");
  userKnowledgeRepository.hydrate(progress.userKnowledge);
  learningProgressRepository.hydrate(userId, courseRepository.listCourseRuntimes().map((runtime) => runtime.course.id), progress.courseStates);
}
