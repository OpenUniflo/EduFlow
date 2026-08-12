import type { CourseCreationService } from "@/features/course/creation/CourseCreationService";
import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import { DemoCourseRepository } from "@/demo/courses/DemoCourseRepository";
import { DemoCourseCreationService } from "@/demo/services/DemoCourseCreationService";
import { DemoUserKnowledgeRepository } from "@/demo/users/DemoUserKnowledgeRepository";
import { LocalStorageDomainGovernanceRepository } from "@/features/knowledge/domain/LocalStorageDomainGovernanceRepository";
import { DomainGovernanceService } from "@/features/knowledge/domain/DomainGovernanceService";
import { demoDomainGovernanceSeed } from "@/demo/domains/demoDomainGovernance.seed";
import type { DomainGovernanceRepository } from "@/features/knowledge/domain/DomainGovernanceRepository";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import type { KnowledgeRepository } from "@/features/knowledge/repository/KnowledgeRepository";
import { demoPersonalKnowledgeGraph } from "@/demo/users/demoPersonalKnowledgeGraph.fixture";
import type { UserKnowledgeRepository } from "@/features/profile/UserKnowledgeRepository";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";
import { LocalStorageLearningProgressRepository } from "@/features/learning/progress/LocalStorageLearningProgressRepository";
import { demoUserCourseStateSeed } from "@/demo/users/demoUserCourseState.seed";

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
