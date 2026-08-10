import type { CourseCreationService } from "../course/creation/CourseCreationService";
import type { CourseRepository } from "../course/repository/CourseRepository";
import { DemoCourseRepository } from "../demo/courses/DemoCourseRepository";
import { DemoCourseCreationService } from "../demo/services/DemoCourseCreationService";
import { DemoUserKnowledgeRepository } from "../demo/user/DemoUserKnowledgeRepository";
import { LocalStorageDomainGovernanceRepository } from "../knowledge/domain/LocalStorageDomainGovernanceRepository";
import { DomainGovernanceService } from "../knowledge/domain/DomainGovernanceService";
import { demoDomainGovernanceSeed } from "../demo/domains/demoDomainGovernance.seed";
import type { DomainGovernanceRepository } from "../knowledge/domain/DomainGovernanceRepository";
import { InMemoryKnowledgeRepository } from "../knowledge/repository/InMemoryKnowledgeRepository";
import type { KnowledgeRepository } from "../knowledge/repository/KnowledgeRepository";
import { demoPersonalKnowledgeGraph } from "../demo/user/demoPersonalKnowledgeGraph.fixture";
import type { UserKnowledgeRepository } from "../profile/UserKnowledgeRepository";
import type { LearningProgressRepository } from "../progress/LearningProgressRepository";
import { LocalStorageLearningProgressRepository } from "../progress/LocalStorageLearningProgressRepository";
import { demoUserCourseStateSeed } from "../demo/user/demoUserCourseState.seed";

export type ApplicationServices = {
  courseRepository: CourseRepository;
  knowledgeRepository: KnowledgeRepository;
  userKnowledgeRepository: UserKnowledgeRepository;
  learningProgressRepository: LearningProgressRepository;
  domainGovernanceRepository: DomainGovernanceRepository;
  domainGovernanceService: DomainGovernanceService;
  courseCreationService: CourseCreationService;
};

const knowledgeRepository = new InMemoryKnowledgeRepository(demoPersonalKnowledgeGraph);
const domainGovernanceRepository = new LocalStorageDomainGovernanceRepository(demoPersonalKnowledgeGraph, demoDomainGovernanceSeed);
const domainGovernanceService = new DomainGovernanceService(knowledgeRepository, domainGovernanceRepository);

export const applicationServices: ApplicationServices = {
  courseRepository: new DemoCourseRepository(knowledgeRepository),
  knowledgeRepository,
  userKnowledgeRepository: new DemoUserKnowledgeRepository(),
  learningProgressRepository: new LocalStorageLearningProgressRepository(demoUserCourseStateSeed),
  domainGovernanceRepository,
  domainGovernanceService,
  courseCreationService: new DemoCourseCreationService()
};
