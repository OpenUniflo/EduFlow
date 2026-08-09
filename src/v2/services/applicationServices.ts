import type { CourseCreationService } from "../course/creation/CourseCreationService";
import type { CourseRepository } from "../course/repository/CourseRepository";
import { DemoCourseRepository } from "../course/repository/DemoCourseRepository";
import { DemoCourseCreationService } from "../demo/services/DemoCourseCreationService";
import { DemoUserKnowledgeRepository } from "../demo/user/DemoUserKnowledgeRepository";
import { LocalStorageDomainGovernanceRepository } from "../knowledge/domain/LocalStorageDomainGovernanceRepository";
import type { DomainGovernanceRepository } from "../knowledge/domain/DomainGovernanceRepository";
import { InMemoryKnowledgeRepository } from "../knowledge/repository/InMemoryKnowledgeRepository";
import type { KnowledgeRepository } from "../knowledge/repository/KnowledgeRepository";
import { demoPersonalKnowledgeGraph } from "../profile/demoUserKnowledge";
import type { UserKnowledgeRepository } from "../profile/UserKnowledgeRepository";
import type { LearningProgressRepository } from "../progress/LearningProgressRepository";
import { LocalStorageLearningProgressRepository } from "../progress/LocalStorageLearningProgressRepository";

export type ApplicationServices = {
  courseRepository: CourseRepository;
  knowledgeRepository: KnowledgeRepository;
  userKnowledgeRepository: UserKnowledgeRepository;
  learningProgressRepository: LearningProgressRepository;
  domainGovernanceRepository: DomainGovernanceRepository;
  courseCreationService: CourseCreationService;
};

const knowledgeRepository = new InMemoryKnowledgeRepository(demoPersonalKnowledgeGraph);

export const applicationServices: ApplicationServices = {
  courseRepository: new DemoCourseRepository(knowledgeRepository),
  knowledgeRepository,
  userKnowledgeRepository: new DemoUserKnowledgeRepository(),
  learningProgressRepository: new LocalStorageLearningProgressRepository(),
  domainGovernanceRepository: new LocalStorageDomainGovernanceRepository(),
  courseCreationService: new DemoCourseCreationService()
};
