import type { ApplicationServices } from "@/app/services/applicationServices";
import { DemoCourseRepository } from "@/demo/courses/DemoCourseRepository";
import { demoDomainGovernanceSeed } from "@/demo/domains/demoDomainGovernance.seed";
import { demoPersonalKnowledgeGraph } from "@/demo/users/demoPersonalKnowledgeGraph.fixture";
import { DemoUserKnowledgeRepository } from "@/demo/users/DemoUserKnowledgeRepository";
import { demoUserCourseStateSeed } from "@/demo/users/demoUserCourseState.seed";
import { DomainGovernanceService } from "@/features/knowledge/domain/DomainGovernanceService";
import { LocalStorageDomainGovernanceRepository } from "@/features/knowledge/domain/LocalStorageDomainGovernanceRepository";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { LocalStorageLearningProgressRepository } from "@/features/learning/progress/LocalStorageLearningProgressRepository";
import { demoMicroLearningProvider } from "@/demo/learning/demoMicroLearningProvider";
import { DemoCourseCreationService } from "./DemoCourseCreationService";

export function createDemoApplicationServices(): ApplicationServices {
  const knowledgeRepository = new InMemoryKnowledgeRepository(demoPersonalKnowledgeGraph);
  const domainGovernanceRepository = new LocalStorageDomainGovernanceRepository(demoPersonalKnowledgeGraph, demoDomainGovernanceSeed);
  return {
    courseRepository: new DemoCourseRepository(knowledgeRepository),
    knowledgeRepository,
    userKnowledgeRepository: new DemoUserKnowledgeRepository(),
    learningProgressRepository: new LocalStorageLearningProgressRepository(demoUserCourseStateSeed),
    microLearningRepository: {
      ...demoMicroLearningProvider,
      async hydrate() {}, getPath() { return null; }, getPathProgress() { return undefined; }, getUnitProgress() { return undefined; }, async start() {}, async completeStep() { return { correct:false, completed:false }; }, subscribe() { return () => {}; }
    },
    learnerStateService: { startKnowledge: async () => ({ status:"learning" }), startAssignment: async () => ({ status:"started" }), submitAssignment: async () => ({ status:"submitted", accepted:false }) } as never,
    domainGovernanceRepository,
    domainGovernanceService: new DomainGovernanceService(knowledgeRepository, domainGovernanceRepository),
    courseCreationService: new DemoCourseCreationService()
  };
}
