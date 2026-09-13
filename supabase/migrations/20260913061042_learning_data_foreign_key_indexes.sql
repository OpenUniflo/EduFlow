-- Cover the two Foundation foreign keys reported by Hosted performance advisors.
-- Keep the existing learner/Knowledge/sequence index for scoped evidence reads.
create index mastery_criteria_revision_idx on public.mastery_criteria(knowledge_revision_id);
create index course_recommendation_policies_updated_by_idx on public.course_recommendation_policies(updated_by);
